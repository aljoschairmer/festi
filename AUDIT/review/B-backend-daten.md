# B – Backend & Daten

## Zusammenfassung

Geprüft wurden alle 84 Server Actions unter `src/features/*/actions/`, die vier Route Handler
unter `src/app/api/**`, `prisma/schema.prisma` (575 Zeilen) inkl. aller Migrationen, die Route
Engine (`festi-backend/src/api/server.ts`, `jobs.ts`, `worker/index.ts`, `validation.ts`,
`openapi.yaml`) sowie der Engine-Client in `festi-routes/scripts/generate.mjs`.

Das Gesamtbild ist besser als erwartet: Autorisierung wird in praktisch jeder Action geprüft,
die Route-Statistiken werden serverseitig neu berechnet statt dem Client geglaubt, die
Engine liefert konsequent JSON (nie HTML) und die Statuscodes 400/404/409/429/503 sind dort
sauber getrennt. Auch Migrationen und Schema stimmen indexseitig überein (kein Drift).

Die Probleme liegen in drei Clustern:

1. **Connection- und Query-Ökonomie.** Der Prisma-Client wird pro Request neu gebaut, mit
   `maxUses: 1` – effektiv eine neue Postgres-Verbindung *pro Query*, ohne dass der Pool je
   geschlossen wird. Dazu kommen mehrere Listen-Queries komplett ohne `take` (u.a. jede
   jemals geschriebene Direktnachricht) und `include` statt `select`, wodurch bei jeder
   Rides-Liste `routeGeometry` + `elevationProfile` mitgezogen werden.
2. **Transaktionen und Races.** Genau ein `$transaction` im gesamten Projekt (`createRide`).
   Waitlist-Promotion, Join-Approval, Doppel-Like und Doppel-Join laufen als
   Check-dann-Schreiben ohne Sperre – das führt zu Überbuchung und zu rohen
   Prisma-`P2002`-Fehlern, die ungefangen an den Client durchschlagen.
3. **Fehlerpfade.** Read-Actions `throw`en für erwartete Zustände (Next 16 maskiert die
   Message in Produktion), Upstream-Fehlertexte von BRouter und der Engine werden 1:1 an
   den Nutzer gereicht, und ein `FAILED`-Job der Route Engine wird im UI überhaupt nicht
   angezeigt – die Generierung endet still.

Der API-Vertrag Frontend ↔ Engine ist inhaltlich weitgehend korrekt (Feldnamen, Enums,
TTL-Annahme 30 min). Die Lücken liegen bei Timeouts (es gibt schlicht keine),
Job-Ownership (jede jobId ist für jeden Angemeldeten abrufbar) und dem ungenutzten
Ballast `gpx` + `fitBase64` in jeder `/result`-Antwort.

---

## Findings

### B-01 — Prisma-Client pro Request mit `maxUses: 1`: jede Query öffnet eine eigene Postgres-Verbindung · P0
- **Ort:** `src/lib/prisma.ts:14`
- **Befund:**
  ```ts
  const getClient = cache(() => {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      maxUses: 1,
    });
    return new PrismaClient({ adapter });
  });
  ```
  `cache()` memoisiert den Client pro Request, aber `maxUses: 1` sorgt dafür, dass `pg` einen
  Client beim `release()` **zerstört** statt ihn in den Idle-Pool zurückzugeben. Innerhalb
  eines Requests wird damit für jede weitere Query eine neue TCP-+TLS-+Auth-Runde
  aufgebaut. `getAnalytics` (`src/features/analytics/actions/getAnalytics.ts:71`) feuert 17
  Queries via `Promise.all` – das sind 17 parallele Verbindungsaufbauten für einen
  Seitenaufruf. Zusätzlich wird der Pool nie beendet: es gibt im gesamten Repo kein
  `$disconnect()` und kein `pool.end()`.
- **Auswirkung:** Latenz pro Query um den Handshake erhöht; unter Last läuft
  `max_connections` bzw. das Pooler-Limit voll, obwohl die Anwendung wenig Traffic hat.
  Der Kommentar im File begründet nur, warum der *Client* nicht global sein darf – nicht,
  warum jede *Query* eine eigene Verbindung braucht.
- **Fix:** Auf einen Pooler mit HTTP-/WebSocket-Transport (Prisma Accelerate, Hyperdrive,
  Supabase/Neon Serverless Driver) wechseln, oder mindestens `maxUses` fallen lassen und
  stattdessen den Client pro Request neu bauen aber Verbindungen innerhalb des Requests
  wiederverwenden (`max: 1..3`, `idleTimeoutMillis: 0`) und den Pool am Requestende über
  `ctx.waitUntil(pool.end())` schließen. **Zu verifizieren:** genaues `pg`-Verhalten mit
  `maxUses` in der eingesetzten Version (`pg@^8.22`) unter workerd.

### B-02 — Mehrschritt-Mutationen ohne `$transaction` (nur 1 Transaktion im ganzen Projekt) · P1
- **Ort:** `src/features/rides/actions/leaveRide.ts:55-99`, `respondToJoinRequest.ts:78-118`,
  `requestJoinRide.ts:74-96`, `markAttendance.ts:60-77`, `joinGroup.ts:63-126`,
  `createRide.ts:142-219`
- **Befund:** Einziges `$transaction` im Repo ist `createRide.ts:142` (nur die Ride-Inserts der
  Serie). Die Waitlist-Promotion in `leaveRide.ts` ist z.B. vierstufig ohne jede Klammer:
  ```ts
  await prisma.rideParticipant.delete({ where: { rideId_userId: { rideId, userId: session.user.id } } });
  const nextInLine = await prisma.rideParticipant.findFirst({ where: { rideId, status: "WAITLISTED" }, orderBy: { createdAt: "asc" } });
  if (nextInLine) {
    await prisma.rideParticipant.update({ where: { id: nextInLine.id }, data: { status: "PENDING" } });
    await Notifier.push({ ... });   // eigene Query
    await Notifier.push({ ... });   // eigene Query
    await Logger.log(...);          // eigene Query
  }
  ```
- **Auswirkung:** Bricht der Request nach dem `delete` ab (Worker-CPU-Limit, DB-Fehler,
  Deploy), ist der Platz frei, aber niemand rückt nach – die Warteliste bleibt für immer
  hängen, ohne dass es jemand merkt. Analog bei `createRide`: die Rides existieren, die
  `GROUP_RIDE_CREATED`-Benachrichtigungen fehlen. Bei `joinGroup` kann die Mitgliedschaft
  ohne Owner-Notification entstehen.
- **Fix:** Alles, was einen konsistenten Zustand bildet (Participant-Statuswechsel +
  Notification + Log), in `prisma.$transaction(async (tx) => …)` klammern. Notifications, die
  bewusst „best effort" sein sollen, gehören dann *nach* dem Commit, nicht mitten hinein.

### B-03 — Race Conditions: Überbuchung, Doppel-Join, Doppel-Like → rohe Prisma-Fehler am Client · P1
- **Ort:** `src/features/rides/actions/requestJoinRide.ts:53-96`,
  `respondToJoinRequest.ts:78-92`, `src/features/posts/actions/togglePostLike.ts:32-52`,
  `src/features/community/actions/joinGroup.ts:36-105`,
  `src/features/community/actions/followRider.ts:30-48`
- **Befund:** Überall dasselbe Muster „lesen, prüfen, schreiben" ohne Sperre. Beispiel
  Kapazitätsprüfung:
  ```ts
  if (approve && participant.ride.maxParticipants !== null) {
    const approvedCount = await prisma.rideParticipant.count({ where: { rideId: participant.ride.id, status: "APPROVED" } });
    if (approvedCount >= participant.ride.maxParticipants) { return { success: false, error: "This ride is full." }; }
  }
  await prisma.rideParticipant.update({ where: { id: participantId }, data: { status } });
  ```
  Beispiel Doppel-Like (`togglePostLike.ts:32`): `findUnique` → `create`. Bei zwei parallelen
  Klicks schlägt `create` mit `P2002` (Unique `postId_userId`) fehl. Die Action hat **kein**
  `try/catch` – der Prisma-Fehler wird geworfen.
- **Auswirkung:** (a) Ein Ride mit `maxParticipants: 8` kann 9+ Approvals bekommen, wenn der
  Creator zwei Requests schnell hintereinander bestätigt. (b) Doppelklick auf Like/Join/Follow
  wirft einen unbehandelten `PrismaClientKnownRequestError` aus der Server Action; der Client
  sieht statt einer Meldung den Error-Boundary bzw. eine abgelehnte Promise. In Produktion ist
  nur der `digest` sichtbar – nicht debugbar für den Nutzer.
- **Fix:** Kapazität in einem `$transaction` mit `SELECT … FOR UPDATE` auf die Ride-Zeile
  (bzw. `isolationLevel: "Serializable"`) prüfen. Für Like/Join/Follow das Unique-Constraint
  als Mechanismus nutzen: `upsert` bzw. `create` mit `catch (e) { if (e.code === "P2002") … }`
  statt vorher zu lesen.

### B-04 — Listen-Queries komplett ohne `take` · P1
- **Ort:**
  - `src/features/chat/actions/direct-chat-action.ts:80` – **jede** je gesendete/empfangene DM
  - `src/features/rides/actions/getRides.ts:91` – alle künftigen Rides
  - `src/features/community/actions/getGroups.ts:12` – alle Gruppen **inkl. aller Member-Zeilen**
  - `src/features/community/actions/getRiders.ts:12` – alle nicht gebannten User
  - `src/features/users/actions/getUsers.ts:12` – alle User inkl. aller aktiven Sessions
  - `src/features/posts/actions/getPostComments.ts:14` – alle Kommentare eines Posts
  - `src/features/events/actions/getCalendarEvents.ts:21` – alle künftigen Radnet-Events
  - `src/features/pro/actions/getStageReplay.ts:55` – alle Telemetrie-Frames einer Etappe
- **Befund:** z.B. `getDirectConversations`:
  ```ts
  const messages = await prisma.directMessage.findMany({
    where: { OR: [{ senderId: myId }, { recipientId: myId }] },
    orderBy: { createdAt: "desc" },
    select: { content: true, createdAt: true, senderId: true, recipientId: true, readAt: true },
  });
  ```
  Anschließend wird in JS (Zeile 98) auf Gesprächspartner gefaltet. Und `getGroups`
  (`getGroups.ts:20`) lädt zu *jeder* Gruppe die komplette `members`-Liste, nur um in JS zu
  zählen (`approvedMembers.length`).
- **Auswirkung:** Speicher- und Zeitverbrauch wächst linear mit der Historie. Auf einem
  Cloudflare Worker (128 MB) ist das der wahrscheinlichste OOM-Kandidat; `getStageReplay`
  bei einer 5-h-Etappe mit 30-s-Cadence sind ~600 Frames × ~180 Fahrer JSON.
- **Fix:** Überall `take` + Cursor. Für `getDirectConversations` die Partnerliste per
  `groupBy`/`$queryRaw` (`DISTINCT ON`) ermitteln statt in JS. Für `getGroups`
  `_count: { select: { members: { where: { status: "APPROVED" } } } }` plus eine gezielte
  `members`-Query nur für die eigene Mitgliedschaft.

### B-05 — `include` statt `select`: volle Geometrie in jeder Listen-Query · P2
- **Ort:** `src/features/rides/actions/getRides.ts:96`, `getUserRides.ts:20`,
  `getGroupRides.ts:36`, `src/features/posts/actions/getFeed.ts:86`
- **Befund:** `include: { creator: …, participants: …, _count: … }` – `include` liefert
  **alle** Skalarfelder des Ride mit, also `routeGeometry` (encoded Polyline, oft mehrere KB)
  und `elevationProfile` (bis 200 Punkte JSON) und `waypoints`. Das Mapping danach (z.B.
  `getRides.ts:123-146`) verwirft `elevationProfile` wieder komplett.
- **Auswirkung:** Unnötiges DB→Worker-Transfervolumen, das mit der Zahl der Rides in der
  Liste skaliert – bei `getFeed` zusätzlich pro Seite.
- **Fix:** `select` mit expliziter Feldliste, `elevationProfile` nur in `getRide`/`getRideGpx`
  laden.

### B-06 — Feed-Cursor vergleicht IDs über zwei verschiedene Tabellen hinweg · P2
- **Ort:** `src/features/posts/actions/getFeed.ts:50-57` und `:148-159`
- **Befund:** Der Cursor ist `{ createdAt, id }` des letzten *gemischten* Items:
  ```ts
  const cursorFilter = cursor ? { OR: [
    { createdAt: { lt: new Date(cursor.createdAt) } },
    { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
  ] } : {};
  ```
  Dieses Filter wird identisch auf `post` **und** `ride` angewendet. Stammt der Cursor von
  einem Post, wird `id < <post-cuid>` auf die Ride-Tabelle angewendet – ein Vergleich
  zwischen zwei unabhängigen cuid-Räumen.
- **Auswirkung:** Bei gleichem `createdAt` (Sekundenbruchteil-Kollisionen, Seed-Daten,
  Serien-Rides aus `createRide` mit identischem `createdAt`) werden Einträge der jeweils
  anderen Tabelle übersprungen oder doppelt geliefert. Zusätzlich ist `nextCursor` schief:
  `merged.length > limit` prüft die *Summe* beider Quellen, nicht ob wirklich noch ältere
  Items existieren.
- **Fix:** Getrennte Cursor pro Quelle (`{ postCursor, rideCursor }`) oder ein einziger
  `createdAt`-Cursor plus tabellenlokaler ID-Tiebreaker.

### B-07 — N+1: `await prisma.*` in Schleifen · P1
- **Ort:**
  - `src/features/events/actions/syncCalendarEvents.ts:111-129` – bis zu 900 sequenzielle Upserts
  - `src/features/rides/actions/cancelRide.ts:85-123` – pro Serien-Instanz je 1 Log + 1 Participant-Query
  - `src/features/rides/actions/createRide.ts:173-192` – pro Serien-Instanz 1 sequenzieller `Logger.log`
- **Befund:** `syncCalendarEvents` ist der gravierendste Fall:
  ```ts
  const items = await client.search({ startDate, endDate, maxPages: LIST_MAX_PAGES }); // 30 Seiten × 30 Events
  for (const item of items) {
    …
    await prisma.radnetEvent.upsert({ where: { id: item.id }, update: listFields, create: { …listFields, id: item.id, type: item.type } });
  }
  ```
  Der Kommentar ab Zeile 42 begründet die Batch-Größe mit Cloudflares Subrequest-Limit –
  das gilt aber nur für die *HTTP*-Requests an rad-net, nicht für die DB-Roundtrips. Mit B-01
  ist jeder dieser Upserts zusätzlich ein eigener Verbindungsaufbau.
- **Auswirkung:** Ein einzelner Kalender-Sync blockiert den globalen Lock (3 min,
  `LOCK_MS`) und läuft mit hoher Wahrscheinlichkeit ins Worker-Zeitlimit – der Lock wird dann
  zwar via `finally` freigegeben, aber `listSyncedAt` bleibt ungesetzt, sodass der nächste
  Besucher denselben Vollscrape erneut startet (Endlosschleife bei genug Events).
- **Fix:** Upserts chunken und pro Chunk in `prisma.$transaction([...])` bündeln, oder
  `createMany({ skipDuplicates: true })` + `updateMany` für die Delta-Felder. `Logger.log` in
  Schleifen durch ein `createMany` ersetzen.

### B-08 — Fehlende Composite-Indizes für die tatsächlichen `where`/`orderBy`-Kombinationen · P1
- **Ort:** `prisma/schema.prisma` (siehe Tabelle „Index-Empfehlungen")
- **Befund:** Schema und Migrationen sind konsistent (alle 41 `CREATE INDEX` aus den
  Migrationen entsprechen dem Schema, kein Drift). Aber fast alle Indizes sind
  Single-Column-FK-Indizes. Praktisch jede Liste sortiert nach `createdAt` und filtert nach
  einer FK – dafür existiert nirgends ein passender Composite. Beispiel Notifications:
  Index ist `([userId])` und `([userId, read])`, die Query ist
  `where: { userId }, orderBy: { createdAt: "desc" }, take: 50`
  (`src/features/notification/actions/notification-actions.ts:30`).
- **Auswirkung:** Postgres liest alle Zeilen des Users und sortiert im Speicher. Bei den
  Cursor-Paginierungen (`getFeed`, `getNotificationHistory`) verhindert der fehlende
  `(fk, createdAt, id)`-Index einen Index-Only-Scan komplett.
- **Fix:** Siehe Tabelle unten.

### B-09 — Uneinheitliches Rückgabeformat der Server Actions · P2
- **Ort:** drei parallele Konventionen im selben Feature-Tree
- **Befund:**
  - `{ success: true; message } | { success: false; error }` – Mehrheit, z.B. `cancelRide.ts:11`
  - `{ success: false; message: "…" }` – Community-Follow: `followRider.ts:13`
    (`return { success: false, message: "Invalid form data." }`), `unfollowRider.ts:12`
  - `throw new Error(...)` – alle Read-Actions, z.B. `getRides.ts:35`, `getFeed.ts:33`,
    `getGroupRides.ts:15`, `chat-action.ts:11`, `getAnalytics.ts:43`
  - `Promise<void>` ohne jedes Ergebnis – `updatePresence.ts:11`, `markNotificationsSeen():127`
  - `null` als Sammelrückgabe für „nicht gefunden" und „nicht öffentlich" – `getPublicRide.ts:33`
- **Auswirkung:** Der Aufrufer muss pro Action wissen, welche Konvention gilt. In
  `followRider` liest der Client wahrscheinlich `result.error` (undefined) statt `result.message`
  – zu verifizieren im Client-Code, aber die Diskrepanz ist real.
- **Fix:** Einen gemeinsamen `ActionResult<T>`-Typ definieren (`{ ok: true; data } | { ok: false; error: { code, message } }`)
  und alle Actions darauf ziehen, inkl. der Read-Actions.

### B-10 — Read-Actions werfen für erwartete Zustände; Next 16 maskiert die Message in Produktion · P2
- **Ort:** `src/features/rides/actions/getRides.ts:35`, `getRide.ts:17`, `getGroupRides.ts:15`,
  `getMyRideGroups.ts:18`, `searchPlaces.ts:29`, `src/features/posts/actions/getFeed.ts:33`,
  `src/features/community/actions/getGroups.ts:9`, `getRiders.ts:9`, `getRider.ts:29`,
  `src/features/analytics/actions/getAnalytics.ts:43`, `src/features/users/actions/getUsers.ts:9`,
  `src/features/chat/actions/chat-action.ts:11,:76`, `direct-chat-action.ts:75,:178,:242`,
  `src/features/events/actions/*`
- **Befund:** `if (!session) { throw new Error("You must be signed in."); }` bzw.
  `throw new Error("You must be a member of this group.")`. Die Next-16-Doku ist hier
  eindeutig (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md:24`):
  > „For these errors, avoid using `try`/`catch` blocks and throw errors. Instead, model
  > expected errors as return values."

  und (`…/03-api-reference/03-file-conventions/error.md:106`):
  > „During development, the `Error` object forwarded to the client will be serialized and
  > include the `message` … However, **this behavior is different in production** … Errors
  > forwarded from Server Components show a generic message with an identifier."
- **Auswirkung:** In Produktion sieht der Nutzer bei abgelaufener Session oder fehlender
  Gruppenmitgliedschaft nicht „Du musst Mitglied sein", sondern den Error-Boundary
  (`src/app/error.tsx`) mit generischer Meldung. Die sorgfältig formulierten Fehlertexte sind
  wirkungslos.
- **Fix:** Erwartete Zustände als Rückgabewert modellieren (siehe B-09); nur echte
  Programmfehler werfen. Für Auth in Server Components stattdessen `requireAuth()` mit
  `redirect("/login")` verwenden – das existiert bereits in `guards.ts:22`.

### B-11 — Rohe Upstream-Fehlertexte werden an den Client durchgereicht · P2
- **Ort:** `src/features/rides/lib/brouter.ts:143-150`, `src/features/rides/actions/calculateRoute.ts:35-43`,
  `createRide.ts:122-130`, `src/features/rides/lib/routeEngine.ts:219-221`
- **Befund:** BRouter:
  ```ts
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message.trim() || "No cycling route could be found …");
  }
  ```
  Und in `calculateRoute.ts:38`: `error: error instanceof Error ? error.message : "…"`.
  Analog gibt `toUserSafeError` bei Engine-400 den Rohtext weiter
  (`routeEngine.ts:219: if (response.status === 400 && body.error) return new Error(body.error)`),
  z.B. `minDistanceKm/maxDistanceKm are only valid in roundtrip mode` oder
  `targetDistanceKm must be between 1 and 400` – englische Entwickler-Meldungen mit
  internen Feldnamen.
- **Auswirkung:** Der Nutzer bekommt Meldungen im Stil von BRouter-Debug-Output bzw.
  Engine-Validierungsnamen zu sehen. Kein Geheimnisleck, aber die Funktion heißt
  `toUserSafeError` und hält das Versprechen nur teilweise.
- **Fix:** Upstream-Text loggen, dem Client eine gemappte Meldung geben. Die bereits
  vorhandenen Spezialfälle (`covered region`, 429, 503) zeigen das richtige Muster.

### B-12 — Fehlgeschlagene Routen-Generierung wird im UI nie angezeigt · P1
- **Ort:** `src/features/rides/components/routeGeneratorMap.tsx:213-241`,
  `src/features/rides/actions/getRouteGenerationStatus.ts:40-50`
- **Befund:** Die Action liefert `FAILED`/`CANCELLED` korrekt als `{ success: true, status: { state: "FAILED", errorDetail } }`
  zurück. Im Client:
  ```ts
  refetchInterval: (query) => { … return data.status.state === "PENDING" || data.status.state === "RUNNING" ? 1000 : false; },
  …
  const options = status?.state === "SUCCEEDED" ? (status.options ?? null) : null;
  const generating = submitMutation.isPending || (jobId !== null && (!status || status.state === "PENDING" || status.state === "RUNNING"));
  ```
  Es gibt im gesamten File **keinen** Zweig für `FAILED` oder `CANCELLED` – `grep` findet die
  Strings nicht. `errorDetail` wird zwar bis in den Typ `RouteGenerationStatus`
  (`src/features/rides/types.ts:190`) transportiert, aber nirgends gerendert.
- **Auswirkung:** Bei Job-Timeout (`Zeitlimit überschritten (180s)`), Routing-Fehler oder
  GraphHopper-Ausfall hört der Spinner auf, es erscheinen keine Routen und **keine Meldung**.
  Der Nutzer weiß nicht, ob er warten, neu tippen oder aufgeben soll.
- **Fix:** `state === "FAILED"` → `toast.error(status.errorDetail ?? status.message)` plus
  Reset von `jobId`; `CANCELLED` still verwerfen.

### B-13 — Kein Timeout auf irgendeinem ausgehenden Fetch der Festi-App · P1
- **Ort:** `src/features/rides/lib/routeEngine.ts:238,257,273,285`, `lib/brouter.ts:139`,
  `lib/geocode.ts`, `src/features/rides/actions/searchPlaces.ts:44,62`
- **Befund:** `grep -n "AbortSignal|signal:|timeout" src/features/rides/lib/*.ts src/lib/*.ts`
  liefert **null Treffer**. Beispiel:
  ```ts
  response = await fetch(`${getRouteEngineBaseUrl()}/v1/jobs`, {
    method: "POST", headers: engineHeaders(userRef, idempotencyKey),
    body: JSON.stringify(request), cache: "no-store",
  });
  ```
  Zum Vergleich: die Engine selbst setzt gegenüber GraphHopper korrekt ein Timeout
  (`festi-backend/src/graphhopper.ts:56: private readonly timeoutMs = 60_000`).
- **Auswirkung:** Hängt die Engine (siehe B-15) oder BRouter, blockiert die Server Action bis
  zum Worker-Limit. Der Poll-Interval von 1 s im UI stapelt in der Zwischenzeit weitere
  hängende Requests.
- **Fix:** `signal: AbortSignal.timeout(ms)` für alle Aufrufe – kurz für Status-Polls (~3 s),
  großzügiger für `/result` (~15 s).

### B-14 — Engine: Per-User-Quota leckt, wenn der Submit nach dem Increment scheitert · P2
- **Ort:** `festi-backend/src/api/server.ts:344-374`
- **Befund:**
  ```ts
  if (userRef && config.maxOpenJobsPerUser > 0) {
    const open = await deps.store.incrementUserOpen(userRef);
    …
  }
  …
  await deps.store.setStatus(jobId, 'PENDING', 0, 'Job eingereicht');
  await deps.queue.add(jobId, params);
  ```
  Wirft `setStatus` oder `queue.add` (Redis-Fehler), greift der äußere Catch (`:298-306`) und
  antwortet 500 – der Zähler bleibt erhöht. Er heilt erst über die TTL
  (`jobs.ts:112: expire(key, this.config.jobPendingTtlSec)` = **2 Stunden**).
- **Auswirkung:** Bei `MAX_OPEN_JOBS_PER_USER=3` (Default) sperrt sich ein Nutzer nach drei
  fehlgeschlagenen Submits für zwei Stunden selbst aus – mit der Meldung „You have too many
  route generations running" (`routeEngine.ts:210`), die die Ursache verschleiert.
- **Fix:** `try/finally` um Submit-Rest, Decrement im Fehlerfall. Ergänzend: Quota-TTL an
  `jobTimeoutSec` koppeln statt an `jobPendingTtlSec`.

### B-15 — Engine: Redis-Ausfall führt zu unbegrenzt hängenden HTTP-Requests · P1
- **Ort:** `festi-backend/src/jobs.ts:37-40`, `festi-backend/src/api/server.ts:240`
- **Befund:**
  ```ts
  export function createRedis(url: string): Redis {
    // BullMQ requires maxRetriesPerRequest: null on its connections.
    return new Redis(url, { maxRetriesPerRequest: null });
  }
  ```
  `maxRetriesPerRequest: null` + ioredis-Default `enableOfflineQueue: true` bedeutet: Kommandos
  werden bei getrennter Verbindung **unbegrenzt gepuffert** statt zu scheitern. Der HTTP-Server
  setzt weder `server.requestTimeout` noch `headersTimeout` (grep in `server.ts` findet nur den
  Shutdown-`setTimeout` in Zeile 637).
- **Auswirkung:** Bei Redis-Ausfall antwortet `/v1/jobs/:id` nicht mit 500, sondern gar nicht.
  Zusammen mit B-13 (kein Client-Timeout) hängt die Kette Frontend → Engine → Redis
  komplett. `/healthz` würde zwar 503 melden (`queuePing` schlägt fehl) – aber auch der
  `redis.ping()` in `queuePing` läuft in dieselbe Offline-Queue. **Zu verifizieren:** ob
  `ping()` bei ioredis der Offline-Queue unterliegt oder sofort rejected.
- **Fix:** Zwei getrennte Redis-Clients: einer für BullMQ (`maxRetriesPerRequest: null`), einer
  für den JobStore/Health mit `enableOfflineQueue: false`, `commandTimeout: 2000`,
  `maxRetriesPerRequest: 2`. Zusätzlich `server.requestTimeout = 30_000`.

### B-16 — Engine: rohe interne Fehlermeldung als `errorDetail` an den Client · P2
- **Ort:** `festi-backend/src/worker/index.ts:168-174`
- **Befund:**
  ```ts
  await store.setStatus(jobId, 'FAILED', 0, 'Generierung fehlgeschlagen', (err as Error).message);
  ```
  `errorDetail` geht über `statusToJson` (`server.ts:136`) unverändert an den Aufrufer und von
  dort über `getRouteGenerationStatus.ts:47` bis in den Client-Typ. Enthält bei
  GraphHopper-Fehlern URLs/Hostnamen und Stacktrace-Fragmente.
- **Auswirkung:** Interne Topologie (Routing-Engine-Adresse, Bibliotheksinterna) landet
  potenziell im Browser. Aktuell nur latent, weil das UI `errorDetail` nicht rendert (B-12) –
  sobald das behoben wird, ist es sichtbar.
- **Fix:** `errorDetail` auf eine kuratierte Fehlerklasse (`ROUTING_FAILED`, `TIMEOUT`,
  `NO_ROUTE_FOUND`) reduzieren, Volltext nur ins Server-Log.

### B-17 — Engine: `/result` liefert `gpx` + `fitBase64` mit, die Festi gar nicht braucht · P2
- **Ort:** `festi-backend/src/api/server.ts:142-191`, `src/features/rides/lib/routeEngine.ts:136-174`
- **Befund:** `routeToJson` gibt immer `gpx` (kompletter GPX-String) und `fitBase64`
  (base64-kodierte FIT-Datei) je Route zurück. Der Festi-Typ `EngineRoute` deklariert beide
  Felder nicht und `toRouteResult` (`routeEngine.ts:411`) verwendet sie nicht. Das UI fordert
  `numAlternatives: 5` an (`routeGeneratorMap.tsx:196`).
- **Auswirkung:** Pro Poll-Erfolg **und** erneut bei `createRide` lädt der Worker fünf volle
  Routen inkl. GPX + FIT + kompletter GeoJSON-Geometrie und parst sie mit `response.json()`
  (doppelter Speicher). Der Kommentar in `server.ts:77` benennt das Problem selbst
  („Route results (GPX + FIT + profile) easily exceed 1 MB") und löst es nur transportseitig
  per gzip – im Worker-Speicher liegt trotzdem das entpackte Original.
- **Fix:** Query-Parameter `?fields=` oder `?include=gpx,fit` an `/v1/jobs/:id/result`
  (Default: ohne). Die Downloads gibt es ohnehin separat unter `/result/:i.gpx` bzw. `.fit`.

### B-18 — Kein Ownership-Check auf `jobId` (IDOR über die gesamte Kette) · P2
- **Ort:** `src/features/rides/actions/getRouteGenerationStatus.ts:20-29`,
  `cancelRouteGeneration.ts:13-24`, `createRide.ts:109-118`, `festi-backend/src/api/server.ts:442-543`
- **Befund:** Die Actions prüfen nur, *dass* jemand angemeldet ist, nicht *wem* der Job gehört:
  ```ts
  const user = await getCurrentUser();
  if (!user) { return { success: false, error: "You must be signed in." }; }
  if (typeof jobId !== "string" || jobId.length === 0 || jobId.length > 100) { … }
  await cancelGenerationJob(jobId);
  ```
  Die Engine kennt `X-Festi-User` nur für die Quota (`server.ts:344`), speichert es aber nicht
  am Job-Status – ein Ownership-Check ist serverseitig gar nicht möglich.
- **Auswirkung:** Wer eine fremde jobId kennt, kann deren Status lesen, das Ergebnis über
  `createRide` als eigenen Ride speichern und den Job abbrechen. Die jobIds sind `randomUUID()`
  (`server.ts:358`), also nicht erratbar – das Risiko ist damit gering, aber die Autorisierung
  fehlt strukturell.
- **Fix:** `userRef` im `JobStatusRecord` persistieren und in `handleStatus`/`handleResult`/
  `handleCancel` gegen den `X-Festi-User`-Header prüfen (404 statt 403, um Existenz nicht zu
  verraten).

### B-19 — Verwaiste R2-Objekte: `deletePost` räumt Bilder nicht auf · P2
- **Ort:** `src/features/posts/actions/deletePost.ts:29`, vgl. `src/features/rides/actions/deleteRidePhoto.ts:36-42`
  und `src/features/community/actions/deleteGroup.ts:41-45`
- **Befund:** `await prisma.post.delete({ where: { id: postId } });` – kein `deleteObject`.
  Die `PostImage`-Zeilen kaskadieren weg (`schema.prisma:507 onDelete: Cascade`), die Objekte
  unter `posts/{postId}/{position}.webp` (`uploadPostImage.ts:55`) bleiben für immer in R2.
  `deleteGroup` und `deleteRidePhoto` machen es richtig vor.
- **Auswirkung:** Monoton wachsende Speicherkosten, und die Bilder bleiben unter ihrer
  öffentlichen URL abrufbar, obwohl der Post gelöscht ist (DSGVO-relevant beim Löschwunsch).
- **Fix:** Vor dem `delete` die `images` selektieren und `deleteObject` je Key aufrufen
  (best effort, wie in `deleteRidePhoto.ts:39`). Gleiches gilt für `deleteRide` – dort sterben
  `RidePhoto`-Zeilen per Cascade, die R2-Objekte unter `rides/{rideId}/photos/*` nicht.

### B-20 — Polymorphe Referenzen ohne FK: Notifications/ActivityLogs zeigen auf gelöschte Entities · P2
- **Ort:** `prisma/schema.prisma:207-212` (Notification), `:307-310` (ActivityLog)
- **Befund:**
  ```prisma
  // Polymorphic reference to any related entity (e.g. a group).
  targetType String?
  targetId   String?
  ```
  Kein FK, keine Cascade. `deleteRide`, `deletePost`, `deleteGroup` löschen nie die zugehörigen
  Notifications. `Notifier.remove` (`notification.ts:72`) wird nur in Undo-Pfaden
  (unfollow, withdraw, leave, unlike) verwendet, nicht beim Löschen der Entity.
- **Auswirkung:** Die Notification-Liste (`getNotifications`, take 50) füllt sich mit Einträgen,
  deren `targetId` ins Leere zeigt – Klick führt auf 404. Bei gelöschten Rides bleiben
  `RIDE_JOIN_REQUEST`-Notifications ewig stehen.
- **Fix:** In den Delete-Actions `prisma.notification.deleteMany({ where: { targetType, targetId } })`
  ergänzen (idealerweise in derselben Transaktion, siehe B-02). Für ActivityLog ist das
  Verwaisen akzeptabel (Audit-Trail), sollte aber im UI abgefangen werden.

### B-21 — `PostImage` ohne `@@unique([postId, position])` → Duplikate beim Re-Upload · P2
- **Ort:** `prisma/schema.prisma:500-511`, `src/features/posts/actions/uploadPostImage.ts:55-72`
- **Befund:**
  ```ts
  const key = `posts/${postId}/${position}.webp`;   // stabiler Key, überschreibt in R2
  …
  await prisma.postImage.create({ data: { postId, url: imageUrl, position } });   // immer INSERT
  ```
  Der R2-Key ist stabil (Überschreiben), die DB-Zeile wird aber jedes Mal neu angelegt. Es gibt
  kein Unique-Constraint auf `(postId, position)`.
- **Auswirkung:** Lädt ein Nutzer Position 0 zweimal hoch, hat der Post zwei `PostImage`-Zeilen
  mit derselben Position und (bis auf `?v=`) derselben URL – das Bild erscheint doppelt im Feed
  (`getFeed.ts:69: images: { orderBy: { position: "asc" } }`).
- **Fix:** `@@unique([postId, position])` im Schema plus `upsert` statt `create`.
  Analog `uploadRidePhoto.ts:57`: die Prüfung `ride._count.photos >= MAX_RIDE_PHOTOS` ist ein
  TOCTOU – bei parallelen Uploads lassen sich mehr als `MAX_RIDE_PHOTOS` anlegen.

### B-22 — `ProTelemetryFrame` wächst unbegrenzt, ohne Retention und ohne `take` beim Lesen · P2
- **Ort:** `prisma/schema.prisma:553-565`, `src/app/api/pro/capture/route.ts:55-66`,
  `src/features/pro/actions/getStageReplay.ts:55`
- **Befund:** Der Cron läuft laut `wrangler.jsonc` jede Minute zwischen 08–17 UTC und schreibt
  je Rennen einen Frame mit dem kompletten Fahrerfeld als `payload Json`. Es gibt keine
  Löschlogik im gesamten Repo (`grep proTelemetryFrame` → nur `createMany` und `findMany`).
  Das Lesen holt alle Frames einer Etappe ohne Limit.
- **Auswirkung:** Über eine Grand-Tour-Saison summieren sich hunderttausende JSON-Payloads;
  eine einzelne Replay-Anfrage lädt alle Frames einer Etappe in den Worker-Speicher.
- **Fix:** Retention-Job (z.B. Frames älter als 90 Tage löschen, oder auf 1 Frame/60 s
  ausdünnen) und beim Lesen `take` + Downsampling per SQL.

### B-23 — Route Engine: `handleCancel` nach dem Erfolgsfall inkonsistent mit dem Frontend-Vertrag · P3
- **Ort:** `festi-backend/src/api/server.ts:516-543`, `src/features/rides/lib/routeEngine.ts:284-293`
- **Befund:** `handleCancel` antwortet 404 für unbekannte Jobs, 200 für bereits terminale Jobs
  und 200 mit unverändertem Status, wenn der Worker den Job schon gegriffen hat (Flag-only-
  Cancel). Der Client:
  ```ts
  export async function cancelGenerationJob(jobId: string): Promise<void> {
    await fetch(…, { method: "DELETE", … }).catch(() => {});
  }
  ```
  – schluckt alles, prüft den Status nicht und `cancelRouteGeneration.ts:23` gibt unabhängig
  vom Ergebnis `{ success: true }` zurück.
- **Auswirkung:** Fachlich vertretbar (Cancel ist best effort), aber die Quota wird erst
  freigegeben, wenn der Worker den nächsten Checkpoint erreicht. Kombiniert mit
  `routeGeneratorMap.tsx:259-263` – dort wird `activeJobRef.current` erst in `onSuccess`
  gesetzt – bleibt ein noch fliegender Submit beim schnellen Nachtippen **unstorniert** und
  frisst dauerhaft einen der drei Quota-Slots bis zum Job-Ende.
- **Fix:** `activeJobRef` bereits beim `mutate` setzen (bzw. `AbortController` am Submit), und
  `cancelGenerationJob` den Status zurückgeben lassen, damit das UI „wird abgebrochen" zeigen kann.

### B-24 — HTTP-Statuscodes in `src/app/api/**`: Validierungsfehler als 404, Konfigurationsfehler als 503 · P3
- **Ort:** `src/app/api/pro/live/[race]/[year]/[stage]/route.ts:68-78`,
  `src/app/api/pro/capture/route.ts:82-88`, `src/app/api/pro/reports/[reportId]/route.ts:52-57`
- **Befund:**
  ```ts
  if (!race?.asoRace || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 30) {
    return NextResponse.json({ error: "Unknown stage." }, { status: 404 });
  }
  ```
  Ein unparsbares `year` („abc") oder `stage: 99` ist ein Client-Fehler (400), kein 404.
  In `capture/route.ts:84` wird ein fehlendes `CRON_SECRET` mit **503** beantwortet – ein
  Serverkonfigurationsfehler, also 500. In `reports/route.ts:55` wird *jeder* Upstream-Fehler
  zu **502**, auch ein 404 des Upstreams (der Report existiert nicht) – der Client kann
  „gibt's nicht" nicht von „Upstream kaputt" unterscheiden.
- **Auswirkung:** Monitoring und Client-Retry-Logik laufen auf falschen Signalen; 502 löst
  typischerweise Retries aus, die bei einem echten 404 sinnlos sind.
- **Fix:** 400 für Parameterfehler, 404 nur für „Rennen/Etappe existiert nicht", 500 für
  fehlende Konfiguration, 404 durchreichen wenn der Upstream 404 meldet.
  **Positiv:** alle vier Route Handler antworten konsequent mit `NextResponse.json` – nie HTML.

### B-25 — Route Engine: kein 405, Method-Mismatch fällt auf 404; OpenAPI ohne Security-Scheme und 401 · P3
- **Ort:** `festi-backend/src/api/server.ts:262-297`, `festi-backend/openapi.yaml`
- **Befund:** Trifft ein Request das Job-Pattern, aber mit falscher Methode (z.B.
  `PUT /v1/jobs/:id`), fällt er durch alle `if`-Zweige und landet bei
  `sendJson(res, 404, { error: 'not found' })`. Sauber wäre 405 mit `Allow`-Header.
  Wichtiger: `grep -n "security|401" openapi.yaml` → **keine Treffer**. Der Server verlangt
  aber bei gesetztem `API_KEY` für jeden Endpunkt außer `/healthz` einen Key
  (`server.ts:246`) und antwortet sonst mit 401. Auch 500 (`server.ts:303`) ist nicht dokumentiert.
- **Auswirkung:** Ein Integrator, der sich an die Spec hält, baut keine Auth ein und bekommt
  überall 401 ohne dokumentierte Ursache.
- **Fix:** `components.securitySchemes.apiKeyAuth` (`type: apiKey, in: header, name: X-API-Key`)
  plus globales `security:` und je Pfad die Antworten 401 und 500 ergänzen. Für 405 einen
  expliziten Fallback im Router.

### B-26 — `syncCalendarEvents` ist eine offene Server Action mit globalem Lock · P2
- **Ort:** `src/features/events/actions/syncCalendarEvents.ts:51-97`
- **Befund:** Jeder eingeloggte Nutzer kann den Scrape auslösen; die einzige Bremse ist die
  Lock-Zeile:
  ```ts
  const acquired = await prisma.radnetSyncState.updateMany({
    where: { id: 1, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  ```
  Der Lock wird im `finally` (`:91-96`) *bedingungslos* freigegeben – auch wenn der Sync
  abgebrochen ist. Und der Detail-Pfad (`syncDetailBatch`) macht pro Batch bis zu 3
  HTTP-Requests an rad-net mit je 1 s `sleep`, das UI ruft die Action laut Kommentar in
  Schleife auf, solange `pendingDetails > 0`.
- **Auswirkung:** Vergleichsweise leicht als Amplifikations-Vektor gegen rad-net nutzbar, und
  jeder Aufruf blockiert bis zu 3 s im Worker (Sleeps zählen zur Wall-Clock).
- **Fix:** Sync per Cron (`wrangler.jsonc` hat bereits einen `scheduled`-Handler über
  `custom-worker.ts`) statt per Nutzeraktion; die Action nur noch lesen lassen.

### B-27 — Analytics: `distinct` im Speicher, teure Counts ohne passende Indizes · P2
- **Ort:** `src/features/analytics/actions/getAnalytics.ts:79-83`, `:117-128`
- **Befund:**
  ```ts
  prisma.session.findMany({ where: { expiresAt: { gt: now } }, select: { userId: true }, distinct: ["userId"] }),
  ```
  Prisma wendet `distinct` bei `findMany` clientseitig an – es werden also **alle** nicht
  abgelaufenen Sessions geladen. Auf `Session.expiresAt` gibt es keinen Index
  (`schema.prisma:79` hat nur `@@index([userId])`). Die drei `activityLog.count`-Aufrufe
  filtern auf `action` **und** `createdAt`; im Schema existieren beide nur einzeln
  (`:324`, `:328`).
- **Auswirkung:** Das Admin-Dashboard wird mit wachsender Session- und Log-Tabelle spürbar
  langsamer; zusammen mit B-01 sind es 17 separate Verbindungen.
- **Fix:** `groupBy(['userId'])` bzw. `$queryRaw COUNT(DISTINCT "userId")`,
  `@@index([expiresAt])` auf Session, `@@index([action, createdAt])` auf ActivityLog.

### B-28 — Engine: Idempotency-Key- und Status-TTL divergieren; Dedup kann auf toten Job zeigen · P3
- **Ort:** `festi-backend/src/jobs.ts:128-139`, `festi-backend/src/config.ts:64-65`,
  `festi-backend/src/api/server.ts:361-369`
- **Befund:** `rememberIdempotent` speichert mit `jobResultTtlSec` (30 min), der
  Status-Record eines *laufenden* Jobs lebt aber `jobPendingTtlSec` (2 h), der eines
  terminalen 30 min. Der Key wird **vor** `setStatus`/`queue.add` registriert – stirbt der
  Prozess dazwischen, mappt der Key 30 Minuten lang auf eine jobId, die nie einen Status
  bekommt.
- **Auswirkung:** Ein Retry mit demselben `requestKey` bekommt `202 { jobId, deduplicated: true }`
  und pollt anschließend gegen 404 → Frontend zeigt „This generation has expired"
  (`getRouteGenerationStatus.ts:36`), obwohl nie etwas generiert wurde. Der Nutzer kann sich
  daraus nur befreien, indem er die Parameter ändert (neuer `requestKey`).
  In `festi-routes/scripts/generate.mjs:133` ist derselbe Effekt sichtbar: der Kommentar
  erklärt, dass der Request-Hash im Key einen alten fehlgeschlagenen Job vermeidet – für
  einen *unveränderten* Wiederholungslauf innerhalb von 30 min gilt das aber nicht, dort
  wird der FAILED-Job erneut geliefert.
- **Fix:** Key erst *nach* erfolgreichem `queue.add` schreiben (bzw. bei Fehler wieder löschen)
  und die TTL an `jobPendingTtlSec` angleichen.

### B-29 — Engine-Worker: Job-Dauer im `failed`-Handler ist immer ~0 · P3
- **Ort:** `festi-backend/src/worker/index.ts:192-208`
- **Befund:**
  ```ts
  await finalize(data.jobId, data.params.userRef, 'FAILED', Date.now());
  ```
  Als `startedAtMs` wird der aktuelle Zeitpunkt übergeben, sodass
  `bumpMetric('job_duration_ms_sum', Date.now() - startedAtMs)` (`:70`) immer ≈ 0 addiert,
  während `job_duration_count` hochgezählt wird.
- **Auswirkung:** `routeengine_job_duration_seconds` (`server.ts:426-428`) unterschätzt die
  Dauer systematisch, gerade bei den interessanten Fällen (Stalls, Crashes).
- **Fix:** Startzeit im Status-Record (`createdAt` ist vorhanden) verwenden statt `Date.now()`.

### B-30 — Wetterdaten der generierten Route beziehen sich auf „jetzt", nicht auf den Ride-Start · P3
- **Ort:** `src/features/rides/components/routeGeneratorMap.tsx:183-201`,
  `src/features/rides/actions/generateRoute.ts:56`, `festi-backend/src/validation.ts:231-247`
- **Befund:** Das Schema kennt `departureTime` (`schemas/index.ts:77`) und die Action reicht
  es durch (`generateRoute.ts:56: departureTime: data.departureTime`), aber der Generator-UI
  sendet es nie – `grep departureTime` findet im Client keinen Treffer. Die Engine nutzt dann
  `new Date()` (`worker/index.ts:87-89`).
- **Auswirkung:** Die im Routen-Vergleich angezeigten Werte (`weather`, `airQuality`,
  `LEAST_HEADWIND`-Label, wind-optimierte Startrichtung) gelten für den Moment des Klicks,
  nicht für den geplanten Ride-Start – der beim Anlegen eines Rides typischerweise Tage
  entfernt ist. Zusätzlich würde die Engine `departureTime > now + 5 Tage` mit **400**
  ablehnen (`validation.ts:243`), was via B-11 als englischer Rohtext beim Nutzer landet;
  das Frontend-Zod-Schema kennt diese Grenze nicht.
- **Fix:** Ride-Startzeit im Generator abfragen und als `departureTime` mitschicken;
  `z.string().datetime()` um eine `refine`-Prüfung auf „≤ +5 Tage" ergänzen und sonst die
  Wetter-Anreicherung im UI als „für jetzt" kennzeichnen.

---

## Index-Empfehlungen

| Modell | Query (Ort) | Fehlender Index | Vorschlag |
|---|---|---|---|
| `Notification` | `where userId`, `orderBy createdAt desc, id desc`, Cursor (`notification-actions.ts:83`) | ja | `@@index([userId, createdAt, id])` |
| `Notification` | `Notifier.remove`: `type + userId + actorId + targetType + targetId + read` (`notification.ts:74`) | ja | `@@index([userId, type, targetId])` |
| `Post` | `where authorId in (...)`, `orderBy createdAt desc, id desc` (`getFeed.ts:61`, `getUserPosts.ts:16`) | ja | `@@index([authorId, createdAt, id])` |
| `Ride` | `where creatorId in (...)`, `orderBy createdAt desc, id desc` (`getFeed.ts:82`, `getUserRides.ts:16`) | ja | `@@index([creatorId, createdAt, id])` |
| `Ride` | `where groupId + status + startTime`, `orderBy startTime` (`getGroupRides.ts:26`) | ja | `@@index([groupId, status, startTime])` |
| `Ride` | Umkreis-Bounding-Box `startLat/startLng` (`getRides.ts:79-87`) | ja | `@@index([startLat, startLng])` (langfristig PostGIS/`earthdistance`) |
| `Ride` | `contains … mode: "insensitive"` auf `title`/`startLocation` (`getRides.ts:65-71`) | ja | GIN + `pg_trgm` auf beiden Spalten |
| `RideParticipant` | `count where rideId + status` (`requestJoinRide.ts:75`, `respondToJoinRequest.ts:79`), `_count` mit Status-Filter | ja | `@@index([rideId, status])` |
| `RideParticipant` | `findFirst where rideId + status WAITLISTED orderBy createdAt asc` (`leaveRide.ts:60`) | ja | von `@@index([rideId, status, createdAt])` abgedeckt |
| `GroupMember` | `where groupId + status APPROVED` (`createRide.ts:197`, `chat-action.ts:48`, `createAnnouncement.ts:71`) | ja | `@@index([groupId, status])` |
| `GroupMember` | `where userId + status`, `orderBy group.name` (`getMyRideGroups.ts:21`) | ja | `@@index([userId, status])` |
| `GroupMessage` | `where groupId`, `orderBy createdAt desc take 100` (`chat-action.ts:32`) | ja | `@@index([groupId, createdAt])` |
| `GroupAnnouncement` | `where groupId`, `orderBy createdAt desc take 20` (`getGroupAnnouncements.ts:42`) | ja | `@@index([groupId, createdAt])` |
| `DirectMessage` | `OR(sender/recipient)`, `orderBy createdAt desc take 100` (`direct-chat-action.ts:193`) | ja | `@@index([senderId, recipientId, createdAt])` + `@@index([recipientId, senderId, createdAt])` |
| `DirectMessage` | `count where recipientId + readAt null` (`direct-chat-action.ts:47`) | ja | `@@index([recipientId, readAt])` |
| `ActivityLog` | `count where action + createdAt` (`getAnalytics.ts:117,120,126`) | ja | `@@index([action, createdAt])` |
| `ActivityLog` | `groupBy actorId where createdAt` (`getAnalytics.ts:103`) | teilweise | `@@index([actorId, createdAt])` |
| `Session` | `where expiresAt > now` (`getAnalytics.ts:79`, `getUsers.ts:16`) | ja | `@@index([expiresAt])` |
| `User` | `where banned = false`, `orderBy createdAt desc` (`getRiders.ts:12`) | ja | `@@index([banned, createdAt])` |
| `RadnetEvent` | `where detailSyncedAt null + date >= today`, `orderBy date asc` (`syncCalendarEvents.ts:169`) | teilweise | `@@index([detailSyncedAt, date])` |
| `PostImage` | Eindeutigkeit `(postId, position)` (siehe B-21) | ja (Constraint) | `@@unique([postId, position])` |
| `Follow` | `where followerId` (`getFeed.ts:38`) | vorhanden | ok |
| `Ride` | `where status + startTime`, `orderBy startTime` (`getRides.ts:59`) | vorhanden | `@@index([status, startTime])` passt |
| `ProTelemetryFrame` | `where raceKey+year+stage`, `orderBy capturedAt` (`getStageReplay.ts:55`) | vorhanden | vom Unique-Index abgedeckt |

---

## API-Vertrag Frontend ↔ Route Engine

| Feld / Verhalten | Frontend erwartet | Engine liefert | Status |
|---|---|---|---|
| `POST /v1/jobs` → `{ jobId }` | `submitGenerationJob` liest nur `jobId` (`routeEngine.ts:250`) | `202 { jobId }` bzw. `{ jobId, deduplicated: true }` (`server.ts:366,374`) | ✅ – `deduplicated` wird ignoriert, unkritisch |
| `state`-Enum | `PENDING\|RUNNING\|SUCCEEDED\|FAILED\|CANCELLED` (`routeEngine.ts:58-63`) | identisch (`openapi.yaml` `JobState`, `types.ts`) | ✅ |
| `progressPercent`, `message` | Pflichtfelder (`types.ts:186-193`) | immer gesetzt (`statusToJson`, `server.ts:130`) | ✅ – `message` ist **deutsch** („Generierung gestartet"), Frontend sendet `locale: "en"` (`generateRoute.ts:57`) und rendert die Message direkt (`routeGeneratorMap.tsx:721`) → gemischtsprachige UI |
| `errorDetail` | optional, wird bis in den Client-Typ transportiert | roher `err.message` (`worker/index.ts:173`) | ⚠️ B-16 – interner Text; und das UI zeigt ihn nie an (B-12) |
| `FAILED` / `CANCELLED` | – kein Zweig im UI | 200 mit terminalem Status | ❌ B-12 – Generierung endet still |
| Job unbekannt/abgelaufen | `getGenerationJobStatus` → `null` → „This generation has expired" | `404 { error: 'unknown or expired job' }` (`server.ts:449`) | ✅ |
| `/result` bei nicht-SUCCEEDED | `getGenerationJobResult` behandelt 404 **und** 409 als `null` (`routeEngine.ts:277`) | `409 { error, state }` (`server.ts:466`) | ⚠️ – FAILED und TTL-Ablauf werden beide zu „expired, please regenerate"; die eigentliche Ursache geht verloren |
| Result-TTL | Kommentar „~30 min", `createRide` holt das Ergebnis serverseitig neu (`routeEngine.ts:11-14`) | `jobResultTtlSec` Default `30 * 60` (`config.ts:64`) | ✅ – korrekt angenommen |
| Status-TTL laufender Jobs | keine Annahme | `jobPendingTtlSec` Default 2 h (`config.ts:65`) | ✅ |
| Idempotency-Key TTL | `requestKey` neu pro Regenerierung (`routeGeneratorMap.tsx:265`) | `jobResultTtlSec` = 30 min, Registrierung **vor** dem Enqueue | ⚠️ B-28 |
| Per-User-Quota | 429 → „too many route generations running" (`routeEngine.ts:209`) | `429` + `Retry-After: 10`, `MAX_OPEN_JOBS_PER_USER=3` (`server.ts:349`) | ⚠️ B-14/B-23 – Quota leckt bei Fehler und bei nicht storniertem In-Flight-Submit |
| Kapazität | 503 → „at capacity" | `503` + `Retry-After: 5` (`server.ts:337-340`) | ✅ – `Retry-After` wird vom Client aber nicht ausgewertet |
| Coverage | 400 mit `covered region` im Text → gemappte Meldung (`routeEngine.ts:204`) | `400 { error: 'coordinates outside covered region', coveredRegions, bbox }` (`server.ts:327`) | ✅ – String-Matching auf `"covered region"` ist fragil, aber funktioniert |
| Auth | `x-api-key` gesetzt wenn `ROUTE_ENGINE_API_KEY` vorhanden (`routeEngine.ts:189-196`) | 401 bei fehlendem/falschem Key (`server.ts:246`) | ⚠️ B-25 – 401 wird von `toUserSafeError` zu „unavailable" verallgemeinert; in `openapi.yaml` gar nicht dokumentiert |
| Job-Ownership | keine Prüfung | keine Prüfung (`X-Festi-User` nur für Quota) | ❌ B-18 |
| `numAlternatives` | UI sendet 5 (`routeGeneratorMap.tsx:196`), Action-Default 2 (`generateRoute.ts:55`) | `MAX_ALTERNATIVES=5`, Default 1 (`config.ts:69`, `validation.ts:264`) | ✅ – `routeIndex` max 4 (`schemas/index.ts:110`) passt zu 5 Alternativen |
| `minDistanceKm`/`maxDistanceKm` + `end` | Zod erlaubt beides gleichzeitig (`schemas/index.ts:57-87`) | 400 „only valid in roundtrip mode" (`validation.ts:118`) | ⚠️ – aktuell nicht auslösbar (UI sendet bei A-nach-B kein Band), aber die Schemata widersprechen sich |
| `maxDetourFactor` | nur bei `end` gesetzt (`generateRoute.ts:47`) | 400 wenn ohne `end` (`validation.ts:218`) | ✅ – korrekt abgesichert |
| `departureTime` | `z.string().datetime()`, keine Obergrenze | 400 wenn > +5 Tage oder > 1 h in der Vergangenheit (`validation.ts:240-245`) | ⚠️ B-30 – Grenze frontendseitig unbekannt; Feld wird gar nicht gesendet |
| `category` | `road\|touring\|gravel\|mtb\|enduro\|cargo` (`schemas/index.ts:43`) | identisch (`validation.ts:12`) | ✅ |
| `geojson` | `{ geometry: { type: "LineString", coordinates: number[][] } }` (`routeEngine.ts:137`) | GeoJSON **Feature** mit `geometry.coordinates` als `[lng, lat, ele?]` (`gpx.ts:56-74`, `types.ts:82`) | ✅ – kompatibel; die Höhe ist aber `Position[2]?` **optional**, `buildElevationProfile` (`routeEngine.ts:324`) liefert dann `[]`, `getRide.ts:69` rechnet es über BRouter nach |
| `gpx`, `fitBase64` | im Frontend-Typ nicht deklariert, ungenutzt | in **jeder** `/result`-Antwort enthalten (`server.ts:147-148`) | ⚠️ B-17 – Speicher-/Bandbreitenlast |
| `elevationProfile` (Engine) | ignoriert, Frontend baut eigenes aus der Geometrie | `[distanceM, elevationM]`-Paare (`openapi.yaml`) | ✅ – bewusst so, im Code dokumentiert |
| Timeout / Abbruch | kein Client-Timeout | `JOB_TIMEOUT_SEC=180` → `FAILED` mit „Zeitlimit überschritten" | ⚠️ B-13 + B-12 |
| Engine-Neustart mid-job | – | BullMQ `attempts: 1`, `removeOnFail: true` (`jobs.ts:165-168`); der `failed`-Handler flippt den Status auf FAILED (`worker/index.ts:192`) | ✅ – sauber gelöst; Redis-Neustart mit Datenverlust lässt den Job dagegen als 404 „expired" enden (akzeptabel) |
| `festi-routes/generate.mjs` | `JOB_WAIT_TIMEOUT_MS` 300 s Poll-Deadline, `Idempotency-Key` mit Request-Hash | `jobTimeoutSec` 180 s | ✅ – Client-Deadline > Server-Deadline, richtig herum. Kein `X-Festi-User` → nur globale Quota, gewollt. Bei 503 kein Backoff/Retry (`generate.mjs:104`) → Idee schlägt hart fehl |

---

## Geprüft & in Ordnung

- **Autorisierung in Actions:** Jede der 84 Actions ruft `getCurrentUser()`/`getCurrentAdmin()`
  als erstes auf; Besitzprüfungen (`ride.creatorId !== session.user.id`,
  `post.authorId !== session.user.id`, `canManageGroup`) sind durchgängig vorhanden.
- **Keine Massenzuweisung:** Route-Statistiken werden serverseitig neu berechnet
  (`createRide.ts:104-121`) statt vom Client übernommen – der Kommentar dort beschreibt
  genau das richtige Bedrohungsmodell.
- **Schema ↔ Migrationen:** Alle 41 `CREATE INDEX`/`CREATE UNIQUE INDEX` in
  `prisma/migrations/` entsprechen exakt den `@@index`/`@@unique` im Schema – kein Drift.
- **`onDelete`-Regeln:** durchdacht. `Cascade` für abhängige Zeilen (Session, GroupMember,
  RideParticipant, PostLike/Comment/Image, RidePhoto), `SetNull` für `Ride.groupId`
  (`schema.prisma:371`) und `ActivityLog.actorId/targetUserId` (`:301,:305`) – der Audit-Trail
  überlebt korrekt das Löschen eines Users. Einzige Lücke: die polymorphen Felder (B-20).
- **`createRide` Serienanlage:** korrekt in `$transaction` geklammert, Dubletten-Prüfung pro
  Kalendertag vorab für alle Instanzen (`createRide.ts:66-102`) – der Kommentar „so a series
  never half-creates" hält.
- **`Notifier` / `Logger`:** beide fangen ihre Fehler ab und brechen die auslösende Action nie
  ab (`notification.ts:66`, `logger.ts:120`) – bewusst und dokumentiert.
- **Notification-Undo-Pfade:** `withdrawJoinRequest`, `unfollowRider`, `leaveGroup`,
  `togglePostLike` entfernen die ungelesene Notification wieder – verhindert Request/Withdraw-Spam.
- **Fan-out an Gruppenmitglieder:** korrekt als `Promise.all` statt sequenziell
  (`createRide.ts:206`, `cancelRide.ts:111`, `createAnnouncement.ts:76`, `updateRide.ts:141`).
- **`getAnalytics`:** 17 Queries sauber in einem `Promise.all` – die richtige Struktur
  (die Kosten liegen bei B-01/B-27, nicht am Code).
- **`getPublicRide`:** bewusst reduzierte Projektion ohne User-IDs und ohne Teilnehmerdaten,
  gefiltert über `isPublic` – sauber.
- **Route Engine Statuscodes:** 400 (Validierung/Coverage), 401 (Auth), 404 (unbekannt/TTL),
  409 (falscher Job-State), 429 (User-Quota, mit `Retry-After`), 503 (Kapazität + Health) sind
  präzise getrennt und korrekt verwendet. Antworten sind **immer** JSON, auch im
  Catch-all (`server.ts:297,303`) – nie HTML.
- **Route Engine Validierung:** `validation.ts` prüft Lat/Lng-Bereiche, Enum-Werte,
  Kreuzabhängigkeiten (roundtrip vs. point-to-point) und Distanzbänder gründlich;
  Body-Limit 1 MB (`server.ts:16,108`).
- **Engine-Auth:** `timingSafeEqual` mit vorheriger Längenprüfung (`server.ts:120-128`) –
  korrekt implementiert.
- **SSE-Endpunkt `/v1/jobs/:id/events`:** sauber mit Unsubscribe bei terminalem State und bei
  `req.on('close')` (`server.ts:506-513`); wird vom Frontend nicht genutzt (dort Polling),
  aber funktional korrekt.
- **`custom-worker.ts`/`wrangler.jsonc`:** Cron-Trigger auf die Live-Fenster begrenzt
  (`* 8-17 * * *`), `CRON_SECRET`-Bearer-Guard vorhanden (`capture/route.ts:89`),
  `Promise.allSettled` verhindert, dass ein hängendes Rennen die anderen mitreißt.
- **`/api/pro/live/...`:** vorbildliches Ressourcen-Handling – ein `AbortController` bündelt
  Client-Disconnect, toten Enqueue und Loop-Ende; Heartbeat wird im Abort-Listener geräumt.

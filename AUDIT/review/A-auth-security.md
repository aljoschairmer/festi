# A – Auth & Security

## Zusammenfassung

Das Grundgerüst ist überraschend solide: better-auth ist sauber konfiguriert (E-Mail-Verifikation
erzwungen, Enumeration-Protection, Login-Logging), praktisch **jede** Server Action ruft
`getCurrentUser()`/`getCurrentAdmin()` auf, Ownership wird in Ride-/Post-/Route-/Group-Actions in der
Regel korrekt geprüft, Uploads validieren Magic-Bytes und leiten den Content-Type serverseitig ab,
und der Markdown-Renderer ist bewusst HTML-frei. Es gibt keine hardcodierten Secrets, keine
`.env`-Leichen in der Git-History und kein `$queryRawUnsafe`.

Die drei gravierendsten Themen:

1. **Gruppen-Privatsphäre ist nicht durchgesetzt.** Gruppen-Rides tauchen in `getRides`, `getRide`
   und `getFeed` ohne jeden `groupId`-Filter auf, und `kickGroupMember` prüft die Membership-Zeile
   nicht gegen die Gruppe (gruppenübergreifende IDOR).
2. **Jede Fahrt ist standardmäßig öffentlich** (`isPublic @default(true)`, `createRide` setzt das Feld
   nie) — `/rides/{id}` liefert ohne Login Routen-Geometrie und Startort, was faktisch die Wohnadresse
   der Nutzer ist.
3. **Rate-Limiting greift nur auf `/api/auth/*`.** Die eigene `registerUser`-Action ruft
   `auth.api.signUpEmail()` direkt auf und umgeht damit den Router — und mit ihm den Limiter.
   Alle anderen Server Actions (Upload, Suche, Routengenerierung) haben gar keins.

Dazu kommen: kein `proxy.ts` (Next 16-Nachfolger von `middleware.ts`), Auth-Check nur im
Dashboard-Layout (laut Next-16-Doku unzureichend), spoofbare IP-Erfassung im Audit-Log, fehlende
Security-Header und eine Route-Engine, deren Job-Endpunkte keinerlei Nutzerbindung kennen.

---

## Findings

### A-01 — `kickGroupMember`: Membership wird nicht gegen die Gruppe geprüft (gruppenübergreifende IDOR) · P1

- **Ort:** `src/features/community/actions/kickGroupMember.ts:30-40`, `:74-78`
- **Befund:** Die Berechtigung wird gegen `input.groupId` geprüft, die zu löschende Zeile aber
  ausschließlich über ihre eigene ID geladen — ohne `groupId` im `where`:

  ```ts
  const group = await prisma.group.findUnique({          // :19  → Gruppe A
    where: { id: input.groupId }, select: { createdById: true },
  });

  const member = await prisma.groupMember.findUnique({   // :30  → beliebige Gruppe!
    where: { id: input.memberId },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  ...
  const isOwner = group.createdById === session.user.id; // :47  Rolle in Gruppe A
  const callerRole = await getGroupRole(input.groupId, session.user.id);
  ...
  await prisma.groupMember.delete({ where: { id: input.memberId } });  // :74
  ```

  Zum Vergleich macht es die Nachbar-Action richtig — `updateGroupMemberRole.ts:56-58`:
  `prisma.groupMember.findFirst({ where: { id: memberId, groupId, status: "APPROVED" } })`.
  Auch `respondToGroupJoinRequest.ts:54-57` scopet korrekt mit `{ id: memberId, groupId }`.
- **Risiko:** Wer Owner (oder Moderator) *irgendeiner* Gruppe ist, kann beliebige Mitglieder aus
  *jeder anderen* Gruppe entfernen. Die benötigten `GroupMember.id`-Werte werden an jedes Mitglied
  ausgeliefert (`src/app/dashboard/community/g/[id]/page.tsx:260,266` rendern
  `memberId={member.id}`), und offenen Gruppen (`needApproval: false`) kann man jederzeit beitreten,
  um sie abzugreifen. Auch der Schutz „Owner kann nicht gekickt werden" greift nicht, weil
  `member.userId === group.createdById` (:67) den Owner der *falschen* Gruppe vergleicht — der Owner
  von Gruppe B ist so kickbar.
- **Fix:** Membership gruppen-gescoped laden, analog zu `updateGroupMemberRole`:

  ```ts
  const member = await prisma.groupMember.findFirst({
    where: { id: input.memberId, groupId: input.groupId },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  ```

  Und im `delete` zusätzlich absichern: `where: { id: input.memberId, groupId: input.groupId }`
  (bzw. `deleteMany`, das ein zusammengesetztes `where` erlaubt).

---

### A-02 — Gruppen-Rides sind für alle eingeloggten Nutzer sichtbar und beitretbar · P1

- **Ort:** `src/features/rides/actions/getRides.ts:59-88`, `src/features/rides/actions/getRide.ts:19-41`,
  `src/features/posts/actions/getFeed.ts:82-83`, `src/features/rides/actions/requestJoinRide.ts:25-34`
- **Befund:** `getGroupRides.ts:7-24` dokumentiert die Absicht ausdrücklich („Only approved members of
  the group may read them — everyone else gets an error, so group rides never leak to non-members
  **here**"). Die generischen Listen setzen das aber nicht um. `getRides` baut sein `where` ohne
  jeden Bezug auf `groupId`:

  ```ts
  const where: Prisma.RideWhereInput = {
    status: "SCHEDULED",
    ...(filters.includePast ? {} : { startTime: { gte: new Date() } }),
    ...(filters.search ? { OR: [...] } : {}),
    ...(filters.pace ? { pace: filters.pace } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
    ...(near ? { startLat: {...}, startLng: {...} } : {}),
  };
  ```

  `getRide(rideId)` lädt per `findUnique({ where: { id: rideId } })` und prüft danach nur, ob der
  Aufrufer *Creator* ist (`:47`) — nie, ob er Mitglied der Gruppe ist. `getFeed` filtert Rides mit
  `where: { creatorId: authorFilter, ...cursorFilter }`, ebenfalls ohne `groupId`.
  `requestJoinRide` prüft Status, Zeit und Kapazität, aber keine Gruppenmitgliedschaft.
- **Risiko:** Jeder eingeloggte Nutzer sieht in der allgemeinen Ride-Liste, im Feed und per Deep-Link
  `/dashboard/community-rides/{id}` Titel, Beschreibung, Startort, Startzeit, komplette Routen-
  Geometrie und die Namen aller approved Teilnehmer von Rides, die in eine private Gruppe gepostet
  wurden — und kann eine Beitrittsanfrage stellen. Die Gruppen-Zugangskontrolle
  (`GroupMember.status = APPROVED`) ist damit für Rides wirkungslos.
- **Fix:** In `getRides`/`getFeed` Gruppen-Rides auf die eigenen Mitgliedschaften einschränken, in
  `getRide`/`requestJoinRide` die Mitgliedschaft prüfen:

  ```ts
  const myGroupIds = (await prisma.groupMember.findMany({
    where: { userId: session.user.id, status: "APPROVED" }, select: { groupId: true },
  })).map((m) => m.groupId);

  const where: Prisma.RideWhereInput = {
    status: "SCHEDULED",
    OR: [{ groupId: null }, { groupId: { in: myGroupIds } }],
    ...
  };
  ```

---

### A-03 — Jede Fahrt ist per Default öffentlich abrufbar (Standortpreisgabe ohne Login) · P1

- **Ort:** `prisma/schema.prisma:366`, `src/features/rides/actions/createRide.ts:144-165`,
  `src/features/rides/actions/getPublicRide.ts:31-56`
- **Befund:** Das Schema definiert `isPublic Boolean @default(true)`, und `createRide` setzt das Feld
  in seinem `data`-Block nie:

  ```ts
  prisma.ride.create({
    data: {
      creatorId: session.user.id, title, description, startLocation,
      startTime: date, distance, duration, elevationGain, elevationLoss,
      routeGeometry: route.routeGeometry, waypoints, elevationProfile,
      pace, difficulty, maxParticipants,
      groupId: groupId ?? null, recurrenceId,
      startLat: start.lat, startLng: start.lng,   // ← kein isPublic
    },
  })
  ```

  `getPublicRide` hat bewusst **keinen** Auth-Guard (`where: { id: rideId, isPublic: true }`) und
  wird von `src/app/rides/[rideId]/page.tsx` ohne Session gerendert. `setRidePublic` ist reines
  Opt-*out*.
- **Risiko:** Für jede jemals angelegte Fahrt — inkl. Gruppen-Rides — liefert `/rides/{id}` ohne
  Login `routeGeometry`, `startLocation`, Startzeit, Distanz und den Klarnamen des Erstellers. Da
  Rundkurse typischerweise an der Haustür beginnen, ist das eine Wohnadress-Preisgabe. Die IDs sind
  Prisma-`cuid()` (v1) — die enthalten Zeitstempel und einen monoton hochzählenden Counter, sind also
  deutlich besser ratbar als UUIDv4, und Links werden ohnehin geteilt/indexiert.
- **Fix:** Default auf `false` drehen (`isPublic Boolean @default(false)` + Migration, die
  Bestandsdaten nicht rückwirkend öffnet oder — besser — bewusst schließt), `createRide` das Feld
  explizit setzen lassen, und Gruppen-Rides gar nicht erst öffentlich schaltbar machen
  (`if (ride.groupId) return { success: false, ... }` in `setRidePublic`).

---

### A-04 — `registerUser` umgeht das better-auth-Rate-Limit vollständig · P1

- **Ort:** `src/features/auth/actions/registerUser.ts:51-59`, `src/lib/auth.ts:29-33`
- **Befund:** Konfiguriert ist ein Limit:

  ```ts
  rateLimit: { enabled: true, window: 60, max: 5 },
  ```

  Es wird aber ausschließlich im HTTP-Router angewandt —
  `node_modules/better-auth/dist/api/index.mjs:163-168`:

  ```js
  async onRequest(req) {
    ...
    const rateLimitResponse = await onRequestRateLimit(currentRequest, ctx);
    if (rateLimitResponse) return rateLimitResponse;
  ```

  `auth.api` wird dagegen ohne Router gebaut (`node_modules/better-auth/dist/auth/base.mjs:9`:
  `const { api } = getEndpoints(authContext, options);`). Die Registrierung läuft aber genau darüber:

  ```ts
  const user = await auth.api.signUpEmail({ headers: await headers(), body: { email, password, name, username } });
  ```

  Damit greifen weder Rate-Limiter noch `originCheckMiddleware`. Auch alle übrigen Server Actions
  (`uploadAvatar`, `uploadPostImage`, `searchPlaces`, `generateRoute`, `syncCalendarEvents`,
  `sendDirectMessage`) haben kein eigenes Limit.
- **Risiko:** Unbegrenzte Registrierungsversuche pro Sekunde. Konkret: Massenversand von
  Verifikations- bzw. „Someone tried to sign up with your email"-Mails über Resend an beliebige
  fremde Adressen (Kosten + Zustellreputation der Domain), Account-Flooding, und Brute-Force gegen
  `checkUsernameAvailable` (A-11). Analog ist `searchPlaces` ein kostenloser Proxy auf den
  MapTiler-Key, `generateRoute` ein Hebel auf die (teure) Route-Engine.
- **Fix:** Entweder die Registrierung über den HTTP-Handler laufen lassen (`authClient.signUp.email`
  vom Client, Validierung serverseitig im better-auth-`before`-Hook), oder ein eigenes Limit vor
  `auth.api.signUpEmail` legen. Für Server Actions generell einen kleinen Helper einführen:

  ```ts
  await rateLimit(`register:${ip}`, { window: 60, max: 3 });
  ```

  (Storage: Redis/Cloudflare KV — der In-Memory-Store von better-auth überlebt Worker-Isolates nicht.)

---

### A-05 — `getBanInfo`: unauthentifizierte Server Action gibt Sperrgrund zu beliebiger E-Mail heraus · P2

- **Ort:** `src/features/auth/actions/getBanInfo.ts:4-21`
- **Befund:** Kein Guard, kein Schema, keine Rate-Begrenzung:

  ```ts
  "use server";
  export async function getBanInfo(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { banned: true, banReason: true, banExpires: true },
    });
    if (!user?.banned) return null;
    return { reason: user.banReason, expires: user.banExpires?.toISOString() ?? null };
  }
  ```

  Aufgerufen wird sie nur im Fehlerpfad des Login-Formulars (`loginForm.tsx:80`), aber `"use server"`
  macht daraus einen öffentlich adressierbaren RPC-Endpunkt.
- **Risiko:** Ein Angreifer kann für beliebige E-Mail-Adressen abfragen, ob ein gesperrter Account
  existiert, und bekommt den vom Admin frei eingetippten `banReason` (bis 500 Zeichen, potenziell
  interne Notizen/personenbezogene Daten) im Klartext. Das untergräbt genau die
  Enumeration-Protection, die in `src/lib/auth.ts:36-38` bewusst aufgebaut wurde.
- **Fix:** Sperrinformationen nicht als eigene Action herausgeben, sondern in die Fehlerantwort von
  better-auth einbetten (`BANNED_USER` liefert bereits `banReason`/`banExpires`, wenn im
  admin-Plugin aktiviert). Falls die Action bleibt: Nachweis verlangen, dass der Aufrufer gerade
  ein gültiges Passwort für diesen Account geliefert hat — sonst nur ein generisches
  `{ banned: true }` ohne Grund.

---

### A-06 — Route-Engine-Jobs sind an keinen Nutzer gebunden (IDOR + globaler Idempotency-Namespace) · P2

- **Ort:** `src/features/rides/actions/getRouteGenerationStatus.ts:20-32`,
  `src/features/rides/actions/cancelRouteGeneration.ts:13-24`,
  `src/features/rides/lib/routeEngine.ts:188-197`, `:254-264`,
  `festi-backend/src/api/server.ts:442-478`, `:516-543`, `festi-backend/src/jobs.ts:128-139`
- **Befund:** Beim Submit wird der Nutzer mitgegeben, beim Abholen/Abbrechen nicht:

  ```ts
  function engineHeaders(userRef?: string, idempotencyKey?: string) { ... }

  export async function getGenerationJobStatus(jobId: string) {
    const response = await fetch(`${getRouteEngineBaseUrl()}/v1/jobs/${encodeURIComponent(jobId)}`,
      { headers: engineHeaders(), cache: "no-store" });   // ← kein userRef
  ```

  Die Actions prüfen nur Authentifizierung und Länge:

  ```ts
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be signed in." };
  if (typeof jobId !== "string" || jobId.length === 0 || jobId.length > 100) { ... }
  ```

  Die Engine selbst kennt ebenfalls keine Zuordnung — `handleStatus`, `handleResult`,
  `handleDownload`, `handleEvents` und `handleCancel` lesen ausschließlich `store.getStatus(jobId)`.
  Zusätzlich ist der Idempotency-Namespace global und der Schlüssel kommt vom Client
  (`generateRoute.ts:64` reicht `data.requestKey` durch, Schema: `z.string().min(8).max(100)`):

  ```ts
  async rememberIdempotent(key, jobId) {
    const redisKey = IDEMPOTENCY_PREFIX + key;   // kein userRef im Key
    const won = await this.redis.set(redisKey, jobId, 'EX', this.config.jobResultTtlSec, 'NX');
    if (won) return jobId;
    return (await this.redis.get(redisKey)) ?? jobId;
  }
  ```
- **Risiko:** Wer eine fremde Job-ID kennt, liest deren Ergebnis (inkl. Start-/Zielkoordinaten und
  GPX/FIT der fremden Route) oder bricht den Job ab. Ebenso bekommt jeder, der denselben
  `requestKey` schickt, die Job-ID des Erstsubmitters zurück (`202 { jobId: winner, deduplicated: true }`)
  und damit dessen Ergebnis. Praktisch abgemildert dadurch, dass Job-IDs `randomUUID()` sind und der
  Client aktuell `crypto.randomUUID()` als `requestKey` nutzt — es ist aber eine reine
  Konventions-, keine Zugriffskontrolle. Zusätzlich wird die Per-User-Quota (`MAX_OPEN_JOBS_PER_USER`)
  nur gezählt, *wenn* der `X-Festi-User`-Header gesetzt ist (`server.ts:344-355`) — sie ist damit
  für jeden, der den API-Key besitzt, durch Weglassen des Headers umgehbar.
- **Fix:** `userRef` in der Engine mit dem Job persistieren und in Status/Result/Cancel/Download
  gegen den `X-Festi-User`-Header prüfen (404 statt 403, um IDs nicht zu bestätigen); den
  Idempotency-Key mit dem `userRef` präfixen (`IDEMPOTENCY_PREFIX + userRef + ':' + key`); im
  Frontend `engineHeaders(session.user.id)` auch in `getGenerationJobStatus`,
  `getGenerationJobResult` und `cancelGenerationJob` mitgeben.

---

### A-07 — Kein `proxy.ts`; Auth-Check nur im Layout, das laut Next 16 nicht bei jeder Navigation läuft · P2

- **Ort:** `src/app/dashboard/layout.tsx:18`, fehlende Datei `src/proxy.ts`,
  `src/app/dashboard/{community-rides,community,events,notifications,pro}/**/page.tsx`
- **Befund:** Es existiert weder `middleware.ts` noch der Next-16-Nachfolger `proxy.ts`
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`:
  „The `middleware` file convention is deprecated and has been renamed to `proxy`"). Der einzige
  seitenübergreifende Guard ist `await requireAuth()` im Dashboard-Layout. Mehrere Kind-Seiten haben
  gar keinen eigenen Check: `dashboard/community-rides/page.tsx`, `dashboard/community/page.tsx`,
  `dashboard/community/u/[id]/page.tsx`, `dashboard/events/page.tsx`,
  `dashboard/notifications/page.tsx`, `dashboard/pro/**`.
  Die Next-16-Doku warnt genau davor —
  `node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350`:
  > „Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on
  > navigation, meaning the user session won't be checked on every route change."
- **Risiko:** Nach Ablauf/Widerruf der Session (z. B. nach `revokeUserSessions`) navigiert ein
  offener Tab weiterhin client-seitig in ungeschützte Segmente, ohne dass der Layout-Guard neu
  greift. Die Seiten rendern dann ihr Gerüst; die eigentlichen Daten sind zwar geschützt (jede
  Action prüft selbst und wirft), aber es entstehen kaputte Zustände statt eines Redirects, und die
  Absicherung hängt vollständig daran, dass *jede* Action ihren Guard behält.
- **Fix:** `src/proxy.ts` mit einem optimistischen Cookie-Check für `/dashboard/:path*` anlegen
  (Redirect auf `/login`) **und** zusätzlich pro Seite `await requireAuth()` aufrufen — die Doku
  benennt Proxy explizit als „initial check", nicht als Verteidigungslinie
  (`authentication.md:1119`).

---

### A-08 — Audit-Log und Brute-Force-Erkennung verwenden die spoofbare `x-forwarded-for` · P2

- **Ort:** `src/features/logger/logger.ts:75-87`, `src/features/analytics/actions/getAnalytics.ts:129-140`
- **Befund:**

  ```ts
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  ```

  Die App läuft auf Cloudflare Workers (`wrangler.jsonc`, `open-next.config.ts`). Cloudflare *hängt*
  die echte Client-IP an ein bereits vorhandenes `X-Forwarded-For` an, statt es zu ersetzen — der
  **erste** Eintrag ist damit der vom Client mitgeschickte Wert. Die vertrauenswürdige Quelle ist
  `cf-connecting-ip`. Auf diesem Feld baut die Sicherheitsanalytik auf:

  ```sql
  SELECT "ipAddress" AS ip, count(*)::int AS count
  FROM activity_log
  WHERE action = 'USER_LOGIN_FAILED' AND "createdAt" >= ${last24h} AND "ipAddress" IS NOT NULL
  GROUP BY "ipAddress" HAVING count(*) >= 5
  ```
- **Risiko:** Ein Angreifer setzt bei jedem Login-Versuch ein zufälliges `X-Forwarded-For` und
  verschwindet vollständig aus der „suspicious IPs"-Auswertung (`HAVING count(*) >= 5` wird nie
  erreicht). Umgekehrt lassen sich fremde IPs in das Audit-Log injizieren und unbeteiligte Dritte
  belasten. Da `activityLog` die Grundlage für Ban-Entscheidungen ist, ist das eine
  Log-Injection-/Evasion-Lücke.
- **Fix:**

  ```ts
  const ipAddress =
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    null;
  ```

  `x-forwarded-for` nur als Fallback in Nicht-CF-Umgebungen und dann von *rechts* lesen.

---

### A-09 — Keine Security-Header (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) · P2

- **Ort:** `next.config.ts` (kein `headers()`), `public/` (kein `_headers`), `wrangler.jsonc`
- **Befund:** Die gesamte `next.config.ts` besteht aus `serverExternalPackages` — es gibt keinen
  `async headers()`-Block, keine `_headers`-Datei für Cloudflare Assets und keinen Header-Setzer im
  `custom-worker.ts`. Grep über `src/` und die Config-Dateien liefert null Treffer für
  `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`,
  `X-Content-Type-Options`.
- **Risiko:** Kein Clickjacking-Schutz für `/dashboard/*` (Login-/Admin-Flows in fremdem Iframe),
  keine CSP als zweite Verteidigungslinie gegen eine künftige XSS-Lücke, kein MIME-Sniffing-Schutz
  für die von `/api/pro/reports/[reportId]` durchgereichten Upstream-Inhalte (dort wird
  `file.contentType` von Tissot ungefiltert als `Content-Type` gesetzt,
  `src/app/api/pro/reports/[reportId]/route.ts:44-50`).
- **Fix:** In `next.config.ts`:

  ```ts
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Content-Security-Policy", value: "..." },
    ]}];
  }
  ```

  Siehe `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` für die
  Nonce-Variante. Zusätzlich in der Report-Route den Content-Type auf die bekannte Whitelist
  (`EXT_BY_CONTENT_TYPE`) einschränken statt ihn durchzureichen.

---

### A-10 — Route-Engine-Container veröffentlicht Port 8080 auf allen Interfaces, API-Key optional · P2

- **Ort:** `festi-backend/docker-compose.yml` (Service `api`), `festi-backend/src/api/server.ts:246`,
  `:621-623`
- **Befund:**

  ```yaml
  api:
    environment:
      # Set in .env on the host; empty disables auth (local dev only).
      - API_KEY=${API_KEY:-}
    ports:
      - "8080:8080"
  ```

  Anders als `routing-engine` (`"127.0.0.1:8989:8989"`) bindet der API-Service auf `0.0.0.0`. Die
  Auth-Prüfung ist an das Vorhandensein des Keys gekoppelt:

  ```ts
  if (config.apiKey && path !== '/healthz' && !isAuthorized(req, config.apiKey)) {
    sendJson(res, 401, { error: 'unauthorized' });
  ```

  Bei leerem `API_KEY` gibt es nur eine Warnung im Log (`server.ts:621-623`), aber keinen
  Startabbruch. Die TLS-Variante (`docker-compose.caddy.yml`) entfernt das Port-Mapping wieder — sie
  ist aber ein Opt-in-Overlay; ein `docker compose up -d` mit der Basisdatei exponiert den Dienst.
- **Risiko:** Fehlt die `.env` auf dem Host (oder ist die Variable leer), läuft eine vollständig
  offene Route-Engine im Internet: fremde Jobs einreichen, fremde Ergebnisse (`/v1/jobs/:id/result`),
  GPX/FIT-Downloads, Job-Abbrüche und `/metrics` — plus DoS über die teure Generierung.
- **Fix:** Port auf `127.0.0.1:8080:8080` binden (Zugriff nur über Caddy/Tunnel) und den Start
  hart abbrechen, wenn `API_KEY` in Nicht-Dev-Umgebungen fehlt:

  ```ts
  if (!config.apiKey && process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY is required in production');
  }
  ```

---

### A-11 — `checkUsernameAvailable`: unauthentifizierte Nutzernamen-Enumeration ohne Limit · P2

- **Ort:** `src/features/auth/actions/checkAvailability.ts:5-22`
- **Befund:**

  ```ts
  "use server";
  export async function checkUsernameAvailable(username: string) {
    const existingUser = await prisma.user.findFirst({ where: { username }, select: { id: true } });
    if (existingUser) return { available: false, error: "This username is already taken" };
    return { available: true };
  }
  ```

  Kein Guard, kein Zod-Schema (das `username`-Regex aus `registerSchema` wird hier nicht angewandt),
  kein Rate-Limit (siehe A-04).
- **Risiko:** Vollständige Enumeration des Nutzerverzeichnisses über einen öffentlichen Endpunkt.
  Kombiniert mit `getRider`/`getRiders` (die Namen, Bio, Ort und Rolle liefern) und `getBanInfo`
  (A-05) ergibt das ein gut befülltes Profil-Scraping. Ausserdem ungeprüfter String direkt in
  `findFirst` — hier zwar von Prisma parametrisiert, aber ohne Längenbegrenzung.
- **Fix:** Schema anwenden (`z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/)`), Rate-Limit pro IP
  (z. B. 10/min) und die Prüfung im Zweifel nur noch innerhalb von `registerUser` durchführen statt
  als eigenständig aufrufbare Action.

---

### A-12 — HTML-Injection in Transaktions-Mails; `firstName`/`lastName` unbegrenzt und ungefiltert · P2

- **Ort:** `src/lib/email.ts:74`, `:116`, `:160`; `src/features/auth/schemas/index.ts:28-35`;
  `src/features/auth/actions/registerUser.ts:56`
- **Befund:** Der Anzeigename wird roh in HTML interpoliert:

  ```ts
  Hey ${userName}, welcome to the cycling community! ...
  <a href="${url}" style="...">Verify Email</a>
  ```

  `userName` ist `user.name`, das in `registerUser.ts:56` als `` `${firstName} ${lastName}` ``
  gebaut wird. Das Schema kennt weder Maximallänge noch Zeichenklasse:

  ```ts
  firstName: z.string().min(1, "First name is required").min(2, "First name must be at least 2 characters"),
  lastName:  z.string().min(1, "Last name is required").min(2, "Last name must be at least 2 characters"),
  ```
- **Risiko:** Ein Registrierender kann beliebiges HTML (eigene `<a href>`-Buttons, gefälschte
  Hinweistexte, Tracking-Pixel) in die eigenen Verifikations-/Reset-Mails einschleusen. Aktuell
  gehen alle drei Templates an den Namensinhaber selbst, der Schaden ist also begrenzt — aber
  `getExistingAccountEmailHtml` ist bereits eine Mail, die durch die Aktion eines *Dritten*
  ausgelöst wird, und sobald ein Template einmal einen Fremdnamen rendert (Gruppen-Einladung,
  Ride-Benachrichtigung), wird daraus ein sauberer Phishing-Vektor mit der eigenen Absenderdomain.
  Zusätzlich: unbegrenzte Namenslänge landet in DB, Feed, Chat und E-Mail-Betreffzeilen.
- **Fix:** Namen begrenzen und escapen:

  ```ts
  firstName: z.string().trim().min(2).max(50).regex(/^[\p{L}\p{M}' -]+$/u),
  ```

  und in `email.ts` einen `escapeHtml()`-Helper auf jede interpolierte Variable anwenden
  (`& < > " '`), inkl. `url`.

---

### A-13 — `validateEmailDomain`: unauthentifizierter DNS-Resolver für beliebige Domains · P3

- **Ort:** `src/features/auth/actions/validateEmail.ts:5-17`
- **Befund:**

  ```ts
  "use server";
  export async function validateEmailDomain(email: string) {
    const domain = email.split("@")[1];
    if (!domain) return { valid: false, error: "Invalid email format" };
    const mxRecords = await dns.resolveMx(domain);
  ```

  Kein Guard, keine Validierung des Domain-Strings, kein Timeout, kein Limit.
- **Risiko:** Der Server führt für beliebige Angreifer-Eingaben MX-Lookups aus — nutzbar als
  DNS-Rebinding-/Exfiltrations-Kanal (Subdomain-Encoding gegen einen kontrollierten
  Authoritative-Server) und als Amplifier gegen fremde DNS-Server. Ausserdem kostet jeder Aufruf
  eine Subrequest auf Cloudflare.
- **Fix:** Nicht als eigenständige Action exportieren (nur intern aus `registerUser` aufrufen), die
  E-Mail vorher mit `registerSchema` validieren, Domain-Länge/Zeichen prüfen und ein Timeout setzen.

---

### A-14 — `cookieCache` verzögert Ban-/Rollenentzug; Kommentar widerspricht dem Wert · P3

- **Ort:** `src/lib/auth.ts:112-118`
- **Befund:**

  ```ts
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
    cookieCache: { enabled: true, maxAge: 30, // 5 minutes
    },
  },
  ```

  `maxAge` ist in Sekunden — der Wert ist also 30 s, nicht 5 Minuten. Der Kommentar ist falsch.
- **Risiko:** Solange der Cookie-Cache gültig ist, liefert `getSession()` (und damit
  `requireAdmin`/`getCurrentAdmin`) Rolle und Ban-Status aus dem signierten Cookie statt aus der DB.
  `banUser`, `updateUserRole` und `revokeUserSessions` wirken deshalb bis zu 30 s verzögert. Bei 30 s
  akzeptabel — gefährlich wird es, wenn jemand den Kommentar für bare Münze nimmt und den Wert auf
  „die dokumentierten 5 Minuten" korrigiert.
- **Fix:** Kommentar richtigstellen (`// 30 seconds`) und in den Admin-Actions nach einer
  Rollen-/Ban-Änderung den Cookie-Cache des Zielnutzers invalidieren
  (better-auth: Session-Datensätze löschen → `revokeUserSessions` ergänzt um Cache-Invalidierung).

---

### A-15 — Hardcodierte Entwicklungs-Origins in `trustedOrigins` (Produktion) · P3

- **Ort:** `src/lib/auth.ts:35-41`
- **Befund:**

  ```ts
  trustedOrigins: [
    "http://localhost:3000",
    "http://10.160.92.25:3000",
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
  ],
  ```

  Die beiden ersten Einträge sind unbedingt aktiv, auch im Produktions-Worker. Die private IP
  `10.160.92.25` ist zudem eine unfreiwillige Preisgabe der internen Netztopologie im Repo.
- **Risiko:** better-auth akzeptiert CSRF-relevante Requests und Redirect-Ziele mit diesen Origins.
  In einer Umgebung, in der ein Angreifer `localhost:3000` oder das 10.x-Netz kontrolliert
  (Entwicklermaschine, geteiltes VPN, Container-Netz), fällt der Origin-Check weg.
- **Fix:** Dev-Origins hinter `process.env.NODE_ENV !== "production"` schalten:

  ```ts
  trustedOrigins: [
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:3000", process.env.DEV_LAN_ORIGIN].filter(Boolean) : []),
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
  ],
  ```

---

### A-16 — `MAX_IMAGE_DIMENSION` wird deklariert, aber serverseitig nie durchgesetzt · P3

- **Ort:** `src/lib/image.ts:8`, `:24-49`
- **Befund:** `export const MAX_IMAGE_DIMENSION = 2000;` hat im gesamten `src/`-Baum genau einen
  Treffer — die Definition selbst. `validateImageUpload` prüft Größe, MIME und Magic-Bytes, aber
  keine Bildabmessungen:

  ```ts
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image must be 5MB or smaller." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as never)) { ... }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  ```

  Die Skalierung passiert ausschließlich clientseitig in `imageProcessing.ts` (`"use client"`), also
  in einer Schicht, die ein Angreifer schlicht überspringt (die Actions nehmen `FormData` entgegen).
- **Risiko:** Eine 5-MB-PNG-„Dekompressionsbombe" (z. B. 30000×30000 px, einfarbig) passiert die
  Validierung, landet in R2 und wird jedem Betrachter ausgeliefert — Browser-Tab-OOM in Feed,
  Gruppenseite und Ride-Galerie.
- **Fix:** Dimensionen aus dem PNG-IHDR / JPEG-SOF / WebP-VP8X-Header lesen (die ersten ~30 Byte
  reichen) und gegen `MAX_IMAGE_DIMENSION` prüfen — die Bytes liegen in `validateImageUpload`
  ohnehin schon vor.

---

### A-17 — Route-Engine: `avoid` ungetypt validiert; `data-updater` mountet den Docker-Socket · P3

- **Ort:** `festi-backend/src/validation.ts:290`, `festi-backend/docker-compose.yml` (Service
  `data-updater`)
- **Befund:** Alle numerischen Parameter sind sauber begrenzt (Distanz 1–400 km, `numAlternatives`
  gegen `maxAlternatives` geklemmt, `viaPoints` ≤ 15, Body ≤ 1 MB) — `avoid` aber nicht:

  ```ts
  avoid: (raw.avoid ?? []).map((a) => a.toLowerCase().trim()).filter(Boolean),
  ```

  Weder Array-Typ noch Elementtyp noch Länge werden geprüft. `{"avoid": 5}` bzw. `{"avoid": [1,2]}`
  wirft einen `TypeError`, der in `server.ts:298-306` als `500 internal error` endet statt als 400.
  Separat davon:

  ```yaml
  data-updater:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  ```
- **Risiko:** Ersteres ist ein Robustheitsproblem (unklare 500er, Log-Rauschen), kein Ausbruch.
  Zweiteres ist Root-Äquivalenz auf dem Host für jeden, der Code in diesem Container ausführt — es
  ist zwar über `profiles: ["ops"]` opt-in, aber der Container lädt und verarbeitet OSM-Daten aus
  dem Netz.
- **Fix:** `avoid` typisiert validieren:

  ```ts
  if (raw.avoid !== undefined && (!Array.isArray(raw.avoid) || raw.avoid.length > 16
      || raw.avoid.some((a) => typeof a !== 'string' || a.length > 32))) {
    throw new ValidationError('avoid must be an array of at most 16 short strings');
  }
  ```

  Für den Updater den Docker-Socket über einen Proxy mit Whitelist (z. B. `tecnativa/docker-socket-proxy`)
  einbinden oder den Job per Host-Cron statt im Container fahren.

---

### A-18 — `/healthz` der Route-Engine ist unauthentifiziert und verrät Infrastrukturzustand · P3

- **Ort:** `festi-backend/src/api/server.ts:246`, `:545-561`
- **Befund:**

  ```ts
  if (config.apiKey && path !== '/healthz' && !isAuthorized(req, config.apiKey)) { ... }
  ...
  sendJson(res, healthy ? 200 : 503, {
    healthy, version: VERSION, routingEngineReachable: engineReachable, queueReachable,
  });
  ```
- **Risiko:** Ein unauthentifizierter Aufrufer erfährt die exakte Engine-Version (`0.2.0`) und ob
  GraphHopper bzw. Redis erreichbar sind — nützlich für Timing eines DoS und für die Auswahl
  versionsspezifischer Exploits. In Kombination mit A-10 (offener Port) ist der Endpunkt der
  bequemste Weg, den Dienst überhaupt zu entdecken.
- **Fix:** Nur `{"healthy": true|false}` ohne Version und Abhängigkeitsdetails ausliefern; die
  ausführliche Variante hinter den API-Key legen (z. B. `/healthz?verbose=1`).

---

### A-19 — `uploadPostImage`: `position` nicht als Integer validiert, keine Obergrenze für Bild-Zeilen · P3

- **Ort:** `src/features/posts/actions/uploadPostImage.ts:33-35`, `:55`, `:66-72`
- **Befund:**

  ```ts
  if (position < 0 || position >= MAX_POST_IMAGES) {
    return { success: false, error: "Invalid image position." };
  }
  ...
  const key = `posts/${postId}/${position}.webp`;
  ...
  await prisma.postImage.create({ data: { postId, url: imageUrl, position } });
  ```

  `position` ist `number` ohne `Number.isInteger`-Prüfung, und es wird nirgends gezählt, wie viele
  `PostImage`-Zeilen ein Post bereits hat. (Pfad-Traversal ist ausgeschlossen: `postId` stammt aus der
  DB, und `putObject` encodiert jedes Segment einzeln — `r2.ts:89-94`.)
- **Risiko:** Ein Angreifer (nur für eigene Posts) kann mit `position: 0.1, 0.11, …` beliebig viele
  R2-Objekte und `PostImage`-Zeilen unter einem Post anlegen — Storage-/DB-Amplification und ein
  Rendering-Problem im Lightbox-Karussell. Nur durch die 5-MB-Grenze und die eigene Bandbreite
  gebremst (kein Rate-Limit, siehe A-04).
- **Fix:**

  ```ts
  if (!Number.isInteger(position) || position < 0 || position >= MAX_POST_IMAGES) { ... }
  const existing = await prisma.postImage.count({ where: { postId } });
  if (existing >= MAX_POST_IMAGES) return { success: false, error: "Image limit reached." };
  ```

  und `upsert` auf `(postId, position)` statt `create`.

---

## Geprüft & in Ordnung

**Session & better-auth (`src/lib/auth.ts`, `src/features/auth/guards.ts`)**
- `emailAndPassword`: `autoSignIn: false`, `requireEmailVerification: true` — Login vor
  Verifikation ist nicht möglich.
- Email-Enumeration-Protection ist bewusst und korrekt implementiert (`onExistingUserSignUp`,
  `customSyntheticUser`, und `registerUser.ts:36-38` verzichtet absichtlich auf eine Duplikatsprüfung).
- Session-Lifetime 7 d mit `updateAge` 1 d ist angemessen; Cookie-Flags werden nicht überschrieben,
  better-auth setzt in Produktion `httpOnly`, `secure`, `sameSite: lax` und den `__Secure-`-Präfix.
- `admin`-Plugin mit `defaultRole: "user"` — keine versehentliche Rechteerhöhung bei Registrierung.
- Fehlgeschlagene Logins/Registrierungen werden über den `after`-Hook protokolliert.

**Server Actions — Authorization (systematisch alle 78 Dateien unter `src/features/*/actions/` geprüft)**
- Rides: `updateRide:61`, `cancelRide:52`, `deleteRide:31`, `setRidePublic:38`, `uploadRidePhoto:46`,
  `deleteRidePhoto:31`, `markAttendance:39`, `respondToJoinRequest:46` prüfen alle
  `creatorId === session.user.id`. `getRideGpx:43` beschränkt auf Creator + APPROVED-Teilnehmer.
  `leaveRide`/`withdrawJoinRequest` operieren nur auf der eigenen `rideParticipant`-Zeile.
- Posts: `deletePost:25` und `deletePostComment:24` prüfen Autorschaft; `uploadPostImage:46` die
  Post-Autorschaft.
- Groups: `updateGroup:36`, `deleteGroup:29`, `uploadGroupImage:41` prüfen `createdById`;
  `createAnnouncement:48` und `deleteAnnouncement:33-37` nutzen `canManageGroup` (Owner/Moderator)
  bzw. Autorschaft; `updateGroupMemberRole:56` und `respondToGroupJoinRequest:54` scopen die
  Membership korrekt mit `groupId`.
- Routes: `deleteRoute:31` prüft `creatorId`; `getRoute:28-36` und `getGroupRoutes:16` prüfen
  Creator bzw. APPROVED-Mitgliedschaft; `saveRoute:47-70` prüft Ride-Teilnahme und Gruppenzugehörigkeit.
- Chat: `getGroupMessages:27` und `sendGroupMessage:100` erzwingen beide `status === "APPROVED"`.
  DMs sind sauber: `sendDirectMessage:259` verlangt `areMutualFollowers`, `getDirectMessages` liest
  ausschließlich Konversationen, an denen der Aufrufer beteiligt ist (`OR: [{senderId: myId, …}, …]`).
- Notifications: alle vier Actions filtern hart auf `userId: session.user.id` — kein Fremdzugriff,
  kein Markieren fremder Benachrichtigungen (`notification-actions.ts:31,59,85,132`).
- Admin: `banUser`, `unbanUser`, `updateUserRole`, `revokeUserSessions`, `getUsers`, `getAnalytics`
  rufen alle `getCurrentAdmin()` auf und brechen bei `null` ab; `banUser:33` verhindert zusätzlich
  das Sperren anderer Admins.
- `createRide:53-58` prüft die APPROVED-Mitgliedschaft, bevor ein Ride in eine Gruppe gepostet wird.

**Input-Validierung**
- Zod-Schemata mit `safeParse` in praktisch allen mutierenden Actions; kein Fall gefunden, in dem
  rohes `input` per Spread an Prisma weitergereicht wird (kein Mass-Assignment).
- `updateProfile:33-41` listet die erlaubten Felder explizit auf, statt `...data` zu spreaden.
- `updateRoleSchema` beschränkt auf `["user", "admin"]`.
- Drei `$queryRaw`-Stellen in `getAnalytics.ts:89,96,129` nutzen Tagged Templates mit
  Prisma-Parametern (`${since}`, `${last24h}`) — keine SQL-Injection; kein `$queryRawUnsafe` im Repo.
- Route-Engine `validation.ts`: alle Zahlenparameter mit Ober-/Untergrenzen, `departureTime` auf
  now…+5 d, Body-Limit 1 MB, Koordinaten-Bereichsprüfung plus bbox-Coverage-Check.

**Uploads**
- `validateImageUpload` (`src/lib/image.ts:24-49`) prüft Existenz, 5-MB-Limit, MIME-Whitelist **und**
  Magic Bytes (JPEG/PNG/WebP); der an R2 gesendete `Content-Type` ist der *gesniffte*, nicht der vom
  Client behauptete — SVG und HTML sind damit ausgeschlossen.
- R2-Keys werden ausschließlich aus serverseitig verifizierten IDs gebaut
  (`users/${session.user.id}/…`, `groups/${groupId}/…`, `rides/${rideId}/…`); `encodeKey`
  (`r2.ts:89-94`) encodiert jedes Segment einzeln — kein Pfad-Traversal.
- R2-Credentials kommen ausnahmslos aus `requireEnv()`.

**XSS**
- `renderMarkdown` (`src/features/posts/lib/markdown.tsx`) baut React-Nodes statt HTML-Strings,
  Link-Schemata sind auf `https?:`/`mailto:` beschränkt (`SAFE_LINK`), Links tragen
  `rel="noopener noreferrer nofollow"`.
- Der einzige `dangerouslySetInnerHTML` im Repo ist `components/ui/chart.tsx:95` (generiertes CSS aus
  der shadcn-Chart-Komponente, keine Nutzerdaten).
- Alle `target="_blank"` tragen `rel="noopener noreferrer"` oder `rel="noreferrer"` (letzteres
  impliziert noopener in allen aktuellen Browsern).

**Secrets**
- Keine hardcodierten Keys/Tokens in `src/`, `prisma/`, den Config-Dateien, `festi-backend/src`,
  `festi-backend/config`, `festi-backend/scripts` oder `festi-routes/scripts`.
- `.gitignore` deckt `.env*` und `.dev.vars` ab; `git log --all --diff-filter=A` liefert keine jemals
  committete `.env`-, `.pem`- oder Secret-Datei.
- `wrangler.jsonc` enthält unter `vars` nur `EMAIL_FROM` und weist im Kommentar explizit auf
  `wrangler secret put` hin. `docker-compose.yaml` (Frontend) enthält nur lokale
  Postgres-/pgAdmin-Dev-Credentials und ist nicht für Produktion gedacht.

**API-Routes (`src/app/api/**`)**
- `/api/auth/[...all]` ist der Standard-better-auth-Handler (inkl. Origin-Check und Rate-Limit).
- `/api/pro/capture` ist per `CRON_SECRET` als Bearer geschützt und antwortet ohne konfiguriertes
  Secret mit 503 statt offen zu laufen.
- `/api/pro/reports/[reportId]` und `/api/pro/live/[race]/[year]/[stage]` prüfen beide
  `getCurrentUser()`; die Report-ID ist gegen `/^[\w.-]{1,128}$/` validiert (kein Traversal, keine
  Quote-Injection in `Content-Disposition`), die Live-Route validiert Jahr und Etappennummer.

**Route-Engine (`festi-backend`)**
- API-Key-Prüfung nutzt `timingSafeEqual` mit vorheriger Längenprüfung (`server.ts:120-128`) —
  korrekt; die Längeninformation ist kein verwertbares Leck.
- Keine SSRF-Fläche: alle ausgehenden URLs (`ROUTING_ENGINE_URL`, `WEATHER_API_URL`,
  `AIR_QUALITY_API_URL`) stammen aus der Konfiguration, nie aus Request-Daten.
- Job-IDs sind `randomUUID()` (v4) — nicht erratbar; Ergebnisse haben eine TTL von 30 min.
- Globale Backpressure (`MAX_OPEN_JOBS`) und Wall-Clock-Budget (`JOB_TIMEOUT_SEC`) sind vorhanden;
  die Per-User-Quota wird im Worker bei jedem Terminalzustand freigegeben (`worker/index.ts:56-72`).
- Keine Secrets im Log: `console.log`/`console.error` geben nur Pfade, Zähler und Fehlertexte aus;
  der API-Key wird nirgends geloggt.

**festi-routes**
- Reines Datenrepo. `scripts/generate.mjs` liest `API_KEY` und `ENGINE_URL` ausschließlich aus
  `process.env`, kein Secret im Code, keine Shell-Ausführung, keine Nutzereingaben.

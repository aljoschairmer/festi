# C – Frontend-Architektur

## Vorbemerkung: Next.js-16-Doku

**Die Doku war nicht lesbar.** `node_modules/` existiert in diesem Checkout überhaupt nicht:

```
$ ls /home/user/festi/node_modules/
ls: cannot access '/home/user/festi/node_modules/': No such file or directory
$ find / -type d -path "*next/dist/docs*"   → keine Treffer
```

Aus `package-lock.json` ist die Version belegt: `next@16.2.10`.

**Konsequenz für diesen Report:** Ich habe wie in `AGENTS.md` gefordert *keine* Aussagen über
`use cache`, `cacheLife`, `cacheTag`, `dynamicIO`, `revalidate`-Semantik, `unstable_*`-APIs oder die
genaue `params`/`searchParams`-Await-Semantik aus dem Gedächtnis getroffen. Alle Findings, die von
Framework-Verhalten (statt von reinem Anwendungscode) abhängen, sind explizit als
**„Verdacht – zu verifizieren"** markiert und mit der Doku-Datei benannt, die dafür zu lesen ist.

Was ich stattdessen als Basis verwendet habe: den tatsächlichen Code, `package.json`,
`package-lock.json`, `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc` — und für alles andere
rein strukturelle Argumente (was existiert, was nicht, wer wen importiert, wie oft was pollt).

Was im Code **nachweislich nicht vorkommt** (`grep` über `src/`), unabhängig von der Doku:

| API | Treffer in `src/` |
|---|---|
| `use cache` / `cacheLife` / `cacheTag` | 0 |
| `revalidateTag` | 0 |
| `export const revalidate` / `export const dynamic` | 0 |
| `generateStaticParams` | 0 |
| `generateMetadata` | 0 |
| `next/dynamic` / `React.lazy` | 0 |
| `useActionState` / `useFormStatus` / `useOptimistic` / `useTransition` | 0 |
| `<form action={serverAction}>` | 0 |
| `loading.tsx` / `not-found.tsx` / `global-error.tsx` / `template.tsx` | 0 Dateien |
| `<Suspense>` | 1 (`src/app/reset-password/page.tsx:6`) |

---

## Zusammenfassung

Die Architektur ist im Kern **konsequent und nachvollziehbar**: strikte Feature-Ordner, ein
Server-Action pro Datei, Zod-Schemas pro Feature, alle Mutations-Actions prüfen selbst die Session,
Maps werden per `await import("maplibre-gl")` lazy geladen, und die Pro-Live-Ansicht nutzt bereits
SSE statt Polling. Das ist deutlich besser als der Durchschnitt.

Die Probleme liegen an drei Stellen:

1. **Die App ist als Single-Page-App gebaut, die zufällig im App Router liegt.** Nahezu jede Liste
   (Rides, Riders, Groups, Feed, Notifications, Users, Events, News) rendert eine leere Server-Shell
   und lädt die Daten danach per TanStack Query über einen Server-Action-POST nach. Damit wird der
   gesamte Server-Rendering-Teil von Next.js nicht genutzt — kein Streaming, kein SEO, LCP hinter
   einem zusätzlichen Roundtrip. Gleichzeitig gibt es **kein einziges `loading.tsx`**, sodass die
   wenigen wirklich serverseitig rendernden Seiten (Pro-Racing: vier externe Scrapes in `Promise.all`)
   komplett blockieren, bis alles fertig ist.

2. **Die Caching-Schicht ist verkabelt, aber nicht angeschlossen.** 33 Actions rufen
   `revalidatePath()` — davon **7 auf Routen, die es nicht gibt** (`/groups`, `/groups/:id`); der Rest
   zielt auf Seiten, deren Inhalt clientseitig geladen wird und die davon gar nicht betroffen sind.
   `open-next.config.ts` ist ein nackter `defineCloudflareConfig()` ohne `incrementalCache`, während
   `src/features/pro/lib/clients.ts` und `src/features/news/lib/feeds.ts` explizit auf
   `next: { revalidate: 3600 / 1800 }` setzen.

3. **Der Polling-Grundlast im Dashboard-Layout ist zu hoch und die Read-Actions sind unbegrenzt.**
   Jeder offene Tab erzeugt dauerhaft ~16 Server-Action-Requests/Minute, jeder mit Session-Lookup und
   mindestens einer Postgres-Query. Sechs Read-Actions haben kein `take:` und liefern die komplette
   Tabelle an den Browser, der dann clientseitig filtert und in 5er-Schritten „paginiert".

Insgesamt: **26 Findings** (2 × P0, 8 × P1, 11 × P2, 5 × P3).

---

## Findings

### C-01 — Read-Actions ohne Limit; Filterung und Paginierung passieren im Browser · **P0**

- **Ort:**
  - `src/features/community/actions/getRiders.ts:12` — `const users = await prisma.user.findMany({` (nur `where`, `orderBy`, `select` — kein `take`)
  - `src/features/community/actions/getGroups.ts:12` — `findMany` mit `include: { members: { select: { userId, status } } }`, kein `take`
  - `src/features/rides/actions/getRides.ts` — kein `take`
  - `src/features/events/actions/getCalendarEvents.ts:21` — `prisma.radnetEvent.findMany({ where: { date: { gte: today } }, ... })`, kein `take`
  - `src/features/users/actions/getUsers.ts`, `src/features/followers/actions/getFollowConnections.ts`, `src/features/posts/actions/getPostComments.ts`, `src/features/rides/actions/getMyRideGroups.ts` — ebenfalls ohne `take`
  - Gegenprobe: `getFeed.ts:64`, `getUserPosts.ts:19`, `getGroupRides.ts:35`, `notification-actions.ts:33` *haben* Limits — es ist also bekannt, wie es geht.
- **Befund:** Sechs bis neun Read-Pfade liefern die vollständige Tabelle. Die Konsumenten filtern und
  paginieren danach im Browser:
  ```tsx
  // src/features/community/components/ridersGrid.tsx:20,32-46
  const PAGE_SIZE = 5;
  const { data: riders = [] } = useQuery({ queryKey: ["riders"], queryFn: () => getRiders() });
  const filteredRiders = useMemo(() => { /* .filter über alle Nutzer */ }, [riders, search]);
  ```
  `EventsExplorer` (`eventsExplorer.tsx:53-56, 93-119`) zieht den kompletten BDR-Breitensport-Kalender
  und filtert Typ/Region/Datum/Suche in `useMemo` — inklusive `EventsMap`, die daraus eine
  GeoJSON-FeatureCollection baut.
- **Auswirkung:** Payload und Query-Kosten wachsen linear mit der Nutzer-/Event-Zahl, nicht mit dem
  Sichtbaren. Bei 5 000 Nutzern werden 5 000 Datensätze über die Leitung geschickt, um 5 Karten zu
  zeigen. Auf Cloudflare Workers zählt das direkt auf CPU-Zeit und Postgres-Verbindungen. Die
  Suchfunktion findet außerdem nur, was zufällig schon im Speicher liegt — sie skaliert nicht mit.
- **Fix:** `take`/`skip` bzw. Cursor in die Actions ziehen (Muster von `getFeed.ts` übernehmen),
  Suchbegriff und Filter als Action-Parameter durchreichen und in den Query-Key aufnehmen
  (`["riders", { search, page }]`). Das Muster existiert bereits in `getRides` für Pace/Difficulty —
  es fehlt nur die Begrenzung.

---

### C-02 — Polling-Grundlast: ~16 Requests/Minute pro offenem Tab, allein aus dem Dashboard-Layout · **P0**

- **Ort:** `src/app/dashboard/layout.tsx:22,33` rendert unbedingt `<PresenceHeartbeat />` und
  `<HeaderButtonGroup />`; letzteres ist `src/components/headerButtonGroup.tsx:8-10`.
- **Befund:** Vier Dauer-Timer, alle ohne Sichtbarkeits- oder Öffnungs-Gate:

  | Quelle | Intervall | Req/min |
  |---|---|---|
  | `notificationSheet.tsx:237-241` — `queryKey: ["notifications-unread"]`, `refetchInterval: 10000` | 10 s | 6 |
  | `directChatHeaderButton.tsx:10-14` — `queryKey: ["direct-unread"]`, `refetchInterval: 10000` | 10 s | 6 |
  | `followerListSheet.tsx:133-137` — `queryKey: ["follow-connections"]`, `refetchInterval: 30_000` | 30 s | 2 |
  | `presenceHeartbeat.tsx` + `followers/lib/presence.ts:9` — `PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000` | 30 s | 2 |
  | **Summe** | | **16** |

  Auf einer Gruppenseite kommen `groupChat.tsx:66-69` (`refetchInterval: 2000`) hinzu — **+30/min**;
  in einem offenen DM-Thread `directChatThread.tsx:57-59` (`refetchInterval: 2000`) weitere **+30/min**,
  plus `directChatDialog.tsx:206-209` (5 s) **+12/min**.

  Besonders teuer ist `follow-connections`: das ist kein Zähler, sondern die **komplette** Follower-,
  Following- und Mutual-Liste (`getFollowConnections.ts`, ohne `take`) — alle 30 Sekunden, auch wenn
  das Sheet nie geöffnet wurde. `ProfileFollowStats` (`profileFollowStats.tsx:33-37`) startet denselben
  Poll ein zweites Mal auf der Profilseite (TanStack dedupliziert ihn zwar, das Intervall bleibt aber).
- **Auswirkung:** 960 Worker-Invocations pro Stunde und offenem Tab, jede mit `getSession()` (DB) plus
  Fach-Query. Bei 100 gleichzeitigen Nutzern ≈ 96 000 Invocations/h **ohne jede Interaktion**. Auf
  Cloudflare Workers + Postgres ist das die dominierende Kostenposition, und es ist Last, die
  vollständig verschwindet, sobald man sie ereignisgesteuert macht.
- **Korrektur (nachträglich geprüft):** Der ursprüngliche Punkt 1 des Fixes war falsch. React Query
  pausiert Intervall-Refetches im Hintergrund-Tab **von sich aus**: `queryObserver.js:215` feuert nur
  bei `this.options.refetchIntervalInBackground || focusManager.isFocused()`, und `focusManager`
  (`focusManager.js:59`) liest `document.visibilityState !== "hidden"`. `refetchIntervalInBackground`
  ist nirgends im Repo gesetzt und hat den Default `false`. Die Zahlen oben gelten also für den
  **sichtbaren** Tab; ein Hintergrund-Tab pollte nie. Geprüft gegen `@tanstack/react-query@5.101.2`
  im `node_modules` dieses Repos.
- **Fix:**
  1. ~~`refetchInterval` an `visibilitychange` koppeln~~ — entfällt, siehe Korrektur.
  2. Die beiden Unread-Zähler zu **einem** Badge-Endpunkt zusammenlegen (`{ notifications, messages }`)
     → halbiert 12 auf 6 Req/min.
  3. `follow-connections` nicht pollen: `enabled: open` im Sheet, plus Invalidierung nach
     Follow/Unfollow (siehe C-10).
  4. Für Chat: das SSE-Muster nutzen, das in
     `src/app/api/pro/live/[race]/[year]/[stage]/route.ts` bereits sauber implementiert ist (Kommentar
     dort: *„replacing the panel's former 8s server-action polling"*). Die Lösung existiert im Repo —
     sie ist nur nicht auf den Chat angewandt.
- **Status:** Punkte 2 und 3 umgesetzt. Die beiden Unread-Zähler laufen jetzt über eine gemeinsame
  Server-Action (`src/lib/unreadBadges.ts`) und einen gemeinsamen Hook
  (`src/hooks/useUnreadBadges.ts`), Intervall 15 s statt 2 × 10 s; die alten Einzel-Actions sind
  gelöscht (jede exportierte Server-Action ist ein öffentlicher Endpunkt). `follow-connections` läuft
  nur noch mit `enabled: open` — im Sheet und in `ProfileFollowStats` — und wird nach Follow/Unfollow
  invalidiert. Damit sinkt die Grundlast eines idle Tabs von **16 auf 6 Req/min**
  (Badges 4 + Presence 2). Punkt 4 (Chat auf SSE) ist offen.

---

### C-03 — `revalidatePath()` auf Routen, die es nicht gibt (7 Aktionen) · **P1**

- **Ort:**
  - `src/features/community/actions/leaveGroup.ts:62` — `revalidatePath(\`/groups/${groupId}\`);`
  - `src/features/community/actions/joinGroup.ts:72,107` — dito (zweimal)
  - `src/features/community/actions/cancelGroupJoinRequest.ts:58`
  - `src/features/community/actions/kickGroupMember.ts:80` — `revalidatePath(\`/groups/${input.groupId}\`)`
  - `src/features/community/actions/respondToGroupJoinRequest.ts:81`
  - `src/features/community/actions/updateGroup.ts:52`
  - `src/features/community/actions/createGroup.ts:43` und `deleteGroup.ts:47` — `revalidatePath("/groups")`
- **Befund:** Es existiert **kein** Segment `src/app/groups/`. Die echte Route ist
  `src/app/dashboard/community/g/[id]/page.tsx`. Dass es zwei korrekte Gegenbeispiele im *selben*
  Ordner gibt, macht den Fehler eindeutig:
  ```ts
  // uploadGroupImage.ts:69-70  — richtig
  revalidatePath("/dashboard/community");
  revalidatePath(`/dashboard/community/g/${groupId}`);
  // updateGroupMemberRole.ts:79, createAnnouncement.ts:59, deleteAnnouncement.ts:46 — ebenfalls richtig
  ```
- **Auswirkung:** Nach Beitritt, Austritt, Kick, Rollenwechsel oder Gruppen-Umbenennung wird die
  Gruppenseite nicht invalidiert. Sichtbar wird das dort, wo die Gruppenseite **serverseitig** rendert:
  Mitgliederliste, Beschreibung, `pendingMembers` und `groupForButton` in
  `dashboard/community/g/[id]/page.tsx:44-136`. Diese Daten stammen direkt aus Prisma im Server
  Component, nicht aus TanStack Query.
- **Fix:** Alle sieben Aufrufe auf `/dashboard/community/g/${groupId}` bzw. `/dashboard/community`
  umstellen. Danach: die Pfade zentral ablegen (z. B. `features/community/lib/routes.ts` mit
  `groupPath(id)`), damit derselbe Fehler nicht wiederkehrt.

---

### C-04 — OpenNext ohne `incrementalCache`: die vorhandenen `revalidate`-Angaben laufen vermutlich ins Leere · **P1** *(Verdacht – zu verifizieren)*

- **Ort:**
  ```ts
  // open-next.config.ts — vollständige Datei
  import { defineCloudflareConfig } from "@opennextjs/cloudflare";
  export default defineCloudflareConfig();
  ```
  gegen:
  ```ts
  // src/features/pro/lib/clients.ts:8-17
  /** Upstream race data … opt into Next's fetch cache with a 1-hour revalidation window. */
  const CACHE_OPTIONS = { next: { revalidate: 3600 } };
  const LIVE_OPTIONS  = { next: { revalidate: 0 } };
  ```
  ```ts
  // src/features/news/lib/feeds.ts:89-92
  const res = await fetch(url, { headers: {...}, next: { revalidate: 1800 } });
  ```
  `wrangler.jsonc` deklariert nur `assets` und `crons` — kein KV-, R2- oder D1-Binding für einen Cache.
- **Befund:** `defineCloudflareConfig()` wird ohne `incrementalCache`-Option aufgerufen. Der Code geht
  aber ausdrücklich davon aus, dass ein persistenter Data Cache existiert („Cached for 30 min" im
  Kommentar von `fetchCyclingNews`). Zusätzlich laufen alle diese `fetch`-Aufrufe innerhalb von
  `"use server"`-Modulen (`getRaceDetail.ts:1`, `getNews.ts:1`), was eine zweite offene Frage aufwirft.
- **Auswirkung (falls bestätigt):** Jeder Aufruf von `/dashboard/pro/[race]/[year]` scraped ASO und
  Tissot komplett neu (`getRaceDetail` allein macht `getStages`, `getWithdrawals` pro gefahrener Etappe,
  `getRiders`, `getTeams`, `getLatestOverallRanking` — siehe `getRaceDetail.ts:54-103,113-116,170-187`),
  und jeder Aufruf von `/dashboard/news` holt alle RSS-Feeds neu. Das ist die teuerste Seite der App
  und sie hat effektiv keinen Cache. `revalidatePath()` (33 Aufrufe) hätte ebenfalls nichts zu purgen.
- **Fix / Verifikation:** Vor jeder Änderung `node_modules/@opennextjs/cloudflare` (README /
  `docs/`) und `node_modules/next/dist/docs/` zum Thema Data Cache + Server Actions lesen. Wenn
  bestätigt: `incrementalCache: r2IncrementalCache` (oder KV) in `open-next.config.ts` konfigurieren und
  das Binding in `wrangler.jsonc` ergänzen. Zweite Option unabhängig davon: die Pro-/News-Fetches aus
  den `"use server"`-Modulen in normale serverseitige Module ziehen (siehe C-07), damit die
  Fetch-Cache-Semantik überhaupt greifen kann.

---

### C-05 — Kein `loading.tsx`, kein `not-found.tsx`, kein `global-error.tsx`; `error.tsx` ohne `reset` · **P1**

- **Ort:** `find src/app -name "loading.tsx" -o -name "not-found.tsx" -o -name "global-error.tsx"` → nur
  `src/app/error.tsx`. Dessen Inhalt vollständig:
  ```tsx
  "use client";
  import { ErrorComponent } from "@/components/errorComponent";
  export default function ErrorPage() {
    return <ErrorComponent />;
  }
  ```
- **Befund, vier Teile:**

  **(a) Kein `loading.tsx` → keine Streaming-Grenze.** Am teuersten sichtbar auf
  `src/app/dashboard/pro/[race]/[year]/page.tsx:457-462`:
  ```ts
  const [detail, reports, raceMap, news] = await Promise.all([
    getRaceDetail(raceKey, year), getRaceReports(raceKey, year),
    getRaceMap(raceKey, year),    getRaceNews(raceKey, year),
  ]);
  ```
  Vier externe Scrapes; bis der langsamste fertig ist, sieht der Nutzer die **alte Seite** (der App
  Router blockiert die Navigation ohne Loading-Boundary). Dasselbe gilt für
  `dashboard/community-rides/[rideId]/page.tsx:35` und `dashboard/community/g/[id]/page.tsx:44-118`
  (drei sequenzielle Prisma-Queries: `group` → `ownMembership` → `pendingMembers`).

  **(b) Kein `not-found.tsx`.** `notFound()` wird an 6 Stellen aufgerufen
  (`community/g/[id]/page.tsx:75`, `community-rides/[rideId]/page.tsx:38`, `pro/[race]/[year]/page.tsx:454,464`,
  `pro/.../stage/[stage]/page.tsx:41,46`) und landet damit auf Next.js' eingebauter Default-404 —
  ohne Layout, ohne Raleway, ohne Sidebar. Die passende Komponente **existiert bereits**:
  `src/components/notFoundComponent.tsx` — sie wird aber nur von *einer* Client-Komponente benutzt
  (`userMainComponent.tsx:34`), nie als Route-Konvention.

  **(c) Kein `global-error.tsx`.** `error.tsx` fängt Fehler im Root-Layout nicht ab —
  `src/app/layout.tsx` rendert `QueryProvider` und `Toaster`, `dashboard/layout.tsx` ruft `requireAuth()`.

  **(d) `error.tsx` verwirft `error` und `reset`.** Kein „Erneut versuchen"-Button, kein Logging des
  `digest`. `ErrorComponent` akzeptiert zwar `error?: string` (`errorComponent.tsx:3-5`) — es wird nur
  nichts übergeben. Auch `LoadingComponent` (`src/components/loadingComponent.tsx`) existiert bereits,
  wird aber nie als `loading.tsx` verwendet.
- **Auswirkung:** Kein Streaming, blockierende Navigationen bei jeder externen Datenquelle, ein
  stilfremder 404, ein nicht abgefangener Root-Layout-Fehler und ein Error-Screen ohne Ausweg.
- **Fix:** Die Bausteine sind fertig, es fehlt die Verkabelung:
  - `src/app/dashboard/loading.tsx` → `<LoadingComponent />` (plus segmentspezifische Skeletons unter
    `pro/`, `community-rides/[rideId]/`, `community/g/[id]/`)
  - `src/app/not-found.tsx` → `<NotFoundComponent />`
  - `src/app/global-error.tsx`
  - `error.tsx` auf `({ error, reset }: { error: Error & { digest?: string }; reset: () => void })`
    umstellen, `reset` an einen Button hängen, `error.digest` loggen
    (`src/features/logger` existiert bereits).
  - Vorher die Doku zu `loading.tsx`/`error.tsx`/`not-found.tsx` in Next 16 gegenlesen — insbesondere
    ob sich Signatur oder Konvention gegenüber Next 15 geändert haben (in diesem Checkout nicht möglich).

---

### C-06 — Die Listen rendern nicht auf dem Server: leere Shell + Nachladen per Server-Action-POST · **P1**

- **Ort (Muster durchgängig):**

  | Route | Server-Component rendert | Daten kommen aus |
  |---|---|---|
  | `dashboard/community-rides/page.tsx:24` | `<RideFilters />` | `ridesGrid.tsx:20-23` → `getRides` |
  | `dashboard/community/page.tsx:30,42` | `<RidersGrid /> <GroupsGrid />` | `getRiders`, `getGroups` |
  | `dashboard/community/u/[id]/page.tsx:6` | `<UserMainComponent />` | `userMainComponent.tsx:18-21` → `getRider` |
  | `dashboard/page.tsx:36` | `<PostFeed />` | `postFeed.tsx:24-30` → `getFeed` |
  | `dashboard/notifications/page.tsx:27` | `<NotificationHistory />` | `getNotificationHistory` |
  | `dashboard/admin/users/page.tsx:29` | `<UsersTable />` | `getUsers` |
  | `dashboard/news/page.tsx:16` | `<NewsGrid />` | `getNews` |
  | `dashboard/events/page.tsx:14` | `<EventsExplorer />` | `getCalendarEvents` |
- **Befund:** Die Server Components liefern nur Überschrift und Card-Rahmen. Besonders deutlich:
  ```tsx
  // src/app/dashboard/community/u/[id]/page.tsx — vollständig
  export default function RiderProfilePage() {
    return (<div><UserMainComponent /></div>);
  }
  ```
  Der Client liest die ID dann via `useParams()` (`userMainComponent.tsx:15-16`), obwohl die Route ein
  `params`-Objekt hat. Die Seite ist damit dynamisch, aber ohne jeden Server-Inhalt.
- **Auswirkung:** LCP = Server-Roundtrip (HTML) **+** Hydration **+** Server-Action-POST **+** DB-Query.
  Kein Inhalt im initialen HTML → nichts indexierbar, Skeletons bei jedem Seitenwechsel, und der
  komplette Vorteil von RSC (Datenlogik bleibt auf dem Server, kein Client-JS dafür) entfällt.
  Zusätzlich ist damit auch `revalidatePath` auf diesen Routen wirkungslos (siehe C-03/C-13): der
  Server-Payload enthält die Daten gar nicht.
- **Fix:** Für jede Liste eine der beiden Varianten, nicht gemischt:
  - **Statisch/selten wechselnd** (Riders, Groups, News, Ride-Detail): direkt im Server Component laden
    und als Props reingeben, Interaktivität in kleine Client-Inseln kapseln — so wie
    `dashboard/community-rides/[rideId]/page.tsx` und `dashboard/pro/**` es bereits richtig machen.
  - **Interaktiv gefiltert** (Rides, Events, Feed): serverseitig die erste Seite laden und über
    `HydrationBoundary`/`initialData` in TanStack Query einspeisen, damit nach der Hydration nicht
    sofort nachgeladen wird.

---

### C-07 — `guards.ts` ist mit `"use server"` markiert: Auth-Guards werden zu Action-Endpunkten · **P1**

- **Ort:** `src/features/auth/guards.ts:1`
  ```ts
  "use server";
  import { headers } from "next/headers";
  import { redirect } from "next/navigation";
  export async function getSession() { … }
  export async function requireAuth() { … }
  export async function requireAdmin() { … }
  export async function getCurrentUser() { … }
  export async function getCurrentAdmin() { … }
  ```
- **Befund:** Diese Funktionen werden ausschließlich **serverseitig** aufgerufen: aus Layouts
  (`dashboard/layout.tsx:18`), aus Pages (7 Stellen) und aus anderen Server Actions (~40 Stellen).
  Keine einzige Client-Komponente importiert sie. `"use server"` erfüllt hier also keinen Zweck,
  sondern registriert fünf Funktionen zusätzlich als aufrufbare Endpunkte — darunter
  `getSession()` und `getCurrentAdmin()`, die das komplette Session-Objekt zurückgeben.
  Dasselbe gilt für alle 30 `get*`-Read-Actions: `getRaceDetail`, `getRiders`, `getUsers` etc. sind
  `"use server"`, obwohl `getRaceDetail`/`getProRaces`/`getStageDetail` **nur** von Server Components
  aufgerufen werden (`pro/page.tsx:38`, `pro/[race]/[year]/page.tsx:457-462`).
- **Auswirkung:** Unnötig große Angriffsfläche (Details gehören in den Security-Review) und
  architektonisch die falsche Grenze: serverinterne Hilfsfunktionen werden zu einer öffentlichen
  API. Nebenwirkung: die Fetch-Cache-Optionen der Pro-Clients laufen dadurch möglicherweise im
  Action-Kontext statt im Render-Kontext (siehe C-04).
- **Fix:** `"use server"` aus `guards.ts` entfernen und stattdessen `import "server-only"` setzen —
  genau das Muster, das `src/features/pro/lib/clients.ts:1` bereits verwendet. Analog für die
  Read-Actions, die nur von Server Components konsumiert werden (`pro/*`, `getPublicRide`, `getRide`).
  Nur was tatsächlich vom Client aufgerufen wird, bleibt `"use server"`.
  *Vorher:* Doku zu Server Actions / `server-only` in Next 16 gegenlesen — ob sich Registrierung oder
  Konvention geändert haben, konnte ich hier nicht prüfen.

---

### C-08 — `QueryClient` ohne Defaults: `staleTime: 0` überall, kein SSR-Schutz, kein Retry-Verhalten · **P1**

- **Ort:** `src/features/providers/query-provider.tsx:7`
  ```tsx
  const [queryClient] = useState(() => new QueryClient());
  ```
- **Befund:** Keine `defaultOptions`. Damit gilt für jede der ~30 Queries `staleTime: 0`,
  `refetchOnWindowFocus: true`, `refetchOnMount: true`, `retry: 3`. Nur fünf Queries setzen
  explizit einen `staleTime` (`use-session.ts:18`, `newsGrid.tsx:24`, `locationSearch.tsx:44`,
  `analyticsDashboard.tsx:39`, und `eventsExplorer.tsx:75` schaltet nur `refetchOnWindowFocus` ab).
- **Auswirkung:**
  - **Doppeltes Fetchen bei jeder Navigation:** zurück zu `/dashboard` → `["posts","following"]`
    refetcht sofort, auch wenn die Daten drei Sekunden alt sind.
  - **Fetch-Sturm bei Fensterfokus:** ein Tab-Wechsel triggert gleichzeitig `posts`, `riders`,
    `groups`, `rides`, `notifications`, `follow-connections`, `direct-unread`, …
  - **Fehlerhafte Actions werden 3× wiederholt** — bei `getRaceDetail` (mehrere externe Scrapes) und
    `syncCalendarEvents` (rate-limitierter rad-net-Scrape) ist das schädlich.
  - Es maskiert außerdem C-10: fehlende Invalidierungen fallen selten auf, weil ohnehin alles
    ständig neu geladen wird — die Korrektheit hängt an einem Zufall.
- **Fix:**
  ```tsx
  new QueryClient({ defaultOptions: { queries: {
    staleTime: 60_000, gcTime: 5 * 60_000,
    refetchOnWindowFocus: false, retry: 1,
  } } })
  ```
  Danach die tatsächlich echtzeitnahen Queries (Chat, Unread-Zähler) gezielt mit kürzerem `staleTime`
  überschreiben — statt umgekehrt.

---

### C-09 — Öffentliche Ride-Seite: kein `generateMetadata`, Soft-404 mit HTTP 200 · **P1**

- **Ort:** `src/app/rides/[rideId]/page.tsx` — die einzige Seite der App, die explizit zum Teilen
  gebaut ist (`PublicRideLink`, `setRidePublic`). Kein `generateMetadata` in der Datei;
  `grep -rn "generateMetadata" src` → 0 Treffer im gesamten Repo.
  ```tsx
  // rides/[rideId]/page.tsx:36,55-58
  const ride = await getPublicRide(rideId);
  …
  {!ride ? (
    <Card><CardHeader><CardTitle>This ride is not public</CardTitle></CardHeader>
  ```
- **Befund, zwei Teile:**
  **(a)** Ein geteilter Link zeigt in WhatsApp/Slack/Twitter den globalen Titel aus
  `src/app/layout.tsx:34-40` — „Festi - Your Cycling Community" mit dem Logo — statt Ride-Titel,
  Datum, Distanz und Höhenmetern. Genau die Daten, die die Seite ohnehin serverseitig hat.
  **(b)** Ein nicht existierender oder privater Ride liefert **HTTP 200** mit einer Fehlerkarte statt
  `notFound()`. Suchmaschinen indexieren das als gültige Seite (Soft-404); es gibt weder
  `robots.ts` noch `sitemap.ts` im Repo, die das abfangen würden.
  **(c)** In `src/app/layout.tsx:13-41` fehlt außerdem `metadataBase`, während die OG-Bilder relativ
  angegeben sind (`images: ["/logo-original-white.png"]`) — *Verdacht, gegen die Metadata-Doku zu
  verifizieren*: relative OG-URLs benötigen üblicherweise eine Basis-URL.
- **Auswirkung:** Die einzige Wachstumsschleife der Plattform (geteilte Ride-Links) trägt keinen
  Kontext; jeder geteilte Link sieht identisch aus.
- **Fix:** `generateMetadata({ params })` in `rides/[rideId]/page.tsx` (Titel, Beschreibung,
  `openGraph`), `notFound()` statt der Inline-Karte für „existiert nicht", die Inline-Karte nur noch
  für „existiert, ist aber privat" (dann mit `robots: { index: false }`). `metadataBase` im
  Root-Layout ergänzen. `src/app/sitemap.ts` und `src/app/robots.ts` anlegen.

---

### C-10 — Fehlende Query-Invalidierungen nach Follow, Ride-Erstellung und Route-Speichern · **P1**

- **Ort / Befund:**

  **(a) Follow/Unfollow** — `src/features/community/components/followRiderButton.tsx:33-41,59-67`:
  ```ts
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ["rider-profile", targetId] });
    router.refresh();
  ```
  Nicht invalidiert werden: `["posts"]` (der „Following"-Feed auf `/dashboard` ändert sich durch
  einen Follow direkt — `getFeed.ts:22-24`), `["follow-connections"]` (Follower-Sheet und
  `ProfileFollowStats`), `["riders"]`. Zudem revalidiert weder `followRider.ts` noch
  `unfollowRider.ts` irgendeinen Pfad — `/dashboard/profile` rendert die Follower-Zahl aber
  serverseitig (`profile/page.tsx:28,33-34`).

  **(b) Ride-Erstellung** — `src/features/rides/components/ridePlanner.tsx:224-245`: die Mutation
  navigiert per `router.push(...)` weiter, ohne `["rides"]` oder `["group-rides", groupId]` zu
  invalidieren. `groupRides.tsx:26` nutzt `["group-rides", groupId]`.

  **(c) Routen-Bibliothek** — `saveRouteDialog.tsx:68` invalidiert `["group-routes"]` (Prefix, ok),
  aber `routes/actions/saveRoute.ts` und `deleteRoute.ts` rufen **kein** `revalidatePath` — die
  Gruppenseite, die `GroupRoutes` rendert, bleibt serverseitig unberührt.

  **(d)** `posts/actions/togglePostLike.ts`, `addPostComment.ts`, `deletePostComment.ts`: kein
  `revalidatePath("/dashboard")`, obwohl die Geschwisteraktionen `createPost.ts:42`,
  `deletePost.ts:31`, `uploadPostImage.ts:74` es tun. Inkonsistent, auch wenn es hier folgenlos ist
  (der Feed ist client-geladen).
- **Auswirkung:** Veraltete UI nach Follow (Feed und Follower-Listen), nach Ride-Erstellung (Liste und
  Gruppen-Rides) und nach dem Speichern einer Route. Aktuell teilweise verdeckt durch `staleTime: 0`
  (C-08) — sobald man den `staleTime` korrekt setzt, werden diese Lücken sofort sichtbar. Die
  Reihenfolge der Fixes ist also: **erst C-10, dann C-08.**
- **Fix:** Query-Keys zentralisieren (`features/<domain>/queryKeys.ts`) und pro Mutation die
  betroffenen Keys explizit auflisten. Details in der Revalidation-Matrix unten.

---

### C-11 — Zwei konkurrierende `useSession`-Implementierungen; die Invalidierung ist wirkungslos · **P2**

- **Ort:**
  - `src/features/auth/hooks/use-session.ts:6-19` — eigener TanStack-Wrapper,
    `sessionQueryKey = ["session"]`, `staleTime: 5 min`
  - `src/lib/auth-client.ts:10-17` — re-exportiert better-auths eigenen `useSession` (nanostores)
- **Befund:** Der einzige tatsächliche Konsument eines `useSession()`-Aufrufs ist
  `analyticsDashboard.tsx:15,31` — und der nutzt die **better-auth-Variante**. Der TanStack-Wrapper
  wird von *niemandem* aufgerufen; von ihm wird nur der Key importiert, um ihn zu invalidieren:
  ```ts
  // userMenu.tsx:38, loginForm.tsx:64, avatarUploader.tsx:58
  queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  ```
  Da niemand die Query jemals abonniert, invalidieren diese drei Aufrufe einen nie befüllten
  Cache-Eintrag — sie sind funktional No-Ops. Der better-auth-Store, der die Daten tatsächlich hält,
  wird nicht angefasst.
- **Auswirkung:** Toter Code, der wie eine Cache-Invalidierung aussieht. Nach Avatar-Upload oder
  Logout wird der better-auth-Session-Store nicht aktualisiert; dass es trotzdem funktioniert, liegt
  am begleitenden `router.refresh()`.
- **Fix:** Auf **eine** Quelle festlegen. Da `dashboard/layout.tsx:18` die Session ohnehin
  serverseitig lädt und als Props durchreicht, ist der einfachste Weg: `features/auth/hooks/use-session.ts`
  löschen, die drei `sessionQueryKey`-Invalidierungen entfernen, und in `analyticsDashboard.tsx` die
  E-Mail als Prop von der Server-Page übergeben statt clientseitig zu holen.

---

### C-12 — Kein `next/dynamic`; recharts landet statisch im Ride-Detail- und Ride-Planner-Bundle · **P2**

- **Ort:**
  - `src/features/rides/components/elevationChart.tsx:12` — `} from "recharts";` (statisch, `"use client"`)
  - `src/components/ui/chart.tsx:5` — `import * as RechartsPrimitive from "recharts";`
  - `src/features/analytics/components/activityCharts.tsx:11` — `} from "recharts";`
  - Konsumenten von `ElevationChart`: `rideRoutePanel.tsx:5` (→ Ride-Detail-Seite),
    `ridePlanner.tsx:48` (→ `/dashboard/community-rides/new`),
    `pro/components/stageRoutePanel.tsx:65` (→ Pro-Etappenseite)
- **Befund:** maplibre-gl wird vorbildlich lazy geladen — `rideMap.tsx:186,577,739,881`,
  `eventsMap.tsx:136,266`, `raceMap.tsx:89,218` nutzen alle
  `const maplibregl = (await import("maplibre-gl")).default;` mit `import type` für die Typen.
  Bei recharts fehlt dasselbe: `ElevationChart` wird in `rideRoutePanel.tsx:34` nur gerendert, wenn
  `elevationProfile.length >= 2` — der Import ist trotzdem statisch, das Chart-Bundle wird also auch
  für Rides ohne Höhenprofil geladen. `next/dynamic` und `React.lazy` kommen im gesamten Repo nicht vor.
- **Nebenbefund:** `src/features/rides/lib/mapStyle.ts` ist 547 Zeilen / 20 kB Quelltext (kompletter
  MapLibre-Style) und wird statisch in jede Karten-Komponente gebündelt, obwohl es reines
  Konfigurations-JSON ist.
- **Auswirkung:** ~100 kB (gzip, grob geschätzt) recharts auf drei Routen, die es meist nicht brauchen.
  Auf `/dashboard/community-rides/new` liegt es zusätzlich zu maplibre-gl im selben Chunk.
- **Fix:** `const ElevationChart = dynamic(() => import("./elevationChart").then(m => m.ElevationChart), { ssr: false })`
  — oder, konsistent mit dem bereits im Repo verwendeten Muster, `await import("recharts")` innerhalb
  der Komponente. `mapStyle` als statisches JSON aus `public/` laden.
  *Vor der Umsetzung:* die `next/dynamic`-Doku in Next 16 lesen — insbesondere ob `ssr: false`
  weiterhin so heißt und in Server Components zulässig ist. In diesem Checkout nicht prüfbar.

---

### C-13 — `revalidatePath` auf Routen, deren Inhalt gar nicht serverseitig gerendert wird · **P2**

- **Ort (Beispiele):** `users/actions/banUser.ts:46`, `unbanUser.ts:36`, `updateUserRole.ts:38`,
  `revokeUserSessions.ts:23` → alle `revalidatePath("/dashboard/admin/users")`;
  `posts/actions/createPost.ts:42`, `deletePost.ts:31`, `uploadPostImage.ts:74` → `revalidatePath("/dashboard")`;
  `community/actions/uploadGroupImage.ts:69` → `revalidatePath("/dashboard/community")`;
  `users/actions/updateProfile.ts:44` → `revalidatePath("/dashboard/community/u/${id}")`.
- **Befund:** Alle vier Zielseiten rendern ihre Daten **clientseitig** (siehe C-06):
  `/dashboard/admin/users` → `UsersTable` mit `["admin-users"]`; `/dashboard` → `PostFeed` mit
  `["posts", scope]`; `/dashboard/community` → `RidersGrid`/`GroupsGrid`; `/dashboard/community/u/[id]`
  → `UserMainComponent` mit `["rider-profile", id]`. Der revalidierte RSC-Payload enthält nur den
  Card-Rahmen. Alle diese Aktionen funktionieren in der Praxis nur, weil die Client-Komponenten
  *zusätzlich* `queryClient.invalidateQueries` aufrufen (`usersTableColumns.tsx:48,67,87`,
  `bannedDialog.tsx:75`, `createPostForm.tsx:134`, `postCard.tsx:81`).
- **Auswirkung:** Kein Fehlverhalten, aber ein irreführendes Sicherheitsgefühl: es sieht so aus, als
  wäre die Server-Invalidierung die Quelle der Frische. Beim Umbau auf echtes Server-Rendering (C-06)
  wäre die Abdeckung dann tatsächlich lückenhaft — und es erschwert die Fehlersuche bei C-03.
- **Fix:** Pro Route eine bewusste Entscheidung (Server-gerendert → `revalidatePath`; client-geladen →
  `invalidateQueries`), nicht beides „zur Sicherheit". Andernfalls entstehen bei jeder Mutation zwei
  parallele, unabhängig zu pflegende Invalidierungspfade — genau das ist bereits der Fall
  (18 × `router.refresh()` neben 33 × `revalidatePath` neben ~25 × `invalidateQueries`).

---

### C-14 — Session wird pro Request mehrfach geladen; kein `cache()`-Dedup · **P2**

- **Ort:** `src/features/auth/guards.ts:11-16` — `getSession()` ruft `auth.api.getSession({ headers })`
  ohne jede Memoisierung. `grep -rn "cache(" src/features src/lib` → einziger Treffer:
  `src/lib/prisma.ts:14` (`getClient`).
- **Befund:** Ein Request auf `/dashboard` durchläuft mindestens:
  `dashboard/layout.tsx:18` `requireAuth()` → `dashboard/page.tsx:6` `requireAuth()` → danach je ein
  `getCurrentUser()` in `getFeed`. Auf `/dashboard/community-rides/[rideId]`:
  Layout + `page.tsx:33` + `getRide`. Auf `/dashboard/community/g/[id]` wird die Session sogar in der
  Page nochmals direkt über `auth.api.getSession({ headers: await headers() })` geholt
  (`g/[id]/page.tsx:40-42`), obwohl das Layout sie bereits hat.
- **Auswirkung:** 2–3 zusätzliche Session-Lookups (jeweils DB) pro Seitenaufruf, multipliziert mit der
  Polling-Last aus C-02.
- **Fix:** `getSession` in `React.cache()` wrappen (Request-Scope-Dedup) — setzt allerdings voraus,
  dass `"use server"` dort entfernt wird (C-07). Zusätzlich: die Session vom Layout als Prop
  weiterreichen, wo möglich.
  *Verifikation:* ob `React.cache()` in Next 16 weiterhin das empfohlene Mittel für Request-Dedup ist
  (statt einer neueren Doku-Empfehlung), konnte ich mangels `node_modules/next/dist/docs/` nicht prüfen.

---

### C-15 — 31 von 62 shadcn-Komponenten ungenutzt; 7 Runtime-Dependencies nur für tote Komponenten · **P2**

- **Ort:** `src/components/ui/` — ungenutzt (kein Import außerhalb von `src/components/ui/`):
  `accordion, aspect-ratio, attachment, breadcrumb, bubble, button-group, calendar, carousel,
  collapsible, combobox, context-menu, direction, drawer, hover-card, input-group, input-otp, item,
  kbd, marker, menubar, message, message-scroller, native-select, navigation-menu, pagination,
  progress, radio-group, resizable, scroll-area, spinner, toggle-group`
- **Befund:** Daraus folgen ungenutzte `dependencies` in `package.json`:

  | Paket | einziger Nutzer | Nutzer selbst verwendet? |
  |---|---|---|
  | `embla-carousel-react` | `ui/carousel.tsx:5` | nein |
  | `react-day-picker` | `ui/calendar.tsx:14` | nein |
  | `input-otp` | `ui/input-otp.tsx:5` | nein |
  | `react-resizable-panels` | `ui/resizable.tsx:3` | nein |
  | `vaul` | `ui/drawer.tsx` | nein |
  | `@base-ui/react` | `ui/combobox.tsx:3` | nein |
  | `@shadcn/react` | `ui/message-scroller.tsx:8` | nein |

  **Korrektur zur Auftragsvermutung:** `shadcn` ist *keine* tote Runtime-Dependency — es wird
  tatsächlich zur Buildzeit gebraucht: `src/app/globals.css:3` enthält `@import "shadcn/tailwind.css";`.
  `@shadcn/react` (v0.2.0) dagegen ist tot.
- **Auswirkung:** Für das ausgelieferte Bundle gering (ungenutzte Module werden nicht gebündelt), für
  Install-Zeit, Lockfile, CI und Supply-Chain-Fläche aber real — insbesondere `@shadcn/react@^0.2.0`,
  ein Paket auf 0.2-Niveau.
- **Fix:** Ungenutzte `ui/`-Dateien löschen, danach die sieben Pakete aus `package.json` entfernen.
  `carousel`, `calendar` und `resizable` gezielt neu per shadcn-CLI hinzufügen, wenn sie gebraucht werden.

---

### C-16 — `PostCard`: Server-State per `useEffect` in lokalen State gespiegelt · **P2**

- **Ort:** `src/features/posts/components/postCard.tsx:44-51`
  ```tsx
  // Optimistic like state, re-synced when the feed refetches.
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  useEffect(() => {
    setLiked(post.likedByMe);
    setLikeCount(post.likeCount);
  }, [post.likedByMe, post.likeCount]);
  ```
- **Befund:** Abgeleiteter State über `useEffect` — das klassische Anti-Pattern. Konkrete Race:
  `refetchOnWindowFocus` (C-08) ist an; kommt ein Feed-Refetch herein, während `likeMutation` noch
  läuft, überschreibt der Effekt die optimistische Änderung mit dem alten Serverwert, und
  `onSuccess` (`postCard.tsx:63-65`) setzt sie danach wieder zurück — sichtbares Flackern.
  Zusätzlich liest `onMutate` (`postCard.tsx:59-61`) `liked` aus der Closure, während es gleichzeitig
  per Updater-Funktion verändert wird — bei zwei schnellen Klicks driftet der Zähler.
- **Auswirkung:** Flackernde Like-Zähler, in Randfällen falsche Werte bis zum nächsten Refetch.
- **Fix:** Kein Spiegel-State. Entweder `useOptimistic` (React 19, im Repo bisher nirgends genutzt)
  oder TanStack-Query-idiomatisch: `onMutate` schreibt direkt per `queryClient.setQueryData` in den
  `["posts", scope]`-Cache und gibt den Snapshot für `onError` zurück. Dann ist `post` die einzige
  Wahrheit und der Effekt entfällt.

---

### C-17 — Filter- und Tab-Zustand nur im lokalen State, nicht in der URL · **P2**

- **Ort:**
  - `src/features/rides/components/rideFilters.tsx:35-41` — sieben `useState` (Suche, Pace,
    Difficulty, includePast, nearPlace, radiusKm) + Debounce in `useEffect:43-46`
  - `src/features/events/components/eventsExplorer.tsx:40-46` — acht `useState` (Gruppe, Region,
    von/bis, Suche, Auswahl)
  - `src/features/posts/components/postFeed.tsx:34-35` — Tab + Discover-Flag
  - `src/features/community/components/userContent.tsx:18` — Posts-/Rides-Tab
- **Befund:** Kein `useSearchParams`/`router.replace` irgendwo für Filterzustand. Der einzige
  Query-Parameter-Konsum in der App ist `dashboard/community-rides/new/page.tsx:11-25`
  (`routeId`, `genJob`, `genIndex`, `genName`) — dort wird es also durchaus richtig gemacht.
- **Auswirkung:** Gefilterte Ansichten sind nicht teilbar, nicht bookmarkbar; Zurück-Button verwirft
  den Filter; ein Reload setzt alles zurück. Bei der Events-Seite besonders schmerzhaft, weil dort
  Datum + Region + Typ kombiniert werden.
- **Fix:** Filterzustand in `searchParams` spiegeln (`router.replace(?...`, `scroll: false`) und beim
  Mount daraus initialisieren. *Vorher:* die `searchParams`-Doku für Next 16 lesen — die Await-Semantik
  in Server Components und das Verhalten von `useSearchParams` in Client Components konnte ich hier
  nicht gegenprüfen.

---

### C-18 — Keine React-19-Formular-Primitiven; alle 13 Formulare sind reine Client-Mutations · **P2**

- **Ort:** 13 × `useForm` + `zodResolver` (26 Treffer), 0 × `useActionState`, `useFormStatus`,
  `useOptimistic`, `useTransition`, 0 × `<form action={serverAction}>`.
  Beispiel `registerForm.tsx:56-75`: `useMutation` → `registerUser(data)` → `throw new Error(result.error)`
  → `toast.error` in `onError`.
- **Befund:** react-hook-form ist konsistent und korrekt eingesetzt (Resolver, `defaultValues`,
  `watch`, `Controller` in `createPostForm.tsx:13`) — das ist in Ordnung. Was fehlt, ist die Verbindung
  zum Server: keine progressive Enhancement, kein `pending`-State aus dem Framework, keine
  Feldfehler vom Server (alle Server-Fehler werden zu einem Toast, nicht zu `setError("email", …)`).
  Der Nutzer-Kommentar in `concerns.txt` zielt auf dasselbe Thema aus anderer Richtung.
- **Auswirkung:** Formulare funktionieren ohne JavaScript nicht; serverseitige Validierungsfehler
  (z. B. „Username vergeben" aus `checkAvailability.ts`) erscheinen als Toast statt am Feld.
- **Fix:** Entweder bewusst bei RHF + `useMutation` bleiben — dann aber Server-Fehler auf Felder
  mappen (`setError`) — oder für die einfachen Formulare (Login, Forgot-Password, Change-Password)
  auf `useActionState` + `<form action={…}>` umstellen.
  *Vorher:* Doku zu Server Actions/Forms in Next 16 lesen; ich habe die Signaturen bewusst nicht aus
  dem Gedächtnis angegeben.

---

### C-19 — Feature-Ordner: sechs Abweichungen von der eigenen Konvention · **P2**

- **Ort / Befund:** Die Konvention (`src/features/<domain>/{actions,components,schemas,types}`, ein
  Action pro Datei, camelCase) wird an folgenden Stellen gebrochen:

  | Abweichung | Ort |
  |---|---|
  | Sammeldatei + kebab-case | `chat/actions/chat-action.ts` (2 Actions), `chat/actions/direct-chat-action.ts` (4 Actions + 2 Typen), `notification/actions/notification-actions.ts` (4 Actions + 3 Typen) |
  | Typen in der Action-Datei statt in `types.ts` | `chat/` hat gar keine `types.ts`; `DirectConversation`, `DirectMessagesResult` leben in `direct-chat-action.ts:52,151`; `NotificationItem`, `NotificationCursor`, `NotificationHistoryPage` in `notification-actions.ts:7,63,65`; `FeedScope/FeedCursor/FeedPage` in `posts/actions/getFeed.ts:8-17`; `Rider` in `community/actions/getRider.ts:6` |
  | `.tsx` für eine reine Typdatei | `users/types.tsx` (alle anderen: `types.ts`) |
  | kebab-case-Einzeldateien | `auth/hooks/use-session.ts`, `community/utils/format-relative-date.ts`, `users/utils/relative-time.ts`, `providers/query-provider.tsx` |
  | Zwei Utils für dasselbe | `community/utils/format-relative-date.ts` und `users/utils/relative-time.ts`; zusätzlich eine dritte Inline-Variante in `notificationSheet.tsx:36` (`formatRelativeTime`) |
  | Kein Domain-Feature | `features/providers/` (nur `query-provider.tsx`), `features/logger/` (nur `index.ts`, `logger.ts`) — beides gehört nach `src/lib/` bzw. `src/components/providers/` |
- **Auswirkung:** Rein Wartbarkeit — aber genau die Konsistenz, die der Rest der Codebase mit
  Disziplin durchhält (107 Action-Dateien nach Schema), wird an drei prominenten Stellen gebrochen.
- **Fix:** `chat-action.ts` → `getGroupMessages.ts` + `sendGroupMessage.ts`;
  `direct-chat-action.ts` → 4 Dateien + `chat/types.ts`; `notification-actions.ts` → 4 Dateien;
  `users/types.tsx` → `.ts`; die drei Relativzeit-Helfer zu einem in `src/lib/` konsolidieren;
  `providers/` und `logger/` aus `features/` herausziehen.

---

### C-20 — Barrel `features/auth/index.ts` mischt Client-Komponenten mit Server-Guards · **P2**

- **Ort:** `src/features/auth/index.ts`
  ```ts
  export { ForgotPasswordForm } from "./components/forgotPasswordForm";  // "use client"
  export { LoginForm } from "./components/loginForm";                    // "use client"
  export { RegisterForm } …  export { ResetPasswordForm } …               // "use client"
  export { getCurrentUser, getSession, requireAdmin, requireAuth, … } from "./guards";  // "use server" + next/headers
  export { sessionQueryKey, useSession } from "./hooks/use-session";      // "use client"
  ```
- **Befund:** Dieses Barrel wird von beiden Seiten importiert:
  - Server Components: `app/login/page.tsx:1`, `register/page.tsx:1`, `reset-password/page.tsx:2`,
    `forgot-password/page.tsx:1` (holen die Formulare)
  - Server Actions: `community/actions/followRider.ts:3`, `unfollowRider.ts:3`, `getRider.ts:3`
    (holen `getCurrentUser`) — und ziehen damit den kompletten Modulgraphen von vier
    `"use client"`-Formularen inkl. react-hook-form, zod-Resolver und `ParticleBackground` in die
    Auflösung einer reinen Server-Action-Datei.
  Alle anderen ~40 Aufrufer importieren korrekt direkt: `from "@/features/auth/guards"`.
- **Auswirkung:** Unnötige Modulgraph-Kopplung, längere Build-/Bundling-Zeiten, und ein Barrel, das
  drei unterschiedliche Ausführungsumgebungen (server-only, client, geteilt) in eine Datei mischt.
  Ob es zu tatsächlichem Bundle-Bloat führt, hängt vom Tree-Shaking ab — *zu verifizieren mit einer
  Bundle-Analyse.*
- **Fix:** Barrel auflösen oder mindestens dreiteilen (`auth/guards`, `auth/client`, `auth/schemas`).
  Dieselbe Frage stellt sich für `features/analytics/index.ts:1-3`, das `getAnalytics` (Action) und
  `AnalyticsDashboard` (Client) exportiert; `features/notification/index.ts` ist sauber (nur Server).

---

### C-21 — `ParticleBackground`: dauerhafte rAF-Schleife auf der Landing Page, ohne DPR und ohne `prefers-reduced-motion` · **P2**

- **Ort:** `src/components/particleBackground.tsx` (498 Zeilen), gerendert von
  `src/app/page.tsx:17` und zusätzlich von `registerForm.tsx:66` im Verifikations-Screen.
- **Befund:**
  - `animate()` läuft unbedingt (`particleBackground.tsx:474,477`), pro Frame: Physik über 26 Stops,
    Hover-Suche über 26 Stops, danach zwei weitere volle Durchläufe zum Zeichnen
    (`:285-460`) plus `Math.floor(length / 60)` Pfeile pro Segment. Das sind pro Frame mehrere hundert
    Canvas-Operationen inklusive `ctx.save()/restore()`, `createRadialGradient` und `measureText`.
  - `handleResize` (`:137-141`) setzt `canvas.width = window.innerWidth` ohne
    `devicePixelRatio` → auf Retina-Displays sichtbar unscharf.
  - Keine Abfrage von `prefers-reduced-motion`.
  - `mousemove`/`touchmove` sind auf `window` registriert (`:209-210`) und laufen auch, wenn der
    Cursor gar nicht über dem Canvas ist.
- **Auswirkung:** Die Landing Page — die erste Seite, die ein neuer Nutzer sieht — hält dauerhaft
  einen Kern beschäftigt. Auf Mobilgeräten kostet das Akku und drückt den Interaction-Score.
  Barrierefreiheit: Nutzer mit `prefers-reduced-motion` bekommen die volle Animation.
- **Fix:** `matchMedia("(prefers-reduced-motion: reduce)")` abfragen und dann statisch rendern;
  `devicePixelRatio` in `handleResize` einrechnen (`ctx.scale(dpr, dpr)`); die Positions-/Hover-Schleifen
  in einen Durchlauf zusammenlegen (aktuell wird `floatX/floatY` dreimal pro Frame und Stop berechnet:
  `:263-266`, `:293-296`, `:386-389`); Pointer-Listener auf das Canvas statt auf `window`.

---

### C-22 — Bilder: durchgängig `<img>` ohne Dimensionen, kein `next/image`, keine `images`-Konfiguration · **P2**

- **Ort:** `next/image` wird an genau **einer** Stelle verwendet: `src/components/logo.tsx:1`.
  Rohe `<img>`-Tags: `ridePhotos.tsx:143,223`, `postCard.tsx:242`, `imageLightbox.tsx:57`,
  `createPostForm.tsx:232`, `newsGrid.tsx:108,153`, `liveStagePanel.tsx:202`,
  `pro/page.tsx:83`, `pro/[race]/[year]/page.tsx:133,153,177,272,286`.
  `next.config.ts` enthält keinen `images`-Block (nur `serverExternalPackages`).
- **Befund:** Die Begründungen im Code sind teilweise berechtigt
  (`ridePhotos.tsx:142`: *„R2 URLs, not optimized"*; `createGroupDialog.tsx:161`: Blob-URL-Preview —
  das ist korrekt). Aber: keines der `<img>` setzt `width`/`height` oder ein `aspect-ratio`, und nur
  zwei setzen `loading="lazy"` (`ridePhotos.tsx:145`, ansonsten Fehlanzeige in `newsGrid` und den
  Pro-Seiten). Die Pro-Seiten zeigen Fahrerfotos und Teamlogos von externen ASO-Hosts, potenziell
  Dutzende pro Startliste, alle eager.
  Positiv: Uploads werden clientseitig auf WebP verkleinert (`src/lib/imageProcessing.ts`) — für
  Workers die richtige Entscheidung.
- **Auswirkung:** Layout-Shift (CLS) auf Feed, Ride-Fotos, News-Grid und Startlisten; auf der
  Startlisten-Seite außerdem viele parallele eager Requests an Drittanbieter. Im Lightbox-Fall
  (`ridePhotos.tsx:223`) wird dieselbe Datei wie im 1:1-Thumbnail geladen — eine Größe für beide Fälle.
- **Fix:** Kurzfristig `width`/`height` (oder Container mit `aspect-ratio`) und `loading="lazy"` +
  `decoding="async"` überall ergänzen. Mittelfristig `images.remotePatterns` für die R2-Domain und die
  ASO-Hosts in `next.config.ts` eintragen und `next/image` verwenden.
  *Vorher:* prüfen, welcher Image-Loader unter `@opennextjs/cloudflare` unterstützt wird — das ist
  deployment-spezifisch und ohne `node_modules` nicht verifizierbar.

---

### C-23 — Theme: `next-themes` ohne Provider, `.dark`-Block tot, 80 `dark:`-Utilities wirkungslos · **P3**

- **Ort:**
  - `src/components/ui/sonner.tsx:10,14` — `import { useTheme } from "next-themes";` / `const { theme = "system" } = useTheme();`
  - `grep -rn "ThemeProvider" src` → **0 Treffer**; `src/app/layout.tsx:48-54` rendert nur
    `QueryProvider` und `Toaster`, `<html>` hat kein `suppressHydrationWarning`.
  - `src/app/globals.css:5` — `@custom-variant dark (&:is(.dark *));`
  - `src/app/globals.css:51-84` — `:root` enthält bereits die dunkle Palette (`--background: oklch(0.08 …)`)
  - `src/app/globals.css:86-118` — `.dark { … }` mit **identischen** Werten
- **Befund:** Die App ist dauerhaft dunkel, weil `:root` bereits dunkel ist. Der `.dark`-Block ist eine
  Kopie und wird nie aktiviert, weil kein Provider die Klasse setzt. `useTheme()` in `sonner.tsx` fällt
  immer auf `"system"` zurück. Die 80 `dark:`-Utilities in den `.tsx`-Dateien greifen nie.
- **Auswirkung:** Toter Code und irreführende Signale — jeder, der einen Light-Mode ergänzen will,
  glaubt zunächst, die halbe Arbeit sei schon getan.
- **Fix:** Entscheiden: (a) Dark-only → `next-themes` entfernen, `sonner.tsx` auf `theme="dark"`
  festnageln, `.dark`-Block und `@custom-variant` löschen, `dark:`-Utilities aufräumen; oder
  (b) Theming wirklich einführen → `ThemeProvider` in `layout.tsx`, `suppressHydrationWarning` auf
  `<html>`, `:root` auf die helle Palette umstellen und `.dark` mit den jetzigen Werten füllen.

---

### C-24 — Keine Route-Gruppen; Auth-Seiten duplizieren ihr eigenes Layout · **P3**

- **Ort:** `src/app/` enthält `login/`, `register/`, `forgot-password/`, `reset-password/`,
  `terms/`, `privacy/`, `imprint/`, `rides/`, `dashboard/` — keine einzige Route-Gruppe `(…)`.
- **Befund:** Jede Auth-Seite ist ein einzeiliger Wrapper um ihr Formular (`login/page.tsx` = 5 Zeilen),
  und jedes Formular bringt seinen eigenen Vollbild-Hintergrund mit — `registerForm.tsx:62-66`
  rendert Gradient-Divs plus `<ParticleBackground />` selbst. Dasselbe Muster wiederholt sich in
  `loginForm`, `forgotPasswordForm`, `resetPasswordForm`. Die Legal-Seiten (`terms`, `privacy`,
  `imprint`) tragen jeweils ihr eigenes `export const metadata` und ihr eigenes Chrome.
  `/rides/[rideId]` baut Header und Footer nochmals von Hand (`rides/[rideId]/page.tsx:40-52`).
- **Auswirkung:** Vierfach dupliziertes Hintergrund-Markup; vierfach eine eigene
  `ParticleBackground`-Instanz im Bundle-Graph; keine gemeinsame Stelle für Auth-Metadaten.
- **Fix:** `src/app/(auth)/{login,register,forgot-password,reset-password}/` mit einem gemeinsamen
  `(auth)/layout.tsx` (Gradient + Partikel + zentrierte Card), `src/app/(legal)/` für die drei
  Rechtstexte, `src/app/(public)/` für die Landing- und die öffentliche Ride-Seite.
  *Vorher:* die Routing-Doku für Next 16 zu Route-Gruppen und Layout-Verschachtelung lesen.

---

### C-25 — Doppelter `Rider`-Typ im selben Feature; Cross-Feature-Kopplung `users` → `community` · **P3**

- **Ort:**
  - `src/features/community/types.ts:1-7` — `Rider` **mit** `id`, ohne Profilfelder
  - `src/features/community/actions/getRider.ts:6-24` — `Rider` **ohne** `id`, mit `bio`, `bikeBrand`,
    `skillLevel`, `followersCount`, `isFollowing`, `isSelf`, …
  - Konsumenten mischen beide: `ridersGrid.tsx:18` → `../types`;
    `userMainComponent.tsx:10` → `../actions/getRider`;
    `app/dashboard/profile/page.tsx:2`, `users/components/riderProfileInfo.tsx:4`,
    `users/components/riderDetailsEditor.tsx:20` → alle `@/features/community/actions/getRider`
- **Befund:** Zwei strukturell unvereinbare Typen mit demselben Namen im selben Feature. Zusätzlich
  importieren drei Dateien aus `features/users/` einen Typ aus `features/community/actions/` —
  ein Feature greift in die Action-Schicht eines anderen. `app/dashboard/profile/page.tsx:36-54`
  konstruiert deshalb von Hand ein `Rider`-Objekt mit `isFollowing: false, isSelf: true`, um den
  fremden Typ zu befriedigen.
- **Auswirkung:** Verwechslungsgefahr, keine Typsicherheit an der Featuregrenze, `id` fehlt genau dort,
  wo man es erwarten würde.
- **Fix:** `RiderSummary` (Liste) und `RiderProfile` (Detail) in `community/types.ts`, beide mit `id`;
  `getRider.ts` importiert den Typ, statt ihn zu definieren. Die drei `users/`-Komponenten, die
  Rider-Profile rendern, gehören nach `features/community/components/` — oder umgekehrt der Typ nach
  `features/users/`.

---

### C-26 — Künstliche 400-ms-Verzögerung im „Load more" von Riders und Groups · **P3**

- **Ort:** `src/features/community/components/ridersGrid.tsx:57-64`
  ```ts
  const loadMore = () => {
    setLoadingMore(true);
    // Small delay so the loading animation is visible before revealing.
    setTimeout(() => { setVisible((v) => v + PAGE_SIZE); setLoadingMore(false); }, 400);
  };
  ```
  Identisch in `src/features/community/components/groupsGrid.tsx`.
- **Befund:** Die Daten liegen bereits vollständig im Speicher (C-01) — es wird künstlich gewartet,
  damit ein Spinner sichtbar wird.
- **Auswirkung:** 400 ms geschenkte Latenz pro Klick, bei `PAGE_SIZE = 5` also 400 ms je 5 Karten.
- **Fix:** Ersatzlos entfernen — und mit C-01 ohnehin durch echtes serverseitiges Nachladen ersetzen,
  bei dem der Spinner echte Wartezeit anzeigt.

---

### Weitere Beobachtungen (unterhalb der Finding-Schwelle)

- `src/components/loadingComponent.tsx:1` trägt `"use client"`, enthält aber nur statisches Markup —
  unnötige Client-Grenze.
- `src/app/error.tsx` ist eine 5-Zeilen-Weiterleitung an `ErrorComponent`; die `"use client"`-Grenze
  könnte direkt in `errorComponent.tsx` bleiben (tut sie auch — die Datei hat sie doppelt).
- `src/app/layout.tsx:7-11` lädt Raleway in **sechs** Schnitten (300–800). Jeder Schnitt ist eine
  eigene Datei; realistisch braucht die App 3–4. Zusätzlich ist `--font-mono: var(--font-raleway)`
  (`globals.css:11`) gesetzt — Inline-Code im Markdown-Renderer (`posts/lib/markdown.tsx`) wird damit
  in einer proportionalen Schrift dargestellt.
- `eventsExplorer.tsx:79-83` invalidiert `["radnet-events"]` in einem `useEffect` bei jeder Änderung
  von `sync` — eine Effekt-Kette, die sich als `onSuccess` der Sync-Query ausdrücken ließe.
- `rideMap.tsx` hat 11 `useEffect` auf 900 Zeilen; `routeGeneratorMap.tsx` 18 `useState` auf 830 Zeilen.
  Beides Kandidaten für `useReducer` bzw. eine Aufteilung — aber es sind echte Imperative-API-Wrapper
  (MapLibre), wo Effekte legitim sind. Keine Empfehlung ohne genauere Analyse.
- **Positiv hervorzuheben:** kein einziger anwendungseigener React-Context (nur die vier innerhalb von
  `components/ui/`), also keine „Context-Explosion"; kein nennenswertes Prop-Drilling; `import * as`
  ausschließlich für `React` und in `ui/chart.tsx`/`ui/resizable.tsx`; Icons durchgehend als
  Named Imports aus `lucide-react`; `date-fns` nur mit `format` und ohne Locale-Importe.

---

## Bundle-/Client-Grenzen

| Seite | Schwere Client-Imports | Bewertung | Vorschlag |
|---|---|---|---|
| `/` (Landing) | `ParticleBackground` (498 Z., rAF-Dauerschleife), `TypedHeadline`, `CookieConsent`; via Root-Layout: `QueryProvider` (TanStack), `Toaster` (sonner + next-themes) | Marketing-Seite lädt die komplette App-Query-Infrastruktur | `QueryProvider` in ein `(app)`-Layout verschieben statt ins Root-Layout; Partikel hinter `prefers-reduced-motion` |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | RHF + zodResolver + `ParticleBackground` je Formular, dazu QueryProvider/Toaster | Vier Kopien desselben Hintergrund-Markups | `(auth)/layout.tsx` (C-24) |
| `/dashboard` | `PostFeed`, `PostCard`, `PostComments`, `MarkdownEditor`, `ImageLightbox`, `CreatePostForm` + `imageProcessing`; Layout: Sidebar, `NotificationSheet`, `DirectChatDialog`, `FollowerListSheet`, `PresenceHeartbeat` | Layout-Chrome ist auf **jeder** Dashboard-Route im Bundle | `DirectChatDialog` erst bei Klick laden (`await import`), nicht als Kind von `DirectChatHeaderButton` |
| `/dashboard/community-rides` | `RideFilters` → `RidesGrid` → `RideCard` → `RouteThumbnail` | Liste komplett clientseitig (C-06) | Erste Seite serverseitig rendern |
| `/dashboard/community-rides/[rideId]` | `RideRoutePanel` → `RoutePreview` (maplibre lazy ✓) **+ `ElevationChart` → recharts statisch ✗**, `RidePhotos`, `SaveRouteDialog`, `EditRideDialog` | maplibre vorbildlich, recharts nicht | recharts dynamisch nachladen (C-12) |
| `/dashboard/community-rides/new` | `RidePlanner` (833 Z., 9 `useState`) + `LocationSearch` + `WaypointList` + `ElevationChart` (recharts) + `RouteThumbnail` + `mapStyle.ts` (20 kB) | Größtes Client-Bundle der App | recharts dynamisch; `mapStyle` als JSON aus `public/` |
| `/dashboard/community-rides/generate` | `RouteGeneratorMap` (830 Z., 18 `useState`), maplibre lazy ✓ | Ganze Seite ist eine Client-Komponente ohne Loading-Boundary | `loading.tsx` ergänzen |
| `/dashboard/events` | `EventsExplorer` + `EventsList` + `EventsMap` (maplibre lazy ✓, CSS statisch) — dazu der **komplette** Kalender im Speicher | Datenmenge, nicht Codemenge, ist das Problem | Serverseitig filtern (C-01) |
| `/dashboard/community/g/[id]` | `GroupChat` (2 s Poll), `GroupRides`, `GroupRoutes`, `GroupAnnouncements`, `GroupJoinRequests`, `MemberRoleButton`, `KickMemberButton`, `EditGroupDialog` + `imageProcessing` | Server-Teil rendert Mitglieder korrekt; vier Client-Queries starten nach Hydration parallel | Chat auf SSE (C-02); Rides/Routes serverseitig vorladen |
| `/dashboard/admin/analytics` | `AnalyticsDashboard` → `ActivityCharts` → **recharts** über `ui/chart.tsx` (`import * as RechartsPrimitive`) | Legitim — Admin-only Route, Charts sind der Zweck | recharts hier belassen; nur sicherstellen, dass der Chunk nicht mit `elevationChart` geteilt wird |
| `/dashboard/pro/**` | `RaceMap`, `StageRoutePanel` (→ recharts), `LiveStagePanel`, `ReplayPanel` (maplibre lazy ✓) | Server-Rendering korrekt, aber blockierend | `loading.tsx` (C-05) |
| `/rides/[rideId]` (öffentlich) | nur `RouteThumbnail` | Sauber: fast reines Server-Rendering | Metadata ergänzen (C-09) |
| **Nie geladen** | `embla-carousel-react`, `react-day-picker`, `input-otp`, `react-resizable-panels`, `vaul`, `@base-ui/react`, `@shadcn/react` | 31 tote `ui/`-Komponenten | Löschen (C-15) |

---

## Revalidation-Matrix

Legende: **RP** = `revalidatePath` in der Action · **IQ** = `invalidateQueries` im Client ·
**RR** = `router.refresh()` · ✗ = fehlt · ⚠︎ = vorhanden, aber wirkungslos

| Mutation | Betroffene Views | RP | IQ | RR | Bewertung / Vorschlag |
|---|---|---|---|---|---|
| `createGroup` | `/dashboard/community` (GroupsGrid) | ⚠︎ `/groups` | `["groups"]` | ✗ | **Pfad existiert nicht** → auf `/dashboard/community`; IQ trägt die Funktion |
| `updateGroup` | Gruppenseite (server), GroupsGrid | ⚠︎ `/groups/:id` | `["groups"]` | ✓ | → `/dashboard/community/g/:id` |
| `deleteGroup` | `/dashboard/community` | ⚠︎ `/groups` | `["groups"]` | ✗ | → `/dashboard/community` |
| `joinGroup` | Gruppenseite (Mitgliederliste, server) | ⚠︎ `/groups/:id` ×2 | `["groups"]` | ✓ | → `/dashboard/community/g/:id`; zusätzlich `["group-rides"]`, `["group-routes"]` |
| `leaveGroup` | dito | ⚠︎ `/groups/:id` | ✗ | ✗ | → korrigierter Pfad; `["groups"]` invalidieren |
| `kickGroupMember` | dito | ⚠︎ `/groups/:id` | `["groups"]` | ✗ | → korrigierter Pfad |
| `respondToGroupJoinRequest` | dito, `pendingMembers` (server) | ⚠︎ `/groups/:id` | `["groups"]` | ✓ | → korrigierter Pfad |
| `cancelGroupJoinRequest` | dito | ⚠︎ `/groups/:id` | ✗ | ✗ | → korrigierter Pfad |
| `updateGroupMemberRole` | dito | ✓ | `["groups"]` | ✓ | **korrekt** |
| `uploadGroupImage` | Gruppenseite + GroupsGrid | ✓ ×2 | — | — | **korrekt** — Referenzimplementierung |
| `createAnnouncement` / `deleteAnnouncement` | GroupAnnouncements (client) | ✓ | `["group-announcements", id]` | — | korrekt (RP hier überflüssig, s. C-13) |
| `followRider` / `unfollowRider` | Feed `/dashboard`, Follower-Sheet, ProfileFollowStats, `/dashboard/profile` (server!) | ✗ | nur `["rider-profile", id]` | ✓ | **C-10**: `["posts"]`, `["follow-connections"]`, `["riders"]` fehlen; `revalidatePath("/dashboard/profile")` fehlt |
| `createPost` / `deletePost` / `uploadPostImage` | PostFeed, UserContent | ✓ `/dashboard` (⚠︎ client-geladen) | `["posts"]` | ✗ | funktioniert via IQ; `["user-posts", id]` fehlt |
| `togglePostLike` | PostCard | ✗ | lokaler State | ✗ | s. C-16 — Cache-Update statt Spiegel-State |
| `addPostComment` / `deletePostComment` | PostComments, Kommentarzähler | ✗ | `["post-comments", id]` + `["posts"]` | ✗ | ok, aber `["user-posts"]` fehlt |
| `createRide` | RidesGrid, GroupRides, Feed | ✓ `/dashboard/community-rides` | **✗** | ✗ | **C-10**: `["rides"]`, `["group-rides", groupId]`, `["posts"]` fehlen |
| `updateRide` | Ride-Detail (server), RidesGrid | ✓ ×2 | `["rides"]` | ✓ | **korrekt** |
| `cancelRide` / `deleteRide` | dito | ✓ | `["rides"]` | ✓ | korrekt (`deleteRide` ohne Detail-Pfad, aber die Seite verschwindet ohnehin) |
| `requestJoinRide` / `withdrawJoinRequest` / `leaveRide` / `respondToJoinRequest` | Ride-Detail (server), RidesGrid | ✓ | `["rides"]` | ✓ | **korrekt** |
| `markAttendance` | RideParticipants (server-Props) | ✓ | `["rides"]` | ✓ | korrekt |
| `uploadRidePhoto` / `deleteRidePhoto` | RidePhotos (server-Props) | ✓ | — | ✓ | korrekt |
| `setRidePublic` | Ride-Detail + öffentliche Seite | ✓ ×2 (inkl. `/rides/:id`) | `["rides"]` | ✓ | **korrekt** — bestes Beispiel im Repo |
| `saveRoute` / `deleteRoute` | GroupRoutes (client), Gruppenseite | **✗** | `["group-routes"]` | ✓ | **C-10**: `revalidatePath("/dashboard/community/g/:id")` fehlt |
| `updateProfile` | `/dashboard/profile` (server), Rider-Profil (client) | ✓ ×2 (⚠︎ `u/:id` client-geladen) | `["rider-profile", userId]` | ✓ | ok; `["riders"]` fehlt |
| `uploadAvatar` | `/dashboard/profile`, Avatare in Feed/Chat/Sidebar | ✓ `/dashboard/profile` | ⚠︎ `sessionQueryKey` (No-Op, C-11) | — | `["riders"]`, `["posts"]`, `["follow-connections"]` fehlen (alte Avatar-URL bleibt) |
| `banUser` / `unbanUser` / `updateUserRole` / `revokeUserSessions` | UsersTable (client) | ✓ (⚠︎ client-geladen) | `["admin-users"]` | ✗ | funktioniert via IQ; RP ist Dekoration (C-13) |
| `markNotificationsSeen` | Badge + Sheet | ✗ | `["notifications-unread"]`, `["notifications"]` | ✗ | ok; `["notification-history"]` fehlt (Verlaufsseite) |
| `sendGroupMessage` / `sendDirectMessage` | Chat | ✗ | jeweiliger Chat-Key + `["direct-unread"]`, `["direct-conversations"]` | ✗ | ok — das Polling verdeckt hier ohnehin alles |
| `updatePresence` | Online-Punkte in FollowerListSheet | ✗ | ✗ | ✗ | bewusst — 30-s-Poll deckt es ab |
| `syncCalendarEvents` | EventsExplorer/Map | ✗ | `["radnet-events"]` via `useEffect` | ✗ | ok, gehört in `onSuccess` statt in einen Effekt |

**Muster:** Von 33 `revalidatePath`-Aufrufen sind 8 auf nicht existente Pfade gerichtet (C-03) und
~12 zielen auf Routen, deren Inhalt clientseitig geladen wird (C-13). Wirklich tragend sind sie nur im
`rides`-Feature — das ist gleichzeitig das einzige Feature mit echtem Server-Rendering der Detailseite.
Das ist kein Zufall, sondern die Bestätigung von C-06.

---

## Geprüft & in Ordnung

- **maplibre-gl-Lazy-Loading:** durchgehend `const maplibregl = (await import("maplibre-gl")).default;`
  bei allen drei Karten (`rideMap.tsx:186,577,739,881`, `eventsMap.tsx:136,266`, `raceMap.tsx:89,218`),
  Typen konsequent per `import type`. Das ist genau richtig gemacht.
- **SSE statt Polling für Live-Etappen:** `src/app/api/pro/live/[race]/[year]/[stage]/route.ts` mit
  Heartbeat (20 s), Refresh-Lane (30 s), Reconnect-Backoff und abort-fähigem `sleep`. Der Kommentar
  benennt sogar, dass es das frühere 8-s-Action-Polling ersetzt. Sauber.
- **`params` als Promise:** alle fünf dynamischen Routen deklarieren `params: Promise<{…}>` und awaiten
  es (`community-rides/[rideId]:31,34`, `community/g/[id]:36,38`, `rides/[rideId]:33,35`,
  `pro/[race]/[year]:20,22`, `pro/.../stage/[stage]:29,31`). Ebenso `searchParams` in
  `community-rides/new/page.tsx:14,25`. Konsistent — die konkrete Semantik habe ich mangels Doku
  nicht bewertet, aber die Verwendung ist einheitlich.
- **Parallelisierung serverseitiger Fetches:** `pro/[race]/[year]/page.tsx:457-462` (`Promise.all` über
  vier Quellen), `getRaceDetail.ts:234-239` (`Promise.all` mit korrekt verketteter Abhängigkeit),
  `getRaceDetail.ts:75` und `feeds.ts:88` (`Promise.allSettled` für fail-soft). Gut durchdacht.
- **`notFound()` wird tatsächlich verwendet** (6 Stellen) — inklusive Parameter-Validierung *vor* dem
  Datenzugriff (`pro/.../stage/[stage]/page.tsx:34-42`). Nur das `not-found.tsx` fehlt (C-05).
- **Autorisierung in Server Components:** Die Gruppenseite lädt `pendingMembers` nur, wenn
  `canManage` — mit explizitem Kommentar, dass die Daten sonst den Server nie verlassen
  (`community/g/[id]/page.tsx:95-118`). Vorbildlich.
- **`server-only`:** `src/features/pro/lib/clients.ts:1` — genau das Muster, das für `guards.ts`
  fehlt (C-07).
- **Kein Context-Wildwuchs, kein Prop-Drilling:** vier `createContext` insgesamt, alle innerhalb von
  `components/ui/` (sidebar, carousel, toggle-group, chart). Keine App-weiten Provider außer
  `QueryProvider`.
- **XSS-sichere Fremddaten:** `posts/lib/markdown.tsx` ohne `dangerouslySetInnerHTML`, mit
  `SAFE_LINK`-Schema-Whitelist; `eventsMap.tsx:52-107` baut Popups per DOM-API statt `innerHTML`,
  mit Begründung im Kommentar.
- **Bild-Uploads:** clientseitige WebP-Konvertierung + Verkleinerung (`src/lib/imageProcessing.ts`)
  mit serverseitigem Gate (`src/lib/image.ts`) — für die Workers-Umgebung die richtige Wahl.
- **`PresenceHeartbeat`:** pausiert korrekt bei `visibilitychange`, feuert beim Sichtbarwerden sofort
  und räumt beide Listener auf (`presenceHeartbeat.tsx:33-49`). Das Intervall (30 s) ist vertretbar;
  problematisch ist nur die Summe mit den drei anderen Timern (C-02).
- **Zod-Schemas:** pro Feature ein `schemas/`-Ordner, `zodResolver` durchgehend, `Input`-Typen aus den
  Schemas abgeleitet.
- **`serverExternalPackages`** in `next.config.ts` korrekt gesetzt und mit Begründung kommentiert —
  Prisma/pg bleiben aus dem Worker-Bundle.
- **Feature-Ordner-Disziplin insgesamt:** 107 Action-Dateien, davon 104 nach dem Schema
  „ein Action pro Datei, camelCase". Die drei Ausnahmen sind in C-19 benannt.

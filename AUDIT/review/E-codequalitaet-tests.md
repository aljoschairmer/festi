# E – Code-Qualität, Konventionen & Tests

> Reviewer E · Audit-Datum 2026-08-19 · Node v22.22.2 / npm 10.9.7
> Alle unten zitierten Ausgaben stammen aus tatsächlich ausgeführten Befehlen in dieser Session.

## Zusammenfassung

**Das Backend (`festi-route-engine`) ist die qualitativ mit Abstand stärkste Codebasis der drei Repos.** 21 Test-Dateien, 241 Tests, alle grün, 75,4 % Statement-Coverage über `src/`, sauberer `tsc --noEmit`. Die Domänenlogik (Scoring, TSP, Metadata, Validation, GPX, FIT, Weather, Traffic-Stress) ist substanziell abgedeckt.

**Das Frontend (`festi`) hat null Tests.** Kein `test`-Script, keine Test-Dependency, keine einzige `*.test.*`-Datei — bestätigt, nicht vermutet (Beleg unten). Gleichzeitig liegt dort die gesamte sicherheitsrelevante Logik: Auth-Guards, Ownership-Checks, Gruppen-Rollen, Waitlist-Promotion, R2-Uploads. Das ist die größte Einzellücke des Gesamtprojekts.

Lint und Typecheck sind im Frontend grün — **aber nur nach zwei ungescripteten Vorbereitungsschritten** (`prisma generate`, `next typegen`). Es gibt kein `typecheck`-Script, keine CI in keinem der drei Repos, kein Node-Version-Pinning im Frontend. Die Qualitätsgates existieren also, werden aber nirgends automatisch erzwungen.

Konventionell ist das Frontend **weit besser als die `concerns.txt` vermuten lässt**: 5 von 6 Kritikpunkten des Maintainers sind vollständig oder überwiegend umgesetzt (Commit `1e09de2` "feat: cleanup" hat `auth/actions/index.ts` entfernt und massenhaft Dateien auf camelCase umbenannt). Übrig bleiben klar abgrenzbare Reste: 9 kebab-case-Ausreißer, 3 Sammel-Action-Dateien, 3 Actions mit Inline-Objekt-Parameter, 8 Actions mit `input: unknown`.

Hauptrisiken in absteigender Priorität: (1) keine Tests im Frontend, (2) keine CI, (3) `"use server"` auf `guards.ts` macht die Auth-Guards zu öffentlich aufrufbaren Endpunkten, (4) `dependencies/procycling-live-0.2.0.tgz` als eingecheckter Binär-Blob ohne Upgrade-Pfad.

---

## Build / Lint / Typecheck / Tests — tatsächliche Ergebnisse

### Vorbedingung: `node_modules` fehlten in beiden Repos

Beide Repos wurden ohne `node_modules` ausgeliefert. `npm ci --ignore-scripts` lief in beiden erfolgreich durch.

```
$ cd /home/user/festi && npm ci --ignore-scripts
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
npm warn deprecated glob@9.3.5: Old versions of glob are not supported, and contain widely publicized
  security vulnerabilities, which have been fixed in the current version.
added 904 packages, and audited 905 packages in 45s
18 vulnerabilities (4 moderate, 14 high)
EXIT=0
```

```
$ cd /home/user/festi-backend && npm ci --ignore-scripts
EXIT=0
```

---

### `/home/user/festi` (Frontend)

#### `npx tsc --noEmit` — **Lauf 1 (roh nach `npm ci --ignore-scripts`): EXIT=2, 69 Fehler**

```
src/lib/prisma.ts(3,30): error TS2307: Cannot find module '@/generated/prisma/client' or its corresponding type declarations.
src/features/logger/logger.ts(4,29): error TS2307: Cannot find module '@/generated/prisma/client' or its corresponding type declarations.
src/features/rides/actions/getRides.ts(4,29): error TS2307: Cannot find module '@/generated/prisma/client' or its corresponding type declarations.
src/features/analytics/actions/getAnalytics.ts(144,11): error TS7006: Parameter 'row' implicitly has an 'any' type.
… (64 weitere TS7006 / TS2339 als Folgefehler des fehlenden Prisma-Clients)
src/app/api/pro/live/[race]/[year]/[stage]/route.ts(54,8): error TS2304: Cannot find name 'RouteContext'.
src/app/api/pro/reports/[reportId]/route.ts(26,8): error TS2304: Cannot find name 'RouteContext'.
```

Ursache: `--ignore-scripts` unterdrückt das `postinstall: prisma generate`. Der Prisma-Client wird nach `src/generated/prisma` generiert (`prisma/schema.prisma:8`) und ist `.gitignore`d (`/src/generated/prisma`, `.gitignore:39`).

#### `npx prisma generate` — EXIT=0

```
✔ Generated Prisma Client (7.8.0) to ./src/generated/prisma in 244ms
```

#### `npx tsc --noEmit` — **Lauf 2: EXIT=2, exakt 2 Fehler**

```
src/app/api/pro/live/[race]/[year]/[stage]/route.ts(54,8): error TS2304: Cannot find name 'RouteContext'.
src/app/api/pro/reports/[reportId]/route.ts(26,8): error TS2304: Cannot find name 'RouteContext'.
```

Diese beiden sind **kein Codefehler**. `RouteContext<'/route'>` ist der korrekte Next-16-Weg (verifiziert gegen `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:107,121`: *"`RouteContext` is a globally available helper … After type generation, the `RouteContext` helper is globally available. It doesn't need to be imported."*). Der Typ entsteht erst durch `next typegen` in `.next/types/**`, das die `tsconfig.json:26-33` bereits einbindet.

#### `npx next typegen` — EXIT=0

```
Generating route types...
✓ Types generated successfully
```

#### `npx tsc --noEmit` — **Lauf 3: EXIT=0, keine Ausgabe** ✅

#### `npm run lint` (= `biome check`) — **EXIT=0** ✅

```
> festi@0.1.0 lint
> biome check

Checked 349 files in 281ms. No fixes applied.
```

Biome 2.2.0, Konfiguration `biome.json`, `linter.rules.recommended: true` plus Next- und React-Domain. Formatter, Linter und Import-Sortierung sind alle in einem Lauf grün.

#### `npm run build` (= `next build`, Turbopack) — **EXIT=0** ✅

```
▲ Next.js 16.2.10 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 15.1s
  Running TypeScript ...
  Finished TypeScript in 15.0s ...
… 32 Routes (10 static, 22 dynamic)
```

Bemerkenswert im Build-Log — der Build läuft **trotz** dieser Fehler durch:

```
[Error [BetterAuthError]: You are using the default secret. Please set `BETTER_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.]
[better-auth] Base URL is not set. Set the baseURL option or BETTER_AUTH_URL env …
[email] RESEND_API_KEY is not set — verification and password-reset emails will NOT be sent …
```

#### `npm test` — **EXIT=1, Script existiert nicht**

```
npm error Missing script: "test"
```

Verifikation, dass es *wirklich* keine Tests gibt:

```
$ find . -path ./node_modules -prune -o \( -name '*.test.*' -o -name '*.spec.*' \
    -o -name '__tests__' -o -name 'vitest.config*' -o -name 'jest.config*' \
    -o -name 'playwright.config*' \) -print | grep -v node_modules
(keine Ausgabe)

$ grep -iE 'vitest|jest|playwright|cypress|testing-library' package.json
KEINE
```

#### `npm audit --production`

```
16 vulnerabilities (4 moderate, 12 high)
```
Betroffen u. a. `postcss` (4 × high, XSS + Path Traversal via sourceMappingURL), `sharp <0.35.0` (libvips CVE-2026-33327/33328/35590/35591), `undici 7.0.0–7.28.0` (5 × high), `valibot <=1.4.1` (moderate). Die `undici`- und `valibot`-Fixes sind non-breaking (`npm audit fix`); `postcss`/`sharp` hängen an `next@16.3.1` und damit außerhalb des gepinnten Range `next: 16.2.10` (`package.json:39`).

---

### `/home/user/festi-backend` (Route Engine)

#### `npx tsc --noEmit` — **EXIT=0** ✅

#### `npm test` (= `vitest run`) — **EXIT=0, 241/241 grün** ✅

```
 RUN  v3.2.7 /home/user/festi-backend

 ✓ test/import-pois.test.ts   (27 tests)  22ms
 ✓ test/api.test.ts           (26 tests) 325ms
 ✓ test/routeshape.test.ts    (16 tests) 156ms
 ✓ test/metadata.test.ts      (16 tests)  13ms
 ✓ test/validation.test.ts    (16 tests)   9ms
 ✓ test/weather.test.ts       (15 tests)  18ms
 ✓ test/matchScore.test.ts    (13 tests)  17ms
 ✓ test/roundtrip.test.ts     (12 tests)  72ms
 ✓ test/geo.test.ts           (12 tests)  15ms
 ✓ test/trafficStress.test.ts (12 tests)   8ms
 ✓ test/scoring.test.ts       (10 tests)  18ms
 ✓ test/effort.test.ts        (10 tests)   9ms
 ✓ test/filters.test.ts        (9 tests)  15ms
 ✓ test/ebike.test.ts          (8 tests)   7ms
 ✓ test/airQuality.test.ts     (7 tests)  11ms
 ✓ test/tsp.test.ts            (7 tests)   8ms
 ✓ test/profiles.test.ts       (6 tests)   7ms
 ✓ test/fit.test.ts            (5 tests)  40ms
 ✓ test/gpx.test.ts            (5 tests)   5ms
 ✓ test/pois.test.ts           (5 tests)   7ms
 ✓ test/pointToPoint.test.ts   (4 tests)  93ms

 Test Files  21 passed (21)
      Tests  241 passed (241)
   Duration  5.14s
```

#### Coverage (`@vitest/coverage-v8` war **nicht** installiert)

```
$ npx vitest run --coverage
 MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

Nach `npm i --no-save --no-package-lock @vitest/coverage-v8@3.2.7` (Repo blieb git-clean):

```
% Coverage report from v8
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   75.44 |     84.4 |    84.8 |   75.44 |
 src               |   79.85 |    86.53 |    83.5 |   79.85 |
  airQuality.ts    |   65.21 |       60 |      60 |   65.21 |
  config.ts        |     2.5 |      100 |       0 |     2.5 |
  diversity.ts     |     100 |    82.85 |     100 |     100 |
  effort.ts        |   97.43 |    66.66 |     100 |   97.43 |
  fit.ts           |     100 |       85 |     100 |     100 |
  geo.ts           |     100 |    95.45 |     100 |     100 |
  gpx.ts           |     100 |     92.3 |     100 |     100 |
  graphhopper.ts   |    2.09 |        0 |       0 |    2.09 |
  jobs.ts          |   21.42 |        0 |       0 |   21.42 |
  labels.ts        |   90.99 |    89.36 |     100 |   90.99 |
  matchScore.ts    |   92.85 |    76.47 |     100 |   92.85 |
  metadata.ts      |   94.11 |    90.36 |     100 |   94.11 |
  pois.ts          |   94.65 |       92 |   88.88 |   94.65 |
  profiles.ts      |   85.55 |    64.51 |     100 |   85.55 |
  scoring.ts       |   89.02 |     87.5 |     100 |   89.02 |
  terrain.ts       |   89.84 |    97.72 |    87.5 |   89.84 |
  trafficStress.ts |     100 |    91.42 |     100 |     100 |
  tsp.ts           |    97.7 |    94.87 |     100 |    97.7 |
  validation.ts    |   93.13 |    93.16 |     100 |   93.13 |
  weather.ts       |   75.86 |     75.8 |   72.72 |   75.86 |
 src/api           |   79.96 |    78.67 |   95.23 |   79.96 |
  server.ts        |   79.96 |    78.67 |   95.23 |   79.96 |
 src/generation    |   80.25 |    77.66 |   83.33 |   80.25 |
  assemble.ts      |     100 |    33.33 |     100 |     100 |
  index.ts         |   50.81 |    66.66 |      50 |   50.81 |
  pointToPoint.ts  |   76.33 |    55.17 |     100 |   76.33 |
  roundtrip.ts     |   90.39 |    93.22 |     100 |   90.39 |
 src/worker        |       0 |        0 |       0 |       0 |
  index.ts         |       0 |        0 |       0 |       0 |
-------------------|---------|----------|---------|---------|
```

#### Testdateien selbst sind **nicht** typgeprüft

`tsconfig.json:22` hat `"exclude": ["node_modules", "dist", "test"]` und `"include": ["src/**/*.ts"]`. Weder `npm run build` noch `npm run typecheck` sehen also `test/`. Ein Typecheck mit denselben Compileroptionen über `test/*.ts` liefert **25 Fehler**:

```
$ npx tsc --noEmit --strict --noUncheckedIndexedAccess --module NodeNext \
    --moduleResolution NodeNext --target ES2022 --skipLibCheck --esModuleInterop \
    --resolveJsonModule src/garmin-fitsdk.d.ts test/*.ts
test/helpers.ts(56,3): error TS2322: Type '{ startLat: number; … }' is not assignable to type
  'GenerationParams'. Types of property 'locale' are incompatible.
  Type '"en" | "de" | undefined' is not assignable to type '"en" | "de"'.
test/api.test.ts(115,5): error TS2740: Type '{ distanceKm: … }' is missing the following properties
  from type 'RouteMetadata': surfaceBreakdown, wayTypeBreakdown, pushingSectionsM, physicalEffortKj, and 2 more.
test/gpx.test.ts(9,7):    error TS2740: (dito)
test/filters.test.ts(58,71), (68,61), (77,61): error TS2345: Property 'eBike' is missing in type … 
test/profiles.test.ts(34,44) … (84,67) [7×]: error TS2345: Property 'eBike' is missing …
test/import-pois.test.ts(17,8): error TS7016: Could not find a declaration file for module
  '../scripts/import-pois.mjs' — implicitly has an 'any' type.
test/import-pois.test.ts: 9 × TS7006 (implizites any) + 2 × TS2532 (Object is possibly 'undefined')
… 25 Fehler gesamt
```

Die Tests laufen trotzdem grün, weil Vitest nur transpiliert. Die Testfixtures sind also strukturell von den Produktivtypen abgedriftet.

---

### `/home/user/festi-routes` (Datenrepo)

Kein `package.json`, kein Lockfile, keine `.gitignore`, keine Tests, keine CI. Ein einziges Skript: `scripts/generate.mjs` (221 Zeilen, sauber dokumentierter Header, `node --env`-basiert). 1712 getrackte Dateien, davon 569 `.gpx`, `routes/` = 58 MB.

---

## Findings

### E-01 — Frontend hat null automatisierte Tests · **P0**
- **Ort:** `/home/user/festi/package.json` (kein `test`-Script, keine Test-Dependency); repoweit keine `*.test.*`/`*.spec.*`-Datei.
- **Befund:** Das Frontend enthält 82 Server Actions, davon ~46 mutierend, inklusive aller Auth-Guards (`src/features/auth/guards.ts`), Ownership-Checks, Gruppen-Rollenlogik (`src/features/community/lib/groupRoles.ts`), Waitlist-Promotion (`src/features/rides/actions/leaveRide.ts:58-97`), Ban-/Rollen-Administration (`src/features/users/actions/banUser.ts`, `updateUserRole.ts`) und R2-Uploads. Kein einziger dieser Pfade ist durch einen Test abgesichert. Jede Regression in einem Autorisierungs-Check ist damit nur durch manuelles Klicken auffindbar.
- **Fix:** Vitest + `@testing-library/react` als devDependencies, `"test": "vitest run"` und `"test:watch": "vitest"` in `package.json`. Erste Stufe: reine Unit-Tests der Server Actions gegen einen gemockten Prisma-Client (`vi.mock("@/lib/prisma")`) und gemockte Guards (`vi.mock("@/features/auth/guards")`) — das braucht keine Datenbank und deckt genau die Autorisierungslogik ab. Zweite Stufe: `@prisma/client` gegen eine Testcontainers-Postgres für die transaktionalen Pfade. Priorisierte Liste siehe *Test-Lücken: Top 10*.

### E-02 — Keinerlei CI/CD in allen drei Repos · **P0**
- **Ort:** `/home/user/festi/.github` (existiert nicht), `/home/user/festi-backend/.github` (existiert nicht), `/home/user/festi-routes/.github` (existiert nicht).
- **Befund:** `ls -la .github` liefert in allen drei Repos "KEIN .github". Es gibt also keinen automatischen Gate für Lint, Typecheck, Build oder Tests. Konkrete Folge: die 25 Typfehler in `festi-backend/test/*.ts` (siehe oben) und der Umstand, dass `npx tsc --noEmit` im Frontend ohne Vorarbeit rot ist, wären in einer CI sofort sichtbar geworden.
- **Fix:** Je ein Workflow.
  `festi`: `npm ci` → `npx prisma generate` → `npx next typegen` → `npx tsc --noEmit` → `npm run lint` → `npm run build`.
  `festi-backend`: `npm ci` → `npm run typecheck` → `npm test`.
  `festi-routes`: JSON-Schema-Validierung von `ideas/**/*.json` gegen `schema/route-idea.schema.json`.

### E-03 — Kein `typecheck`-Script; `tsc --noEmit` ist ohne zwei ungescriptete Vorschritte rot · **P1**
- **Ort:** `/home/user/festi/package.json:5-16` (Scripts-Block).
- **Befund:** Ein Entwickler oder eine CI, die naiv `npx tsc --noEmit` ausführt, bekommt 69 bzw. 2 Fehler — obwohl der Code korrekt ist. Notwendig sind vorher `prisma generate` (Client nach `src/generated/prisma`, gitignored) und `next typegen` (globales `RouteContext`, `.next/types`). Die Next-Doku sagt das explizit: `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md:183` empfiehlt `next typegen && tsc --noEmit`, und Zeile 208: *"To ensure `next-env.d.ts` is present before type-checking run `next typegen`."*
- **Fix:** `"typecheck": "prisma generate && next typegen && tsc --noEmit"` in `package.json` aufnehmen und in der CI (E-02) verwenden. Das Backend hat so ein Script bereits (`festi-backend/package.json`: `"typecheck": "tsc -p tsconfig.json --noEmit"`) — das Frontend zieht nach.

### E-04 — `"use server"` auf `guards.ts` exponiert alle Auth-Guards als öffentliche Endpunkte · **P1**
- **Ort:** `src/features/auth/guards.ts:1` (`"use server"`), Exports in Zeilen 11, 22, 34, 49, 58.
- **Befund:** `guards.ts` ist die einzige Datei außerhalb von `*/actions/*`, die `"use server"` trägt (repoweit verifiziert). In Next.js macht `"use server"` **jeden** Export der Datei zu einem über eine stabile Action-ID vom Browser aufrufbaren POST-Endpunkt. `getSession()` (Zeile 11) und `getCurrentUser()` (Zeile 49) geben das vollständige Session-Objekt zurück; `requireAuth()` (Zeile 22) und `requireAdmin()` (Zeile 34) sind reine Page-Guards, die nie über die Netzwerkgrenze gehören. Der Datei-Doc-Kommentar sagt selbst "Use in server components / layouts" — das widerspricht der `"use server"`-Direktive.
- **Fix:** `"use server"` aus `guards.ts` entfernen. Die Guards werden ausschließlich aus Server Components und aus Server Actions heraus aufgerufen; beide Kontexte laufen bereits serverseitig und brauchen die Direktive nicht. Analog gilt: die vier Aufrufer-Actions bleiben unverändert, weil sie ihr eigenes `"use server"` an Dateikopf tragen.

### E-05 — Interne Auth-Helper liegen in `actions/` und sind dadurch öffentlich aufrufbar · **P1**
- **Ort:** `src/features/auth/actions/checkAvailability.ts:1,5` (`checkUsernameAvailable`), `src/features/auth/actions/validateEmail.ts:1,5` (`validateEmailDomain`).
- **Befund:** Beide Dateien tragen `"use server"` und beide werden nur noch aus `registerUser.ts:42` bzw. `:28` heraus aufgerufen — sie sind seit Commit `1e09de2` reine interne Helfer der Registrierung. Als eigenständige Server Actions bleiben sie aber unauthentifiziert von außen aufrufbar und bilden ein Username-Enumeration- bzw. DNS-Lookup-Orakel (letzteres ohne Rate-Limit, `validateEmail.ts` macht einen echten DNS-Roundtrip pro Aufruf).
- **Fix:** Beide nach `src/features/auth/lib/` verschieben (ohne `"use server"`), aus `registerUser.ts` weiterhin importieren. Der Ordner `actions/` sollte per Konvention ausschließlich Dinge enthalten, die der Client tatsächlich aufrufen darf.

### E-06 — Backend: Testdateien sind vom Typecheck ausgeschlossen und driften (25 Fehler) · **P1**
- **Ort:** `/home/user/festi-backend/tsconfig.json` — `"include": ["src/**/*.ts"]`, `"exclude": ["node_modules", "dist", "test"]`.
- **Befund:** Weder `npm run build` noch `npm run typecheck` typprüfen `test/`. Der oben zitierte Lauf zeigt 25 echte Fehler, u. a. `test/helpers.ts:56` (`locale` optional statt required in `GenerationParams`), `test/api.test.ts:115` und `test/gpx.test.ts:9` (Fixtures fehlen sechs Felder von `RouteMetadata`: `surfaceBreakdown`, `wayTypeBreakdown`, `pushingSectionsM`, `physicalEffortKj` u. a.), `test/filters.test.ts:58,68,77` und `test/profiles.test.ts` 7×  (`eBike` fehlt). Die Fixtures behaupten also Typen, die die Produktivtypen längst überholt haben — die Tests testen teilweise gegen ein veraltetes Datenmodell.
- **Fix:** Separates `tsconfig.test.json` mit `"extends": "./tsconfig.json"`, `"include": ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.mjs"]`, `"noEmit": true`; `"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit"`. Danach die 25 Fehler abarbeiten — insbesondere `test/helpers.ts:56`, weil dieser Helper von den meisten Suites verwendet wird. Für `scripts/import-pois.mjs` eine `.d.mts` beilegen oder das Skript nach TypeScript ziehen (behebt 12 der 25 Fehler).

### E-07 — Backend: Worker, Job-Queue und GraphHopper-Client praktisch ungetestet · **P1**
- **Ort:** `src/worker/index.ts` (0 % / 227 Zeilen), `src/graphhopper.ts` (2,09 % / 214 Zeilen), `src/jobs.ts` (21,42 % / 171 Zeilen), `src/config.ts` (2,5 %).
- **Befund:** Genau die Komponenten mit dem meisten operativen Risiko — asynchrone Job-Verarbeitung, BullMQ-Retry-/Cancel-Semantik, Redis-Zustandsübergänge, HTTP-Fehlerbehandlung gegen GraphHopper — sind die einzigen mit nahezu null Abdeckung. `src/api/server.ts` erreicht dagegen 79,96 % (Statements) / 95,23 % (Functions), weil `test/api.test.ts` mit 26 Tests inkl. Quota (429), Backpressure (503), Idempotenz-Dedup und API-Key-Auth sehr gründlich ist. Die Asymmetrie ist auffällig.
- **Fix:** `test/jobs.test.ts` gegen `ioredis-mock` oder eine Testcontainers-Redis: Zustandsübergänge PENDING → RUNNING → SUCCEEDED/FAILED/CANCELLED, kooperative Cancellation während RUNNING, TTL-Ablauf. `test/graphhopper.test.ts` mit `vi.stubGlobal('fetch', …)`: 4xx/5xx-Antworten, Timeout, malformed-Response, Retry-Verhalten. `test/worker.test.ts`: ein durchgereichter Job mit gemocktem GraphHopper end-to-end.

### E-08 — Uneinheitliche Rückgabekonventionen der Server Actions: 3 Grundvarianten, 16 duplizierte `Result`-Typen · **P2**
- **Ort:** Repoweit in `src/features/*/actions/`. Beispiele: `src/features/posts/actions/deletePost.ts:7` und `src/features/posts/actions/deletePostComment.ts:6` (`type Result = { success: true } | { success: false; error: string };` — buchstäblich identisch), `src/features/community/actions/createGroup.ts:12` (`success: false as const` ohne Typ-Alias), `src/features/rides/actions/getRides.ts` (`throw new Error`).
- **Befund:** 46 Actions signalisieren Fehler über ein `{ success, error }`-Discriminated-Union, 30 werfen (`throw new Error`), 5 geben schlicht Nutzdaten oder `null` zurück. Innerhalb der `success`-Fraktion gibt es nochmal drei Schreibweisen: 16 Dateien definieren einen lokalen `type Result`, 13 davon unter einem eigenen Namen (`CreateRideResult`, `LeaveRideResult`, …), 13 Dateien verzichten auf einen Typ-Alias und schreiben `success: false as const` inline. Für den Client heißt das: er muss pro Action nachschlagen, ob er `try/catch` oder `if (!result.success)` braucht. Details in der Tabelle unten.
- **Fix:** Einen gemeinsamen Typ nach `src/lib/actionResult.ts` ziehen — `export type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };` — plus die Regel: **Mutationen** geben immer `ActionResult` zurück (nie werfen), **Reads** dürfen werfen und werden vom `error.tsx`-Boundary bzw. TanStack Query aufgefangen. Diese Regel in `AGENTS.md` festhalten. Die 16 lokalen `Result`-Typen ersetzen.

### E-09 — Dateinamens-Konvention: 9 kebab-case-Ausreißer außerhalb `components/ui` · **P2**
- **Ort:** siehe Tabelle *Dateinamen* unten.
- **Befund:** Der Maintainer hat in `concerns.txt` camelCase als Standard gesetzt, und Commit `1e09de2` hat das großflächig umgesetzt (`particle-background.tsx → particleBackground.tsx`, `user-menu.tsx → userMenu.tsx`, `check-availability.ts → checkAvailability.ts`, `login-form.tsx → loginForm.tsx`, …). Übrig sind 9 Dateien. `src/components/ui/**` ist durchgängig kebab-case, das ist aber von der shadcn-CLI generiert und sollte bewusst so bleiben (sonst bricht `npx shadcn add`).
- **Fix:** Die 9 Dateien umbenennen. Bei den drei Hooks (`use-session.ts`, `use-mobile.ts`, `query-provider.tsx`) explizit entscheiden: entweder auch auf camelCase (`useSession.ts`, `useMobile.ts`, `queryProvider.tsx`) — dann ist die Regel ausnahmslos — oder eine dokumentierte Ausnahme "Hooks und Provider bleiben kebab-case" in `AGENTS.md`. Wichtig: `git mv` verwenden, weil `forceConsistentCasingInFileNames` nicht gesetzt ist (`tsconfig.json`) und macOS/Windows-Checkouts sonst still driften.

### E-10 — 3 Sammel-Action-Dateien mit 10 Actions statt 10 Dateien · **P2**
- **Ort:** `src/features/notification/actions/notification-actions.ts` (4 Actions: `getNotifications:24`, `getUnreadNotificationCount:54`, `getNotificationHistory:74`, `markNotificationsSeen:127`), `src/features/chat/actions/direct-chat-action.ts` (4: `getUnreadDirectCount:43`, `getDirectConversations:72`, `getDirectMessages:173`, `sendDirectMessage:239`), `src/features/chat/actions/chat-action.ts` (2: `getGroupMessages:9`, `sendGroupMessage:72`).
- **Befund:** Alle 79 übrigen Action-Dateien halten "eine Action pro Datei" ein (verifiziert: `grep -cE '^export (async )?function|^export const'` liefert für alle anderen exakt 1). Diese drei Dateien sind die letzten Reste des von `concerns.txt` kritisierten Musters und tragen zugleich als einzige kebab-case-Namen — sie wurden bei Commit `1e09de2` schlicht übersehen.
- **Fix:** Aufsplitten in `notification/actions/getNotifications.ts`, `getUnreadNotificationCount.ts`, `getNotificationHistory.ts`, `markNotificationsSeen.ts`, `chat/actions/getGroupMessages.ts`, `sendGroupMessage.ts`, `getUnreadDirectCount.ts`, `getDirectConversations.ts`, `getDirectMessages.ts`, `sendDirectMessage.ts`. Gemeinsame Typen (`DirectConversation`, `NotificationItem`) wandern in die jeweilige `types.ts`, die bereits existiert.

### E-11 — Zod-Parameter-Typisierung: 8 × `input: unknown` und 3 × Inline-Objektliteral · **P2**
- **Ort:** siehe Tabelle *Zod-Parameter* unten.
- **Befund:** Der vom Maintainer gewünschte Stil (`createGroup(input: GroupFormData)`) ist in 8 Actions umgesetzt. Daneben stehen zwei abweichende Muster: 8 Actions nehmen `input: unknown` (z. B. `src/features/rides/actions/createRide.ts:23`, `src/features/users/actions/updateProfile.ts:15`) und 3 Actions ein anonymes Inline-Objektliteral (`src/features/community/actions/createAnnouncement.ts:20-22`, `kickGroupMember.ts:10-12`, `updateGroupMemberRole.ts:24-27`). `input: unknown` ist sicherheitstechnisch tadellos (nichts wird implizit vertraut), kostet aber jede Compile-Time-Hilfe am Aufrufort — der Client kann beliebigen Unsinn übergeben, ohne dass TypeScript murrt.
- **Fix:** Einheitlich `z.infer`-Typ als Parametertyp **plus** `safeParse` im Rumpf. Das ist kein Widerspruch: der Typ ist Entwickler-Ergonomie, das `safeParse` ist die Laufzeitgrenze. Genau so kommentiert es `createGroup.ts:16-17` bereits vorbildlich (*"Runtime validation: types are erased at runtime and this is a public endpoint, so we never trust the client-provided input."*). Für die drei Inline-Objekte reichen neue Typen `CreateAnnouncementData`, `KickGroupMemberData`, `UpdateGroupMemberRoleData` in der jeweiligen `schemas/`-Datei.

### E-12 — `kickGroupMember` validiert seinen Input überhaupt nicht mit Zod · **P2**
- **Ort:** `src/features/community/actions/kickGroupMember.ts:10-12` (Signatur), Verwendung von `input.groupId` ab Zeile 20, `input.memberId` ab Zeile 32.
- **Befund:** `grep -n "safeParse\|parse(" src/features/community/actions/kickGroupMember.ts` liefert **keinen Treffer**. Die Action ist eine öffentlich aufrufbare `"use server"`-Funktion, nimmt ein untypisiertes Objektliteral entgegen und reicht `input.groupId` / `input.memberId` ungeprüft an Prisma weiter. Sie ist damit der einzige der drei Inline-Objekt-Fälle ohne Laufzeitvalidierung: `createAnnouncement.ts:28` und `updateGroupMemberRole.ts:34` parsen beide sauber. Autorisierung findet zwar statt (`getGroupRole`-Prüfung), aber die Eingabeform selbst wird nicht geprüft.
- **Fix:** `kickGroupMemberSchema` in `src/features/community/schemas/index.ts` ergänzen (beide Felder `z.string().min(1)` bzw. cuid/uuid je nach ID-Format) und in Zeile 13 mit `safeParse` vorschalten, exakt nach dem Muster von `updateGroupMemberRole.ts:34-37`.

### E-13 — Waitlist-Promotion läuft nicht in einer Transaktion · **P2**
- **Ort:** `src/features/rides/actions/leaveRide.ts:54-68`.
- **Befund:** Der Ablauf ist `prisma.rideParticipant.delete(...)` (Zeile 54) → `findFirst({ status: "WAITLISTED", orderBy: { createdAt: "asc" } })` (Zeile 60) → `update({ status: "PENDING" })` (Zeile 66) als drei getrennte Statements. Verlassen zwei Teilnehmer gleichzeitig dieselbe Fahrt, können beide Aufrufe denselben `nextInLine` lesen; einer der beiden freien Plätze bleibt dann unbesetzt, während gleichzeitig zwei Notifications für denselben Nutzer rausgehen (Zeilen 70-85). Dieselbe Sequenz ohne Test — das ist genau der Klassiker, den ein Test fixieren müsste.
- **Fix:** Die drei Schritte in `prisma.$transaction(async (tx) => { … })` klammern; die Promotion-`update` mit `updateMany({ where: { id: nextInLine.id, status: "WAITLISTED" }, data: { status: "PENDING" } })` absichern und nur bei `count === 1` die Notifications senden. Dann Regressionstest (siehe *Test-Lücken* T-03).

### E-14 — Ungenutzte bzw. falsch platzierte Dependencies · **P2**
- **Ort:** `package.json:52` (`shadcn`), `:41` (`pg-cloudflare`), `:24` (`@prisma/client`), `:20` (`@base-ui/react`), `:25` (`@shadcn/react`), `:43` (`radix-ui`), `:55` (`tw-animate-css`).
- **Befund:** Import-Zählung über `src/` + Root-Configs (ohne `src/generated/`):

  | Paket | Import-Treffer | Bewertung |
  |---|---:|---|
  | `shadcn` (`^4.12.0`) | **0** | CLI-Werkzeug, fälschlich unter `dependencies` — landet im Production-Bundle-Graph |
  | `pg-cloudflare` | 0 als Import | nur als String in `next.config.ts:12` (`serverExternalPackages`) — **korrekt so** |
  | `@prisma/client` | 0 als Import | nur `next.config.ts:8` — Prisma 7 generiert nach `src/generated/prisma`; das Paket bleibt aber Runtime-Requirement |
  | `tw-animate-css` | 0 als Import | via `src/app/globals.css:2` `@import "tw-animate-css"` — **korrekt so** |
  | `@base-ui/react` | **1** | nur `src/components/ui/combobox.tsx:3` — und diese Komponente wird nirgends importiert (E-15) |
  | `@shadcn/react` | **1** | nur `src/components/ui/message-scroller.tsx:8` — ebenfalls nirgends importiert (E-15) |
  | `radix-ui` | 36 | intensiv genutzt, in Ordnung |
  | `procycling-live` | 21 | intensiv genutzt (siehe E-18) |
  | `radnet-breitensport` | 1 | `src/features/events` — in Ordnung |

  Die drei UI-Bibliotheken `radix-ui`, `@base-ui/react` und `@shadcn/react` parallel zu führen ist zudem strategisch fragwürdig: zwei davon je genau eine Komponente, und beide Komponenten sind tot.
- **Fix:** `shadcn` nach `devDependencies` verschieben (oder ganz entfernen und per `npx shadcn@latest` aufrufen). Nach Aufräumen von E-15 fallen `@base-ui/react` und `@shadcn/react` ersatzlos weg — dann ist `radix-ui` die einzige Primitive-Bibliothek.
- **Status:** behoben. `shadcn` liegt jetzt unter `devDependencies`. Mit E-15 fielen **sieben**
  Laufzeit-Pakete weg, nicht zwei: `@base-ui/react` (combobox), `@shadcn/react` (message-scroller),
  `embla-carousel-react` (carousel), `input-otp`, `react-day-picker` (calendar),
  `react-resizable-panels` (resizable) und `vaul` (drawer) — jedes hatte genau eine Import-Stelle,
  und die war eine tote Komponente. `dependencies` sinkt von 37 auf 30; `radix-ui` ist die einzige
  verbleibende Primitive-Bibliothek. `cmdk` bleibt: `command.tsx` wird von `bikeCombobox.tsx` genutzt.

### E-15 — 31 ungenutzte UI-Komponenten (3418 LOC) und 4 komplett tote Module · **P3**
- **Ort:** Komplett unreferenziert (kein Import irgendwo in `src/`):
  - `src/components/navigation.tsx` (23 LOC)
  - `src/components/goBack.tsx` (22 LOC)
  - `src/features/community/utils/format-relative-date.ts` (20 LOC, Export `formatRelativeDate`)
  - `src/features/users/utils/relative-time.ts` (24 LOC)
  - 31 Dateien in `src/components/ui/`: `accordion`, `aspect-ratio`, `attachment`, `breadcrumb`, `bubble`, `button-group`, `calendar`, `carousel`, `collapsible`, `combobox`, `context-menu`, `direction`, `drawer`, `hover-card`, `input-otp`, `item`, `kbd`, `marker`, `menubar`, `message`, `message-scroller`, `native-select`, `navigation-menu`, `pagination`, `progress`, `radio-group`, `resizable`, `scroll-area`, `spinner`, `toggle-group` — zusammen **3418 LOC**. (`toggle.tsx` selbst wird genutzt: `src/features/users/components/riderDetailsEditor.tsx:19`.)
- **Befund:** Die beiden `utils`-Dateien sind besonders auffällig, weil sie **dieselbe Funktion zweimal** implementieren (relative Datumsformatierung) und beide tot sind — die produktive Variante läuft über `date-fns`. Zusätzlich: 64 exportierte Symbole in nicht-toten Dateien werden nirgends importiert, Schwerpunkte `src/features/rides/schemas/index.ts` (14), `src/features/rides/lib/routeEngine.ts` (11, überwiegend Typ-Bausteine die nur dateiintern kombiniert werden — unkritisch), `src/features/users/schemas/index.ts` (8, u. a. `profileFormSchema`, `ProfileFormValues`, `ALLOWED_ROLES`, `SKILL_LEVEL_VALUES`, `RIDING_STYLE_VALUES`).
- **Fix:** Die 4 toten Module löschen. Bei `src/components/ui/**` differenzieren: das sind shadcn-Vendor-Dateien, die man bewusst auf Vorrat halten kann — dann aber dokumentieren (Zeile in `AGENTS.md`), damit die nächste Analyse nicht wieder darüber stolpert. `combobox.tsx` und `message-scroller.tsx` sollten in jedem Fall weg, weil sie als einzige zwei ganze npm-Pakete am Leben halten (E-14). Die ungenutzten Schema-Exports mit `knip` oder `ts-prune` in einem Aufwasch prüfen.
- **Status:** behoben. 34 Dateien, **3507 Zeilen** gelöscht. Vor dem Löschen nachgeprüft, nicht der
  Liste vertraut: für jede Datei in `src/components/ui/` wurde gegen
  `from "(@/components/ui/|./|../ui/)<name>"` gesucht. Ergebnis: **30**, nicht 31 — die Überschrift
  war um eins daneben, die Aufzählung darunter stimmte. `command.tsx` bleibt (`bikeCombobox.tsx`),
  `toggle.tsx` bleibt (`riderDetailsEditor.tsx`). Danach Lint, Typecheck, 28 Tests und ein voller
  `next build` grün.
- **Nachtrag:** Statt „auf Vorrat halten" gelöscht, weil die Dateien nicht nur Zeilen sind: sie hielten
  sieben npm-Pakete im Produktions-Abhängigkeitsgraphen (siehe E-14). Zurückholen kostet
  `npx shadcn@latest add <name>`.

### E-16 — Stale `eslint-disable`-Kommentare in einem Biome-Projekt · **P3**
- **Ort:** `src/features/community/components/editGroupDialog.tsx:180`, `src/features/community/components/createGroupDialog.tsx:160`.
- **Befund:** Beide Zeilen lauten `// eslint-disable-next-line @next/next/no-img-element`, direkt gefolgt von der wirksamen `// biome-ignore lint/performance/noImgElement: …` in Zeile 181 bzw. 161. Das Projekt nutzt ausschließlich Biome (`package.json:5` → `"lint": "biome check"`), ESLint ist weder Dependency noch konfiguriert. Die Kommentare sind wirkungslose Überbleibsel der Migration.
- **Fix:** Beide Zeilen löschen. Alle 34 übrigen `biome-ignore`-Kommentare im Produktivcode sind sauber begründet (überwiegend `noImgElement` für externe CDN-URLs und `noArrayIndexKey` für Skeleton-Platzhalter) und sollten bleiben.

### E-17 — `console.log` im Produktivcode leakt Auth-Fehler in die Browser-Konsole · **P3**
- **Ort:** `src/features/auth/components/loginForm.tsx:56` — `console.log(result.error);`
- **Befund:** Das ist der **einzige** `console.log` im gesamten Produktiv-`src/` (repoweit verifiziert). Er steht in einer `"use client"`-Komponente und schreibt das rohe Fehlerobjekt der Login-Antwort in die Browser-Konsole. Die übrigen 14 `console.*`-Aufrufe sind alle `console.error`/`console.warn` in Server-Code mit sauberem Präfix (`[uploadAvatar]`, `[Logger]`, `[Notifier]`, `[radnet-sync]`, …) und sind als Server-Logging vertretbar. `prisma/seed.ts` (8×) ist ein CLI-Skript — unkritisch.
- **Fix:** Zeile 56 entfernen. Mittelfristig: die 14 verstreuten `console.error` durch den bereits existierenden `Logger` (`src/features/logger/logger.ts`) ersetzen, damit Fehler auch in der ActivityLog-Tabelle landen statt nur im Worker-stdout.

### E-18 — `procycling-live` als eingecheckter 240-KB-Tarball ohne Upgrade-Pfad · **P2**
- **Ort:** `package.json:42` — `"procycling-live": "file:dependencies/procycling-live-0.2.0.tgz"`; die Datei `dependencies/procycling-live-0.2.0.tgz` (239.955 Bytes) ist getrackt.
- **Befund:** Das Paket wird in 21 Import-Stellen genutzt und ist damit eine harte Laufzeitabhängigkeit der gesamten `/dashboard/pro`-Sektion. `tar tzf` zeigt: nur `dist/` (CJS + ESM + `.d.cts`/`.d.ts` + Sourcemaps), **kein Quellcode**. `package.json` im Tarball nennt als Autor "Aljoscha Irmer" — es ist also eine Eigenentwicklung des Maintainers. Das Schwesterpaket `radnet-breitensport@0.1.1` desselben Autors liegt dagegen regulär auf npm (`resolved: https://registry.npmjs.org/…`, Lockfile-Eintrag verifiziert). Konkrete Risiken: (a) Jede Version bläht die Git-History dauerhaft um ~240 KB auf, (b) `npm audit` kann das Paket und seine transitive Abhängigkeiten nicht bewerten, (c) es gibt kein `npm outdated`/Dependabot-Signal, (d) ein Rebuild aus Quellen ist ohne Zugriff auf ein separates, hier nicht vorhandenes Repo unmöglich. Immerhin: das Lockfile führt einen `integrity`-Hash (`sha512-ZhZ3QHavV6/…`), Manipulation am Tarball würde also auffallen.
- **Fix:** `procycling-live` genauso auf npm veröffentlichen wie `radnet-breitensport` und die `file:`-Referenz durch `"procycling-live": "^0.2.0"` ersetzen. Falls es privat bleiben soll: GitHub Packages oder ein privates npm-Scope. Der Tarball und `dependencies/procycling-live-feedback.md` können danach aus dem Repo verschwinden. Bis dahin mindestens den Ursprung im README dokumentieren.

### E-19 — Kein Node-Version-Pinning im Frontend · **P3**
- **Ort:** `/home/user/festi/package.json` (kein `engines`-Feld), kein `.nvmrc`, kein `.node-version`.
- **Befund:** `festi-backend/package.json` pinnt korrekt `"engines": { "node": ">=20" }`; das Frontend pinnt gar nichts, obwohl es mit Next 16, Prisma 7 und dem OpenNext-Cloudflare-Adapter drei Toolchains mit harten Node-Anforderungen kombiniert. Beide Repos haben zudem kein `.nvmrc`, sodass `nvm use` ins Leere läuft.
- **Fix:** `"engines": { "node": ">=20" }` in `festi/package.json` und je eine `.nvmrc` mit der tatsächlich verwendeten Major-Version in beide Repos. Die CI aus E-02 dann mit `actions/setup-node` + `node-version-file: .nvmrc`.

### E-20 — `festi-routes` hat keine `.gitignore` und keinerlei Validierung · **P3**
- **Ort:** `/home/user/festi-routes/` — `.gitignore` existiert nicht; kein `package.json`, kein Lockfile, keine Tests, keine CI.
- **Befund:** 1712 getrackte Dateien, davon 569 `.gpx`; `routes/` ist 58 MB groß. Die GPX-Dateien sind Output von `scripts/generate.mjs` aus den `ideas/*.json` — also eingecheckte Generate. Für ein deklariertes Datenrepo ist das vertretbar (die Routen sind das Produkt), es fehlt aber jede Absicherung: `schema/route-idea.schema.json` existiert, wird aber von nichts erzwungen. Ohne `.gitignore` landen `node_modules/`, `.env` oder lokale Zwischenstände beim ersten Unachtsamen im Repo.
- **Fix:** `.gitignore` anlegen (`node_modules/`, `.env*`, `*.log`, `.DS_Store`). Ein minimales `package.json` mit `"validate": "node scripts/validate-ideas.mjs"`, das alle `ideas/**/*.json` gegen `schema/route-idea.schema.json` prüft (z. B. via `ajv`), plus GitHub-Action, die das bei jedem PR ausführt. Das ist ~30 Zeilen und verhindert genau die Klasse Fehler, die in einem Datenrepo real auftritt.

### E-21 — Barrel-Exports nur in 5 von 15 Features · **P3**
- **Ort:** `index.ts` vorhanden in `src/features/analytics/`, `auth/`, `logger/`, `notification/` (+ `providers/` hat keine). Fehlt in `chat/`, `community/`, `events/`, `followers/`, `news/`, `posts/`, `pro/`, `rides/`, `routes/`, `users/`.
- **Befund:** Dadurch existieren zwei Importstile nebeneinander: `import { RegisterForm } from "@/features/auth"` (`src/app/register/page.tsx:1`) gegen `import { createRide } from "@/features/rides/actions/createRide"`. Wer eine Action verschiebt, muss im zweiten Fall alle Aufrufer anfassen. Nebenbei: `src/features/users/types.tsx` ist die einzige `types`-Datei mit `.tsx`-Endung — alle 9 anderen Features nutzen `types.ts`.
- **Fix:** Entscheidung treffen und in `AGENTS.md` festschreiben. Empfehlung: **keine** Barrels für Server Actions (Barrel-Dateien mit `"use server"`-Reexports vergrößern den Action-Graph und damit die Client-Bundle-Grenze unnötig), aber Barrels für Komponenten und Typen. `types.tsx` → `types.ts` umbenennen, falls kein JSX enthalten ist.

---

## Konventions-Ausreißer (Tabellen)

### Dateinamen — kebab-case in einer camelCase-Codebase

Regel laut `concerns.txt`: *"Also change everything to camelcase naming filenames"*. Verbleibende Abweichungen außerhalb `src/components/ui/**`:

| Datei | Exportiert | Bewertung |
|---|---|---|
| `src/features/chat/actions/chat-action.ts` | `getGroupMessages`, `sendGroupMessage` | **Verstoß** — zusätzlich Sammeldatei (E-10) |
| `src/features/chat/actions/direct-chat-action.ts` | `getUnreadDirectCount`, `getDirectConversations`, `getDirectMessages`, `sendDirectMessage` | **Verstoß** — zusätzlich Sammeldatei (E-10) |
| `src/features/notification/actions/notification-actions.ts` | `getNotifications`, `getUnreadNotificationCount`, `getNotificationHistory`, `markNotificationsSeen` | **Verstoß** — zusätzlich Sammeldatei (E-10) |
| `src/features/community/utils/format-relative-date.ts` | `formatRelativeDate` | **Verstoß** — außerdem tot (E-15) |
| `src/features/users/utils/relative-time.ts` | — | **Verstoß** — außerdem tot (E-15) |
| `src/features/auth/hooks/use-session.ts` | `useSession`, `sessionQueryKey` | Grenzfall — React-Hook-Konvention |
| `src/hooks/use-mobile.ts` | `useIsMobile` | Grenzfall — React-Hook-Konvention |
| `src/features/providers/query-provider.tsx` | `QueryProvider` | Grenzfall |
| `src/lib/auth-client.ts` | better-auth Client | Grenzfall — folgt better-auth-Doku |

`src/components/ui/**` (72 Dateien) ist vollständig kebab-case — shadcn-Vendor-Code, bewusst so belassen. Keine einzige Datei dort trägt einen Großbuchstaben (verifiziert).

### Sammeldateien statt einer Action pro Datei

| Datei | Anzahl Actions | Zeilen der Exports |
|---|---:|---|
| `src/features/notification/actions/notification-actions.ts` | 4 | 24, 54, 74, 127 |
| `src/features/chat/actions/direct-chat-action.ts` | 4 | 43, 72, 173, 239 |
| `src/features/chat/actions/chat-action.ts` | 2 | 9, 72 |
| **alle übrigen 79 Action-Dateien** | **je 1** | — |

Zusätzlich: Dateiname ≠ Exportname auch bei zwei Einzel-Action-Dateien — `src/features/auth/actions/checkAvailability.ts:5` exportiert `checkUsernameAvailable`, `src/features/auth/actions/validateEmail.ts:5` exportiert `validateEmailDomain`.

### Rückgabe-Konventionen der Server Actions — 3 Grundvarianten, 5 Ausprägungen

| Variante | Anzahl | Beispiele |
|---|---:|---|
| **A1** — `{ success, error }` mit lokalem `type Result` (Discriminated Union) | 16 | `posts/actions/deletePost.ts:7`, `posts/actions/deletePostComment.ts:6`, `community/actions/createAnnouncement.ts:12`, `users/actions/updateProfile.ts:10` |
| **A2** — `{ success, error }` mit eigenem benannten Result-Typ | 13 | `rides/actions/leaveRide.ts:11` (`LeaveRideResult`), `rides/actions/createRide.ts` (`CreateRideResult`), `routes/actions/saveRoute.ts` (`SaveRouteResult`) |
| **A3** — `{ success: false as const, … }` ohne Typ-Alias | 13 | `community/actions/createGroup.ts:12`, `community/actions/kickGroupMember.ts:17`, `auth/actions/registerUser.ts:21`, `users/actions/banUser.ts` |
| **B** — `throw new Error(...)` | 30 | `rides/actions/getRides.ts`, `posts/actions/getFeed.ts`, `pro/actions/getStageDetail.ts`, `analytics/actions/getAnalytics.ts`, `notification/actions/notification-actions.ts` |
| **C** — reine Nutzdaten / `null` / `void`, kein Fehlerkanal | 5 | `auth/actions/getBanInfo.ts:4`, `auth/actions/checkAvailability.ts:5`, `auth/actions/validateEmail.ts:5`, `rides/actions/getPublicRide.ts:31`, `followers/actions/updatePresence.ts:11` |
| **D** — `redirect()` aus der Action heraus | **0** | — *(nur noch in `auth/guards.ts:25,37,40` — dort korrekt, siehe concerns-Tabelle)* |

Summe A1+A2+A3 = 46 · B = 30 · C = 5 · (drei Sammeldateien zählen mehrfach). **Positiv:** Variante D ist vollständig verschwunden — genau das war der zentrale Kritikpunkt aus `concerns.txt`.

### Zod-Nutzung — Parametertyp der Actions

| Muster | Anzahl | Dateien (`datei:zeile`) |
|---|---:|---|
| **Gewünscht** — `z.infer`-Typ als Parameter + `safeParse` im Rumpf | 8 | `auth/actions/registerUser.ts:16` (`RegisterFormData`) · `community/actions/createGroup.ts:10` (`GroupFormData`) · `community/actions/updateGroup.ts:10` (`GroupFormData & { groupId: string }`) · `community/actions/followRider.ts:10` (`FollowUserFormData`) · `community/actions/unfollowRider.ts:10` (`FollowUserFormData`) · `community/actions/respondToGroupJoinRequest.ts:16` (`RespondToGroupJoinRequestData`) · `chat/actions/chat-action.ts:72` (`MessageFormData`) · `chat/actions/direct-chat-action.ts:239` (`DirectMessageFormData`) |
| **Ausreißer 1** — `input: unknown`, Typ entsteht erst durch `parsed.data` | 8 | `posts/actions/createPost.ts:18` · `rides/actions/calculateRoute.ts:17` · `rides/actions/createRide.ts:23` · `rides/actions/generateRoute.ts:22` · `rides/actions/getRides.ts:32` · `rides/actions/updateRide.ts:22` · `routes/actions/saveRoute.ts:18` · `users/actions/updateProfile.ts:15` |
| **Ausreißer 2** — anonymes Inline-Objektliteral als Parametertyp | 3 | `community/actions/createAnnouncement.ts:20-22` *(parst)* · `community/actions/updateGroupMemberRole.ts:24-27` *(parst)* · `community/actions/kickGroupMember.ts:10-12` **(parst NICHT — siehe E-12)** |
| Primitive Parameter (`string`, `boolean`, `FormData`), Validierung via ID-Schema | ~60 | z. B. `rides/actions/leaveRide.ts:19` + `rideIdSchema.safeParse` in Zeile 25 |

### Typ-Escapes

| Muster | Vorkommen im Produktivcode | Vorkommen in `src/generated/prisma` |
|---|---:|---:|
| `any` (`: any`, `as any`, `<any`, `any[]`) | **0** | — |
| `@ts-expect-error` / `@ts-ignore` | **0** | — |
| `as unknown as` | **8** | 2 |
| `biome-ignore` | 34 | 31 (`biome-ignore-all lint: generated file`) |
| `eslint-disable` | **2** (stale, E-16) | 31 |

Die 8 produktiven `as unknown as` sind alle derselbe, legitime Prisma-`Json`-Fall und tragen keinen Kommentar:

| Ort | Cast |
|---|---|
| `src/features/posts/actions/getFeed.ts:132` | `ride.waypoints as unknown as Waypoint[]` |
| `src/features/rides/actions/createRide.ts:157` | `route.elevationProfile as unknown as object` |
| `src/features/rides/actions/getRide.ts:60` | `ride.waypoints as unknown as Waypoint[]` |
| `src/features/rides/actions/getRide.ts:65` | `ride.elevationProfile as unknown as ElevationPoint[] \| null` |
| `src/features/rides/actions/getUserRides.ts:48` | `ride.waypoints as unknown as Waypoint[]` |
| `src/features/rides/actions/getRides.ts:134` | `ride.waypoints as unknown as Waypoint[]` |
| `src/features/rides/actions/getGroupRides.ts:64` | `ride.waypoints as unknown as Waypoint[]` |
| `src/features/routes/actions/getRoute.ts:58` | `route.waypoints as unknown as LibraryWaypoint[]` |

**Vorschlag:** eine Helferfunktion `parseWaypoints(json: Prisma.JsonValue): Waypoint[]` in `src/features/rides/lib/`, die `waypointSchema.array().safeParse()` verwendet (das Schema existiert bereits in `rides/schemas/index.ts` und ist derzeit ungenutzt — siehe E-15). Das ersetzt sechs blinde Casts durch echte Laufzeitvalidierung; JSON-Spalten können durch Migrationen jederzeit von der Typ-Annahme abweichen.

### `console.*` im Produktivcode

| Datei:Zeile | Aufruf | Bewertung |
|---|---|---|
| `src/features/auth/components/loginForm.tsx:56` | `console.log(result.error)` | **Entfernen** — Client-Komponente, leakt Auth-Fehler in die Browser-Konsole |
| `src/lib/email.ts` | `console.warn(...)`, `console.error("Failed to send email:", error)` | Server, akzeptabel |
| `src/features/logger/logger.ts` | `console.error("[Logger] Failed to write activity log:", error)` | Server, akzeptabel |
| `src/features/notification/notification.ts` (2×) | `console.error("[Notifier] …")` | Server, akzeptabel |
| `src/features/users/actions/uploadAvatar.ts` | `console.error("[uploadAvatar] R2 upload failed:", error)` | Server, akzeptabel |
| `src/features/rides/actions/uploadRidePhoto.ts` | `console.error("[uploadRidePhoto] …")` | Server, akzeptabel |
| `src/features/rides/actions/deleteRidePhoto.ts` | `console.error("[deleteRidePhoto] …")` | Server, akzeptabel |
| `src/features/posts/actions/uploadPostImage.ts` | `console.error("[uploadPostImage] …")` | Server, akzeptabel |
| `src/features/community/actions/uploadGroupImage.ts` | `console.error("[uploadGroupImage] …")` | Server, akzeptabel |
| `src/features/community/actions/deleteGroup.ts` | `console.error("[deleteGroup] …")` | Server, akzeptabel |
| `src/features/events/actions/syncCalendarEvents.ts` | `console.error("[radnet-sync] detail fetch failed for ${event.id}", error)` | Server, akzeptabel |
| `src/features/auth/actions/validateEmail.ts` | `console.error("DNS lookup error:", error)` | Server, **ohne** Präfix-Konvention |
| `src/features/auth/actions/checkAvailability.ts` | `console.error("Username check error:", error)` | Server, **ohne** Präfix-Konvention |
| `custom-worker.ts:36` | `console.error(...)` | Worker-Entrypoint, akzeptabel |
| `prisma/seed.ts` (8×) | `console.log`/`console.error` | CLI-Skript, akzeptabel |

**Gesamt in `src/` (ohne `generated/`): 15.** Genau 1 davon ist `console.log`.

### TODO / FIXME / HACK

```
$ grep -rn "TODO\|FIXME\|HACK\|XXX" src --include=*.ts --include=*.tsx | grep -v src/generated/
(keine Ausgabe)

$ grep -rn "TODO\|FIXME\|HACK\|XXX" /home/user/festi-backend/{src,test,scripts}
(keine Ausgabe)

$ grep -rn "TODO\|FIXME\|HACK" /home/user/festi-routes/scripts
(keine Ausgabe)
```

**Null Treffer in allen drei Repos.** Das ist ungewöhnlich sauber — allerdings mit einem Vorbehalt: fehlende TODOs bedeuten nicht fehlende offene Punkte, sie bedeuten hier vor allem, dass offene Punkte in `concerns.txt` statt im Code notiert werden.

---

## `concerns.txt` — Punkt für Punkt

Datei: `/home/user/festi/concerns.txt` (6 Punkte, 8 Zeilen). Der Cleanup-Commit `1e09de2` ("feat: cleanup", Adam Spodniak, 2026-07-08) hat den Großteil adressiert — er hat u. a. `src/features/auth/actions/index.ts` gelöscht (47 Zeilen) und `registerUser.ts` (66 Zeilen) neu angelegt, außerdem massenhaft Dateien umbenannt.

| # | Punkt (Original) | Trifft noch zu? | Beleg | Vorschlag |
|---|---|---|---|---|
| 1 | *"Auth/action index.ts ---> why its called index if these are like helper functions. Find better name"* | **NEIN — erledigt** | `git log --diff-filter=D` zeigt: `src/features/auth/actions/index.ts` in Commit `1e09de2` gelöscht. Die Funktionen liegen heute in `src/features/auth/guards.ts` mit sprechenden Namen `getSession:11`, `requireAuth:22`, `requireAdmin:34`, `getCurrentUser:49`, `getCurrentAdmin:58`. | Nichts zu tun am Namen. **Aber:** `guards.ts:1` trägt weiterhin `"use server"` — das macht alle fünf Guards zu öffentlichen Endpunkten (E-04). Direktive entfernen; die Datei gehört konzeptionell nach `src/features/auth/guards.ts` **ohne** Action-Semantik. |
| 2 | *"why the functions only redirect the user? … better i want them to return True/False and then in the server action … return appropriate error message back to the user"* | **NEIN — erledigt** | Es gibt jetzt zwei klar getrennte Familien mit erklärenden Doc-Comments: **Page-Guards** `requireAuth` (`guards.ts:22-28`) und `requireAdmin` (`:34-43`) redirecten — kommentiert als *"Use in server components / layouts, where redirecting is the correct UX."* **Action-Guards** `getCurrentUser` (`:49-52`) und `getCurrentAdmin` (`:58-64`) geben `null` zurück — kommentiert als *"Server actions decide how to react (return a friendly error to the client instead of redirecting)."* Verifiziert: `grep -rln 'redirect(' src/features/*/actions/` liefert **0 Treffer**, keine einzige Server Action redirected mehr. Alle 46 mutierenden Actions beginnen mit dem Muster `if (!session) return { success: false, error: "You must be signed in." }`. | Umgesetzt und besser als gefordert (Trennung Page- vs. Action-Guard statt bloßem Boolean). Verbleibende Aufgabe: die Fehlerstring-Konvention zentralisieren — `"You must be signed in."` steht heute als Literal in ~46 Dateien. Eine Konstante `AUTH_REQUIRED_ERROR` in `src/features/auth/` genügt. |
| 3a | *"I dont like how everything is in one action file. I want … each and every server action to have separate file"* | **FAST — 3 Dateien offen** | 79 von 82 Action-Dateien enthalten exakt eine Action. Offen: `notification/actions/notification-actions.ts` (4 Actions, Zeilen 24/54/74/127), `chat/actions/direct-chat-action.ts` (4, Zeilen 43/72/173/239), `chat/actions/chat-action.ts` (2, Zeilen 9/72). | Diese 3 Dateien in 10 Einzeldateien aufsplitten (siehe E-10). Gemeinsame Typen (`DirectConversation`, `NotificationItem`) in die jeweils bereits vorhandene `types.ts` verschieben, nicht duplizieren. |
| 3b | *"Also change everything to camelcase naming filenames"* | **FAST — 9 Dateien offen** | Erledigt in `1e09de2` (u. a. `particle-background.tsx→particleBackground.tsx`, `user-menu.tsx→userMenu.tsx`, `check-availability.ts→checkAvailability.ts`, `get-ban-info.ts→getBanInfo.ts`, `validate-email.ts→validateEmail.ts`, `login-form.tsx→loginForm.tsx`, `register-form.tsx→registerForm.tsx`, `forgot-password-form.tsx→forgotPasswordForm.tsx`). Offen: die 9 Dateien in der Tabelle *Dateinamen* oben. | Die 5 klaren Verstöße per `git mv` umbenennen (die 3 chat/notification-Dateien fallen bei 3a ohnehin weg, die 2 `utils`-Dateien bei E-15 ersatzlos). Für die 4 Grenzfälle (`use-session.ts`, `use-mobile.ts`, `query-provider.tsx`, `auth-client.ts`) eine Zeile in `AGENTS.md`: *"Dateien: camelCase. Ausnahmen: `src/components/ui/**` (shadcn-Vendor, kebab-case) und React-Hooks/Provider (`use-*.ts`, `*-provider.tsx`)."* Damit ist die Regel entscheidbar statt Ermessenssache. |
| 4 | *"i dont like the way you use zod. Example: `createGroup(input: {name; description; needApproval})` … why not `createGroup(input: GroupFormData)`"* | **TEILWEISE — genau dieses Beispiel ist gefixt, 11 andere offen** | `src/features/community/actions/createGroup.ts:10` lautet heute wörtlich `export async function createGroup(input: GroupFormData)` — der zitierte Fall ist erledigt, inkl. erklärendem Kommentar in `:16-17` warum `safeParse` trotzdem bleibt. Offen: 8 Actions mit `input: unknown` und 3 mit Inline-Objektliteral (Tabelle *Zod-Nutzung* oben). | Alle 11 auf den `createGroup`-Stil bringen: `z.infer`-Typ als Parameter **und** `safeParse` im Rumpf. Für die 3 Inline-Fälle neue Typen `CreateAnnouncementData` / `KickGroupMemberData` / `UpdateGroupMemberRoleData` in `community/schemas/index.ts`. Dringend zuerst `kickGroupMember.ts` — dort fehlt die Validierung komplett (E-12). Die Regel danach in `AGENTS.md`: *"Server Actions: Parametertyp immer `z.infer<typeof schema>`, Rumpf immer `schema.safeParse(input)`. Nie `unknown`, nie anonymes Objektliteral."* |
| 5 | *"register-form i dont know if i like how we call each function inside the mutation. Wouldnt it be better to have one server action and in that server action call it all?"* | **NEIN — erledigt** | `src/features/auth/components/registerForm.tsx:56-63`: die Mutation ruft **eine** Action auf (`const result = await registerUser(data)`), prüft `result.success` und wirft für den `onError`-Toast. `src/features/auth/actions/registerUser.ts:16-77` orchestriert intern alles: `registerSchema.safeParse` (`:18`) → `validateEmailDomain` (`:28`) → `checkUsernameAvailable` (`:42`) → `auth.api.signUpEmail` (`:51`) → `Logger.log` (`:61`). Der Doc-Comment `:11-15` benennt die Absicht explizit: *"Single entry point for registration. Runs every check server-side in one round trip."* | Genau wie gewünscht umgesetzt, inkl. sinnvoller Zusatzentscheidung (Doppel-E-Mail wird bewusst **nicht** geprüft — Enumeration-Schutz, kommentiert in `:36-38`). Verbleibende Aufgabe: `checkAvailability.ts` und `validateEmail.ts` sind seither reine interne Helfer, liegen aber weiter in `actions/` mit `"use server"` und bleiben dadurch einzeln von außen aufrufbar (E-05). Nach `src/features/auth/lib/` verschieben. |

**Fazit zur `concerns.txt`:** 3 von 6 Punkten vollständig erledigt (1, 2, 5), 3 überwiegend erledigt mit klar benennbaren Resten (3a: 3 Dateien, 3b: 9 Dateien, 4: 11 Actions). Der Aufwand für die Restarbeiten liegt bei geschätzt einem halben Tag. Empfehlung: `concerns.txt` danach durch entsprechende Regeln in `AGENTS.md` ersetzen, damit die Konventionen für künftige Beiträge verbindlich statt als lose Notiz existieren.

---

## Test-Lücken: Top 10

Alle zehn beziehen sich auf `/home/user/festi` (Frontend), sofern nicht anders angegeben. Reihenfolge = Priorität.

| # | Stelle | Warum dringend | Konkreter Testvorschlag |
|---|---|---|---|
| **T-01** | **Auth-Guards** — `src/features/auth/guards.ts:22,34,49,58` | Einziger Zugangsschutz der gesamten App. `requireAdmin:39` prüft `session.user.role !== "admin"` gegen ein optionales String-Feld (`prisma/schema.prisma`: `role String? @default("user")`) — bei `null` greift der Redirect korrekt, bei einem Tippfehler im Rollennamen still nicht mehr. | `guards.test.ts`: `auth.api.getSession` mocken. Fälle: keine Session → `requireAuth` ruft `redirect("/login")`; `role: "user"` → `requireAdmin` ruft `redirect("/dashboard")`; `role: null` → redirect; `role: "admin"` → Session durchgereicht; `getCurrentUser` liefert `null` statt zu redirecten. Zusätzlich ein struktureller Test, der sicherstellt, dass `guards.ts` **kein** `"use server"` trägt (E-04). |
| **T-02** | **Ownership-Checks der Ride-Actions** — `src/features/rides/actions/deleteRide.ts:16`, `cancelRide.ts:23`, `updateRide.ts:20`, `setRidePublic.ts:15`, `respondToJoinRequest.ts:18`, `markAttendance.ts:17` | Sechs Actions, die fremde Fahrten verändern könnten. Jede prüft `ride.creatorId === session.user.id` eigenhändig — sechs Kopien derselben Logik, keine davon getestet. Ein vergessener Check in einer davon ist eine direkte IDOR. | Eine tabellengetriebene Suite: für jede der sechs Actions dieselben drei Fälle — (a) nicht eingeloggt → `{ success: false, error: "You must be signed in." }`, (b) eingeloggt aber nicht Creator → Fehler und **kein** `prisma.*.update/delete`-Aufruf (`expect(prisma.ride.delete).not.toHaveBeenCalled()`), (c) Creator → Erfolg. Prisma per `vi.mock("@/lib/prisma")`. |
| **T-03** | **Waitlist-Promotion** — `src/features/rides/actions/leaveRide.ts:54-97` | Reihenfolgeabhängige, nicht-transaktionale Zustandsmaschine (E-13) mit zwei Notification-Seiteneffekten. Bricht still und wird von niemandem bemerkt: der Wartende erfährt nie, dass ein Platz frei wurde. | Fälle: (a) Creator versucht zu leaven → `"The creator cannot leave their own ride."` (`:39-42`); (b) Nutzer mit Status `PENDING` statt `APPROVED` → `"You are not part of this ride."` (`:50`); (c) leave mit leerer Warteliste → kein `update`, keine Notification; (d) leave mit 3 Wartenden → **genau** der mit dem ältesten `createdAt` wird auf `PENDING` gesetzt (`orderBy: { createdAt: "asc" }`, `:62`); (e) zwei Notifications gehen raus — `RIDE_WAITLIST_PROMOTED` an den Beförderten, `RIDE_JOIN_REQUEST` an den Creator (`:70-85`). Nach dem Transaktions-Fix (E-13) zusätzlich ein Nebenläufigkeitstest gegen eine echte Testcontainers-Postgres. |
| **T-04** | **Gruppen-Rollenlogik** — `src/features/community/lib/groupRoles.ts` + `kickGroupMember.ts`, `updateGroupMemberRole.ts:24`, `respondToGroupJoinRequest.ts:15`, `deleteGroup.ts:10`, `createAnnouncement.ts:20` | Drei-Rollen-Modell (`owner` / `moderator` / `member`) mit unterschiedlichen Rechten pro Action. `kickGroupMember` validiert seinen Input überhaupt nicht (E-12). Eine Rechteverwechslung erlaubt einem Moderator, den Owner zu entfernen. | Vollständige Rechte-Matrix als Test: 3 Rollen × 5 Actions = 15 Fälle plus die Sonderfälle "Owner kann nicht sich selbst degradieren" (`updateGroupMemberRole` Doc-Comment `:21-22` behauptet das explizit) und "Moderator kann Owner nicht kicken". Zusätzlich: `kickGroupMember({})` und `kickGroupMember({ groupId: 123 })` müssen sauber fehlschlagen statt Prisma zu erreichen. |
| **T-05** | **Backend Job-Lifecycle** — `festi-backend/src/jobs.ts` (21,4 % Coverage) und `src/worker/index.ts` (**0 %**, 227 Zeilen) | Die einzigen Module der Engine mit nahezu null Abdeckung, gleichzeitig die mit dem meisten Laufzeitzustand (Redis, BullMQ, kooperative Cancellation). `test/api.test.ts` testet die HTTP-Fassade davor bereits sehr gut (79,96 % / 95,23 % Funktionen), aber nicht die Verarbeitung dahinter. | `test/jobs.test.ts` gegen `ioredis-mock`: Zustandsübergänge PENDING→RUNNING→SUCCEEDED / →FAILED / →CANCELLED; Cancel während RUNNING setzt das Flag statt zu löschen (das API-Verhalten dazu ist in `api.test.ts:254` bereits getestet, die Job-Seite nicht); TTL-Ablauf gibt 404. `test/worker.test.ts`: ein Job end-to-end mit gemocktem GraphHopper, inkl. Fehlerpfad (Engine antwortet 500 → Job landet auf FAILED mit lesbarer Message). |
| **T-06** | **GPX-/FIT-Export im Frontend** — `src/features/rides/lib/gpx.ts` + `src/features/rides/actions/getRideGpx.ts:16` | Das Backend testet seinen eigenen Export gründlich (`test/gpx.test.ts` 100 % Statements auf `src/gpx.ts`, `test/fit.test.ts` 100 % auf `src/fit.ts`) — das Frontend hat aber **eine zweite, eigene** GPX-Implementierung in `src/features/rides/lib/gpx.ts`, völlig ungetestet. Zwei Implementierungen desselben Formats, die auseinanderlaufen können. | `gpx.test.ts`: XML-Wohlgeformtheit (gegen `DOMParser` parsen), korrekte Namespace-Deklaration, Elevation-Punkte in der richtigen Reihenfolge, Escaping von `&`/`<`/`"` in benutzergesteuerten Ride-Titeln (**XML-Injection**), leere Waypoint-Liste, Waypoints ohne Elevation. Plus: `getRideGpx` gibt für einen fremden, nicht-öffentlichen Ride `{ success: false }` zurück. **Zusätzlich empfehlenswert:** ein Contract-Test, der dieselbe Route durch beide Implementierungen schickt und die Ausgaben vergleicht — oder besser, die Frontend-Implementierung streichen und den Engine-Export verwenden. |
| **T-07** | **Zod-Schemata als Sicherheitsgrenze** — `src/features/rides/schemas/index.ts`, `users/schemas/index.ts`, `posts/schemas/index.ts`, `community/schemas/index.ts` | Die Schemata sind die einzige Laufzeitgrenze zwischen Client-Input und Prisma. Sie sind nirgends direkt getestet — nur implizit über die (nicht existierenden) Action-Tests. `rides/schemas/index.ts` hat 14 exportierte, nirgends verwendete Symbole (E-15): dort ist unklar, ob es Zukunftsplanung oder abgehängter Code ist. | Pro Schema eine Property-artige Suite: gültiger Minimalfall, jedes Pflichtfeld einzeln entfernt, Grenzwerte (`maxParticipantsSchema`, `MAX_RECURRENCE_WEEKS`), Typverwechslung (`"5"` statt `5`), und — wichtig — **Überschussfelder**: prüfen, ob `strict()` gesetzt ist oder ein Angreifer `{ …gültig, isAdmin: true }` durchschleusen kann. Nebeneffekt: der Test klärt, welche der 14 ungenutzten Exports noch gebraucht werden. |
| **T-08** | **Backend GraphHopper-Client** — `festi-backend/src/graphhopper.ts` (2,09 % Coverage, 214 Zeilen) | Die einzige externe Netzwerkgrenze der Engine. Alle Generierungspfade (`roundtrip.ts` 90,4 %, `pointToPoint.ts` 76,3 %) hängen daran, testen aber gegen einen Stub. Wie sich die Engine bei einem 503, einem Timeout oder einer malformed Response verhält, ist unbekannt. | `test/graphhopper.test.ts` mit `vi.stubGlobal('fetch', …)`: HTTP 400 mit GraphHopper-Fehlerobjekt → lesbare Domain-Exception; HTTP 503 → Retry-Verhalten; Timeout via `AbortSignal`; leeres `paths[]`-Array; JSON ohne `points`-Feld; nicht-JSON-Body. Deckt die 212 aktuell ungetesteten Zeilen weitgehend ab. |
| **T-09** | **R2-Upload-Pfade** — `src/lib/image.ts` (`validateImageUpload:24`), `src/lib/imageProcessing.ts` (`processImageToWebp:27`), plus die 4 Upload-Actions `uploadAvatar.ts:20`, `uploadRidePhoto.ts:19`, `uploadPostImage.ts:19`, `uploadGroupImage.ts:19` | Vier Actions nehmen `FormData` direkt vom Client entgegen. `validateImageUpload` ist der einzige Filter vor dem R2-Schreibzugriff (`MAX_IMAGE_BYTES = 5MB`, `MAX_IMAGE_DIMENSION = 2000`, `ALLOWED_IMAGE_TYPES`) und komplett ungetestet. Ein umgangener MIME-Check bedeutet beliebige Dateien im öffentlichen Bucket. | `image.test.ts`: Datei über 5 MB → abgelehnt; `image/svg+xml` → abgelehnt (SVG kann Script tragen und steht nicht in `ALLOWED_IMAGE_TYPES`); Datei mit `content-type: image/png` aber PNG-fremden Magic Bytes → abgelehnt (falls der Check das heute nicht tut, ist **das** der Befund); Bild über 2000 px; leere `FormData`; korrektes JPEG → akzeptiert. Dazu je Action ein Ownership-Test (fremde Ride-ID → kein R2-Write). |
| **T-10** | **Backend Test-Fixtures typprüfen** — `festi-backend/test/helpers.ts:56` und die 24 weiteren Fehler aus E-06 | Kein neuer Test, sondern die Voraussetzung dafür, dass die vorhandenen 241 Tests weiterhin das testen, was sie zu testen behaupten. Die Fixtures konstruieren `RouteMetadata`-Objekte, denen sechs Felder fehlen (`surfaceBreakdown`, `wayTypeBreakdown`, `pushingSectionsM`, `physicalEffortKj` u. a.) — die Assertions laufen also gegen ein veraltetes Datenmodell. | `tsconfig.test.json` anlegen (siehe E-06), die 25 Fehler beheben, `typecheck` erweitern. Danach als CI-Gate. Zusätzlich `@vitest/coverage-v8` als devDependency aufnehmen und in `vitest.config.ts` eine Schwelle setzen — z. B. `coverage: { thresholds: { statements: 75, branches: 80 } }` — damit die erreichten 75,4 % nicht unbemerkt zurückfallen. |

---

## Geprüft & in Ordnung

Damit nachvollziehbar ist, was *nicht* zu Findings geführt hat:

- **Biome-Konfiguration** (`biome.json`) — durchdacht: `vcs.useIgnoreFile: true` (respektiert `.gitignore`, hält generierten Prisma-Code raus), `recommended: true` plus `next`- und `react`-Domain, gezielte Overrides nur für `src/components/ui/**` (shadcn-Vendor-Code) statt globaler Abschaltungen. `npm run lint` läuft in 281 ms über 349 Dateien und ist grün.
- **`any` und `@ts-expect-error`: null Vorkommen** im gesamten Produktivcode. Bei ~14.000 Zeilen TypeScript ist das bemerkenswert. Die 8 `as unknown as` sind alle derselbe, dokumentierbare Prisma-`Json`-Fall.
- **TODO/FIXME/HACK: null Treffer** in allen drei Repos.
- **Frontend-Build ist grün** (`next build`, Turbopack, 15,1 s Compile + 15,0 s TypeScript, 32 Routes) und der Typecheck ist nach `prisma generate` + `next typegen` vollständig sauber — **0 Fehler**.
- **`RouteContext<'/route'>` ist korrektes Next 16** — gegen `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md:107-121` verifiziert, kein veraltetes `{ params }: { params: Promise<…> }`-Muster im Code. Die App folgt hier der neuen API, nicht dem Trainingsdaten-Muster.
- **Backend-Testsuite ist substanziell**, nicht dekorativ: 241 Tests über 21 Dateien mit echten Domänen-Assertions — `test/api.test.ts` deckt Quota (429), Backpressure (503), Idempotenz-Dedup, SSE-Terminalzustand, gzip, Prometheus-Metriken, API-Key via `x-api-key` **und** `Authorization: Bearer`, sowie `/healthz` als bewusst offener Endpunkt ab. `test/tsp.test.ts` erreicht 97,7 % auf `src/tsp.ts`, `test/validation.test.ts` 93,1 % auf `src/validation.ts`, `test/trafficStress.test.ts`, `test/geo.test.ts` und `test/gpx.test.ts` je 100 % Statements.
- **Backend `tsconfig.json` ist streng**: `strict: true` **plus** `noUncheckedIndexedAccess: true` **plus** `forceConsistentCasingInFileNames: true` — strenger als das Frontend, das nur `strict: true` setzt.
- **Server-Action-Ordnerstruktur**: alle 82 Action-Dateien tragen `"use server"` am Dateikopf (lückenlos verifiziert); `guards.ts` ist die einzige Datei außerhalb von `actions/` mit der Direktive (dazu E-04).
- **Feature-Slice-Architektur** (`src/features/<domain>/{actions,components,lib,schemas,utils,types}`) ist über 15 Features konsequent durchgehalten. Die Ordnernamen variieren nirgends.
- **Lockfiles sind konsistent**: `npm ci` läuft in beiden Repos ohne Konflikt durch, `npm ls --depth=0` meldet kein `invalid`/`missing`/`UNMET`. Der `file:`-Tarball trägt im Lockfile einen `integrity`-Hash (`sha512-ZhZ3QHavV6/LXEg/…`), Manipulation würde auffallen.
- **Keine Secrets und keine Build-Artefakte eingecheckt**: `git ls-files` findet in `festi` genau ein Binary (`dependencies/procycling-live-0.2.0.tgz`, dazu E-18) und keine `.env`; in `festi-backend` nur `.env.example`. `.gitignore` deckt in beiden Repos `.next/`, `node_modules/`, `dist/`, `.env*`, `.open-next/`, `.wrangler/`, `.dev.vars`, `cloudflare-env.d.ts` und `src/generated/prisma` sauber ab. Beide Repos sind git-clean.
- **`festi-backend/.gitignore`** schließt korrekt die großen Datenverzeichnisse aus (`data/osm/`, `data/graph-cache/`, `data/dem/`, `data/pois/`) — genau die Kandidaten, die ein Repo sonst auf mehrere GB aufblähen.
- **`festi-backend/package.json`** pinnt `"engines": { "node": ">=20" }` (das Frontend nicht — E-19).
- **`scripts/generate.mjs`** in `festi-routes` (221 Zeilen) ist sauber geschrieben: dokumentierter Usage-Header, alle Env-Variablen mit Defaults (`ENGINE_URL`, `API_KEY`, `CONCURRENCY`, `POLL_INTERVAL_MS`, `JOB_WAIT_TIMEOUT_MS`), `--dry-run`- und `--force`-Flags, Concurrency bewusst auf 3 begrenzt mit Begründungskommentar (*"Engine-Quota: max. 3 offene Jobs/User"*), Content-Hashing via `createHash` für Idempotenz.
- **`registerUser.ts`** ist insgesamt vorbildlich: ein Einstiegspunkt, `safeParse` zuerst, Enumeration-Schutz bewusst begründet (`:36-38`), Fehler als Daten statt als Exception (`:20-24`, `:70-75`) mit dem korrekten Argument, dass Next.js geworfene Fehler in Production redigiert.

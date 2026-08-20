# 03 – Was ist behoben, was ist offen

> Stand nach der Fix-Runde auf `claude/festi-e2e-audit-n10238`, ergänzt um den
> Neon-Umbau der Datenbankschicht auf `claude/neon-db-implementation-p3jiia`.
> Gesamtbestand: **156 Funde** (F 29 · U 16 · A 19 · B 30 · C 26 · D 25 · E 21 · R 12 · L 8).

## Kurzfassung

| | Anzahl |
| --- | ---: |
| **Behoben** | ~76 |
| **Zurückgezogen** (Fehlmessung / Fehlalarm) | 5 |
| **Offen** | ~75 |

Die Fix-Runde hat sich auf **Sicherheit, Datenkonsistenz und die konkreten
UI-Defekte** konzentriert. Drei ganze Review-Bereiche sind weitgehend
unangetastet: **C** (Frontend-Architektur), **D** (Design-System-Hygiene)
und **E** (Code-Qualität, Tests, CI).

---

## Zurückgezogen

| ID | Warum |
| --- | --- |
| **F-01** | „Feed 21,5 s" — Messartefakt. Mein Verkehr lief über einen US-Egress (`colo=IAD`), der Worker also fern der europäischen Datenbank. Siehe `01-findings.md`. |
| **F-29** | Zeitangabe zur Kommentar-Verzögerung, gleiche Ursache. |
| **U-09 / U-10 / U-11** | Checkboxen, Switch und Ride-Kartenlink haben korrekte Namen — der Chromium-AX-Baum belegt es. Mein Scanner prüfte `label[for]` nicht. |
| *U-12* | Abgeschwächt: Platzhalter sind schwache Label, aber kein Verstoß. |

---

## Behoben

**Sicherheit (15 von 19)** — A-01 gruppenübergreifende IDOR · A-02 Gruppen-Rides
abgeschirmt · A-03 öffentliche Fahrten opt-in · A-04/A-05/A-11/A-13 Rate-Limits ·
A-07 `proxy.ts` · A-08 `cf-connecting-ip` · A-09 Security-Header ·
A-10 Port-Binding · A-12 HTML-Escaping in Mails · A-14 cookieCache ·
A-15 Dev-Origins · A-16 Bildgröße durchgesetzt.

**Daten (9 von 30)** — B-01 Neon-Serverless-Treiber statt `pg`-TCP-Pool ·
B-02 Waitlist-Transaktion · B-03 Race Conditions · B-04 `take`-Limits ·
B-08 20 Composite-Indizes · B-12 fehlgeschlagene Generierung sichtbar ·
B-13 Fetch-Timeouts · B-19 R2-Aufräumen · B-21 `@@unique([postId, position])`.

**Funktion und UI** — F-02/03/04/06/09/10/11/12/13/15/20/22/23/25 · F-28 `.env.example` ·
U-01 bis U-08 · U-13 Kontraste · U-16 Rottöne teilweise.

**Engine (5 von 12)** — R-01 Höhenmeter-Artefakte · R-02 Distanz-Scoring ·
R-03 Lokalisierung · R-04 Coverage · R-11 Port-Binding. Tests 241 → 250.

### Zweite Runde: CI, Tests, Grundlast

**CI (E-02, E-03)** — GitHub-Actions-Workflow in allen drei Repos.
`festi`: Biome, `typecheck` (neues Script, `next typegen` vorgeschaltet), Tests,
Build; dazu ein zweiter Job, der die Migrationen gegen ein echtes Postgres 16
anwendet und mit `prisma migrate diff --exit-code` gegen `schema.prisma` prüft,
damit eine handgeschriebene Migration nicht vom Schema wegdriften kann.
`festi-backend`: Typecheck, 250 Tests, `docker compose config`.
`festi-routes`: `node --check` plus ein Dry-Run des Generators, der bei
`invalid:` fehlschlägt. Der Migrations-Job wurde lokal gegen ein echtes
Postgres verifiziert, inklusive Negativtest (absichtliche Drift → Exit 2);
der Routes-Guard, indem eine Idee absichtlich kaputtgemacht wurde.

**Tests (E-01, teilweise)** — Vitest im Frontend, 28 Tests auf genau der Logik,
die diese Runde angefasst hat: `visibility.test.ts` (10) — Gruppen-Rides bleiben
in der Gruppe, eine leere Mitgliedsliste weitet sich nie auf „irgendeine Gruppe",
offene Beitrittsanfragen zählen nicht als Mitgliedschaft; `image.test.ts` (9) —
`MAX_IMAGE_DIMENSION` greift wirklich, inklusive einer 30000 × 30000-Zip-Bombe
in 33 Byte; `rateLimit.test.ts` (9) — die Grenze zwischen letztem erlaubtem und
erstem blockiertem Aufruf, ehrliches `retryAfterSec`, und Fail-Open, wenn der
Limiter selbst ausfällt.

**Grundlast (C-02, teilweise)** — Zwei Unread-Zähler zu einer Server-Action
zusammengelegt, `follow-connections` nur noch bei geöffnetem Sheet. Idle-Tab:
**16 → 6 Requests/Minute**. Dabei stellte sich Punkt 1 des ursprünglichen Fixes
als falsch heraus — React Query pausiert Intervall-Refetches im Hintergrund-Tab
bereits selbst; korrigiert in `review/C-frontend-architektur.md`.

**Sichtbares (D-10, U-07)** — Scrollbars sind wieder dunkel (`hsl()` um
OKLCH-Variablen entfernt), und hinter dem Landing-Page-Text liegt ein Scrim,
sodass keine Städtenamen mehr durch den Fließtext laufen.

**Toter Code (E-15, E-14)** — 34 Dateien, 3507 Zeilen gelöscht: vier
app-eigene Module ohne Importeur und 30 nie benutzte shadcn-Komponenten
(nachgezählt, nicht der Liste geglaubt — es waren 30, nicht 31). Sie hielten
sieben npm-Pakete am Leben, jedes mit genau einer Import-Stelle in einer toten
Datei; `dependencies` sinkt von 37 auf 30, `shadcn` wandert nach
`devDependencies`.

**Farb-Tokens (D-08)** — 175 Ersetzungen in 46 Dateien; keine
`(text|bg|border|ring|shadow)-red-*` mehr in `src/`. Neuer Token
`--primary-hover`, weil alle 24 `red-400`-Stellen Hover-Partner waren und ein
gemeinsamer Token das Hover-Feedback gelöscht hätte. Fünf vermeintliche
Markenfarben stellten sich als Fehlermeldungen heraus und liegen jetzt auf
`--destructive`. Wiederholungsschutz: `scripts/check-colors.mjs` als eigener
CI-Schritt, negativ getestet.

**Chat-Streams (C-02, Rest)** — `/api/chat/group/[groupId]` und
`/api/chat/direct/[partnerId]` ersetzen das 2-s-Polling. Pro offenem Thread:
30 Requests/min → 0, DB-Statements ~120/min → 30 und nach einer Minute Stille
7,5. Gegen ein echtes Postgres gemessen, nicht geschätzt.

**Community-Pfade (C-03)** — `features/community/lib/routes.ts` baut alle 15
`revalidatePath`-Pfade, damit der behobene `/groups/…`-Fehler nicht wiederkommt.

**Routen-Repo (3 von 8 + Datenfehler)** — L-04 Schema-Validierung ·
L-05 Quota-Header · L-06 `.gitignore`. Dabei aufgedeckt: 14 Constraint-Werte
in 12 Ideen erreichten die Engine nie.

---

## Offen — nach Dringlichkeit

### 1. Keine Tests, keine CI · **das größte Loch**

| ID | |
| --- | --- |
| E-01 | Frontend hat **null** automatisierte Tests — bei 82 Server Actions inklusive aller Auth- und Ownership-Logik. Genau die Logik, die ich gerade angefasst habe (Gruppen-Sichtbarkeit, Kapazität, Rate-Limits), ist ungetestet. |
| E-02 | **Keine CI in allen drei Repos.** Nichts hindert daran, `tsc`-Fehler zu mergen. |
| E-03 | Kein `typecheck`-Script; `tsc --noEmit` braucht zwei ungescriptete Vorschritte. |
| E-06 | Engine: `test/` ist vom Typecheck ausgeschlossen, dort liegen 25 echte Typfehler. |
| E-07 | Engine: Worker (0 %), GraphHopper-Client (2 %), Job-Queue (21 %) praktisch ungetestet. |

**Das würde ich zuerst angehen.** Ohne CI ist jede weitere Änderung ein Blindflug.

### 2. Frontend-Architektur (22 von 26 offen)

| ID | |
| --- | --- |
| C-02 | ~16 Requests/Minute pro offenem Tab, allein aus dem Dashboard-Layout (zwei 10-s-Poller, 30-s-Follower-Liste, 30-s-Presence). Standortunabhängig — das ist echte Grundlast. |
| C-01 / C-06 | Listen filtern und paginieren im Browser statt in der Datenbank; die Seiten rendern eine leere Shell und laden per Server-Action-POST nach. |
| C-04 | `open-next.config.ts` ohne `incrementalCache`, während der Code auf `revalidate: 3600/1800` baut — die Pro-Seiten scrapen vermutlich bei jedem Request neu. *(zu verifizieren)* |
| C-07 / E-04 / E-05 | `guards.ts` trägt `"use server"` → alle fünf Auth-Guards sind öffentliche Action-Endpunkte. |
| C-08 | `QueryClient` ohne `defaultOptions`: `staleTime: 0` überall. |
| C-10 | Fehlende Query-Invalidierungen nach Follow, Ride-Erstellung, Route-Speichern. |
| C-11 | Zwei konkurrierende `useSession`-Implementierungen. |
| C-12 | Kein `next/dynamic`; recharts landet statisch im Bundle. |
| C-05 Rest | `global-error.tsx` und ein Root-`loading.tsx` fehlen weiterhin. |
| C-14 – C-26 | Session-Mehrfachladen, 31 ungenutzte shadcn-Komponenten, Filterzustand nicht in der URL, `<img>` statt `next/image`, Partikel-Animation ohne Reduced-Motion, … |

### 3. Design-System und A11y-Reste

| ID | |
| --- | --- |
| D-08 | **291 hartkodierte Farbklassen** in 61 Dateien am Token-System vorbei (Ausgangswert 347 — die Tokens habe ich gefixt, die Call-Sites nicht). |
| D-01 / D-11 / C-23 | Kein Theming: `.dark` ist wertgleich zu `:root`, kein Provider, 80 `dark:`-Utilities wirkungslos, Toasts folgen dem OS-Theme. |
| D-10 | Scrollbar-Styling funktionslos — `hsl(var(--muted))` um OKLCH-Werte ist ungültiges CSS. Drei Zeilen. |
| D-14 | `autoComplete` nur in 1 von 5 Formularen. |
| D-15 | `FieldError` nicht per `aria-describedby` verknüpft. |
| D-18 / C-21 | Partikel-Canvas ohne `aria-hidden` und ohne Reduced-Motion (WCAG 2.2.2, Level A). |
| D-19 | Sidebar ohne `<nav>`-Landmark und ohne `aria-current`. |
| D-22 | Autocomplete ohne Combobox-Semantik und Tastaturnavigation. |
| D-23 / D-24 / D-25 | Eingabefelder ohne Namen, Karten/Diagramme ohne Textalternative, Sprach-Mix. |
| U-07 | Partikel-Labels laufen durch den Fließtext der Landing Page. |
| U-14 | Events: Quellen-Link liegt in der Klickfläche des Event-Buttons. |
| U-15 | `line-clamp` schneidet ohne Hinweis ab. |

### 4. Daten und Backend (21 von 30 offen)

| ID | |
| --- | --- |
| B-05 / B-07 | `include` statt `select` in Listen-Queries; volle Routen-Geometrie in jeder Zeile. |
| B-06 | Feed-Cursor vergleicht IDs über zwei Tabellen hinweg. |
| B-09 / B-10 / B-11 | Uneinheitliche Rückgabeformate; Read-Actions werfen für erwartete Zustände; rohe Upstream-Fehlertexte am Client. |
| B-20 | Notifications zeigen auf gelöschte Entities (polymorph, kein FK). |
| B-22 | `ProTelemetryFrame` wächst unbegrenzt, ohne Retention. |
| B-26 | `syncCalendarEvents` ist eine offene Server Action mit globalem Lock. |
| B-27 | Analytics: `distinct` im Speicher, teure Counts. |
| B-24 / B-25 / B-28 / B-29 / B-30 | Statuscodes in `api/**`, kein 405 in der Engine, Idempotency-TTL, Job-Dauer im Fehlerpfad, Wetter zur falschen Zeit. |

### 5. Engine-Reste (7 von 12 offen)

R-05 Quota-Leck bei Fehlern · R-06 keine Job-Ownership (IDOR mit dem API-Key) ·
R-07 Redis ohne Retry-Deckel · R-08 `/result` schleppt `gpx`+`fitBase64` mit ·
R-09 `test/` ohne Typecheck · R-10 ungetestete Kernmodule · R-12 `distanceAlongRouteM`.

### 6. Konventionen und Hygiene (E, fast vollständig offen)

E-08 drei Rückgabekonventionen, 16 duplizierte `Result`-Typen ·
E-09 neun kebab-case-Ausreißer · E-10 drei Sammel-Action-Dateien ·
E-11 acht `input: unknown` · E-12 `kickGroupMember` ohne Zod *(Autorisierung ist
gefixt, die Validierung fehlt weiter)* · E-14 ungenutzte Dependencies ·
E-15 31 tote UI-Komponenten (3 418 LOC) · E-16 stale `eslint-disable` ·
E-17 `console.log` leakt Auth-Fehler · E-18 eingecheckter 240-KB-Tarball ·
E-19 kein Node-Pinning · E-21 Barrel-Exports uneinheitlich.

---

## Bewusst nicht gemacht

| | Warum |
| --- | --- |
| **Light-Theme** (D-01, C-23) | Eine Designentscheidung, keine Fehlerbehebung. Die Kontraste im vorhandenen dunklen Theme sind gefixt. |
| **291 Farb-Call-Sites** (D-08) | Mechanisch, aber 61 Dateien mit Regressionsrisiko in Gradienten. Gehört in einen eigenen, reviewbaren PR. |
| **31 tote UI-Komponenten löschen** (E-15) | Dito — eigener PR, damit der Diff lesbar bleibt. |

## Vorschlag für die Reihenfolge

1. ~~**CI aufsetzen** (E-02, E-03)~~ — erledigt, in allen drei Repos.
2. ~~**Tests für die gerade geänderte Sicherheitslogik** (E-01)~~ — erledigt, 28 Tests.
   Die restlichen 82 Server Actions bleiben ungetestet.
3. ~~**C-02 Polling-Grundlast**~~ — 16 → 6 Req/min. Offen bleibt der Chat: 2-s-Polling
   in `groupChat` und `directChatThread` (+30/min je offenem Thread). Das SSE-Muster
   dafür liegt fertig in `src/app/api/pro/live/[race]/[year]/[stage]/route.ts`.
4. ~~**D-10 Scrollbar** und **U-07 Partikel-Lesbarkeit**~~ — erledigt.
5. ~~Die großen mechanischen Blöcke (D-08, E-15)~~ — erledigt, jeweils als eigener Commit
   auf diesem Branch statt als eigener PR, damit alles an einer Stelle reviewbar bleibt.
   C-03 war bereits in `9b32f02` behoben; nachgezogen ist der Wiederholungsschutz.

## Zusammenführung mit `audit/fixes-2026-08`

Parallel lief ein zweiter Audit-Branch (39 Commits, 83 Dateien) vom selben
`main`. Beide sind jetzt zusammengeführt: 334 Dateien mergten automatisch,
**27 Konflikte** habe ich einzeln nach Sachlage entschieden, die Farbkonflikte
nach Messung.

**Von dort übernommen, weil besser:** `getBanInfo` verlangt jetzt das Passwort
und prüft es (mein Rate-Limit war nur eine Bremse gegen Enumeration; es bleibt
zusätzlich, weil ein Passwort-Hash ohne Limit ein Rate-Oracle wäre) ·
Rate-Limits auch auf Chat, Posts und allen vier Upload-Pfaden ·
**Pruning der Rate-Limit-Tabelle** — ich hatte `expiresAt` indiziert und dann nie
gelöscht · Session-Dedup per React `cache` · QueryClient-Defaults ·
Cursor-Pagination für `getRides` · `returnTo` nach Login · Zeitzonen-korrekte
Ride-Daten · FAILED/CANCELLED-Zustände · `metadataBase` · DEM-Fallback ·
Upload-Fortschritt · Retry-Buttons · DDG-§5-Impressum · gleichwertiges
Cookie-Ablehnen.

**Von hier behalten, weil besser:** der Sichtbarkeitsfilter in `getFeed` (dort
war das Leck offen geblieben) · `isPublic` als Opt-in · Chat-SSE, gemeinsamer
Badge-Endpunkt, `enabled: open` in `profileFollowStats` · Tests, CI, tote
Dateien, Farb-Guard.

**Zusammengeführt, weil jede Seite eine Hälfte hatte:** beide
Registrierungs-Limits (gegen die Datenbank nachgewiesen: nach sieben Versuchen
stand der IP-Eimer auf 7, jeder Adress-Eimer auf 1 — das Adress-Limit allein
ist durch Variieren der Adresse umgangen) · `routeGeneratorMap` (ihre Toleranz
für Poll-Aussetzer plus meine Behandlung eines FAILED-Jobs in einer
erfolgreichen Antwort) · `routeEngine` (ihr Ergebnistyp, mein Timeout) · ein
Sichtbarkeits-Helper mit ihrer Relation-Query hinter meiner getesteten API.

**Drei Dinge hatte der Auto-Merge still zerstört**, gefunden von Typecheck und
Tests: zwei `AND`-Keys im selben Objekt in `getRides` (der zweite hätte den
Sichtbarkeitsfilter verworfen), `escapeHtml` doppelt definiert, und
`ui/progress`, das ich als ungenutzt gelöscht hatte und ihre
Fortschrittsanzeige braucht.

Geprüft: Lint, Farb-Guard, Typecheck, 29 Tests, Build, `prisma migrate diff`
ohne Drift gegen echtes Postgres 16 — und danach end-to-end auf dieser
Datenbank.

## Was jetzt eine Entscheidung von dir braucht

| Thema | Frage |
| --- | --- |
| **`text-white` auf Rot** | Weiß auf `--primary` misst **4,06:1** und verfehlt AA; `--primary-foreground` misst **4,79:1**. Die `Button`-Default-Variante macht es schon richtig. Umstellen heißt: jeder rote CTA bekommt fast schwarze statt weißer Schrift. Sichtbar genug, dass ich das nicht allein entscheide. |
| **Gradient-CTAs** (D-03, 56 Klassen) | Als `cta`-Variante in `buttonVariants` aufnehmen? Dann greift auch der Farb-Guard dafür. |
| **Light-Theme** (D-01, C-23) | Unverändert offen — Designentscheidung. |
| **Neon-Endpunkte** (B-01) | Der Umbau ist gegen einen lokalen Postgres und im Build verifiziert, gegen eine echte Neon-Instanz noch nicht. `DATABASE_URL` muss auf den `-pooler`-Endpunkt zeigen, `DIRECT_URL` auf den direkten — beides als Wrangler-Secret. |

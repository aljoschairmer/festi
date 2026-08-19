# 00 – Überblick: Architektur, Datenfluss, Routen & Flows

> Stand: 2026-08-19 · Audit-Branch `claude/festi-e2e-audit-n10238`
> Geprüfte Umgebung: Produktion `https://festicycling.com` (Cloudflare Workers)
> und die Live-Route-Engine `https://route.aljoschairmer.com`.

---

## 1. Die drei Repos — was sie wirklich sind

| Repo | Rolle | Kurzcharakter |
| --- | --- | --- |
| `festi` | **Produktiv-Anwendung** (Frontend *und* Backend) | Next.js 16 App Router, React 19, Prisma 7 → PostgreSQL, better-auth, Cloudflare Workers via OpenNext. Enthält die gesamte Geschäftslogik als Server Actions. |
| `festi-backend` | **Festi Route Engine** — eigenständiger Microservice | Node/TS, REST `/v1`, BullMQ + Redis, GraphHopper als Routing-Engine. Kennt *keine* Festi-User, *keine* Auth-Konzepte, *keine* Datenbank. Reine Routen-Berechnung mit asynchronem Job-Modell. |
| `festi-routes` | **Datenrepo** (kein Code-Produkt) | 569 agent-kuratierte Fahrrad-Routen-Ideen (JSON) + die daraus über die Engine generierten GPX-Dateien und Metadaten, verteilt auf 70 Regionen. Plus ein Generator-Skript. |

> **Wichtige Korrektur zur Aufgabenstellung.** Die Aufgabe spricht von
> `<repo-backend>` als „Backend/API" der Anwendung und von `<repo-routes>` als
> Repo mit „fertig implementierten Routes", die man gegen das Backend
> vergleichen soll. Das trifft die Realität nicht:
> * Das anwendungsseitige Backend steckt **im `festi`-Repo selbst** (Server
>   Actions + Prisma), nicht in `festi-backend`.
> * `festi-routes` enthält **Fahrrad-Routen (GPX-Strecken)**, keine
>   HTTP-Routes/Endpunkte. Ein Endpunkt-Diff „festi-routes vs. Backend" ist
>   deshalb gegenstandslos.
>
> Der inhaltlich sinnvolle Vergleich — welcher kuratierte Routen-Bestand
> existiert und was davon in der App ankommt — steht in
> [`00-routes-diff.md`](./00-routes-diff.md).

---

## 2. Architektur & Datenfluss

```
                         ┌─────────────────────────────────────────┐
   Browser               │  festi  (Cloudflare Worker, OpenNext)   │
   ───────               │                                         │
   RSC-Payload  ◄────────┤  src/app/**          Server Components  │
   Server-Action-POST ──►┤  src/features/*/actions/*  "use server" │
   (sequentiell!)        │  src/features/auth/guards.ts            │
                         │  src/lib/auth.ts (better-auth + admin)  │
                         └───┬─────────┬──────────┬────────────┬───┘
                             │         │          │            │
                    Prisma 7 │  R2 (S3)│  Resend  │  externe   │
                     per-Req │  Bilder │  E-Mail  │  Dienste   │
                             ▼         ▼          ▼            ▼
                       PostgreSQL   Cloudflare  SMTP    MapTiler (Karten/Geocoding)
                                        R2               BRouter  (Routenberechnung)
                                                         rad-net  (Event-Kalender)
                                                         RSS      (News)
                                                         ASO/Tissot (Pro-Racing-Live)
                                                              │
                                                              │ HTTP/JSON  /v1
                                                              ▼
                         ┌──────────────────────────────────────────────┐
                         │  festi-backend — Festi Route Engine          │
                         │                                              │
                         │   api (REST) ──BullMQ──► worker ×N           │
                         │        │                    │                │
                         │        └──► redis ◄─────────┘                │
                         │           (Queue + Status + Ergebnis, TTL)   │
                         │                            │                 │
                         │                            ▼                 │
                         │                   GraphHopper (Graph DE/AT/CH)│
                         └──────────────────────────────────────────────┘
```

### Datenfluss im Detail

1. **Seitenaufruf** → Server Component rendert; `dashboard/layout.tsx` ruft
   `requireAuth()` und leitet ohne Session auf `/login` um.
2. **Lesen von Daten** passiert überwiegend *nicht* im Server Component,
   sondern in Client-Komponenten über **TanStack Query, die Server Actions als
   Query-Funktion aufruft** (`getFeed`, `getRiders`, `getRides`, `getGroups`,
   `getNews`, `getCalendarEvents`, …).
   → Konsequenz: jede Seite feuert nach dem HTML noch 5–8 Server-Action-POSTs.
     Next.js **serialisiert** diese POSTs (siehe Finding F-01 in `01-findings.md`).
3. **Schreiben** ebenfalls über Server Actions, geschützt durch
   `getCurrentUser()` / `getCurrentAdmin()` aus `src/features/auth/guards.ts`.
4. **Prisma** wird *pro Request neu instanziiert* (`src/lib/prisma.ts`,
   `maxUses: 1`) — bewusst, weil Sockets auf Workers nicht über Requests
   hinweg leben. Preis: jeder Server-Action-Call zahlt einen frischen
   PG-Connect (≈ 2,7–3,8 s gemessen, siehe unten).
5. **Bilder**: Browser skaliert/encodiert nach WebP (`src/lib/imageProcessing.ts`),
   Server validiert (`src/lib/image.ts`), Ablage in R2 (`src/lib/r2.ts`).
6. **Routen-Generierung** („Generate a route for me"): Frontend → `generateRoute`
   → `POST {ROUTE_ENGINE_URL}/v1/jobs` → Polling über `getRouteGenerationStatus`
   → Ergebnis wird beim Speichern der Fahrt **server-seitig neu geholt**
   (`createRide`), nicht dem Client geglaubt. Gut gelöst.
7. **Klassische Routenplanung** (Karte, manuelle Wegpunkte) läuft weiterhin
   über **BRouter**, nicht über die Route Engine — zwei parallele
   Routing-Pfade koexistieren.

---

## 3. Alle erreichbaren Routen / Seiten

### 3.1 Öffentlich (ohne Session)

| Pfad | Datei | Status live | Bemerkung |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | 200 | Landing Page, `ParticleBackground`, `TypedHeadline`, Cookie-Consent |
| `/login` | `src/app/login/page.tsx` | 200 | **kein `<h1>`** |
| `/register` | `src/app/register/page.tsx` | 200 | **kein `<h1>`** |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | 200 | **kein `<h1>`** |
| `/reset-password` | `src/app/reset-password/page.tsx` | 200 | **kein `<h1>`**; ohne Token korrekte „Invalid link"-Ansicht |
| `/imprint` | `src/app/imprint/page.tsx` | 200 | |
| `/privacy` | `src/app/privacy/page.tsx` | 200 | |
| `/terms` | `src/app/terms/page.tsx` | 200 | |
| `/rides/[rideId]` | `src/app/rides/[rideId]/page.tsx` | 200 | **öffentliche Fahrten-Seite** — siehe Security-Review A-03 |
| *beliebig unbekannt* | — | 404 | **Next.js-Default-404**, nicht gebrandet (kein `not-found.tsx`) |

### 3.2 Geschützt (`/dashboard/**`, Guard im Layout)

| Pfad | Datei | Zweck |
| --- | --- | --- |
| `/dashboard` | `dashboard/page.tsx` | „For You"-Feed (Posts + Rides interleaved, Cursor-Pagination, Discover-Modus) |
| `/dashboard/community` | `community/page.tsx` | Rider-Netzwerk + Rider-Gruppen |
| `/dashboard/community/u/[id]` | `community/u/[id]/page.tsx` | Fremdprofil, Follow/Unfollow |
| `/dashboard/community/g/[id]` | `community/g/[id]/page.tsx` | Gruppendetail: Mitglieder, Chat, Announcements, Routen-Bibliothek, Gruppen-Rides |
| `/dashboard/community-rides` | `community-rides/page.tsx` | Rides-Liste mit Suche, Pace-/Difficulty-Filter, Umkreissuche, „Include past rides" |
| `/dashboard/community-rides/new` | `community-rides/new/page.tsx` | 3-Schritt-Wizard (Start → Route → Details), MapLibre-Planer |
| `/dashboard/community-rides/generate` | `community-rides/generate/page.tsx` | Routen-Generator gegen die Route Engine |
| `/dashboard/community-rides/[rideId]` | `community-rides/[rideId]/page.tsx` | Ride-Detail: Teilnehmer, Join/Approve, Fotos, GPX, Attendance |
| `/dashboard/events` | `events/page.tsx` | rad-net-Breitensport-Kalender (Liste + Karte) |
| `/dashboard/news` | `news/page.tsx` | RSS-Aggregation Radsport-News |
| `/dashboard/notifications` | `notifications/page.tsx` | Benachrichtigungs-Historie mit Pagination |
| `/dashboard/profile` | `profile/page.tsx` | Eigenes Profil bearbeiten, Avatar-Upload |
| `/dashboard/settings` | `settings/page.tsx` | Konto-Einstellungen |
| `/dashboard/pro` | `pro/page.tsx` | Pro-Racing-Übersicht |
| `/dashboard/pro/[race]/[year]` | `pro/[race]/[year]/page.tsx` | Rennen-Detail |
| `/dashboard/pro/[race]/[year]/stage/[stage]` | `.../stage/[stage]/page.tsx` | Etappen-Detail inkl. Live-Telemetrie |
| `/dashboard/admin/analytics` | `admin/analytics/page.tsx` | Admin: Aktivitäts-Analytics · **verifiziert: leitet Nicht-Admins auf `/dashboard` um** |
| `/dashboard/admin/users` | `admin/users/page.tsx` | Admin: Nutzerverwaltung · **verifiziert: leitet Nicht-Admins um** |

### 3.3 HTTP-Endpunkte (`src/app/api/**`)

| Pfad | Methode | Zweck |
| --- | --- | --- |
| `/api/auth/[...all]` | * | better-auth-Handler (Sign-in/-up, Verify, Reset, Admin-Plugin) |
| `/api/pro/capture` | GET | Telemetrie-Snapshot; wird vom Wrangler-Cron `* 8-17 * * *` getriggert |
| `/api/pro/live/[race]/[year]/[stage]` | GET | **SSE**-Stream mit Live-Etappendaten (Heartbeat 20 s, Refresh 30 s) |
| `/api/pro/reports/[reportId]` | GET | Authentifizierter Proxy für Tissot-Reports (PDF/Bild) |

> Es gibt **kein** `src/middleware.ts` und — in Next.js 16 die korrekte
> Bezeichnung — auch **kein** `src/proxy.ts`. Der einzige Routen-Schutz ist
> `requireAuth()` im Dashboard-Layout.

### 3.4 Route-Engine-Endpunkte (`festi-backend`, live verifiziert)

| Methode | Pfad | Live-Ergebnis |
| --- | --- | --- |
| `GET` | `/healthz` | 200, **ohne API-Key erreichbar** (by design) |
| `GET` | `/v1/coverage` | 401 ohne Key · 200 mit Key: `germany, austria, switzerland`, BBox `[5.86, 45.81, 25.20, 60.44]` |
| `POST` | `/v1/jobs` | 202 + `jobId` |
| `GET` | `/v1/jobs/{id}` | 200 Statusobjekt · 404 `unknown or expired job` |
| `GET` | `/v1/jobs/{id}/events` | SSE-Stream |
| `GET` | `/v1/jobs/{id}/result` | 200 GeoJSON + Metadaten |
| `GET` | `/v1/jobs/{id}/result/{i}.gpx` | 200, `application/gpx+xml`, ~46 KB |
| `GET` | `/v1/jobs/{id}/result/{i}.fit` | FIT-Course-Download |
| `DELETE` | `/v1/jobs/{id}` | Job abbrechen |
| `GET` | `/metrics` | 401 ohne Key · Prometheus-Text mit Key |

Live-Metriken zum Auditzeitpunkt: 69 Jobs gesamt, 53 erfolgreich, **16
fehlgeschlagen (23 %)**, 0 offen, Engine erreichbar.

---

## 4. UI-Flows (Soll-Liste für den Funktionstest)

**Auth** — Registrierung (mit E-Mail-Verifikation) · Login · Logout ·
Session-Persistenz · Passwort vergessen/zurücksetzen · Ban-Hinweis.

**Profil** — Anzeigen · Bearbeiten (Bio, Ort, Rad, Skill-Level, Riding
Styles, Jahre) · Avatar-Upload · Fremdprofil ansehen · Follow/Unfollow ·
Presence-Heartbeat.

**Social Feed** — Post erstellen (Markdown-Editor + bis zu 3 Bilder) ·
Vorschau · Liken · Kommentieren · Kommentar löschen · Post löschen ·
Feed-Tabs *All/Posts/Rides* · Discover-Modus · Cursor-Pagination
(„Load more").

**Gruppen** — Erstellen · Suchen · Beitreten (ggf. mit Freigabe) ·
Join-Request zurückziehen · Beitrittsanfragen genehmigen/ablehnen ·
Moderatoren ernennen · Mitglieder entfernen · Announcements erstellen/löschen ·
Gruppen-Chat · Gruppen-Routen-Bibliothek · Gruppe verlassen/löschen ·
Gruppenbild hochladen.

**Community Rides** — Liste mit Suche/Pace-/Difficulty-Filter/Umkreis
(10–100 km)/„Include past rides" · Ride anlegen (3-Schritt-Wizard,
MapLibre + BRouter) · Routen-Generator (Route Engine) · Wöchentliche
Serien (bis 12 Instanzen) · Teilnahme anfragen · genehmigen/ablehnen ·
Anfrage zurückziehen · Warteliste · Ride verlassen · Ride bearbeiten ·
Ride absagen (Serie oder Einzeltermin) · Fotos hoch-/runterladen ·
GPX-Export · Attendance markieren · Route in Bibliothek speichern ·
Ride in Gruppe posten · Öffentliche Ride-Seite ein-/ausschalten.

**Weitere** — Direktnachrichten (nur bei gegenseitigem Follow) ·
Benachrichtigungen (Sheet + Vollseite) · Events-Kalender (Liste + Karte,
rad-net-Sync) · News-Feed · Pro Racing (Rennen, Etappen, Live-SSE,
Reports) · Admin-Analytics · Admin-Nutzerverwaltung (Rolle, Ban,
Sessions widerrufen) · Cookie-Consent · Imprint/Privacy/Terms.

---

## 5. Lokaler Start — dokumentierte Ergebnisse

| Was | Befehl | Ergebnis |
| --- | --- | --- |
| Frontend | `npx next dev --port 3111` | **Startet: `✓ Ready in 406ms`, Next.js 16.2.10 (Turbopack).** Warnung: `Proxy environment variables detected. We'll use your proxy for fetch requests.` |
| Frontend, funktionsfähig? | — | **Nein.** Es existiert keine `.env` / `.env.local` im Repo (per `.gitignore` bewusst). Ohne `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_MAPTILER_API_KEY`, R2- und Resend-Keys bleibt jede datenführende Seite tot. Es gibt auch **keine `.env.example`** im `festi`-Repo — die Variablenliste steht nur in der README. |
| Datenbank | `docker compose up -d` | Nicht ausgeführt: das Compose-File `docker-compose.yaml` referenziert das Repo-lokale Postgres; ohne Migration/Seed-Lauf gegen eine leere DB wäre der Test wertlos gewesen. Der Audit wurde deshalb **gegen die Produktion** gefahren (Testaccount), was für Phase 1/2 ohnehin aussagekräftiger ist. |
| Route Engine lokal | `docker compose up` in `festi-backend` | Nicht ausgeführt — die Engine braucht einen importierten GraphHopper-Graph für DE/AT/CH (mehrere GB OSM-Daten). **Stattdessen wurde die Live-Engine `https://route.aljoschairmer.com` direkt gegen ihren OpenAPI-Vertrag getestet** (Ergebnisse s. o. und in `01-findings.md`). |

**Fazit Startfehler:** Keine Build-/Startfehler. Die Hürde ist reine
Konfiguration — und dass eine `.env.example` fehlt, ist der eigentliche
Onboarding-Defekt (Finding F-30).

---

## 6. Gemessene Basis-Performance (Produktion, 1440 px, Testaccount)

| Messung | Wert |
| --- | --- |
| `DOMContentLoaded` `/dashboard` | 1,9 – 3,8 s |
| Server-Action-POSTs pro Dashboard-Seitenaufruf | **5 – 8** |
| Dauer je Server Action | 2,7 – 4,7 s |
| Ausführung | **strikt seriell** — Start jeder Action == Ende der vorherigen (9957→9958 ms, 12831→12831 ms) |
| **Feed inhaltlich sichtbar** | **21,5 s nach Navigationsstart** |

Vier Actions feuern auf *jeder* Dashboard-Seite (Notification-Count,
Direktnachrichten, Follower-Sheet, Presence-Heartbeat) — sie stammen aus
`HeaderButtonGroup` und `PresenceHeartbeat` im Layout und stehen damit vor
jeder seitenspezifischen Abfrage in der Warteschlange.

---

## 7. Datenmodell (Kurzfassung)

27 Modelle/Enums in `prisma/schema.prisma`:

`User`, `Session`, `Account`, `Verification` (better-auth) ·
`Follow` · `Group`, `GroupMember` (+`GroupMemberStatus`), `GroupMessage`,
`GroupAnnouncement` · `DirectMessage` · `Post`, `PostLike`, `PostComment`,
`PostImage` · `Ride` (+`RideStatus`), `RideParticipant`
(+`RideParticipantStatus`), `RidePhoto` · `Route` (Routen-Bibliothek,
persönlich oder Gruppe) · `Notification` (+`NotificationType`) ·
`ActivityLog` (+`ActivityAction`) · `RadnetEvent`, `RadnetSyncState`,
`ProTelemetryFrame`.

---

## 8. Wo die Detailergebnisse stehen

| Datei | Inhalt |
| --- | --- |
| `00-routes-diff.md` | Bestand `festi-routes` ↔ Route Engine ↔ App |
| `01-findings.md` | Phase 1 + 2: Funktions-, Design- und UX-Funde mit Repro & Screenshots |
| `review/A-auth-security.md` | Auth, Session, Authorization/IDOR, Uploads, XSS, Rate-Limiting |
| `review/B-backend-daten.md` | Fehlerbehandlung, Statuscodes, N+1, Indizes, Transaktionen, API-Vertrag |
| `review/C-frontend-architektur.md` | Server/Client-Grenzen, Caching, Revalidation, Bundles, State |
| `review/D-a11y-designsystem.md` | Kontraste, Fokus, Tastatur, Tokens, Zustände (Code-Ebene) |
| `review/E-codequalitaet-tests.md` | Build/Lint/Typecheck/Tests, Konventionen, `concerns.txt` |
| `screenshots/` | Alle Belegbilder |

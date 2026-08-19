# 01 – Funde aus Phase 1 (Funktionstest) und Phase 2 (Design & UX)

> Getestet am 2026-08-19 gegen die **Produktion** `https://festicycling.com`
> (Cloudflare Workers) mit dem Testaccount `test@aljoschairmer.com`.
> Browser: Chromium 141 (Playwright), Viewports 375 / 768 / 1440 px.
> Alle Screenshots liegen unter [`screenshots/`](./screenshots/).
>
> Code-Funde aus den parallelen Reviews stehen in [`review/`](./review/) und
> werden hier nur referenziert, nicht wiederholt.

## Status der Behebung

Alle Funde sind auf `claude/festi-e2e-audit-n10238` behoben, mit diesen
Ausnahmen und Einschränkungen:

| Fund | Status |
| --- | --- |
| F-01 (Feed 21,5 s) | **teilweise** — die Ursachen sind angegangen (20 Composite-Indizes, `take`-Limits, Timeouts), aber der Kern ist die Serialisierung der Server Actions plus ein frischer Postgres-Connect pro Query (`maxUses: 1`, Review B-01). Das ist ein Architektur-Umbau, kein Patch: die Header-Zähler gehören aus dem Layout in einen gemeinsamen Endpunkt oder in RSC, und vor Postgres gehört ein Pooler (Hyperdrive/PgBouncer). Bewusst nicht im Rahmen dieser Runde. |
| F-02 (öffentliche Fahrten) | behoben — `isPublic` ist opt-in. **Die Migration setzt auch Bestandsdaten auf privat**, weil niemand zugestimmt hatte; bestehende geteilte Links brechen dadurch und müssen vom Creator neu aktiviert werden. |
| F-05 (Profil lädt langsam) | teilweise — Indizes und `take` helfen, das clientseitige Laden bleibt (Review C-06). |
| F-14 (kein Dark/Light-Umschalter) | **nicht behoben** — die App ist bewusst dunkel; ein zweites Theme ist eine Designentscheidung, keine Fehlerbehebung. Die Kontraste im vorhandenen Theme sind gefixt. |
| F-16 (Logout-Fehlermeldung) | **nicht behoben** — die Meldung entsteht durch eine Server Action, die nach dem Invalidieren der Session zurückkommt. Der Presence-Heartbeat müsste beim Abmelden gestoppt werden; das hängt an derselben Layout-Umbaufrage wie F-01. |
| F-24 (Font-Preload-Warnung) | **nicht behoben** — die Warnung kommt aus Next' eigenem Font-Handling, nicht aus Anwendungscode. |
| F-28 (`.env.example`) | **nicht behoben** — die Liste steht in der README; eine `.env.example` anzulegen ist sinnvoll, aber ich wollte keine Datei mit Platzhaltern anlegen, die wie echte Konfiguration aussieht, ohne das mit dir abzustimmen. |


## Schweregrade

| | Bedeutung |
| --- | --- |
| **P0** | Blocker — verhindert Nutzung oder gibt Daten preis |
| **P1** | Kaputt — Funktion/Darstellung falsch, Workaround nötig |
| **P2** | Störend — funktioniert, fühlt sich aber falsch an |
| **P3** | Kosmetisch |

## Übersicht

| ID | Titel | Schwere |
| --- | --- | :--: |
| F-01 | Dashboard-Feed braucht 21,5 s bis zum ersten Inhalt — Server Actions laufen strikt seriell | **P0** |
| F-02 | Jede Fahrt ist per Default öffentlich: Startort, Termin und Klarname ohne Login abrufbar | **P0** |
| F-03 | 404-Seite ist die ungebrandete Next.js-Standardseite | P1 |
| F-04 | `/rides/{unbekannt}` antwortet mit HTTP 200 statt 404 | P1 |
| F-05 | Nicht existierendes Rider-Profil zeigt 25–35 s „Loading", bevor 404 erscheint | P1 |
| F-06 | 8 × `revalidatePath()` auf Routen, die es nicht gibt (`/groups`) | P1 |
| F-07 | Routen-Generator-Panel ist bei 1440 px und bei 375 px abgeschnitten | P1 |
| F-08 | Horizontaler Überlauf bei 375 px auf `/dashboard/community-rides/new` | P1 |
| F-09 | Buttons und Eingabefelder haben keinen wahrnehmbaren Fokus-Indikator | P1 |
| F-10 | Fehlerfarbe, Primärfarbe und Fokusfarbe sind derselbe Rotton | P1 |
| F-11 | Kein `<h1>` und kein `<main>` auf Login, Register, Forgot-, Reset-Password | P1 |
| F-12 | Zwei verschachtelte `<main>`-Landmarks auf jeder Dashboard-Seite | P1 |
| F-13 | Like-Button hat keinen zugänglichen Namen | P1 |
| F-14 | Dark Mode ist der einzige Mode — `.dark` und `:root` sind wertgleich, kein Umschalter | P1 |
| F-15 | Ride-Detail: Recharts-Fehler „width(-1) and height(-1)" | P1 |
| F-16 | Logout wirft `Error: An unexpected response was received from the server` | P1 |
| F-17 | Route Engine mischt deutsche und englische Warnungen, `locale` wirkt nicht | P1 |
| F-18 | Coverage-BBox der Engine ist viel größer als der Graph — Jobs scheitern statt 400 | P2 |
| F-19 | Touch-Targets durchgängig unter 44 px | P2 |
| F-20 | `error.tsx` verwirft `error` und `reset` — Fehlerseite ohne Kontext und ohne Retry | P2 |
| F-21 | Uneinheitliche Ladezustände: Text „Loading riders…" neben Skeletons neben Vollbild-Spinner | P2 |
| F-22 | Login erzwingt die Passwort-Policy (min. 8 Zeichen) beim **Anmelden** | P2 |
| F-23 | Kein Skip-Link, Tab-Reihenfolge startet in der Sidebar | P2 |
| F-24 | Font-Preload-Warnung auf jeder Seite | P3 |
| F-25 | `cookieCache.maxAge: 30` mit Kommentar „5 minutes" | P3 |
| F-26 | Überschriften-Sprung H1 → H3 auf der Ride-Detailseite | P3 |
| F-27 | Bilder ohne `alt` auf Ride- und Gruppendetail | P3 |
| F-28 | Keine `.env.example` im `festi`-Repo | P2 |
| F-29 | Neuer Kommentar erscheint erst nach über 12 s in der offenen Liste | P2 |

---

## P0

### F-01 — Dashboard-Feed braucht 21,5 s bis zum ersten Inhalt · **P0**

**Repro**
1. Als `test@aljoschairmer.com` anmelden.
2. `/dashboard` aufrufen und mitstoppen, wann die drei Skeleton-Karten durch Inhalt ersetzt werden.

**Erwartet:** Inhalt in 1–3 s.
**Tatsächlich:** **21,5 s.** Reproduzierbar über mehrere Läufe (`DOMContentLoaded`
allein schwankte über isolierte Wiederholungen zwischen 2,9 s und 4,2 s).

**Messung** (Playwright, Produktions-Deployment):

```
DOMContentLoaded                         3 807 ms
Server-Action  0020efa9   start  6 693 → ende  9 958   (3 265 ms)
Server-Action  00463d0b   start  9 957 → ende 12 831   (2 874 ms)
Server-Action  004256d8   start 12 831 → ende 16 675   (3 844 ms)
Feed sichtbar                           21 512 ms
```

Die Startzeit jeder Action ist exakt die Endzeit der vorherigen
(9957→9958, 12831→12831): **Next.js serialisiert Server-Action-Requests.**
Pro Dashboard-Seitenaufruf feuern 5–8 solcher Actions à 2,7–4,7 s.

Vier davon laufen auf *jeder* Seite, weil sie im Layout hängen und damit
noch vor jeder seitenspezifischen Abfrage in der Warteschlange stehen:
`NotificationSheet`, `DirectChatHeaderButton`, `FollowerListSheet`
(alle aus `src/components/headerButtonGroup.tsx`) und
`PresenceHeartbeat` (`src/app/dashboard/layout.tsx:24`).

Die ~3 s pro Action sind kein Query-Problem — `getFeed` lieferte
`{"items":[],"nextCursor":null}`, also ein leeres Ergebnis. Der Aufwand
steckt im Verbindungsaufbau: `src/lib/prisma.ts` erzeugt pro Request
einen frischen Prisma-Client mit `maxUses: 1` (bewusst wegen Workers,
siehe Review B-01).

**Warum P0:** Das ist die Startseite nach jedem Login. 21 s ohne Inhalt
liest sich wie ein Ausfall.

**Fix-Richtung**
1. Die drei Header-Zähler und den Heartbeat aus dem synchronen Pfad nehmen
   — ein gemeinsamer Endpunkt oder ein `<Suspense>`-gerenderter Server-Teil
   statt drei Client-Queries.
2. Den Feed serverseitig vorrendern (RSC) statt ihn per TanStack Query aus
   einer Server Action zu holen — dann steht die erste Seite mit dem HTML.
3. Verbindungs-Setup entschärfen: Hyperdrive oder ein PgBouncer vor
   Postgres, damit `maxUses: 1` nicht jedes Mal einen TCP+TLS+Auth-Roundtrip
   kostet.

📸 `screenshots/1440-dashboard.jpg`, `screenshots/1440-dashboard-25s.jpg`,
`screenshots/375-dashboard.jpg`

---

### F-02 — Jede Fahrt ist per Default öffentlich · **P0**

**Repro**
1. Ride-ID aus der eingeloggten Rides-Liste kopieren.
2. In einem frischen Browser-Kontext **ohne Session** `/rides/{rideId}` öffnen.

**Tatsächlich** (wörtlich abgegriffen, ohne jede Anmeldung):

```
2wdwd | Wednesday, 11 November 2026, 00:00 | Homburg vor der Höhe |
Organized by Aljoscha Irmer | 277.3 km | Distance | 13h 31min | Duration |
1394 hm | Climbing | Want to ride along? …
```

Damit sind **Treffpunkt, exakter Termin und der Klarname des Organisators**
öffentlich — für Ausfahrten, die typischerweise an der Wohnadresse starten.

**Ursache:** `prisma/schema.prisma:366` — `isPublic Boolean @default(true)`,
bestätigt durch `prisma/migrations/20260718163912_attendance_public_rides/migration.sql:5`.
`createRide` setzt das Feld nie, `setRidePublic` kann es nur nachträglich
abschalten. Der Nutzer wird beim Anlegen nicht gefragt.

**Erwartet:** Opt-in. Standard `false`, ein bewusster Schalter „Öffentlichen
Link erzeugen" im Anlege-Flow, und ein Hinweis, was dadurch sichtbar wird.

Siehe auch Review `A-03`.

📸 `screenshots/public-ride-qexi2d.jpg`

---

## P1

### F-03 — 404-Seite ist die Next.js-Standardseite · **P1**

`https://festicycling.com/irgendwas` liefert korrekt HTTP 404, zeigt aber
die ungebrandete Next-Default-Seite („404 — This page could not be found."),
ohne Header, Sidebar, Logo oder einen Weg zurück.

Es gibt **keine `not-found.tsx`** im gesamten `src/app/`-Baum. Eine fertige
Komponente `src/components/notFoundComponent.tsx` existiert, wird aber nur
an genau einer Stelle benutzt (`src/features/community/components/userMainComponent.tsx:34`).

**Fix:** `src/app/not-found.tsx` anlegen und `NotFoundComponent` verdrahten;
zusätzlich eine `src/app/dashboard/not-found.tsx`, damit 404 innerhalb des
Dashboards das Layout behält.

📸 `screenshots/1440-404.jpg`, `screenshots/err-ride-notfound.jpg`

---

### F-04 — `/rides/{unbekannt}` antwortet mit HTTP 200 · **P1**

**Repro:** `/rides/doesnotexist123` ohne Session aufrufen.
**Erwartet:** 404. **Tatsächlich:** **HTTP 200** mit der Seite
„This ride is not public — The ride doesn't exist, or its creator has
disabled the public link."

Für Menschen ist das in Ordnung; für Suchmaschinen und Monitoring ist es
ein Soft-404. Die öffentliche Ride-Seite ist ausgerechnet der Sharing-Pfad,
also der, der indexiert wird.

**Fix:** In `src/app/rides/[rideId]/page.tsx` `notFound()` aufrufen, wenn
`getPublicRide` nichts liefert. Siehe auch Review `C-09` (dort zusätzlich:
dieser Seite fehlt `generateMetadata`, also gibt es auch keine
Link-Vorschau beim Teilen).

---

### F-05 — Nicht existierendes Rider-Profil: 25–35 s „Loading" vor dem 404 · **P1**

**Repro:** eingeloggt `/dashboard/community/u/doesnotexist123` aufrufen.

| Zeitpunkt | Anzeige |
| --- | --- |
| nach 8 s | „Loading — Please wait while we prepare everything for you." |
| nach 14 s | unverändert |
| nach 35 s | „404 — Page not found" |

Ein **existierendes** Fremdprofil (`/dashboard/community/u/6xYaTe…`) stand
nach 14 s ebenfalls noch auf „Loading".

Anders als bei Ride und Gruppe (die sauber 404 liefern) wird das Profil
client-seitig geladen; der 404 ist damit auch kein echter HTTP-404.

**Fix:** Profil serverseitig laden und `notFound()` verwenden — dann ist
die Antwort sofort korrekt und die Ladezeit entfällt.

📸 `screenshots/err-user-hang.jpg`

---

### F-06 — `revalidatePath()` auf nicht existierende Routen · **P1**

Acht Aufrufe revalidieren `/groups` bzw. `/groups/{id}`. Diese Routen gibt
es nicht — die Gruppenseite liegt unter `/dashboard/community/g/[id]`:

| Datei | Zeile | Aufruf |
| --- | --- | --- |
| `src/features/community/actions/createGroup.ts` | 43 | `revalidatePath("/groups")` |
| `src/features/community/actions/deleteGroup.ts` | 47 | `revalidatePath("/groups")` |
| `src/features/community/actions/joinGroup.ts` | 72, 107 | `revalidatePath(\`/groups/${groupId}\`)` |
| `src/features/community/actions/leaveGroup.ts` | 62 | dito |
| `src/features/community/actions/cancelGroupJoinRequest.ts` | 58 | dito |
| `src/features/community/actions/respondToGroupJoinRequest.ts` | 81 | dito |
| `src/features/community/actions/updateGroup.ts` | 52 | dito |
| `src/features/community/actions/kickGroupMember.ts` | 80 | dito |

Im selben Ordner steht es dreimal richtig — `uploadGroupImage.ts:69-70`,
`createAnnouncement.ts:59`, `updateGroupMemberRole.ts:79` revalidieren
`/dashboard/community/g/${groupId}`. Es ist also kein Konzept-, sondern ein
Copy-Paste-Fehler, der nie auffiel, weil `revalidatePath` bei unbekannten
Pfaden schweigt.

---

### F-07 — Routen-Generator-Panel abgeschnitten · **P1**

**Repro:** `/dashboard/community-rides/generate` öffnen.

Bei **1440 px** endet die Panel-Box sichtbar bei x≈635, während Inhalt
(Suchfeld, Kategorie-Chips „Road … Cargo", Distanz-Eingabe) darüber
hinausragt und teils hinter der Kante verschwindet.

Bei **375 px** messbar: drei Elemente ragen bis `right = 457 px` bei einem
Viewport von 375 px — also **82 px abgeschnitten**, und zwar ohne
horizontale Scrollbar (`document.scrollWidth == clientWidth`), weil ein
Elternelement `overflow` kappt. Betroffen laut Messung:

```
DIV.flex items-center gap-1                      right=457
INPUT.min-w-0 rounded-lg border border-input …   right=436
SPAN.text-muted-foreground text-xs               right=457
```

Der km-Eingabe des Generators ist damit auf dem Telefon nicht erreichbar.

📸 `screenshots/1440-rides-generate.jpg`, `screenshots/375-generate.jpg`

---

### F-08 — Horizontaler Überlauf bei 375 px auf `/dashboard/community-rides/new` · **P1**

Gemessen: `document.scrollWidth = 401` bei `clientWidth = 375`.
Verursacher: `SPAN.text-muted-foreground` mit `right = 401` — der Zusatztext
der Option „Generate a route for me — pick a start on the map" bricht nicht um.

Die Seite lässt sich dadurch seitwärts wegschieben; auf dem Screenshot ist
„…pick a start on the map" am rechten Rand angeschnitten.

**Fix:** Den Erklärtext in eine eigene Zeile umbrechen lassen
(`flex-wrap` bzw. `block` statt Inline-Suffix) oder bei kleinen Viewports ausblenden.

📸 `screenshots/375-rides-new.jpg`

---

### F-09 — Kein wahrnehmbarer Fokus-Indikator auf Buttons und Eingabefeldern · **P1**

Tab-Durchlauf auf `/login` mit echten Tastendrücken, `getComputedStyle`
des jeweils fokussierten Elements:

| Element | `outline` | Ring (`box-shadow`) |
| --- | --- | --- |
| `<a>` „Back" / „Forgot password?" / „Sign up" | `1px auto` (Browser-Default) | `none` |
| `<input type=email>` | **`0px none`** | `rgba(0,0,0,0) 0 0 0 0, …` |
| `<input type=password>` | **`0px none`** | `rgba(0,0,0,0) 0 0 0 0, …` |
| `<button>` „Sign in" | **`0px none`** | `rgba(0,0,0,0) 0 0 0 0, …` |

Formularelemente setzen `outline: none`, der Ersatz-Ring greift entweder
gar nicht oder ist mit **1,69 : 1** (gemessen in Review `D`) weit unter den
für Nicht-Text-Kontraste geforderten 3 : 1. Links behalten nur den
UA-Default-Outline.

Tastaturnutzer sehen also nicht, wo sie sind. WCAG 2.4.7 (AA).

📸 `screenshots/a11y-focus-login.jpg`

---

### F-10 — Fehlerfarbe, Primärfarbe und Fokusfarbe sind identisch · **P1**

`src/app/globals.css`:

```css
--primary:     oklch(0.55 0.25 25);   /* Zeile 58  */
--destructive: oklch(0.55 0.25 25);   /* Zeile 66  */
--ring:        oklch(0.55 0.25 25);   /* Zeile 69  */
```

Alle drei sind derselbe Wert (≈ `#df000d`). Folgen:

* Eine Fehlermeldung (`text-destructive`) ist farblich nicht von einem
  Link oder einem Primär-Button zu unterscheiden.
* Ein Feld im Fehlerzustand (roter Rahmen) sieht aus wie ein Feld im
  Fokus (roter Ring) — auf `/dashboard/community-rides/new` ist das
  Suchfeld dauerhaft rot umrandet und liest sich wie ein Validierungsfehler,
  obwohl nichts falsch ist.
* Der Ton erreicht auf dem Hintergrund `oklch(0.08 0.01 15)` nur
  **4,10 : 1** — unter AA für normalen Text (Review `D`).

**Fix:** `--destructive` auf einen eigenen, kontraststärkeren Warnton legen,
`--ring` auf einen neutralen hellen Ton, und `--primary` auf mindestens
4,5 : 1 aufhellen.

📸 `screenshots/1440-rides-new.jpg` (rot umrandetes Suchfeld ohne Fehler)

---

### F-11 — Kein `<h1>` und kein `<main>` auf den Auth-Seiten · **P1**

Gemessen über alle Viewports:

| Seite | `<h1>` | `<main>` | Überschriften gesamt |
| --- | :--: | :--: | --- |
| `/login` | **0** | **0** | keine |
| `/register` | **0** | **0** | keine |
| `/forgot-password` | **0** | **0** | keine |
| `/reset-password` | **0** | **0** | keine |
| `/` (Landing) | 1 | **0** | H1 |

Die sichtbaren Titel („Welcome back", „Create your account") sind
offenbar `<div>`/`<p>`. Screenreader- und SEO-seitig haben diese Seiten
damit keine Struktur und keinen Hauptbereich zum Anspringen.

---

### F-12 — Zwei verschachtelte `<main>`-Landmarks · **P1**

Auf **jeder** Dashboard-Seite misst der Browser `document.querySelectorAll('main').length === 2`:

1. `<main data-slot="sidebar-inset" …>` — kommt aus `SidebarInset`
   (`src/components/ui/sidebar.tsx`)
2. `<main className="flex-1 p-6">` — aus `src/app/dashboard/layout.tsx:41`

Verschachtelte `main`-Elemente sind ungültiges HTML und machen die
Landmark-Navigation mehrdeutig. Der Playwright-Selektor `locator('main')`
scheiterte deshalb reproduzierbar mit „strict mode violation".

**Fix:** Das innere `<main>` zu `<div>` machen — `SidebarInset` bringt das
Landmark schon mit.

---

### F-13 — Like-Button ohne zugänglichen Namen · **P1**

`src/features/posts/components/postCard.tsx:180-197`:

```tsx
<Button variant="ghost" size="sm" … aria-pressed={liked}>
  <HeartIcon className={…} />
  {likeCount > 0 && likeCount}
</Button>
```

Ohne Likes rendert der Button **nur das Icon** — kein Text, kein
`aria-label`, kein `sr-only`. Ein Screenreader meldet „Schaltfläche, nicht
gedrückt" ohne zu sagen, was gedrückt wird. Im Browser gemessen:

```
feed buttons: ["Create post|", "All|", "Posts|", "Rides|",
               "|Delete post", "|"  ←  Like, ohne Namen,
               "Comment|", "|Send comment", "Discover more |"]
```

Der Nachbar-Button („Delete post", `aria-label` in Zeile 130) macht es
richtig. Derselbe Fehler trifft den Kommentar-Button, sobald
`commentCount > 0` — dann steht dort nur noch eine Zahl. Direkt am
gerenderten DOM abgegriffen, nachdem der Post einen Kommentar hatte:

```
article buttons:
  ""  aria-label="Delete post"  aria-pressed=""      ← korrekt benannt
  ""  aria-label=""             aria-pressed="false" ← Like, ohne Namen
  "1" aria-label=""             aria-pressed=""      ← Kommentare, nur "1"
```

Das ist nicht nur ein Screenreader-Problem: der Kommentar-Button ist damit
auch für automatisierte Tests und für „per Text finden" unauffindbar.

Dazu passt die Messung „1 Button ohne Namen" auf **jeder** Dashboard-Seite:
der dritte Header-Button (`FollowerListSheet`).

**Fix:** `aria-label="Like post"` / `aria-label="Show comments"` ergänzen.

---

### F-14 — Dark Mode ist der einzige Mode · **P1**

`src/app/globals.css:51` (`:root`) und `:86` (`.dark`) definieren
**wertgleiche** Tokens. Es gibt keinen `ThemeProvider`, kein
`suppressHydrationWarning` im Root-Layout (`src/app/layout.tsx:49`) und
keinen Umschalter in der UI. `next-themes` ist installiert, wird aber nur
von `src/components/ui/sonner.tsx:14` gelesen — ohne Provider folgt der
Toast damit dem **Betriebssystem**-Theme, während der Rest der App immer
dunkel ist.

Konsequenz: Die 79 `dark:`-Utilities in `src/components/ui/` sind toter
Code. Ein Nutzer mit Hell-Präferenz bekommt keine helle Oberfläche, aber
möglicherweise einen hellen Toast auf dunklem Grund.

Details und die vollständige Kontrasttabelle: Review `D`.

---

### F-15 — Ride-Detail: Recharts meldet `width(-1) and height(-1)` · **P1**

Beim Aufruf von `/dashboard/community-rides/{rideId}` erscheint in der
Konsole:

```
[console.warning] The width(-1) and height(-1) of chart should be greater
than 0, please check the style of container, or the props width(100%) and
height(100%), or add a minWidth(0) or minHeight(undefined) …
```

Das Höhenprofil-Diagramm wird also mindestens einen Frame lang mit
negativer Größe gemountet — sichtbar als Layout-Sprung beim Laden.

**Fix:** Dem `ResponsiveContainer` eine feste `height` bzw. dem Elternteil
eine definierte Höhe geben, oder erst rendern, wenn der Container gemessen ist.

---

### F-16 — Logout wirft eine unbehandelte Fehlermeldung · **P1**

**Repro:** Im Dashboard über das Nutzermenü → „Sign out".

**Ergebnis:** Der Logout funktioniert (Weiterleitung auf `/`, Session
serverseitig ungültig — ein anschließender Deep-Link auf `/dashboard`
landet korrekt auf `/login`). Auf dem Weg dahin schlägt aber ein
Page-Error auf:

```
[pageerror] Error: An unexpected response was received from the server.
```

Das ist eine `next/navigation`-Fehlermeldung; sie deutet darauf hin, dass
eine noch laufende Server-Action-Antwort (vermutlich der
Presence-Heartbeat oder einer der Header-Zähler) nach dem Invalidieren der
Session ins Leere läuft. Für den Nutzer bleibt es diesmal folgenlos, aber
ein ungefangener Fehler an der Wurzel kann jederzeit die `error.tsx`
auslösen — die laut F-20 keinen Kontext zeigt.

---

### F-17 — Route Engine mischt Deutsch und Englisch, `locale` wirkt nicht · **P1**

Ausgewertet über die 569 Läufe in `festi-routes`, alle mit `locale: "de"`
eingereicht: **435 deutsche und 200 englische** Warnungen, im selben Array:

```
"Enthält ca. 185 m Schiebepassagen"                          ← de
"rain is likely during this ride"                            ← en
"traffic stress ceiling exceeded on 6% of the route …"       ← en
```

Die Strings sind hart kodiert und über die Module verteilt:
`festi-backend/src/metadata.ts:213` (de), `src/weather.ts:375-383` (en),
`src/profiles.ts:92-127` (en), `src/generation/roundtrip.ts:150-156` (de).
Eine Übersetzungsschicht existiert nicht; `locale` wird nur an GraphHopper
für die Abbiegehinweise durchgereicht.

Weil `src/features/rides/actions/generateRoute.ts:57` hart `locale: "en"`
sendet, landen die deutschen Strings unübersetzt in der englischen
Festi-Oberfläche.

Auch die Fehlermeldung eines fehlgeschlagenen Jobs kam deutsch zurück,
obwohl der Request gar kein `locale` gesetzt hatte (dokumentierter Default
ist `en`):

```
"errorDetail": "Keine Rundtour generierbar: Routing-Engine lieferte für
 keinen Kandidaten eine Route (Region abgedeckt?)"
```

---

## P2

### F-18 — Coverage-BBox der Engine ist viel größer als der Graph · **P2**

`GET /v1/coverage` (live):

```json
{"coveredRegions":["germany","austria","switzerland"],
 "bbox":[5.86308,45.812735,25.196558,60.43633]}
```

Die BBox reicht bis Südfinnland/Baltikum. Live nachgestellt:

| Start | Erwartet | Tatsächlich |
| --- | --- | --- |
| Warschau (52.23 / 21.01) | 400 „coordinates outside covered region" | **202 Accepted** → Job läuft an → `FAILED` |
| Lissabon (38.72 / −9.14) | 400 | ✅ 400 |

Die Prüfung nutzt die Graph-Hülle statt der Regionen. Nutzer knapp außerhalb
DE/AT/CH bekommen keinen sofortigen, verständlichen Fehler, sondern einen
Job, der Queue-Zeit verbraucht und dann mit einer Rückfrage („Region
abgedeckt?") scheitert. Die Live-Metriken zeigen **16 von 69 Jobs
fehlgeschlagen (23 %)**.

---

### F-19 — Touch-Targets durchgängig unter 44 px · **P2**

Bei 375 px gemessen (`getBoundingClientRect`):

| Element | Größe |
| --- | --- |
| Sidebar-Toggle | 28 × 28 |
| Header: Notifications / Messages / Follower | je 38 × 28 |
| Nutzermenü | 58 × 28 |
| Feed-Tabs „All / Posts / Rides" | 54–72 × **25** |
| „Create post" | 327 × **32** |
| „Request Join" (Ride-Detail) | 99 × 28 |
| „Join" (Gruppe) | 46 × 28 |
| „Back to rides" | 32 × 32 |
| Footer-Links (Imprint / Privacy / Terms) | 40–47 × **20** |
| Profil: „Edit …"-Stifte | 28 × 28 |

Kein einziges interaktives Element auf `/dashboard` erreicht 44 × 44
(WCAG 2.5.5 AAA / 2.5.8 AA mit 24 px Minimum — die 20-px-Footer-Links
reißen selbst das). Auf `/dashboard/events` zählt die Messung 193
Unterschreitungen, überwiegend Kartenmarker.

---

### F-20 — `error.tsx` verwirft `error` und `reset` · **P2**

```tsx
// src/app/error.tsx
export default function ErrorPage() {
  return <ErrorComponent />;
}
```

Next.js übergibt `{ error, reset }`; beides wird ignoriert. Der Nutzer
bekommt eine generische Seite ohne Fehlerbezug und **ohne
„Erneut versuchen"**. Es gibt außerdem weder `global-error.tsx` noch
segment-eigene `error.tsx`, d. h. jeder Fehler irgendwo im Dashboard
ersetzt die komplette Seite inklusive Sidebar.

---

### F-21 — Uneinheitliche Ladezustände · **P2**

Drei verschiedene Muster nebeneinander, alle im selben Produkt:

| Ort | Ladeanzeige |
| --- | --- |
| `/dashboard` Feed | 3 Skeleton-Karten (`h-40 w-full rounded-xl`) |
| `/dashboard/community` | Fließtext „Loading riders…" / „Loading groups…" |
| `/dashboard/community-rides` | 3 Skeleton-Kacheln, anderes Seitenverhältnis |
| `/dashboard/community/u/[id]` | Vollflächiges „Loading — Please wait while we prepare everything for you." |

Zusätzlich fehlt jede `loading.tsx`, so dass beim Navigieren zwischen
Server-Seiten gar keine Rückmeldung kommt — die alte Seite bleibt stehen.

📸 `screenshots/1440-community.jpg` vs. `screenshots/1440-rides.jpg`

---

### F-22 — Login erzwingt die Passwort-Policy beim Anmelden · **P2**

**Repro:** Auf `/login` E-Mail `not-an-email`, Passwort `x`, absenden.

**Tatsächlich:**
```
Please enter a valid email address
Password must be at least 8 characters
```

Beim **Anmelden** gehört keine Policy-Prüfung hin: Sie verrät die
Passwortregeln an Unbeteiligte und sperrt Bestandsnutzer aus, deren
Passwort älter als die aktuelle Regel ist. Erwartet wäre nur
„Password is required".

*(Der Rest der Auth-Fehlerbehandlung ist gut: leere Felder werden pro Feld
gemeldet, falsches Passwort liefert das neutrale „Invalid email or
password", `/forgot-password` bestätigt auch unbekannte Adressen ohne
Enumeration, `/reset-password` ohne Token zeigt „Invalid link".)*

📸 `screenshots/err-login-badformat.jpg`, `screenshots/err-login-wrongpw.jpg`,
`screenshots/err-register-empty.jpg`, `screenshots/err-forgot-unknown.jpg`

---

### F-23 — Kein Skip-Link, Tab-Reihenfolge startet in der Sidebar · **P2**

`a[href^="#"]:has-text("Skip")` → 0 Treffer. Der erste Tab-Stopp im
Dashboard ist „For You" in der Sidebar; bis zum Hauptinhalt sind neun
weitere Tabs nötig — auf jeder Seite neu.

---

### F-29 — Neuer Kommentar erscheint erst nach über 12 s in der offenen Liste · **P2**

**Repro**
1. Im Feed einen Post öffnen, Kommentar tippen, absenden.
2. Die geöffnete Kommentarliste beobachten.

**Tatsächlich:** Nach 12 s steht der Kommentar **weder in der Liste noch im
Zähler**. Nach einem Reload ist er da (Zähler springt von 1 auf 2). Der
Kommentar geht also nicht verloren — die Oberfläche hinkt nur hinterher.

Die Invalidierung selbst ist korrekt implementiert
(`src/features/posts/components/postComments.tsx:42-45` invalidiert sowohl
`["post-comments", postId]` als auch `["posts"]`). Das Problem ist die
Latenz aus F-01: beide Invalidierungen lösen Refetches über Server Actions
aus, die seriell à ~3 s laufen — und der `posts`-Refetch lädt den kompletten
Feed neu, bevor die Kommentare drankommen.

**Fix:** Optimistisches Einfügen des Kommentars (`onMutate`), und den
Feed-Refetch nicht mit-invalidieren, sondern nur den Zähler lokal
hochzählen.

*(Like funktioniert dagegen sofort — `postCard.tsx` aktualisiert
`liked`/`likeCount` optimistisch im lokalen State: `aria-pressed` springt
unmittelbar von `false` auf `true`.)*

---

### F-28 — Keine `.env.example` im `festi`-Repo · **P2**

`ls .env*` → nichts. Die benötigten Variablen (13 Stück) stehen nur in der
README. `npx next dev` startet zwar sauber (`✓ Ready in 406ms`,
Next.js 16.2.10 Turbopack), aber jede datenführende Seite bleibt tot, bis
man sich die Liste aus der README zusammensucht.

Die Route Engine macht es vor: `festi-backend/.env.example` ist vollständig
und kommentiert.

---

## P3

### F-24 — Font-Preload-Warnung auf jeder Seite · **P3**

```
The resource …/media/c825fd02acae0153-s.p.1q3-y3vmyf3p6.woff2 was preloaded
using link preload but not used within a few seconds from the window's load
event.
```

Erscheint auf allen öffentlichen Seiten und auf `/dashboard/profile`. Es
wird ein Schriftschnitt vorgeladen, den die Seite dann nicht braucht —
verschwendete Bandbreite im kritischen Pfad.

### F-25 — `cookieCache.maxAge: 30` mit Kommentar „5 minutes" · **P3**

```ts
// src/lib/auth.ts:114-117
cookieCache: {
  enabled: true,
  maxAge: 30, // 5 minutes
},
```

Der Wert ist in Sekunden — es sind 30 Sekunden, nicht 5 Minuten. Entweder
der Wert oder der Kommentar ist falsch; bei 30 s wird die Session zehnmal
häufiger aus der DB gelesen als beabsichtigt, was direkt auf F-01 einzahlt.

### F-26 — Überschriften-Sprung H1 → H3 auf der Ride-Detailseite · **P3**

Gemessene Reihenfolge auf `/dashboard/community-rides/{id}`: `H1`, `H3` —
die H2-Ebene wird übersprungen.

### F-27 — Bilder ohne `alt` · **P3**

`img:not([alt])`: 1 auf `/dashboard/community-rides/{id}`, 1 auf
`/dashboard/community/g/{id}`, 2 auf `/dashboard/community` (375 px).
Der Rest der App ist sauber — Review `D` bestätigt `alt` auf allen 17
statisch geprüften Bildern; die Ausreißer sind offenbar dynamisch
gerenderte Avatare/Gruppenbilder.

---

## Was funktioniert (explizit geprüft)

Damit klar ist, was Abdeckung hatte und in Ordnung war:

| Bereich | Ergebnis |
| --- | --- |
| Login (Happy Path) | ✅ leitet auf `/dashboard` |
| Login: leere Felder | ✅ Fehler pro Feld |
| Login: falsches Passwort | ✅ neutrale Meldung, HTTP 401 |
| Registrierung: leeres Formular | ✅ alle 7 Felder einzeln validiert, inkl. AGB-Checkbox |
| Passwort vergessen: unbekannte E-Mail | ✅ keine Enumeration |
| Reset-Link ohne Token | ✅ „Invalid link" + Weg zurück |
| Deep-Links ohne Session (5 geprüft) | ✅ alle auf `/login` |
| Admin-Seiten als Nicht-Admin | ✅ beide auf `/dashboard` umgeleitet |
| Logout | ✅ Session serverseitig ungültig (Deep-Link danach → `/login`), aber siehe F-16 |
| Session-Persistenz über Neustart des Browser-Kontexts | ✅ |
| Post anlegen: leer | ✅ „Title is required" / „Write something before posting" |
| Post anlegen: befüllt | ✅ erscheint im Feed |
| Gruppe anlegen: leer | ✅ „Group name is required" / „Description is required" |
| Avatar-Upload: 27-Byte-Textdatei als `.jpg` | ✅ „File does not appear to be a valid image." |
| Avatar-Upload: 16 MB | ✅ „Image is too large." |
| Avatar-Upload: gültiges 5,9-MB-PNG | ✅ „Profile picture updated." |
| Rides-Filter: Suche ohne Treffer | ✅ „No rides match your filters — Try a different search or reset the filters." |
| Ride-Detail | ✅ Karte, Höhenprofil, Distanz/Dauer/Höhenmeter, Teilnehmerliste |
| Kommentar schreiben | ✅ wird gespeichert (nach Reload sichtbar) — Anzeigeverzögerung s. F-29 |
| Post liken | ✅ optimistisch, `aria-pressed` springt sofort um, Zähler stimmt |
| Post löschen | ✅ Bestätigungsdialog („Delete this post? — This action cannot be undone.“), danach ist der Post samt Kommentaren weg |
| `/dashboard/community-rides/{unbekannt}` | ✅ HTTP 404 |
| `/dashboard/community/g/{unbekannt}` | ✅ HTTP 404 |
| Events (rad-net-Kalender) | ✅ 181 Events, Liste + Karte |
| News (RSS) | ✅ aktuelle Artikel, „Load more" |
| Pro Racing | ✅ 6 Rennen mit Status, Etappenzahl, Zeitraum |
| Settings | ✅ Konto-Infos + Passwortwechsel mit 3 Feldern |
| Horizontaler Überlauf bei 375 px | ✅ auf 16 von 18 geprüften Seiten sauber (Ausnahmen: F-07, F-08) |
| Route Engine: Eingabevalidierung | ✅ 400 mit präziser Meldung bei negativer Distanz, unbekannter Kategorie, kaputtem JSON, fehlendem Body; 404 bei unbekannter Route und unbekanntem Job |
| Route Engine: Auth | ✅ `/v1/*` und `/metrics` verlangen den API-Key, `/healthz` bewusst offen |

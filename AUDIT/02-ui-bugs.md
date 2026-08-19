# 02 – Gezielte UI-Fehlersuche

> Getestet am 2026-08-19 gegen die Produktion `https://festicycling.com`,
> Chromium 141 (Playwright), Testaccount, Viewports 375 / 1280 / 1440 px.
> Ergänzt [`01-findings.md`](./01-findings.md) — hier stehen nur UI-Defekte,
> die dort noch nicht drin waren.

## Vorgehen

Drei Verfahren kombiniert:

1. **DOM-Scanner** über 20 Seiten × 2 Viewports: abgeschnittener Text,
   Elemente außerhalb des Viewports, unsichtbarer Text, kaputte Bilder,
   doppelte IDs, interaktive Elemente ohne Namen, überlappende Klickflächen,
   `aria-hidden` über Fokussierbarem, Eingaben ohne Label, verschachtelte
   Scroll-Container, Kontraste.
2. **Interaktions-Durchlauf**: jeder Dialog, jedes Sheet, jedes Dropdown,
   der Markdown-Editor und die Filter geöffnet und im geöffneten Zustand
   gescannt.
3. **Stresstests**: 200 % Textzoom, überlanger Inhalt, Wörter ohne
   Leerzeichen, lange URLs.

**Zur Kontrastmessung:** Die Farben liegen als `oklch()`/`lab()` vor, die der
übliche Canvas-`fillStyle`-Trick nicht auflöst. Gemessen wird deshalb
rasterisiert (Farbe auf Schwarz *und* auf Weiß rendern, daraus Alpha und
Grundfarbe zurückrechnen, dann über den tatsächlichen Elternhintergrund
komponieren). Gegengeprüft an zwei Referenzen: Weiß/Schwarz = **21.00**,
`#767676`/Weiß = **4.54** — beide exakt.

## Status

Alle Funde bis auf die vier zurückgezogenen sind behoben — siehe Commits auf
`claude/festi-e2e-audit-n10238`. Die Kontrastwerte sind nach dem Fix erneut
gemessen worden:

| Paar | vorher | nachher | Ziel |
| --- | ---: | ---: | ---: |
| `text-primary` auf Hintergrund | 4.11 | **5.15** | 4.5 |
| `text-primary` auf Karte | 4.03 | **5.04** | 4.5 |
| Button-Text auf Primary | 4.77 | **4.80** | 4.5 |
| `text-destructive` | 4.11 | **7.18** | 4.5 |
| Fokus-Ring (`ring/50`) | 1.69 | **3.30** | 3.0 |
| Input-Rahmen | 1.07 | **3.01** | 3.0 |
| Chart-Farben 1–5 | 1.05–4.11 | **5.83–10.95** | 3.0 |
| „Host"-Badge | 3.84 | **4.61** | 4.5 |

`--destructive` ist zusätzlich auf einen eigenen Farbton gelegt, damit
Fehlermeldungen nicht mehr aussehen wie Primäraktionen, und `--ring` auf ein
neutrales Hell, damit der Fokus auf jeder Fläche liest.


## Übersicht

| ID | Titel | Schwere |
| --- | --- | :--: |
| U-01 | Dialoge haben keine Höhenbegrenzung — bei viel Inhalt sind Absenden *und* Schließen unerreichbar | **P1** |
| U-02 | Ein Wort ohne Leerzeichen schiebt Tabs und Absende-Button aus dem Bild | **P1** |
| U-03 | Bei 200 % Textzoom geht „Request Join" verloren, 55 px horizontaler Überlauf | **P1** |
| U-04 | Cookie-Banner verdeckt Impressum-, Datenschutz- und AGB-Link | **P1** |
| U-05 | Routen-Generator: Distanzfeld liegt bei 375 px 82 px außerhalb | **P1** |
| U-06 | `/community-rides/new`: 26 px horizontaler Überlauf bei 375 px | P2 |
| U-07 | Landing Page: Partikel-Beschriftungen laufen durch den Fließtext | P2 |
| U-08 | Header-Button ohne zugänglichen Namen — auf jeder Dashboard-Seite | P2 |
| U-09 | Alle vier Checkboxen der App ohne Label | P2 |
| U-10 | „Include past rides"-Switch ohne Namen | P2 |
| U-11 | Ride-Kartenbild-Link (368 × 160) ohne Namen | P2 |
| U-12 | Vier Suchfelder ohne Label | P2 |
| U-13 | Fünf Textrollen unter dem AA-Kontrast | P2 |
| U-14 | Events: Quellen-Link liegt in der Klickfläche des Event-Buttons | P2 |
| U-15 | News: `line-clamp` schneidet Text ohne Hinweis ab | P3 |
| U-16 | Zwei verschiedene Rottöne nebeneinander | P3 |

---

## P1

### U-01 — Dialoge haben keine Höhenbegrenzung · **P1**

**Repro**
1. `/dashboard` → „Create post".
2. Titel „Tourenbericht Deister", in den Text 60 Zeilen einfügen
   (`Zeile 1 des Tourenberichts.` … `Zeile 60 …`).
3. Absenden versuchen.

**Erwartet:** Dialog bleibt im Bild, Inhalt scrollt intern, „Post" bleibt erreichbar.
**Tatsächlich:** Gemessen bei Viewport 1440 × 900:

| | leerer Dialog | mit 60 Zeilen |
| --- | --- | --- |
| Dialog-Box | 576 × 383 @ 432,259 | **576 × 1439 @ 432,−269** |
| ragt heraus | — | **270 px unten, 269 px oben** |
| „Preview" | 923,389 ✅ | 923,**−139** ❌ |
| „Post" | 924,598 ✅ | 924,**1126** ❌ |
| „Close" (X) | 972,267 ✅ | 972,**−261** ❌ |

**Alle drei Bedienelemente liegen außerhalb des Viewports** — auch das
Schließen-Kreuz. Und es gibt keinen Weg dorthin:

```
Seite scrollbar?         { docScrollH: 900, clientH: 900, bodyOverflow: 'hidden' }
Mausrad im Dialog        → Post-Button unverändert bei y=1126  ❌
Klick auf "Post"         → locator.click: Timeout 8000ms exceeded
Escape                   → Dialog geschlossen (Beitrag verloren)
```

Der einzige Ausweg ist Escape, und damit ist der geschriebene Beitrag weg.

**Ursache** — die geteilte Primitive, `src/components/ui/dialog.tsx:63`:

```
"fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)]
 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 …"
```

Am gerenderten Element nachgemessen: `max-height: none`, `overflow-y: visible`.
Es gibt eine Breitenbegrenzung (`max-w-…`), aber **keine Höhenbegrenzung**.
Mit `top-1/2` + `-translate-y-1/2` wächst der Dialog symmetrisch über beide
Bildschirmkanten hinaus.

**Das betrifft jeden Dialog der App**, weil alle diese Primitive benutzen —
Gruppe erstellen/bearbeiten, Ride bearbeiten, Direktnachrichten,
Lösch-Bestätigungen. Sichtbar wird es überall dort, wo der Inhalt wächst.

**Fix** (eine Zeile, in `dialog.tsx`):

```diff
- "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] …"
+ "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)]
+  max-h-[calc(100dvh-4rem)] overflow-y-auto …"
```

Sauberer wäre, nur den Inhaltsbereich scrollen zu lassen und Kopf- und
Fußzeile des Dialogs zu fixieren — dann bleibt „Post" immer sichtbar.

📸 `screenshots/ui-dlg-0-leer.jpg` vs. `screenshots/ui-dlg-4-vielezeilen.jpg`

---

### U-02 — Ein Wort ohne Leerzeichen schiebt die Bedienelemente aus dem Bild · **P1**

**Repro:** „Create post" öffnen, in den Text 160 × `X` ohne Leerzeichen einfügen.

Gemessen bei 1440 × 900:

| | leer | 160 × „X" | lange Komoot-URL (118 Z.) |
| --- | --- | --- | --- |
| „Preview" | x = 923 ✅ | **x = 1869** ❌ (429 px außerhalb) | x = 1009 ⚠️ (86 px verschoben) |
| „Post" | x = 924 ✅ | **x = 1869** ❌ | x = 1009 ⚠️ |
| Dialog-Box | 576 breit | 576 breit (unverändert) | 576 breit |

Die Dialog-*Box* bleibt korrekt bei 576 px — herausgeschoben werden die
Elemente **innerhalb**. Auf dem Screenshot läuft die X-Zeile quer über den
ganzen Bildschirm und durchbricht die Dialogkante bei x ≈ 1008.

Ein langer Titel (160 × `T`) macht das übrigens **nicht** — `<input>` wächst
nicht mit. Nur der Textbereich.

**Ursache** — `src/features/posts/components/createPostForm.tsx:187`:

```tsx
<div className="flex flex-1 flex-col gap-3">
```

Ein Flex-Kind hat per Default `min-width: auto` und kann deshalb nicht unter
seine Inhaltsbreite schrumpfen. Das lange Wort zwingt den Container breiter,
und Tabs und Absende-Button reisen mit.

**Fix:** `min-w-0` an das Flex-Kind, plus `break-words` (bzw.
`overflow-wrap: anywhere`) auf Textarea und Vorschau:

```diff
- <div className="flex flex-1 flex-col gap-3">
+ <div className="flex min-w-0 flex-1 flex-col gap-3">
```

**Praxisrelevanz:** Eine geteilte Komoot-/Strava-URL ist der Normalfall auf
einer Radsport-Plattform, und die verschiebt die Buttons schon um 86 px. Bei
schmalerem Fenster oder etwas längerer URL kippt es.

📸 `screenshots/ui-md-write.jpg`, `screenshots/ui-dlg-1-langeswort.jpg`

---

### U-03 — 200 % Textzoom: „Request Join" verschwindet · **P1**

**Repro:** `/dashboard/community-rides` bei 1280 px Fensterbreite, Textzoom
auf 200 % (`html { font-size: 32px }` — entspricht Browser-Textzoom).

Interaktive Elemente vorher/nachher gezählt: **36 → 36**, es wird also nichts
aus dem DOM entfernt. Trotzdem:

```
Dokumentbreite:  100% = 1280/1280   →   200% = 1335/1280   ⚠️ 55px Überlauf
von overflow:hidden weggeschnitten: ["Request Join ✂ div"]
rechts außerhalb: ["Test Test", "Create Ride", "A", "Request Join"]
```

**„Request Join" ist damit weder sichtbar noch klickbar** — die primäre
Aktion der Seite. „Create Ride" und das Nutzermenü liegen ebenfalls
außerhalb.

Der 55-px-Überlauf tritt auf **allen** Dashboard-Seiten auf (Dashboard,
Rides, Community, Profile, Settings); `/login` ist sauber. Die Sidebar ist in
`rem` bemessen und skaliert mit, während der Hauptbereich `w-full` bleibt —
in Summe breiter als der Viewport.

Auf dem Screenshot sieht man zusätzlich, wie die Pace-/Difficulty-Badges und
die „View Route"-Buttons aus ihren Karten herausragen und Ortsnamen
(`Bruchköbe…`, `Homburg…`) mitten im Wort abschneiden.

Verletzt **WCAG 1.4.4 (Resize Text, AA)** und **1.4.10 (Reflow, AA)**.

**Fix:** Sidebar-Breite in `px` statt `rem`, oder das Grid so aufbauen, dass
der Hauptbereich `min-w-0` bekommt und die Sidebar unterhalb einer
Schwellenbreite einklappt.

📸 `screenshots/ui-zoom200-rides.jpg`

---

### U-04 — Cookie-Banner verdeckt Impressum, Datenschutz und AGB · **P1**

**Repro:** `/` im frischen Browser-Profil öffnen (Banner noch nicht bestätigt).

Gemessene Überlappung bei 375 px:

```
a "Imprint" ∩ button "Got it"   46 × 7 px
a "Privacy" ∩ button "Got it"   47 × 7 px
a "Terms"   ∩ button "Got it"   40 × 7 px
```

Bei 375 px ist der Footer komplett hinter dem Banner; bei 1440 px sind nur
noch „© 2026" links und „Terms" rechts sichtbar, „Festi", „Imprint" und
„Privacy" liegen darunter.

**Ursache** — beide Elemente sitzen am unteren Rand:

| Element | Klassen |
| --- | --- |
| `src/components/cookieConsent.tsx:46` | `fixed inset-x-0 bottom-0 z-50 …` |
| `SiteFooter` auf `src/app/page.tsx` | `absolute inset-x-0 bottom-0 z-10 …` |

**Warum das mehr als kosmetisch ist:** Das Impressum muss nach § 5 DDG
leicht erkennbar und unmittelbar erreichbar sein, und eine
Cookie-Einwilligung setzt voraus, dass die Datenschutzerklärung zugänglich
ist — der Banner verdeckt ausgerechnet beide Links. (Der Banner selbst
verlinkt „Privacy Policy" im Text, das rettet den Datenschutz-Teil; das
Impressum bleibt verdeckt.)

**Fix:** Dem Footer bei sichtbarem Banner einen unteren Abstand geben, oder
den Banner als Sticky-Element oberhalb des Footers einhängen statt beide auf
`bottom-0`.

📸 `screenshots/375-root.jpg`, `screenshots/1440-root.jpg`

---

### U-05 — Routen-Generator: Distanzfeld 82 px außerhalb des Bildschirms · **P1**

Bei 375 px auf `/dashboard/community-rides/generate` gemessen:

```
div.flex.items-center.gap-1   "km"   right=457   vw=375
input.min-w-0.rounded-lg …           right=436   vw=375
span.text-muted-foreground.text-xs "km" right=457 vw=375
```

Das Eingabefeld für die Zieldistanz endet 61 px hinter dem rechten Rand, die
„km"-Einheit 82 px. Es gibt **keine** horizontale Scrollbar
(`scrollWidth == clientWidth`), weil ein Elternelement mit `overflow: hidden`
abschneidet — der Inhalt ist also nicht nur verschoben, sondern schlicht
weg.

**Ohne Zieldistanz ist der Rundtour-Modus nicht bedienbar**: `generateRouteSchema`
verlangt für eine Rundtour `targetDistanceKm` oder ein Min/Max-Band
(„Choose a target distance for a roundtrip.").

Dasselbe Panel ist auch bei 1440 px betroffen: Die Panel-Box endet sichtbar
bei x ≈ 635, während Suchfeld, Kategorie-Chips und Distanzfeld darüber
hinausragen.

📸 `screenshots/375-generate.jpg`, `screenshots/1440-rides-generate.jpg`

---

## P2

### U-06 — `/community-rides/new`: 26 px Überlauf bei 375 px · **P2**

```
span.text-muted-foreground  "— pick a start on the map"   right=401   vw=375
```

Der Erklärtext hinter „Generate a route for me" bricht nicht um. Anders als
bei U-05 entsteht hier eine echte horizontale Scrollbar
(`scrollWidth 401 / clientWidth 375`), die Seite lässt sich seitlich
wegschieben.

**Fix:** Den Zusatz als eigene Zeile setzen (`block` statt Inline-Suffix)
oder unter `sm` ausblenden.

📸 `screenshots/375-rides-new.jpg`

---

### U-07 — Landing Page: Partikel-Beschriftungen laufen durch den Fließtext · **P2**

Der animierte Städte-Graph (`src/components/particleBackground.tsx:494`,
`absolute inset-0 z-0`) zeichnet Ortsnamen über die ganze Fläche. Der
Textblock liegt zwar korrekt darüber (`relative`), hat aber keinen eigenen
Hintergrund — die Labels laufen deshalb sichtbar *hinter* der Schrift durch.

* Bei **375 px** ist es massiv: „Basel", „Köln", „Stuttgart", „Barcelona",
  „Marseille", „Düsseldorf" und „Frankfurt" liegen direkt im Absatz „Your
  all-in-one platform for cyclists …", „Nice" hinter der Headline.
* Bei **1440 px** milder, aber vorhanden: „Stuttgart" hinter „Connect.",
  „Basel" an „Ride.", „Barcelona"/„Marseille" im Fließtext.

Zusätzlich schwankt dadurch der Kontrast des ohnehin grauen
`text-muted-foreground` je nach Hintergrundstelle.

**Fix:** Hinter dem Textblock einen Radial-/Linear-Verlauf legen (z. B.
`bg-background/70 backdrop-blur-sm` auf dem Container), oder die Partikel im
mittleren Bereich ausdünnen.

📸 `screenshots/375-root.jpg`

---

### U-08 — Header-Button ohne zugänglichen Namen · **P2**

Auf **jeder** Dashboard-Seite und in beiden Viewports meldet der Scanner
denselben Treffer:

```
noName: button.group/button.inline-flex.shrink-0.items-center   38x28
```

Es ist der dritte Header-Button (`FollowerListSheet` in
`src/components/headerButtonGroup.tsx`). Die Nachbarn sind korrekt benannt
(„Notifications", „Open messages"), dieser nicht. Er war deshalb auch per
`getByRole('button', { name: /follow/i })` nicht auffindbar.

**Fix:** `aria-label="Followers"` (bzw. `<span className="sr-only">`).

---

### U-09 — Alle vier Checkboxen der App ohne Label · **P2**

| Seite | Element | Größe |
| --- | --- | --- |
| `/register` | `button#terms` + `input[type=checkbox]` ohne `<label for>` | 16 × 16 |
| `/dashboard/community-rides/new` | `button#round-trip` („Round trip") | 16 × 16 |
| `/dashboard/community-rides/generate` | `button#genmap-scenic` („Scenic") | 16 × 16 |
| `/dashboard/community-rides/generate` | `button#genmap-ebike` („E-bike") | 16 × 16 |

Der Beschriftungstext steht jeweils daneben, ist aber nicht verknüpft. Zwei
Folgen: Screenreader melden „Kontrollkästchen" ohne Bezeichnung, und ein
Klick auf den Text schaltet die Checkbox nicht um — bei 16 × 16 px
Trefferfläche auf dem Telefon ärgerlich.

Die Zustimmung zu AGB und Datenschutz (`#terms`) ist damit die am
schlechtesten bedienbare Checkbox der App.

**Fix:** `<Label htmlFor="terms">` bzw. `aria-labelledby` setzen.

---

### U-10 — „Include past rides"-Switch ohne Namen · **P2**

```
noName: button#include-past.peer.group/switch.relative.inline-flex   32x18
```

Auf `/dashboard/community-rides`, beide Viewports. Das Label steht daneben,
ist aber nicht verknüpft. 32 × 18 px sind zusätzlich weit unter jeder
Touch-Target-Empfehlung.

---

### U-11 — Ride-Kartenbild-Link ohne Namen · **P2**

```
noName: a.block.h-40.w-full   368x160  (1440 px)
                              327x160  (375 px)
```

Die Kartenvorschau jeder Ride-Karte ist ein Link, der nur ein `<canvas>`
enthält — kein Text, kein `aria-label`. In der Linkliste eines Screenreaders
steht dort nichts. Der Titel darunter ist ein eigener, korrekt benannter
Link, die Fläche also doppelt verlinkt und einmal davon namenlos.

**Fix:** `aria-hidden="true"` + `tabindex="-1"` am Bildlink (der Titel-Link
reicht), oder `aria-label={\`Route ansehen: ${ride.title}\`}`.

---

### U-12 — Vier Suchfelder ohne Label · **P2**

| Seite | Platzhalter |
| --- | --- |
| `/dashboard/community` | `Search riders...` |
| `/dashboard/community` | `Search groups...` |
| `/dashboard/community-rides/new` | `Search for a place or address…` |
| `/dashboard/community-rides/generate` | `Search a start place…` |

Nur Platzhalter, kein `<label>`, kein `aria-label`. Platzhalter verschwinden
beim Tippen und sind kein Ersatz für ein Label.

*(Das Suchfeld auf `/dashboard/community-rides` — „Search title or start
location" — ist ebenfalls betroffen, wurde vom Scanner aber nicht separat
gelistet.)*

---

### U-13 — Fünf Textrollen unter dem AA-Kontrast · **P2**

Rasterisiert gemessen und über den tatsächlichen Hintergrund komponiert:

| Element | Vorkommen | Größe | Ratio | AA nötig |
| --- | --- | --- | --- | --- |
| Sidebar-Gruppen „Content" / „Account" | jede Dashboard-Seite | 12 px | **3.53 : 1** | 4.5 |
| Events-Untertitel `text-muted-foreground/70` („RTF · 84 / 157 km") | 12 × auf `/dashboard/events` | 12 px | **3.54 : 1** | 4.5 |
| „Host"-Badge auf der Ride-Detailseite | 1 × | 10 px | **3.84 : 1** | 4.5 |
| „Cyclingnews"-Quellenbadge (weiß auf `bg-red-500`) | jede News-Karte | 12 px | **3.81 : 1** | 4.5 |
| „Privacy Policy" im Cookie-Banner (`text-red-500`) | Landing Page | 14 px | **2.22 : 1** | 4.5 |

Zum Einordnen die Token-Werte derselben Messung:

```
foreground / background      19.60 : 1   ✅
muted-foreground / background 6.44 : 1   ✅
primary / background          4.11 : 1   ❌ (Links, Fehlermeldungen)
weiß / primary                5.07 : 1   ✅
```

Die `/70`-Varianten von `muted-foreground` fallen von guten 6.44 : 1 auf
3.54 : 1 — die zusätzliche Transparenz ist der Auslöser.

---

### U-14 — Events: Quellen-Link liegt in der Klickfläche des Event-Buttons · **P2**

```
button "Nuclearban Marathon Berlin-Brandenburg…" ∩ a "rad-net.de Breitensportkalender"
   Überlappung 163 × 13 px
```

Auf `/dashboard/events` liegt der Quellen-Hinweis-Link geometrisch **in**
der Trefferfläche des ersten Event-Buttons. Je nach Stapelreihenfolge
trifft ein Klick auf den Quellentext den Event-Button — oder umgekehrt der
Klick auf den Event verlässt die Seite Richtung rad-net.de.

Es ist die einzige Überlappung interaktiver Elemente, die der Scanner über
alle 20 Seiten gefunden hat, die nicht durch ein Overlay erklärt ist.

---

## P3

### U-15 — News: `line-clamp` schneidet ohne Hinweis ab · **P3**

```
V p.line-clamp-3 "A short, technical time trial opens up the Sp…"   scrollH=80  clientH=60
V p.line-clamp-2 "If AI can rapidly design novel medicines, cou…"   scrollH=80  clientH=40
```

Fünf Vorkommen bei 375 px, zwei bei 1440 px. Der Text wird hart beschnitten,
ohne Auslassungszeichen und ohne „Mehr"-Affordanz. Bei `line-clamp` setzt
der Browser normalerweise ein Ellipsenzeichen — hier greift es nicht, weil
der abgeschnittene Bereich außerhalb der Zeilenbegrenzung liegt.

Auf `/dashboard/community-rides` trifft dasselbe die Ortsnamen bei 200 %
Zoom: `span.line-clamp-1 "Homburg vor der Höhe"` → `scrollH=96 / clientH=32`.

---

### U-16 — Zwei verschiedene Rottöne nebeneinander · **P3**

| Quelle | Wert | Weißer Text darauf |
| --- | --- | --- |
| `--primary` (`globals.css:58`) | `oklch(0.55 0.25 25)` = **#df000d** | 5.07 : 1 ✅ |
| Tailwind `bg-red-500` (Badges, Gradienten) | **#fb2c36** | 3.81 : 1 ❌ |

Beide erscheinen auf derselben Seite (Primärbutton vs. Quellenbadge). Der
Tailwind-Ton ist der hellere und zugleich der mit dem schlechteren Kontrast.
Ein einziger Token für Rot würde beide Probleme lösen.

---

---

## Korrektur: U-09 bis U-12 waren Fehlalarme

Beim Umsetzen der Fixes habe ich alle Namens- und Label-Funde gegen den
**Chromium-Accessibility-Baum** (CDP `Accessibility.getPartialAXTree`)
gegengeprüft, statt gegen meinen eigenen Scanner. Vier Funde halten dem
nicht stand — mein Scanner prüfte nur `aria-label`, `title` und Textinhalt,
nicht `label[for]` und nicht `sr-only`-Text in Kindelementen:

| Fund | Behauptung | Tatsächlich (AX-Baum) |
| --- | --- | --- |
| **U-09** | Checkboxen ohne Label | ✅ Alle vier korrekt benannt, Quelle `relatedElement`. `#terms` heißt „I agree to the Terms of Service and Privacy Policy". Ein Klick auf den Labeltext schaltet um (`aria-checked false → true` verifiziert) — `label[for]` greift in Chromium auch auf Radix' `button[role=checkbox]`. |
| **U-10** | Switch ohne Namen | ✅ `#include-past` heißt „Include past rides". |
| **U-11** | Ride-Kartenlink ohne Namen | ✅ Heißt „Route preview" — `routeThumbnail.tsx:90` setzt `aria-label`. |
| **U-12** | Vier Suchfelder ohne Label | ⚠️ Abgeschwächt: alle haben einen Namen, drei über `placeholder`, das Rides-Feld sogar über ein echtes `aria-label="Search rides"`. Ein Platzhalter ist ein schwaches Label (er verschwindet beim Tippen), aber kein Verstoß. |

**Nicht behoben, weil nichts kaputt war.** Ein zwischenzeitlich gesetztes
`aria-hidden` auf dem Kartenlink habe ich wieder zurückgenommen — es hätte
einen funktionierenden Link aus der Tastaturnavigation entfernt.

Bestätigt geblieben ist **U-08**: genau *ein* Header-Button hat keinen
Namen. Der ist gefixt.


## Geprüft und in Ordnung

Ausdrücklich getestet und **kein** Defekt gefunden — damit klar ist, was
Abdeckung hatte:

| Prüfung | Ergebnis |
| --- | --- |
| Deckkraft aller Overlays (Dialog, Sheet, Select, Dropdown, Autocomplete) | alle **1.0** — nichts scheint durch |
| Markdown-Toolbar-Buttons (B / I / `<>` / Link / Liste) | `aria-label` **und** `title` gesetzt (`markdownEditor.tsx:172-173`) |
| Ortssuche-Vorschläge | keine Duplikate — die Doppelung in einem Zwischen-Log war ein Selektor-Artefakt |
| Kaputte Bilder (`naturalWidth === 0`) | keine, auf keiner Seite |
| Doppelte DOM-`id`s | keine |
| Verschachtelte Scroll-Container | keine |
| Horizontaler Überlauf bei 375 px | 18 von 20 Seiten sauber (Ausnahmen U-05, U-06) |
| `aria-hidden` über Fokussierbarem | nur der von Radix erwartete Hintergrund-Wrapper bei offenem Sheet; Fokus wird korrekt in den Sheet verschoben, keine Konsolenwarnung |
| Select-, Dropdown- und Sheet-Bedienung per Tastatur (Escape) | schließt zuverlässig |
| Filter „keine Treffer" | korrekter Empty State |
| `alt`-Attribute | bis auf die in `01-findings.md` genannten drei dynamischen Bilder vollständig |

## Bezug zu `01-findings.md`

Die dort schon dokumentierten UI-Themen sind hier **nicht** wiederholt:
fehlender Fokus-Indikator (F-09), identische Primär-/Fehler-/Fokusfarbe
(F-10), fehlende `<h1>`/`<main>` auf den Auth-Seiten (F-11), doppeltes
`<main>` (F-12), namenloser Like-Button (F-13), Dark-Mode-Attrappe (F-14),
Recharts-Größenfehler (F-15), Touch-Targets (F-19), uneinheitliche
Ladezustände (F-21).

# D – Accessibility & Design-System (Code-Review)

> Reviewer D · reiner Code-Review (kein Browser-Test) · Stand: 2026-08-19
> Basis: `src/app/globals.css`, `components.json`, `src/components/ui/**`, `src/features/**`, `src/app/**`
> Next.js-Aussagen gegen `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{loading,not-found,error}.md` geprüft.

## Zusammenfassung

Das Projekt hat ein **sehr vollständiges shadcn-Fundament** (105 Dateien in `src/components/ui/`, konsistente `cva`-Varianten, Radix/base-ui unter der Haube). Die Feature-Ebene ignoriert dieses Fundament aber in großen Teilen: **347 hartkodierte Tailwind-Farbklassen in 61 Dateien** (davon nur 5 in `ui/`), überwiegend `red-500`/`white`. Die semantische Token-Schicht existiert, wird aber an den sichtbarsten Stellen (Login, Register, Landing, Sidebar, Header) umgangen.

Drei strukturelle Befunde stechen heraus:

1. **Es gibt kein Theming.** `:root` und `.dark` in `globals.css` sind **Wert für Wert identisch** (Zeilen 51–84 vs. 86–119). Es gibt keinen `ThemeProvider`, kein `suppressHydrationWarning`, keinen Theme-Toggle. Die 79 `dark:`-Utilities im Code sind toter Code, weil `.dark` nie auf `<html>` landet. `next-themes` ist installiert und wird ausschließlich von `sonner.tsx` konsumiert — ohne Provider, was Toasts in das **OS**-Theme fallen lässt statt in das App-Theme.
2. **Kontrast.** Der Marken-Token `--primary`/`--destructive` = `oklch(0.55 0.25 25)` ≙ `#df000d` erreicht auf dem Hintergrund `#030101` nur **4.10:1** — d.h. jeder `text-primary`-Link, jedes `text-destructive` und jede destruktive Badge fällt unter AA. Der Haupt-CTA der Plattform (`text-white` auf `from-red-500`) liegt bei **3.76:1**. Sämtliche Rahmen (`--border` = primary @20 %) liegen bei **1.12:1** und sind faktisch unsichtbar; `--card` steht bei **1.02:1** zum Hintergrund, Karten sind also nicht vom Seitenhintergrund unterscheidbar.
3. **Zustände.** Client-seitig ist die Abdeckung gut (Skeletons, `isError`, Empty-Zweige in praktisch allen Grids). Server-seitig fehlt sie komplett: **kein `loading.tsx`, kein `not-found.tsx`** bei 14 `await`-Server-Pages und 5 `notFound()`-Aufrufen → weiße Next-Default-404 in einer durchgehend dunklen App, und Navigationen ohne jedes Feedback.

A11y-Grundlagen sind besser als erwartet: `lang="en"` gesetzt, alle 17 `<img>`/`<Image>` haben `alt`, keine `onClick`-`<div>`s, alle Dialoge/Sheets haben Titles, Formulare nutzen `FieldLabel htmlFor` + `aria-invalid` + `role="alert"`. Die Lücken sind punktuell (6 unbeschriftete Icon-Buttons, fehlende `<h1>` auf allen Auth-Seiten, kein Skip-Link, kein `<main>` auf Landing/Auth, `autoComplete` nur in 1 von 5 Formularen).

**Priorisierung:** 3 × P0, 7 × P1, 8 × P2, 4 × P3.

---

## Design-Tokens (Ist-Zustand)

`components.json` deklariert `"style": "radix-nova"`, `"baseColor": "neutral"`, `"cssVariables": true`. Die Tokens leben in `src/app/globals.css` als `@theme inline`-Mapping (Zeile 7–49) auf CSS-Variablen in `:root` (51–84) und `.dark` (86–119).

| Token | Wert | ≙ sRGB |
|---|---|---|
| `--background` | `oklch(0.08 0.01 15)` | `#030101` |
| `--foreground` | `oklch(0.98 0 0)` | `#f8f8f8` |
| `--card` | `oklch(0.12 0.02 15 / 80%)` | `#0a0303` (über bg) |
| `--popover` | `oklch(0.12 0.02 15)` | `#0c0404` |
| `--primary` | `oklch(0.55 0.25 25)` | `#df000d` |
| `--secondary` | `oklch(0.18 0.04 20)` | `#20090a` |
| `--muted` | `oklch(0.18 0.02 15)` | `#1a0e0f` |
| `--muted-foreground` | `oklch(0.65 0 0)` | `#8f8f8f` |
| `--accent` | `oklch(0.55 0.25 25)` | `#df000d` (= primary) |
| `--destructive` | `oklch(0.55 0.25 25)` | `#df000d` (= primary) |
| `--border` | `oklch(0.55 0.25 25 / 20%)` | `#2f0104` effektiv |
| `--input` | `oklch(0.55 0.25 25 / 15%)` | `#240103` effektiv |
| `--ring` | `oklch(0.55 0.25 25)` | `#df000d` |
| `--sidebar` | `oklch(0.1 0.01 15)` | `#050303` |
| `--chart-1…5` | L 0.55 → 0.15, C 0.25 → 0.05, alle H 25 | `#df000d` → `#1c0202` |
| `--radius` | `0.625rem` | — |

Auffällig:
- `--accent` und `--destructive` sind **exakt `--primary`**. Damit ist "gefährlich" visuell nicht von "Marke" unterscheidbar (WCAG 1.4.1 Use of Color) und `focus:bg-accent` in Menüs erzeugt rote Hover-Flächen.
- Die Chart-Skala ist eine reine **Helligkeitsrampe eines einzigen Farbtons** (H 25). `chart-2`…`chart-5` liegen bei 2.66 / 1.75 / 1.26 / 1.05 zum Hintergrund — vier von fünf Serien sind auf dunklem Grund nicht unterscheidbar.
- Komponenten-Varianten: `Button` 6 Varianten × 8 Größen (`button.tsx:11-40`), `Badge` 6 Varianten (`badge.tsx:12-27`), `Card` 2 Größen über `--card-spacing` (`card.tsx:13`). Das System ist ausreichend — es wird nur nicht benutzt.

**Komponenten-Inventar `src/components/ui/` (105 Dateien).** Nicht importiert und damit ungenutzter Ballast (Stichprobe): `menubar.tsx`, `context-menu.tsx`, `bubble.tsx`, `message.tsx`, `message-scroller.tsx`, `attachment.tsx`, `kbd.tsx`, `direction.tsx`, `marker.tsx`. Kein A11y-Problem, aber Wartungslast (siehe D-19).

---

## Findings

### D-01 — `:root` und `.dark` sind identisch: es gibt kein Theming · **P1**
- **Ort:** `src/app/globals.css:51-84` (`:root`) vs. `src/app/globals.css:86-119` (`.dark`)
- **Befund:** Beide Blöcke enthalten dieselben 22 Deklarationen mit denselben Werten, z. B. `--background: oklch(0.08 0.01 15);` (Z. 52) und `--background: oklch(0.08 0.01 15);` (Z. 87). Der einzige Unterschied ist, dass `.dark` `--radius` nicht wiederholt. Zusätzlich existiert `@custom-variant dark (&:is(.dark *));` (Z. 5), aber **nirgends im Repo wird die Klasse `dark` gesetzt** — `grep` über `src/` findet weder `ThemeProvider`, `classList`, `documentElement` noch ein `"dark"`-String-Literal.
- **Auswirkung:** Die App ist hart Dark-Only. Die 79 `dark:`-Utilities in den shadcn-Komponenten (z. B. `dark:bg-input/30` in `input.tsx:11`, `dark:aria-invalid:ring-destructive/40` in `button.tsx:8`) greifen **nie** — d. h. Inputs bekommen nie ihren gedachten Füllhintergrund, invalide Felder nie ihren stärkeren Ring. Das erklärt, warum Eingabefelder auf dunklem Grund kaum sichtbar sind (siehe D-05). Nutzer mit `prefers-color-scheme: light` bekommen trotzdem Dark.
- **Fix:** Entscheidung treffen. Entweder (a) Dark-Only bewusst: `.dark`-Block löschen, `@custom-variant dark` entfernen, `dark:`-Utilities aus den ui-Komponenten strippen, `next-themes` deinstallieren — dann aber die Werte in `:root` so setzen, dass sie ohne die `dark:`-Ergänzungen funktionieren. Oder (b) echtes Theming: `ThemeProvider` aus `next-themes` in `src/app/layout.tsx` (mit `attribute="class"`, `defaultTheme="dark"`), `suppressHydrationWarning` auf `<html>`, eine echte Light-Palette in `:root` und Toggle in `userMenu.tsx`.

### D-02 — `--primary`/`--destructive` verfehlt AA für Text (4.10:1) · **P0**
- **Ort:** `src/app/globals.css:58` `--primary: oklch(0.55 0.25 25);` / `:67` `--destructive: …`
- **Befund:** `#df000d` auf `--background` `#030101` = **4.10:1**, auf `--card` `#0a0303` = **4.03:1**. Erforderlich sind 4.5:1. Betroffen sind alle Stellen mit `text-primary` (Button-Variante `link`, `button.tsx:22`), `text-destructive` (Badge/Button `destructive`, `badge.tsx:16` bzw. `button.tsx:20`, sowie `FieldError` in `field.tsx:218` `"text-sm font-normal text-destructive"`) und `data-[variant=destructive]:text-destructive` in `dropdown-menu.tsx:78`.
- Kombiniert mit den zugehörigen Flächen wird es schlechter: `bg-destructive/10` + `text-destructive` (Badge `destructive`) = **3.95:1** auf Background, **3.86:1** auf Card.
- **Auswirkung:** **Fehlermeldungen in Formularen** sind der häufigste Anwendungsfall von `text-destructive` und liegen damit unter AA — betrifft alle 5 Auth-Formulare, `createGroupDialog`, `editRideDialog`, `ridePlanner` etc.
- **Fix:** Zwei Tokens trennen und aufhellen. Vorschlag: `--destructive: oklch(0.70 0.19 25)` (≈ `#ff6b5e`, ~8:1) für Text/Icons, `--primary` bei `oklch(0.62 0.24 25)` (≈ 5.4:1). Falls die Markenfarbe unantastbar ist: ein zusätzliches `--primary-text`/`--destructive-text`-Token einführen und in `badge.tsx`, `button.tsx`, `field.tsx` verwenden.

### D-03 — Haupt-CTA: `text-white` auf `from-red-500` = 3.76:1 · **P0**
- **Ort:** `src/features/auth/components/loginForm.tsx:170`
  ```
  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:from-red-600 hover:to-red-700"
  ```
  Gleiches Muster in `registerForm.tsx:280`, `forgotPasswordForm.tsx`, `resetPasswordForm.tsx:132` & `:205`, `src/app/page.tsx:29`, `src/components/navigation.tsx:15`, `src/components/cookieConsent.tsx:63`, `src/components/typedHeadline.tsx:69` — **9 Vorkommen in 8 Dateien**.
- **Befund:** `#ffffff` auf `#ef4444` (red-500, linke Hälfte des Gradienten) = **3.76:1**. Erst ab `red-600` (`#dc2626`) wird 4.83:1 erreicht. Der Button ist `h-8`/`text-sm` → Normaltext, 4.5:1 nötig.
- **Auswirkung:** Der wichtigste Button der gesamten Plattform ("Sign in", "Create account", "Get started free", "Accept cookies") ist auf seiner linken Hälfte nicht AA-konform.
- **Fix:** Gradient auf `from-red-600 to-red-700` (4.83:1 → 6.47:1) ziehen — oder, besser, das gesamte Muster in eine Button-Variante `cta` in `buttonVariants` (`button.tsx:11`) heben und die 9 Inline-Overrides entfernen (siehe D-08).

### D-04 — Fokus-Indikator unterschreitet 3:1 · **P0**
- **Ort:** `src/components/ui/button.tsx:8` — `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`; identisch in `input.tsx:11`, `select.tsx:46`, `textarea.tsx:10`, `checkbox.tsx:16`, `radio-group.tsx:29`, `switch.tsx:20`, `badge.tsx:8`.
- **Befund:** Der sichtbare 3px-Ring ist `--ring` bei 50 % Alpha → effektiv `#710107` auf `#030101` = **1.69:1**. WCAG 2.1 SC 1.4.11 (Non-text Contrast) und 2.4.7 verlangen 3:1 gegenüber dem Umfeld. Der begleitende `focus-visible:border-ring` (voll deckend, 4.10:1) rettet den Zustand nur teilweise, weil er 1px breit ist und bei `variant="ghost"`/`link` auf transparentem Rand kaum wahrnehmbar bleibt.
- Ein zweiter Fall: `src/features/notification/components/notificationSheet.tsx:226` `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500` ersetzt den Outline korrekt (red-500 = 5.53:1) — hier stimmt es, aber mit hartkodierter Farbe.
- **Auswirkung:** Tastaturnutzer verlieren die Position; auf dunklem Grund ist ein 1.69:1-Ring praktisch unsichtbar.
- **Fix:** `--ring` als Vollton oder mit deutlich höherem Alpha einsetzen: `focus-visible:ring-ring/80` bringt bei aufgehelltem `--ring` ≥3:1. Alternativ ein dedizierter heller Ring-Token (`--ring: oklch(0.75 0.15 25)`), der bewusst nicht die Markenfarbe ist.

### D-05 — Alle Rahmen-Tokens liegen bei ~1.1:1 — Inputs und Karten haben keine sichtbare Begrenzung · **P1**
- **Ort:** `src/app/globals.css:67-68`
  ```
  --border: oklch(0.55 0.25 25 / 20%);
  --input:  oklch(0.55 0.25 25 / 15%);
  ```
- **Befund:** effektiv `#2f0104` (**1.12:1**) bzw. `#240103` (**1.07:1**) gegen `#030101`. `Input` (`input.tsx:11`) rendert `bg-transparent border border-input` — bei 1.07:1 und ohne den nie greifenden `dark:bg-input/30` (siehe D-01) ist das Feld **nicht als Feld erkennbar**. `Card` setzt `ring-1 ring-foreground/10` (`card.tsx:15`) = 1.21:1, und die Kartenfläche selbst steht bei **1.02:1** zum Hintergrund — Karten sind schlicht unsichtbar. `Switch` im Off-Zustand nutzt `data-unchecked:bg-input` (`switch.tsx:20`) → 1.08:1, der Zustand ist nicht ablesbar.
- **Auswirkung:** WCAG 1.4.11. Formulare wirken wie freistehender Text; Karten-Gruppierung geht verloren. Wahrscheinlich die Ursache des im Browser-Test sichtbaren "alles schwimmt"-Eindrucks.
- **Fix:** `--border` auf ~`oklch(0.30 0.03 20)` (neutral, ≈ 3:1 möglich) statt 20 % Marke; `--input` mindestens auf 3:1 anheben; `--card` mit echter Erhöhung versehen (`oklch(0.14 0.015 15)` deckend statt 80 %-Alpha auf identischem Grund).

### D-06 — Kein `not-found.tsx`: 5 `notFound()`-Aufrufe landen auf der Next-Default-404 · **P1**
- **Ort:** `src/app/dashboard/community-rides/[rideId]/page.tsx:38`, `src/app/dashboard/community/g/[id]/page.tsx:75`, `src/app/dashboard/pro/[race]/[year]/page.tsx:454` & `:464`, `src/app/dashboard/pro/[race]/[year]/stage/[stage]/page.tsx:41` & `:46` — jeweils `notFound();`
- **Befund:** `find src/app -name 'not-found.tsx'` → leer. Laut `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md` rendert `not-found.js` die UI, wenn `notFound()` im Segment geworfen wird; ohne die Datei greift Next' eingebaute 404-Seite. Ein fertiger, gestylter Ersatz existiert bereits ungenutzt: `src/components/notFoundComponent.tsx` (mit `<main>`, `<h1>404</h1>`, Token-Farben) — importiert wird er nur von `src/features/community/components/userMainComponent.tsx:34`.
- **Auswirkung:** Für ein Viertel der Detail-Routen bricht die App bei ungültiger ID visuell komplett aus (helle Default-Seite in einer schwarzen App, kein Sidebar-Kontext, kein Weg zurück). Zusätzlich: Next liefert für nicht gematchte URLs überhaupt keine gebrandete 404.
- **Fix:** `src/app/not-found.tsx` anlegen, das `NotFoundComponent` rendert und einen Link nach `/dashboard` ergänzt. Zusätzlich `src/app/dashboard/not-found.tsx`, damit die 404 innerhalb des Dashboard-Layouts (mit Sidebar) erscheint. Optional `global-not-found.js` (in Next 16 experimentell, `globalNotFound`-Flag in `next.config.ts`) für nicht gematchte URLs.

### D-07 — Kein `loading.tsx`: 14 Server-Pages navigieren ohne jedes Feedback · **P1**
- **Ort:** `src/app/dashboard/{page,profile/page,settings/page,news/page,pro/page,admin/users/page,admin/analytics/page}.tsx` u. a. — alle mit `await` im Server-Component-Body (z. B. `src/app/dashboard/pro/[race]/[year]/page.tsx` mit mehreren Remote-Fetches vor dem ersten Render).
- **Befund:** `find src/app -name 'loading.tsx'` → leer. `loading.md` beschreibt genau diesen Fall: ohne `loading.js` gibt es keine Suspense-Boundary, die Navigation blockiert bis das Segment fertig ist. `src/components/loadingComponent.tsx` existiert bereits (Spinner + "Loading"-Text, `aria-hidden` auf dem Spinner) und wird nur an einer Stelle client-seitig verwendet.
- **Auswirkung:** Klick auf einen Sidebar-Eintrag wirkt bis zum Abschluss der Server-Fetches wie ein toter Link. Besonders schlimm bei `/dashboard/pro/[race]/[year]` (externe Live-Daten) und `/dashboard/news`.
- **Fix:** `src/app/dashboard/loading.tsx` (rendert `LoadingComponent` oder ein Skeleton-Layout) plus segmentweise `loading.tsx` für die langsamen Routen (`pro/`, `news/`). Hinweis aus der Next-16-Doku: `loading.js` garantiert keine sofortige Client-Navigation — dafür zusätzlich `unstable_instant` aus der Route exportieren (`docs/01-app/02-guides/instant-navigation.mdx`).

### D-08 — 347 hartkodierte Farbklassen in 61 Dateien am Token-System vorbei · **P1**
- **Ort:** siehe Hotspot-Tabelle unten. Repräsentativ `src/app/dashboard/layout.tsx:25-30`:
  ```
  <header className="… border-b border-red-500/20 bg-background px-4">
    …
    <Separator orientation="vertical" className="mr-2 h-4 bg-red-500/20" />
  ```
- **Befund:** Verteilung der Top-Klassen über `src/`: `text-red-500` (63×), `text-white` (37×), `border-red-500/20` (28×), `text-red-400` (25×), `from-red-500` (12×), `bg-red-500/10` (12×), `bg-red-500` (12×), `to-red-700` (11×). Nur **5** der 347 Treffer liegen in `src/components/ui/` — die Bibliothek ist also sauber, die Anwendungsebene nicht. Zusätzlich 40+ Hex-Literale in JS (`particleBackground.tsx:45-98` 6× `#ef4444`, `elevationChart.tsx:26-29`, `eventTypes.ts:10-18`, `riderDots.ts:7-17`).
- **Auswirkung:** (a) Ein Theme-Wechsel oder ein Rebranding ist nicht möglich, ohne 61 Dateien anzufassen. (b) Es entstehen zwei parallele Rot-Töne: `--primary` = `#df000d` (4.10:1) und `red-500` = `#ef4444` (5.53:1) — nebeneinander sichtbar unterschiedlich, mit unterschiedlichem Kontrastverhalten. (c) `border-red-500/20` (1.20:1) und `--border` (1.12:1) sehen fast gleich aus, sind aber verschiedene Farben.
- **Fix:** Mechanische Ersetzung, dann Lint-Regel. Mapping: `text-red-500`→`text-primary`, `text-red-400`→`text-primary` (hover), `border-red-500/20`→`border-border`, `bg-red-500/10`→`bg-primary/10`, `bg-red-500/20 text-red-500`→`bg-primary/15 text-primary`, `text-white` auf farbigem Grund→`text-primary-foreground`. Die 9 Gradient-CTAs (D-03) als `variant: { cta: … }` in `buttonVariants` aufnehmen. Danach in `biome.json` eine `nursery/noRestrictedClasses`-artige Regel oder ein `grep`-Gate in CI.

### D-09 — Chart-Palette: 4 von 5 Serienfarben unter 3:1 · **P1**
- **Ort:** `src/app/globals.css:70-74`
  ```
  --chart-1: oklch(0.55 0.25 25);  --chart-2: oklch(0.45 0.2 25);
  --chart-3: oklch(0.35 0.15 25);  --chart-4: oklch(0.25 0.1 25);
  --chart-5: oklch(0.15 0.05 25);
  ```
- **Befund:** Kontraste gegen `--background`: chart-1 4.10, chart-2 **2.66**, chart-3 **1.75**, chart-4 **1.26**, chart-5 **1.05**. Alle fünf haben denselben Hue (25) — auch für Normalsichtige sind das fünf Rottöne, für Nutzer mit Protanopie/Deuteranopie ununterscheidbar.
- **Verwendet in:** `src/features/analytics/components/activityCharts.tsx` (4 Recharts-Container, Zeilen 63/89/125/160), `src/features/rides/components/elevationChart.tsx`.
- **Auswirkung:** Analytics-Diagramme mit mehr als einer Serie sind nicht lesbar. WCAG 1.4.11 (grafische Objekte, 3:1) und 1.4.1 (Use of Color).
- **Fix:** Kategoriale, hue-getrennte Palette mit gleichmäßiger Helligkeit, z. B. `oklch(0.70 0.19 25)` / `(0.72 0.15 145)` / `(0.70 0.14 250)` / `(0.78 0.15 85)` / `(0.72 0.16 310)` — alle ≥ 4.5:1 auf `#030101`. Zusätzlich Serien über Strichmuster/Marker differenzieren.

### D-10 — Scrollbar-Styling ist funktionslos: `hsl()` um `oklch()`-Variablen · **P2**
- **Ort:** `src/app/globals.css:143`, `:150`, `:158`
  ```
  ::-webkit-scrollbar-thumb { background: hsl(var(--muted)); … }
  ::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground)); … }
  * { scrollbar-color: hsl(var(--muted-foreground)) transparent; }
  ```
- **Befund:** `--muted` ist `oklch(0.18 0.02 15)` (Z. 62). `hsl(oklch(0.18 0.02 15))` ist keine gültige Farbe → die Deklaration wird vom Parser verworfen. Das Muster stammt aus shadcn-Setups mit HSL-Tokens; hier wurde auf OKLCH migriert, ohne die Scrollbar-Regeln nachzuziehen.
- **Auswirkung:** Scrollbars fallen auf den Browser-Default zurück — helle Leisten in einer schwarzen App, in jedem `overflow-auto`-Container (Chat-Threads, Event-Liste, Notification-Sheet, Kommentare).
- **Fix:** `hsl(...)` entfernen: `background: var(--muted);` / `scrollbar-color: var(--muted-foreground) transparent;`.
- **Status:** behoben. Im gebauten CSS steht jetzt
  `::-webkit-scrollbar-thumb{background:var(--muted)…}` und
  `*{scrollbar-width:thin;scrollbar-color:var(--muted-foreground) transparent}`; kein `hsl(var(--…))`
  mehr im gesamten `src/`.

### D-11 — Sonner ruft `useTheme()` ohne Provider → Toasts folgen dem OS statt der App · **P2**
- **Ort:** `src/components/ui/sonner.tsx:10-15`
  ```
  import { useTheme } from "next-themes";
  const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();
    return <Sonner theme={theme as ToasterProps["theme"]} …
  ```
  Eingebunden in `src/app/layout.tsx:52` als `<Toaster position="top-center" richColors closeButton />` — **ohne** umschließenden `ThemeProvider`.
- **Befund:** Ohne Provider liefert `useTheme()` einen leeren Default; `theme` bleibt `"system"`. Sonner richtet sich dann nach `prefers-color-scheme` des Betriebssystems. Bei einem Nutzer mit Light-OS erscheinen helle Toasts in der durchgehend dunklen App. `richColors` verschärft das, weil Sonner dann eigene, nicht token-basierte Erfolgs-/Fehlerfarben zeichnet, die die Token-Overrides in Z. 30-35 (`--normal-bg: var(--popover)` etc.) teilweise überschreiben.
- **Auswirkung:** Toasts sind der einzige Kanal für Fehler-Feedback in den Auth-Formularen (`loginForm.tsx:70-93` nutzt ausschließlich `toast.error`). Fehlerhafte Darstellung dort ist teuer.
- **Fix:** Entweder `ThemeProvider` ergänzen (siehe D-01b) oder `theme="dark"` fest setzen und `useTheme`/`next-themes` entfernen.

### D-12 — Keine `<h1>` auf den Auth-Seiten; `CardTitle` ist ein `<div>` · **P2**
- **Ort:** `src/app/login/page.tsx` (rendert nur `<LoginForm />`), `src/app/register/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `src/app/dashboard/community-rides/new/page.tsx`, `src/app/dashboard/community-rides/generate/page.tsx`
- **Befund:** In `loginForm.tsx:128` steht `<CardTitle className="text-2xl">Welcome back</CardTitle>`; `CardTitle` rendert laut `src/components/ui/card.tsx:41-50` ein `<div data-slot="card-title">`. Damit hat keine dieser 6 Seiten eine Überschrift der Ebene 1 — `grep '<h[1-6]'` liefert für alle sechs Dateien null Treffer. Die restlichen 22 Seiten haben genau eine `<h1>`, ohne Sprünge; `src/app/imprint/page.tsx` ist mit h1→h2→3×h3 sauber gestuft.
- **Auswirkung:** Screenreader-Nutzer können auf den Einstiegsseiten nicht per Überschriften-Navigation orientieren; SEO-Signal fehlt auf `/login` und `/register`.
- **Fix:** `<CardTitle asChild><h1>Welcome back</h1></CardTitle>` — `CardTitle` unterstützt derzeit kein `asChild`, also entweder ergänzen oder `<h1 className="font-heading text-2xl …">` direkt setzen. Für `community-rides/new` und `/generate` eine Seitenüberschrift ("Plan a ride" / "Generate a route") ergänzen.

### D-13 — Kein Skip-Link, kein `<main>` auf Landing- und Auth-Seiten · **P2**
- **Ort:** `src/app/layout.tsx:44-51` (Root-Body ohne Skip-Link), `src/app/page.tsx:9` (`<section className="relative flex min-h-screen …">` als äußerstes Element), `loginForm.tsx:105` (`<div className="relative flex min-h-screen items-center justify-center px-4 py-12">`)
- **Befund:** `grep '<main'` findet 8 Treffer: `terms`, `privacy`, `imprint`, `rides/[rideId]:54`, `dashboard/layout.tsx:42` sowie die drei Status-Komponenten. Landing, Login, Register, Forgot-/Reset-Password haben **kein** `main`-Landmark. Ein Skip-Link ("Skip to content") existiert nirgends — `grep -i 'skip'` über `src/` ist leer.
- **Auswirkung:** WCAG 2.4.1 (Bypass Blocks, Level A). Im Dashboard muss ein Tastaturnutzer bei jedem Seitenwechsel durch Sidebar-Trigger, Header-Buttons und das gesamte Sidebar-Menü tabben, bevor er den Inhalt erreicht.
- **Fix:** In `src/app/layout.tsx` als erstes Body-Kind: `<a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>`; `id="main"` auf `<main>` in `dashboard/layout.tsx:42` und Landing/Auth-Wrapper auf `<main>` umstellen.

### D-14 — Formulare ohne `autoComplete` und ohne Pflichtfeld-Kennzeichnung · **P2**
- **Ort:** `src/features/auth/components/loginForm.tsx:133-162`, `registerForm.tsx:165-234`, `forgotPasswordForm.tsx`, `resetPasswordForm.tsx`
- **Befund:** `grep autoComplete` über `src/` liefert genau 3 Treffer, alle in `src/features/auth/components/changePasswordForm.tsx:81/96/111` (`current-password`, 2× `new-password`). Login- und Register-Formular haben keinerlei `autoComplete`; `<Input id="email" type="email" …>` (login:137) müsste `autoComplete="email"`, das Passwortfeld `current-password`, Register-Felder `given-name`/`family-name`/`username`/`email`/`new-password` tragen. Ebenso fehlt jede Pflichtfeld-Auszeichnung: kein `required`, kein `aria-required`, kein visuelles `*` — obwohl alle Felder per Zod-Schema Pflicht sind.
- **Auswirkung:** WCAG 1.3.5 (Identify Input Purpose, AA) verletzt; Passwortmanager und Browser-Autofill greifen nicht — spürbare Reibung bei Login und Registrierung. Nutzer erfahren erst nach dem Absenden, welche Felder Pflicht sind.
- **Fix:** `autoComplete` an allen fünf Formularen ergänzen; `required` auf die Inputs, plus eine dezente Pflichtkennzeichnung (`FieldLabel` mit `<span aria-hidden>*</span>` und einmaligem Hinweis "* required").

### D-15 — `FieldError` ist nicht per `aria-describedby` mit dem Input verknüpft · **P2**
- **Ort:** `src/components/ui/field.tsx:208-222`
  ```
  return (
    <div role="alert" data-slot="field-error" className={cn("text-sm font-normal text-destructive", className)} …>
  ```
- **Befund:** Der Fehlercontainer trägt `role="alert"` (wird also beim Erscheinen vorgelesen), bekommt aber **keine `id`**, und keiner der 5 Auth-Formular-Inputs setzt `aria-describedby`. Beispiel `loginForm.tsx:134-143`: `<Input id="email" … aria-invalid={!!errors.email} />` gefolgt von `<FieldError errors={[errors.email]} />`.
- **Auswirkung:** Der Fehler wird beim Auftauchen einmal angesagt. Navigiert der Nutzer danach per Tab zurück ins Feld, hört er nur "invalid" ohne den Grund. Betrifft ~30 Felder in 12 Formularen.
- **Fix:** `FieldError` eine deterministische `id` geben (z. B. abgeleitet aus dem `Field`-Kontext oder per `useId`) und in `Field` per Context an die Kinder durchreichen; Inputs erhalten `aria-describedby={errorId}`, wenn ein Fehler vorliegt. Da `Field` bereits `data-invalid` verwaltet, ist die Stelle dafür `field.tsx:69-82`.

### D-16 — Interaktive Links innerhalb eines `<label>` (Terms-Checkbox) · **P2**
- **Ort:** `src/features/auth/components/registerForm.tsx:251-273`
  ```
  <FieldLabel htmlFor="terms" className="text-sm font-normal leading-relaxed">
    I agree to the{" "}
    <Link href="/terms" className="text-red-500 hover:text-red-400">Terms of Service</Link>{" "}
    and <Link href="/privacy" …>Privacy Policy</Link>
  </FieldLabel>
  ```
- **Befund:** `FieldLabel` rendert ein `<label htmlFor="terms">` (`field.tsx:96-112` → `Label`). Zwei `<a>`-Elemente liegen darin. Ein Klick auf "Terms of Service" navigiert **und** togglet die Checkbox (Label-Aktivierung); Screenreader lesen den Accessible Name der Checkbox als "I agree to the Terms of Service and Privacy Policy" inkl. der Links.
- **Auswirkung:** Nutzer kann die AGB nicht öffnen, ohne unbeabsichtigt zuzustimmen bzw. die Zustimmung zurückzunehmen. Rechtlich heikel bei einer Einwilligungs-Checkbox.
- **Fix:** Label auf den reinen Zustimmungstext beschränken und die Links daneben außerhalb des `<label>` platzieren, oder `onClick={(e) => e.preventDefault()}`-frei per `<Link onClick={(e) => e.stopPropagation()}>` — sauberer ist die Trennung: `<FieldLabel htmlFor="terms">I agree to the terms</FieldLabel>` + separater `<FieldDescription>` mit den beiden Links.

### D-17 — 6 Icon-Buttons ohne zugänglichen Namen · **P2**
- **Ort:**
  - `src/features/chat/components/groupChat.tsx:183` — `<Button type="button" variant="outline" size="icon"><SmileIcon className="size-4" /></Button>`
  - `src/features/chat/components/directChatThread.tsx:176` — identisch
  - `src/features/chat/components/groupChat.tsx:191` und `directChatThread.tsx:183` — Emoji-Auswahl-Buttons (Name ist das Emoji-Zeichen, wird von Screenreadern als "grinsendes Gesicht" o. ä. vorgelesen → tolerierbar, aber unspezifisch)
  - `src/components/ui/combobox.tsx:256` und `src/components/ui/calendar.tsx:204` — shadcn-intern, Combobox-Chip-Remove ohne `sr-only`
- **Befund:** Systematischer Scan über alle `<Button … size="icon*">`: 28 Vorkommen außerhalb `ui/`, davon 22 mit `aria-label`. Der Rest oben. Positiv hervorzuheben: `markdownEditor.tsx:166-176` setzt `aria-label` **und** `title`, `riderDetailsEditor.tsx:323` nutzt `aria-label={\`Edit ${label}\`}`, `followerListSheet.tsx:71/82` kontextualisiert mit dem Nutzernamen.
- **Auswirkung:** Der Emoji-Picker-Trigger wird als "Schaltfläche" ohne Bedeutung angesagt — in beiden Chat-Oberflächen.
- **Fix:** `aria-label="Insert emoji"` auf die beiden Popover-Trigger; `aria-label={\`Insert ${emoji}\`}` auf die Emoji-Buttons; `<span className="sr-only">Remove</span>` in `combobox.tsx:256`.

### D-18 — Dekorative Canvas-Animation: kein `aria-hidden`, keine Reduced-Motion-Berücksichtigung, kein Stopp · **P2**
- **Ort:** `src/components/particleBackground.tsx:491-497`
  ```
  return (
    <canvas ref={canvasRef} className="absolute inset-0 z-0" style={{ background: "transparent" }} />
  );
  ```
- **Befund:** Das Canvas läuft in einer Endlos-`requestAnimationFrame`-Schleife (`particleBackground.tsx:217ff.`), zeichnet bewegte Partikel und Routenlabels und reagiert auf `mousedown`/`touchstart` (Z. 211-213). Es trägt weder `aria-hidden="true"` noch `role="presentation"`. `grep 'prefers-reduced-motion'` findet im gesamten Repo genau **einen** Treffer — `src/components/typedHeadline.tsx:21-22`, wo die Tipp-Animation korrekt abgeschaltet wird. Das Canvas hat keine solche Abfrage. Eingebunden auf Landing, Login, Register, Forgot- und Reset-Password.
- **Auswirkung:** WCAG 2.2.2 (Pause, Stop, Hide — Level A): dauerhaft bewegter Inhalt ohne Pausiermöglichkeit auf 5 Seiten. WCAG 2.3.3 (Animation from Interactions, AAA). Zusätzlich: `<canvas>` ohne `aria-hidden` erscheint für manche Screenreader als leeres Grafik-Element im Accessibility-Tree.
- **Fix:** `aria-hidden="true"` ergänzen; die `matchMedia("(prefers-reduced-motion: reduce)")`-Abfrage aus `typedHeadline.tsx:21` übernehmen und bei `reduce` nur einen statischen Frame zeichnen (oder das Canvas gar nicht mounten).

### D-19 — Sidebar-Navigation ohne `<nav>`-Landmark und ohne `aria-current` · **P3**
- **Ort:** `src/components/sidebar.tsx:78-100`
  ```
  const isActive = pathname === item.href;
  <SidebarMenuButton asChild isActive={isActive}
    className={isActive ? "bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500" : "hover:bg-red-500/10"}>
    <Link href={item.href}> … </Link>
  ```
- **Befund:** `SidebarMenu` rendert `<ul>` (`ui/sidebar.tsx:445`), `SidebarMenuItem` `<li>` (`:456`), `SidebarMenuButton` setzt `data-active={isActive}` (`:510`) — aber kein `aria-current="page"`, und der umgebende Container ist kein `<nav>`. Der aktive Zustand wird ausschließlich farblich transportiert (rote Fläche + roter Text).
- **Auswirkung:** WCAG 1.4.1: die aktive Seite ist für Screenreader-Nutzer nicht erkennbar. Landmark-Navigation ("zur Navigation springen") funktioniert nicht.
- **Fix:** `<Link href={item.href} aria-current={isActive ? "page" : undefined}>`; `SidebarContent` in `<nav aria-label="Main">` wickeln (oder `SidebarGroup` mit `role="navigation"` + Label).
- **Nebenbefund:** `src/components/navigation.tsx` wird nirgends importiert — toter Code mit einem weiteren Gradient-CTA (Z. 15).

### D-20 — `text-[10px]` (12×) unterschreitet die Typo-Skala · **P3**
- **Ort:** `src/features/notification/components/notificationSheet.tsx:281` (Badge-Zähler, `text-white` auf `bg-red-500` → zusätzlich nur 3.76:1), `src/features/chat/components/directChatHeaderButton.tsx:29`, `directChatDialog.tsx:104`, `src/features/rides/components/rideParticipants.tsx:47`, `waypointList.tsx:121`, `rideMap.tsx:624` & `:751`, `routeGeneratorMap.tsx:761` & `:768`, `src/features/pro/components/raceMap.tsx:234`, `src/app/dashboard/pro/[race]/[year]/page.tsx:184` & `:194`
- **Befund:** Die Skala ist ansonsten diszipliniert (`text-sm` 247×, `text-xs` 140×, dann 2xl/3xl/base/lg/xl). Die Ausreißer sind 12× `text-[10px]`, 2× `text-[11px]` (`eventsExplorer.tsx:225/237`), 1× `text-[13px]` (`eventsMap.tsx:54`), 1× `text-[0.7rem]` (`postComments.tsx:152`), 1× `text-[0.85em]` (`markdown.tsx:43`). Spacing ist unauffällig: `gap-2` (148×), `gap-1.5` (80×), `gap-3` (53×), `gap-1` (52×), `gap-4` (50×) — klare Dominanzverteilung, keine Wildwuchs-Werte.
- **Auswirkung:** 10px ist unter jeder üblichen Mindestgröße; in Kombination mit `text-muted-foreground` (6.4:1) noch lesbar, mit `text-white` auf `red-500` (3.76:1) nicht. Kein direkter WCAG-Verstoß (es gibt keine Mindestgröße), aber ein Usability- und Zoom-Problem.
- **Fix:** `text-[10px]`/`text-[11px]` durch `text-xs` ersetzen; wo wirklich kleiner nötig (Kartenlabels), ein Token `--text-2xs: 0.6875rem` in `@theme` definieren statt 5 verschiedene Einzelwerte.

### D-21 — `error.tsx` ignoriert `error` und `unstable_retry` · **P3**
- **Ort:** `src/app/error.tsx`
  ```
  "use client";
  import { ErrorComponent } from "@/components/errorComponent";
  export default function ErrorPage() {
    return <ErrorComponent />;
  }
  ```
- **Befund:** Laut `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` bekommt die Error-Boundary in Next 16 die Props `{ error: Error & { digest?: string }, unstable_retry: () => void }` (in älteren Versionen `reset`). Beide werden hier verworfen. `ErrorComponent` akzeptiert sogar ein `error?: string`-Prop (`src/components/errorComponent.tsx:3-7`), das ungenutzt bleibt. Es gibt außerdem kein `global-error.tsx` und keine segmentweise Boundary unter `/dashboard`.
- **Auswirkung:** Der Nutzer sieht "500 – Something went wrong" ohne jede Möglichkeit, es erneut zu versuchen; die Fehlerursache wird nirgends geloggt (kein `useEffect(() => console.error(error))`), obwohl das Projekt mit `src/features/logger/` einen Logger besitzt. Fehler im Root-Layout selbst werden gar nicht abgefangen.
- **Fix:** Props durchreichen: `export default function ErrorPage({ error, unstable_retry }) { useEffect(() => logger.error(error), [error]); return <ErrorComponent error={error.message} onRetry={unstable_retry} />; }` und `ErrorComponent` um einen "Try again"-Button ergänzen. Zusätzlich `src/app/global-error.tsx`.

### D-22 — Custom-Autocomplete ohne Combobox-Semantik und ohne Tastaturnavigation · **P3**
- **Ort:** `src/features/rides/components/locationSearch.tsx:63-108`
- **Befund:** Ein `<Input>` (ohne `id`, ohne `aria-label`, nur `placeholder="Search for a place or address…"`) mit darunter absolut positionierter `<ul>` aus `<button>`-Zeilen. Es fehlen `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`. Geschlossen wird nur per `mousedown` außerhalb (Z. 52-63) — kein `Escape`-Handler, keine Pfeiltasten-Navigation. Der ähnliche Fall in `src/features/rides/components/rideFilters.tsx:217-239` macht es besser (`role="listbox"`, `aria-label="Place suggestions"`, `role="option"`, `aria-label` am Input) — dort ist allerdings `aria-selected={false}` hart verdrahtet.
- **Auswirkung:** Screenreader kündigen nicht an, dass Vorschläge erschienen sind. Tastaturnutzer erreichen die Vorschläge nur per Tab (funktioniert, weil es echte Buttons sind) und können das Popup nicht per Escape schließen.
- **Fix:** Auf die bereits vorhandene `src/components/ui/combobox.tsx` (base-ui, vollständige ARIA-Implementierung) umstellen — sie wird schon von `bikeCombobox.tsx` verwendet. Minimal-Fix: `aria-label` + `role="combobox"`/`aria-expanded` am Input, `role="listbox"` an der `ul`, `onKeyDown` für Escape/Arrow.

### D-23 — Eingabefelder ohne zugänglichen Namen (11 Stellen) · **P2**
- **Ort:** systematischer Scan (`<Input>`/`<Textarea>` ohne `id` und ohne `aria-label`):
  - `src/features/users/components/riderDetailsEditor.tsx:123` (Bio-Textarea) und `:208` (`<Input type="number" min={0} max={80} …>` — **ohne jeden Namen**, nicht einmal ein Placeholder). Das zugehörige Label ist ein `<span>`: `riderDetailsEditor.tsx:285-287` `<span className="w-32 shrink-0 pt-1.5 text-sm font-medium text-muted-foreground">{label}</span>`
  - `src/features/community/components/groupsGrid.tsx:68`, `ridersGrid.tsx:75`, `followerListSheet.tsx:185`, `usersTable.tsx:60`, `directChatDialog.tsx:142` — Suchfelder, nur Placeholder
  - `src/features/posts/components/postComments.tsx:78`, `directChatThread.tsx:166` — Nachrichteneingaben, nur Placeholder
  - `src/features/community/components/createGroupDialog.tsx:152` / `editGroupDialog.tsx:172` — `<FieldLabel>Group image</FieldLabel>` ohne `htmlFor` (Ziel ist ein `<button>`, kein Input)
- **Befund:** Ein Placeholder ist kein Label (WCAG 3.3.2 / 4.1.2) — er verschwindet beim Tippen und wird von manchen Screenreadern nicht als Name gewertet.
- **Auswirkung:** Der Zahlen-Input in `riderDetailsEditor.tsx:208` wird als "Eingabefeld, Zahl" ohne Kontext angesagt. Sieben Suchfelder heißen alle nur "Suchen".
- **Fix:** `aria-label` (Suchfelder, Chat) bzw. echtes `FieldLabel htmlFor` + `id` (riderDetailsEditor: `Row` um eine generierte `id` erweitern und `<span>` → `<label htmlFor>`).

### D-24 — Diagramme und Karten ohne Textalternative · **P3**
- **Ort:** `src/features/analytics/components/activityCharts.tsx:63/89/125/160` (4 Recharts-Container, jeweils `<div className="h-[220px]">` ohne `role="img"`/`aria-label`), `src/features/rides/components/elevationChart.tsx`, `src/features/rides/components/rideMap.tsx:892` (`<div ref={containerRef}>` für MapLibre, ohne Name), `src/features/events/components/eventsMap.tsx`, `src/features/pro/components/raceMap.tsx`
- **Befund:** Keine der Visualisierungen hat `role="img"` + `aria-label`, keine Tabellen-Alternative, kein `<figcaption>`. `grep 'aria-live\|role="status"'` findet im gesamten Repo nur 4 Treffer (`ui/spinner.tsx:8`, `ui/alert.tsx:30`, `ui/field.tsx:216`, `cookieConsent.tsx:44`).
- **Auswirkung:** Analytics-Dashboard und Streckenprofile sind für Screenreader-Nutzer vollständig leer. WCAG 1.1.1.
- **Fix:** Mindestens `role="img"` + zusammenfassendes `aria-label` ("Activity over the last 30 days, peak 42 rides on …") pro Chart; für Analytics ideal eine visuell versteckte `<table>` mit denselben Daten (`recentActivityTable.tsx` liefert das Muster bereits).

### D-25 — Unbenutzte ui-Komponenten und Sprach-Mix · **P3**
- **Befund Sprache:** Die UI ist **durchgängig Englisch** — ein gezielter Scan nach deutschen Funktionswörtern und Umlauten in JSX-Strings liefert nur Eigennamen (`"München"`, `"Zürich"`, `"Köln"`, `"Düsseldorf"` in `particleBackground.tsx:47-70`; `"Hildesheimer Straße"` als Beispiel-Placeholder in `waypointList.tsx:54`). Kein Sprach-Mix in der Oberfläche.
- **Aber:** Deutschsprachige **Inhalte** stehen in einer als `lang="en"` deklarierten Seite: die Bundesland-Namen in `src/features/events/lib/eventTypes.ts:52-70` (`"Thüringen"`, `"Nordrhein-Westfalen"`), sämtliche Event-Titel aus dem rad-net-Feed (`eventsList.tsx:57` rendert `{event.title}` roh) und die deutschen Rechtsbegriffe in `src/app/imprint/page.tsx:26-27` ("§ 5 TMG", "MDStV"). Screenreader sprechen diese mit englischer Aussprache-Engine.
- **Fix:** `lang="de"` auf den Containern deutschsprachiger Fremddaten setzen (`<li lang="de">` in `eventsList.tsx`, `<span lang="de">` um die Rechtsbegriffe im Impressum).
- **Nebenbefund:** ~9 nie importierte ui-Komponenten (`menubar`, `context-menu`, `bubble`, `message`, `message-scroller`, `attachment`, `kbd`, `direction`, `marker`) — Wartungslast ohne Nutzen, bei einem shadcn-Update jedes Mal mitzupflegen.

---

## Kontrast-Tabelle

Berechnet nach WCAG 2.1 (relative Luminanz, sRGB), Alpha-Kompositierung in Gamma-Raum. Quelle der Werte: `src/app/globals.css:51-119`. **Light und Dark sind identisch, weil `:root` und `.dark` denselben Inhalt haben (D-01)** — die Spalten sind deshalb notwendigerweise gleich.

| Paar | Farbwerte | Light | Dark | AA? |
|---|---|---|---|---|
| `foreground` auf `background` | `#f8f8f8` / `#030101` | 19.63:1 | 19.63:1 | ✅ |
| `foreground` auf `card` | `#f8f8f8` / `#0a0303` | 19.29:1 | 19.29:1 | ✅ |
| `muted-foreground` auf `background` | `#8f8f8f` / `#030101` | 6.43:1 | 6.43:1 | ✅ |
| `muted-foreground` auf `card` | `#8f8f8f` / `#0a0303` | 6.32:1 | 6.32:1 | ✅ |
| `muted-foreground` auf `muted` | `#8f8f8f` / `#1a0e0f` | 5.84:1 | 5.84:1 | ✅ |
| `muted-foreground` auf `sidebar` | `#8f8f8f` / `#050303` | 6.37:1 | 6.37:1 | ✅ |
| `primary-foreground` auf `primary` | `#f8f8f8` / `#df000d` | 4.79:1 | 4.79:1 | ✅ (knapp) |
| `secondary-foreground` auf `secondary` | `#f8f8f8` / `#20090a` | 17.90:1 | 17.90:1 | ✅ |
| **`primary` als Text auf `background`** | `#df000d` / `#030101` | **4.10:1** | **4.10:1** | ❌ D-02 |
| **`primary` als Text auf `card`** | `#df000d` / `#0a0303` | **4.03:1** | **4.03:1** | ❌ D-02 |
| **`destructive` als Text auf `background`** | `#df000d` / `#030101` | **4.10:1** | **4.10:1** | ❌ D-02 |
| **`destructive` auf `bg-destructive/10`** | `#df000d` / `#190103` | **3.95:1** | **3.95:1** | ❌ D-02 |
| **`text-white` auf `red-500` (CTA links)** | `#ffffff` / `#ef4444` | **3.76:1** | **3.76:1** | ❌ D-03 |
| `text-white` auf `red-600` (CTA rechts) | `#ffffff` / `#dc2626` | 4.83:1 | 4.83:1 | ✅ |
| `text-white` auf `red-700` (CTA hover) | `#ffffff` / `#b91c1c` | 6.47:1 | 6.47:1 | ✅ |
| `text-red-500` auf `background` | `#ef4444` / `#030101` | 5.53:1 | 5.53:1 | ✅ |
| `text-red-400` auf `background` | `#f87171` / `#030101` | 7.52:1 | 7.52:1 | ✅ |
| `text-red-500` auf `bg-red-500/20` (Sidebar aktiv) | `#ef4444` / `#360f0f` | 4.55:1 | 4.55:1 | ✅ (knapp) |
| **`text-muted-foreground/70`** (SidebarGroupLabel, `sidebar.tsx:122`/`:132`) | `#656464` / `#050303` | **3.54:1** | **3.54:1** | ❌ (text-xs) |
| **`text-red-500/70`** (Admin-Label, `sidebar.tsx:145`) | — / `#050303` | **3.10:1** | **3.10:1** | ❌ (text-xs) |
| **`text-muted-foreground/70`** (`eventsExplorer.tsx:237`) | `#656464` / `#030101` | **3.55:1** | **3.55:1** | ❌ (text-[11px]) |
| `text-foreground/60` (Tab inaktiv, `tabs.tsx:66`) | — / `#030101` | 7.00:1 | 7.00:1 | ✅ |
| `text-green-500` auf `background` | `#22c55e` / `#030101` | 9.13:1 | 9.13:1 | ✅ |
| `text-amber-600` (`warningsPanel.tsx:21`) | `#d97706` / `#030101` | 6.53:1 | 6.53:1 | ✅ |
| **Nicht-Text (3:1 nötig)** | | | | |
| **`--border` (primary @20 %) auf `background`** | eff. `#2f0104` | **1.12:1** | **1.12:1** | ❌ D-05 |
| **`--input` (primary @15 %) auf `background`** | eff. `#240103` | **1.07:1** | **1.07:1** | ❌ D-05 |
| **`card` gegen `background`** | `#0a0303` / `#030101` | **1.02:1** | **1.02:1** | ❌ D-05 |
| **Card-Kante `ring-foreground/10`** | eff. `#1c1a1a` | **1.21:1** | **1.21:1** | ❌ D-05 |
| **`focus-visible:ring-ring/50`** | eff. `#710107` | **1.69:1** | **1.69:1** | ❌ D-04 |
| `focus-visible:border-ring` (voll) | `#df000d` | 4.10:1 | 4.10:1 | ✅ |
| **`border-red-500/20`** (28×) | eff. `#320f0f` | **1.20:1** | **1.20:1** | ❌ D-08 |
| **`border-red-500/40`** | eff. `#611c1c` | **1.68:1** | **1.68:1** | ❌ |
| **`bg-muted` (Skeleton) gegen `background`** | `#1a0e0f` / `#030101` | **1.10:1** | **1.10:1** | ❌ (Skeletons kaum sichtbar) |
| `chart-1` gegen `background` | `#df000d` | 4.10:1 | 4.10:1 | ✅ |
| **`chart-2`** | `#a9000c` | **2.66:1** | **2.66:1** | ❌ D-09 |
| **`chart-3`** | `#760009` | **1.75:1** | **1.75:1** | ❌ D-09 |
| **`chart-4`** | `#460105` | **1.26:1** | **1.26:1** | ❌ D-09 |
| **`chart-5`** | `#1c0202` | **1.05:1** | **1.05:1** | ❌ D-09 |

Zusatz (informativ, WCAG stellt an Disabled-Zustände keine Kontrastanforderung): `disabled:opacity-50` auf einem Primary-Button ergibt `primary-foreground` bei 1.88:1 zum Untergrund — die Beschriftung ist dann faktisch nicht mehr lesbar.

Rechenweg reproduzierbar: `/tmp/claude-0/-home-user/fa543d4a-b55e-5501-a64d-3cc4b5b14ccf/scratchpad/contrast.py` (OKLab→linear sRGB→Luminanz, Alpha in Gamma-Raum kompositiert).

---

## Hardcoded-Color-Hotspots

Gesamt: **347 Treffer in 61 Dateien** (Muster: `{bg,text,border,ring,from,to,via,shadow,…}-{red,white,black,green,…}`). Davon nur **5 in `src/components/ui/`** — die Komponentenbibliothek ist sauber.

| Datei | Anzahl | Beispiel | Token-Ersatz |
|---|---:|---|---|
| `src/features/auth/components/resetPasswordForm.tsx` | 35 | `:132`/`:205` `bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/25` | `<Button>` default / neue `cta`-Variante |
| `src/features/auth/components/registerForm.tsx` | 25 | `:260` `className="text-red-500 hover:text-red-400"` | `variant="link"` bzw. `text-primary` |
| `src/features/auth/components/forgotPasswordForm.tsx` | 24 | `bg-gradient-to-br from-red-950/50 via-background to-black` | `from-primary/15 via-background to-background` |
| `src/features/notification/components/notificationSheet.tsx` | 16 | `:281` `bg-red-500 … text-[10px] … text-white` (Badge) | `<Badge variant="default">` |
| `src/features/auth/components/loginForm.tsx` | 14 | `:123` `<Card className="… border-red-500/20 …">` | `border-border` (Default der Card) |
| `src/app/imprint/page.tsx` | 12 | `:14` `<Link className="text-sm text-red-500 hover:text-red-400">` | `text-primary hover:text-primary/80` |
| `src/features/news/components/newsGrid.tsx` | 12 | `text-white` auf Bild-Overlay | `text-primary-foreground` / eigenes Overlay-Token |
| `src/components/sidebar.tsx` | 11 | `:89` `"bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500"` | `bg-sidebar-accent text-sidebar-accent-foreground` (Default von `SidebarMenuButton isActive`) |
| `src/features/rides/components/rideMap.tsx` | 11 | Map-Marker-Farben | `--chart-*`-Tokens via `getComputedStyle` |
| `src/components/userMenu.tsx` | 10 | `:86` `text-red-500 hover:bg-red-500/10 focus:text-red-500` | `variant="destructive"` am `DropdownMenuItem` |
| `src/features/rides/components/ridePhotos.tsx` | 10 | `:230` `bg-black/50 text-white` (Lightbox-Nav) | ok als Overlay, aber `bg-background/70 text-foreground` |
| `src/app/page.tsx` | 10 | `:12` `from-red-900/70 via-background to-red-950/50` | `from-primary/20 via-background to-primary/10` |
| `src/app/privacy/page.tsx` | 10 | 5× `text-red-500` | `text-primary` |
| `src/features/posts/components/imageLightbox.tsx` | 8 | `bg-black/50 text-white` | Overlay-Token |
| `src/components/cookieConsent.tsx` | 8 | `:63` Gradient-CTA | `cta`-Variante |
| `src/app/dashboard/community/g/[id]/page.tsx` | 7 | 7× `border-red-500/20` | `border-border` |
| `src/features/posts/components/rideTimelineCard.tsx` | 7 | — | — |
| `src/features/pro/components/liveStagePanel.tsx` | 7 | — | — |
| `src/features/users/components/avatarUploader.tsx` | 6 | `:76` `ring-red-500/50 focus-visible:ring-2` | `ring-ring` |
| `src/components/navigation.tsx` | 6 | toter Code (nirgends importiert) | löschen |
| … 41 weitere Dateien | 1–5 | | |

**Hex-Literale in JS/TS** (nicht Tailwind, daher zusätzlich): `src/components/particleBackground.tsx` (6× `#ef4444`, `#ffffff`, `#1a1a1a`, `#0a0a0a`), `src/features/rides/components/elevationChart.tsx` (`#3b82f6`, `#171717`, `#ef4444`, `#16a34a`, 4× `#ffffff`), `src/features/events/lib/eventTypes.ts:10-18` (9 Marker-Farben), `src/features/pro/lib/riderDots.ts:7-17` (7 Farben), `src/features/community/components/ridersGrid.tsx:115` & `userMainComponent.tsx:56` (`#eab308`, `#3b82f6`). Für Canvas/MapLibre/Recharts ist das legitim, sollte aber aus einer zentralen Konstante kommen, die die CSS-Variablen spiegelt.

---

## Zustände-Matrix

Legende: ✅ vorhanden · ⚠️ teilweise · ❌ fehlt · – nicht anwendbar

| Seite / Komponente | Loading | Empty | Error | Disabled |
|---|:--:|:--:|:--:|:--:|
| **App-Ebene** | | | | |
| `src/app/**` – `loading.tsx` | ❌ D-07 | – | – | – |
| `src/app/**` – `not-found.tsx` | – | ❌ D-06 | – | – |
| `src/app/error.tsx` | – | – | ⚠️ D-21 (kein Retry, kein Log) | – |
| **Listen / Grids** | | | | |
| `rides/ridesGrid.tsx` | ✅ `:25` Skeleton | ✅ `:43` + `:63` (gefiltert vs. leer) | ✅ `:35` | ✅ |
| `rides/groupRides.tsx` | ✅ `:30` | ✅ `:48` | ✅ `:40` | – |
| `posts/postFeed.tsx` | ✅ `:74`,`:136` | ✅ `:107` `EmptyFollowing` | ✅ `:85`,`:142` | ✅ `:116` |
| `community/groupsGrid.tsx` | ✅ `:59` | ✅ `:76` | ✅ `:61` | ✅ `:121` |
| `community/ridersGrid.tsx` | ✅ `:66` | ✅ `:83` | ✅ `:68` | ✅ `:141` |
| `news/newsGrid.tsx` | ✅ `:27` | ✅ `:46` | ✅ `:38` | – |
| `routes/groupRoutes.tsx` | ✅ `:68` | ✅ `:86` | ✅ `:78` | ✅ `:146` |
| `notification/notificationHistory.tsx` | ✅ `:27` | ✅ `:53` | ✅ `:43` | – |
| `notification/notificationSheet.tsx` | ✅ `:301` | ✅ | ⚠️ | – |
| `community/userContent.tsx` | ✅ `:111` | ✅ `:55`,`:75` | ⚠️ | – |
| `community/groupAnnouncements.tsx` | ✅ `:113` | ✅ | ⚠️ | ✅ |
| `posts/postComments.tsx` | ✅ `:101` | ⚠️ | ❌ | ✅ `:83`,`:88` |
| `events/eventsList.tsx` | ⚠️ (Text `:211`) | ✅ `:20` | ❌ | – |
| `chat/directChatDialog.tsx` | ✅ `:51` | ✅ `:157` | ❌ | ✅ |
| `followers/followerListSheet.tsx` | ✅ `:200` | ✅ `:216` | ❌ | – |
| `analytics/warningsPanel.tsx` | ✅ `:35` | ✅ `:44` "All clear" | – | – |
| `analytics/analyticsDashboard.tsx` | ✅ | – | ✅ `:97` | ✅ `:88-92` |
| **Ohne Query-Zustände** | | | | |
| `chat/directChatHeaderButton.tsx` | ❌ | – | ❌ | – |
| `rides/locationSearch.tsx` | ⚠️ Spinner `:77` | ✅ `:84-87` | ❌ | – |
| `rides/rideFilters.tsx` | ❌ | ⚠️ | ❌ | – |
| `users/avatarUploader.tsx` | ⚠️ `uploading` | – | ❌ | ✅ `:74`,`:95` |
| `users/profileFollowStats.tsx` | ❌ | ✅ `:87` | ❌ | – |
| **Server-Pages (kein Client-State)** | | | | |
| `/dashboard`, `/profile`, `/settings`, `/news`, `/pro`, `/admin/*` | ❌ (kein `loading.tsx`) | ⚠️ `pro/[race]/[year]` nutzt `<Empty>` 6× | ⚠️ nur Root-`error.tsx` | – |
| `/dashboard/pro/[race]/[year]`, `/community-rides/[rideId]`, `/community/g/[id]` | ❌ | ❌ `notFound()` ohne `not-found.tsx` | ⚠️ | – |

Bewertung: Die **Client-Ebene ist überdurchschnittlich diszipliniert** — praktisch jedes Grid hat Skeleton + Empty + Error, und `Skeleton`/`Empty` sind eigene ui-Komponenten. Die Lücke liegt vollständig auf der **Server-/Framework-Ebene** (D-06, D-07, D-21) sowie bei 5 kleineren Client-Komponenten ohne `isError`-Zweig. Anmerkung zu D-05: Skeletons nutzen `bg-muted` bei 1.10:1 zum Hintergrund — selbst wo Ladezustände existieren, sind sie kaum sichtbar.

---

## Geprüft & in Ordnung

- **`lang`-Attribut**: `src/app/layout.tsx:44` `<html lang="en" className={…}>` — korrekt gesetzt.
- **Root-Metadata**: `layout.tsx:13-40` mit `title`, `description`, vollständigem `icons`-Set (inkl. `prefers-color-scheme`-Varianten) und `openGraph`. *Einschränkung:* nur `terms`, `privacy` und `imprint` exportieren eigene `metadata` — die 20+ Dashboard-Routen erben alle denselben Titel "Festi - Your Cycling Community". Für interne, auth-geschützte Seiten vertretbar, für `/rides/[rideId]` (öffentlich teilbar) nicht — dort wäre `generateMetadata` mit Ride-Titel und OG-Bild angebracht.
- **Bilder**: alle **17** `<img>`/`<Image>`-Vorkommen haben `alt`. Dekorative Bilder korrekt mit `alt=""`: `pro/[race]/[year]/page.tsx:133` (Team-Logo neben Teamnamen), `:177`, `:272`, `:286`, `pro/page.tsx:83`, `liveStagePanel.tsx:202`. Sinnvolle Alt-Texte bei Inhaltsbildern: `postCard.tsx:242` `alt={\`${post.title} attachment ${index + 1}\`}`.
- **Klickbare Bilder** sind konsequent in echte `<button type="button">` gewickelt (`postCard.tsx:232-248`, `ridePhotos.tsx:137-149`) — keine `onClick`-`<img>`.
- **Keine `onClick` auf nicht-interaktiven Elementen**: systematischer Scan über alle `<div|span|li|td|tr|p|section|article|figure|label>`-Öffnungstags mit `onClick`/`onKeyDown` ergab genau 2 Treffer, beide korrekt mit `role` versehen (`ui/carousel.tsx:120` `role="region"` + `onKeyDownCapture`, `ui/input-group.tsx:51` `role="group"` mit Delegation an das Control).
- **Dialoge / Sheets / Drawer**: alle 40+ `DialogContent`/`SheetContent`/`AlertDialogContent`/`DrawerContent` haben einen `*Title`; wo er visuell nicht erwünscht ist, korrekt `className="sr-only"` (`imageLightbox.tsx:53`, `directChatDialog.tsx:221`, `ridePhotos.tsx:219`, `ui/sidebar.tsx:196`). Fokus-Trap, Escape und Scroll-Lock kommen von Radix/base-ui — keine Abweichungen gefunden.
- **Formular-Grundgerüst**: `loginForm.tsx`, `registerForm.tsx`, `forgotPasswordForm.tsx`, `resetPasswordForm.tsx`, `changePasswordForm.tsx` verwenden durchgängig `<FieldLabel htmlFor="x">` + `<Input id="x">` + `aria-invalid={!!errors.x}` + `<FieldError>`; `FieldError` trägt `role="alert"` (`ui/field.tsx:216`) und dedupliziert Meldungen. Das ist mehr, als in vergleichbaren Projekten üblich — die verbleibenden Lücken sind D-14/D-15/D-16.
- **Icon-Buttons**: 22 von 28 haben `aria-label`; einige vorbildlich kontextualisiert (`followerListSheet.tsx:71` `aria-label={\`Message ${user.name}\`}`, `riderDetailsEditor.tsx:323` `aria-label={\`Edit ${label}\`}`, `replayPanel.tsx:114` `aria-label={playing ? "Pause replay" : "Play replay"}`). Icon-Links mit `asChild` setzen `aria-label` korrekt am `<Link>`, nicht am `<Button>` (`pro/[race]/[year]/page.tsx:470-471`).
- **Heading-Hierarchie**: 22 von 28 Seiten haben genau eine `<h1>`; keine Sprünge h1→h3 gefunden. `imprint/page.tsx` sauber h1→h2→h3. Ausnahmen in D-12.
- **Reduced Motion**: `typedHeadline.tsx:21-22` fragt `prefers-reduced-motion` korrekt ab und überspringt die Tipp-Animation (Gegenbeispiel: D-18).
- **Typo-/Spacing-Skala**: mit 247× `text-sm`, 140× `text-xs` und klarer Dominanz bei `gap-2`/`gap-1.5`/`gap-3` überraschend konsistent — keine Wildwuchs-Werte, nur die 17 arbiträren `text-[…]` aus D-20. `w-[…]`-Ausreißer sind fast ausschließlich Layout-Höhen für Karten/Maps (`h-[420px]`, `h-[calc(100dvh-9rem)]`) und damit legitim; kein einziges `w-[437px]`-artiges Magic-Pixel gefunden.
- **`cn()`-Utility**: `src/lib/utils.ts` korrekt mit `twMerge(clsx(...))` — Klassen-Overrides von außen gewinnen zuverlässig.
- **`cva`-Varianten** werden in `Button` und `Badge` sauber über `data-variant`/`data-size` auch im DOM gespiegelt (`button.tsx:60-61`) — gute Basis für Tests und E2E-Selektoren.
- **Sprache**: kein deutsch/englisch-Mix in der Oberfläche (Details und die verbleibende `lang`-Frage in D-25).

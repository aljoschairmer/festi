# Festi — End-to-End-Audit

Vollständiger Audit von **festicycling.com** über drei Repos, durchgeführt
am **2026-08-19** gegen die Produktion und die Live-Route-Engine.

## Dokumente

| Datei | Inhalt |
| --- | --- |
| [`00-overview.md`](./00-overview.md) | Architektur, Datenfluss, vollständige Routen-/Seiten-Liste, UI-Flows, lokaler Start, Basis-Performance |
| [`00-routes-diff.md`](./00-routes-diff.md) | `festi-routes` ↔ Route Engine ↔ App: Bestand, Feature-Lücken, Integrationsstand, vier datenbelegte Engine-Defekte |
| [`01-findings.md`](./01-findings.md) | Phase 1 + 2: 29 Funde aus Browser-Funktionstest, Responsive-, Design- und A11y-Prüfung — mit Repro, Messwerten und Screenshots |
| [`02-ui-bugs.md`](./02-ui-bugs.md) | Gezielte UI-Fehlersuche: 16 weitere Defekte aus DOM-Scan, Interaktions-Durchlauf und Stresstests (200 % Zoom, überlanger Inhalt) |
| [`review/A-auth-security.md`](./review/A-auth-security.md) | Auth, Session, Authorization/IDOR, Uploads, XSS, Rate-Limiting, Secrets |
| [`review/B-backend-daten.md`](./review/B-backend-daten.md) | Fehlerbehandlung, Statuscodes, N+1, Indizes, Transaktionen, API-Vertrag |
| [`review/C-frontend-architektur.md`](./review/C-frontend-architektur.md) | Server/Client-Grenzen, Caching, Revalidation, Bundles, State, Routing |
| [`review/D-a11y-designsystem.md`](./review/D-a11y-designsystem.md) | Design-Tokens, Kontraste (gerechnet), Fokus, Tastatur, Zustände |
| [`review/E-codequalitaet-tests.md`](./review/E-codequalitaet-tests.md) | Build/Lint/Typecheck/Tests (ausgeführt), Konventionen, `concerns.txt` |
| [`screenshots/`](./screenshots/) | 106 Belegbilder, benannt nach `<viewport>-<seite>.jpg` bzw. `err-*` / `flow-*` |

Die beiden anderen Repos tragen ihre eigenen Funde jeweils in
`AUDIT-FINDINGS.md` (gleicher Branch):

| Repo | Datei | Funde |
| --- | --- | --- |
| `festi-backend` (Route Engine) | `AUDIT-FINDINGS.md` | R-01 … R-12 |
| `festi-routes` (Routen-Bibliothek) | `AUDIT-FINDINGS.md` | L-01 … L-08 |

## Wichtige Einschränkung der Messumgebung

Der gesamte Browser- und HTTP-Verkehr dieses Audits lief über einen
Egress-Proxy in den USA. Cloudflare hat mich deshalb aus Washington
bedient (`colo=IAD`), während die Datenbank in Europa steht. **Alle
Zeitangaben sind dadurch verzerrt** und sagen nichts über die Erfahrung
eines Nutzers in Deutschland aus. Funktionale, strukturelle und
Sicherheitsbefunde sind davon nicht betroffen. Wo Zeitangaben eine Rolle
spielten, sind die Funde zurückgezogen und als solche markiert.

## Methode

* **Phase 0** — Repos gelesen, Frontend lokal gestartet, Live-Engine gegen
  ihren OpenAPI-Vertrag geprüft, Routen und Flows inventarisiert.
* **Phase 1** — Playwright/Chromium gegen die Produktion mit dem
  Testaccount. Happy Paths plus provozierte Fehlerfälle (leere Felder,
  falsches Format, falsches Passwort, unbekannte IDs, zu große und
  gefälschte Uploads, Deep-Links ohne Session). Konsole und Netzwerk auf
  Errors und 4xx/5xx mitgeschnitten.
* **Phase 2** — Viewports 375 / 768 / 1440 px, gemessene Overflow- und
  Touch-Target-Audits im DOM, Tastatur-Tab-Durchlauf mit
  `getComputedStyle`-Auswertung der Fokus-Stile, Zustands- und
  Konsistenzprüfung.
* **Phase 3** — Fünf parallele Code-Review-Agenten mit je eigenem Fokus.

## Zahlen

| | |
| --- | --- |
| Funde Phase 1 + 2 | 29, davon 2 zurückgezogen (F-01 Messartefakt, F-29 Zeitangabe) |
| Funde gezielte UI-Suche | 16, davon 3 zurückgezogen (U-09/U-10/U-11 Fehlalarme) |
| Funde Phase 3 (Code-Review) | 121 über fünf Reports |
| Geprüfte Seiten | 22 Routen × bis zu 3 Viewports |
| Screenshots | 129 |
| Ausgewertete generierte Routen | 569 aus `festi-routes` |

## Die fünf wichtigsten Punkte

1. ~~**Der Dashboard-Feed braucht ~21 s bis zum ersten Inhalt**~~ —
   **zurückgezogen.** Messartefakt: mein Testverkehr lief über einen
   US-Egress (`colo=IAD`), der Worker also fern der europäischen Datenbank.
   Der Betreiber sieht die Latenz nicht. Belege und Gegenmessung in
   `01-findings.md`, F-01.
2. **Jede Fahrt ist per Default öffentlich** — Startort, Termin und
   Klarname des Organisators ohne Login abrufbar (F-02, Review `A-03`).
3. **Autorisierungslücken**: `kickGroupMember` prüft die Gruppen-Zugehörigkeit
   der Mitgliedszeile nicht; Gruppen-Rides sind nicht gegen Nicht-Mitglieder
   abgeschirmt (Review `A-01`, `A-02`).
4. **Die Datenschicht ist ungeschützt gegen Nebenläufigkeit**: ein einziges
   `$transaction` im gesamten Projekt, Wartelisten-Beförderung und
   Kapazitätsprüfung sind Races (Review `B`).
5. **Dialoge haben keine Höhenbegrenzung** — ein 60-zeiliger Beitrag schiebt
   „Post", „Preview" *und* das Schließen-Kreuz aus dem Bild; die Seite scrollt
   nicht, der Dialog auch nicht. Einziger Ausweg: Escape, Beitrag verloren
   (`02-ui-bugs.md`, U-01/U-02).
6. **Die Route Engine kann deutlich mehr, als die App anbietet** — acht
   Parameter und neun Ergebnisfelder ungenutzt, und 569 fertig berechnete
   Routen über 70 Regionen liegen brach (`00-routes-diff.md`).

## Hinweise

* Dieser Audit ist reine Dokumentation. **Es wurde kein Produktivcode
  geändert** und **nichts aus `festi-routes` integriert.**
* Getestet wurde gegen die **Produktion**. Die dabei angelegten Testdaten
  (ein Post, zwei Kommentare, ein Like) wurden am Ende über die UI wieder
  gelöscht — was zugleich den Lösch-Flow verifiziert hat. Geblieben ist ein
  Avatar auf dem Testaccount, hochgeladen beim Prüfen der Upload-Grenzen.
* Die Route Engine wurde live angesprochen (Job-Submits, Statusabfragen,
  GPX-Download). Es wurden 3 Jobs erzeugt; sie sind nach der Redis-TTL von
  30 Minuten verfallen. Der API-Key steht in keiner Datei dieses Repos.

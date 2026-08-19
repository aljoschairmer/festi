# 00 – Routes-Diff: `festi-routes` ↔ Route Engine ↔ Festi-App

> Stand: 2026-08-19 · **Reine Dokumentation, nichts integriert.**

---

## 0. Vorbemerkung: die Aufgabenstellung trifft die Repo-Realität nicht

Die Aufgabe formuliert: *„Vergleiche `<repo-routes>` gegen das Backend: Welche
Routes existieren dort, die im Backend fehlen oder schlechter implementiert
sind?"* — mit „Routes" im Sinne von HTTP-Endpunkten.

Das lässt sich so nicht beantworten, weil:

| Annahme der Aufgabe | Tatsächlich |
| --- | --- |
| `festi-routes` enthält implementierte HTTP-Routes | Enthält **Fahrrad-Routen** (Streckenvorschläge als JSON + GPX). Der einzige Code ist `scripts/generate.mjs` (300 Zeilen Generator-Client) — kein Server, kein Endpunkt. |
| `festi-backend` ist das Backend der App | Ist die **Route Engine**, ein Microservice ohne User-, Auth- oder Datenbank-Konzept. Das Anwendungs-Backend steckt als Server Actions im `festi`-Repo. |

Ein Endpunkt-für-Endpunkt-Diff hat also kein Substrat. Was es stattdessen
gibt und was hier verglichen wird:

1. **Was `festi-routes` an Inhalt produziert hat** (§1)
2. **Welche Engine-Fähigkeiten dieser Bestand nutzt — und welche die App
   davon gar nicht anbietet** (§2, die eigentliche Lücke)
3. **Integrationsstand: was von den 569 Routen in der App ankommt** (§3)
4. **Was der Bestand als Datensatz über Engine-Fehler verrät** (§4)

---

## 1. Bestand in `festi-routes`

| Kennzahl | Wert |
| --- | --- |
| Regionen | **70** (DE, AT, CH, LI) |
| Routen-Ideen (`ideas/**/*.json`) | **569** |
| Generierte Routen (`routes/**/route.gpx` + `meta.json`) | **569 / 569 — 100 % durchgerechnet, keine offene Idee** |
| Modus | 294 Rundtouren · 275 A-nach-B |
| Kategorien | 376 touring · 98 gravel · 77 road · 18 mtb |
| Distanz | min 3,1 km · Median **39,6 km** · max 133,5 km |
| Höhenmeter | min 0 · Median **549 hm** · max 13 557 hm *(siehe §4.1 — Artefakt)* |
| Routen mit mindestens einer Engine-Warnung | **441 / 569 (77 %)** |
| Generiert gegen | `https://route.aljoschairmer.com`, Engine-Version 0.2.0 |

Jede `meta.json` trägt 25+ Metadatenfelder: `surfaceBreakdown`,
`wayTypeBreakdown`, `trafficStressBreakdown`, `elevationProfile`,
`highlights` (POIs entlang der Route), `physicalEffortKj`, `greenShare`,
`waterShare`, `weather`, `airQuality`, `matchPercent`, `labels`.

---

## 2. Die eigentliche Lücke: Engine kann mehr, als die App anbietet

Vergleich der drei Vertragsebenen:
`festi-backend/openapi.yaml` + `src/types.ts` (Engine) ·
`festi/src/features/rides/schemas/index.ts:57` `generateRouteSchema` (App) ·
tatsächliche Nutzung in `festi-routes/ideas/**` (Datensatz).

| Engine-Parameter | Engine | Festi-App sendet | In den 569 Ideen genutzt | Bewertung |
| --- | :--: | :--: | --: | --- |
| `startLat`/`startLng` | ✅ | ✅ | 569 | — |
| `endLat`/`endLng` | ✅ | ✅ | 275 | — |
| `category` | ✅ | ✅ (alle 6) | 569 | — |
| `difficulty` | ✅ | ✅ | 569 | — |
| `targetDistanceKm` | ✅ | ✅ | 303 | — |
| `minDistanceKm`/`maxDistanceKm` | ✅ | ✅ | 36 | — |
| `targetElevationGainM` | ✅ | ✅ | 192 | — |
| `maxTrafficStress` | ✅ | ✅ | 385 | — |
| `surfacePreference` | ✅ | ✅ | 193 | — |
| `avoid` | ✅ | ✅ | 182 | — |
| `preferScenic` | ✅ | ✅ | 522 | — |
| `eBike` | ✅ | ✅ | 1 | — |
| `maxDetourFactor` | ✅ | ✅ | 2 | — |
| `numAlternatives` | ✅ | ✅ (1–5) | — | — |
| `departureTime` | ✅ | ✅ im Schema | — | **Wird vom UI nie befüllt** → Wetter/Luftqualität rechnen immer für „jetzt", nicht für den Ride-Termin |
| **`preferBikeNetworks`** | ✅ | ❌ | **268** | **Lücke** – „ausgeschilderte Radrouten bevorzugen" ist das meistgenutzte Genuss-Feature des Kurations-Bestands und in der App nicht erreichbar |
| **`viaPoints`** (max. 15) | ✅ | ❌ | **263** | **Größte Lücke** – „Route über dieses Highlight" ist die Grundlage aller 275 A-nach-B-Routen; der App-Generator kennt nur Start + optionales Ziel |
| **`optimizeWaypointOrder`** (TSP) | ✅ | ❌ | **175** | **Lücke** – die Engine hat einen TSP-Solver (`src/tsp.ts`), die App ruft ihn nie |
| **`maxSlopePercent`** | ✅ | ❌ | 13 | Lücke |
| **`startDirectionDeg`** | ✅ | ❌ | 21 | Lücke – Rundtour-Himmelsrichtung |
| **`minElevationGainM`/`maxElevationGainM`** | ✅ | ❌ | — | Lücke – nur `target` wird gesendet, der Korridor nicht |
| **`averageSpeedKmh`** | ✅ | ❌ | — | Lücke – persönliche Geschwindigkeit statt Pauschal-Schätzung |
| **`seed`** | ✅ | ❌ | — | Lücke – keine reproduzierbare Generierung |
| **`locale`** | ✅ (`en`\|`de`) | ⚠️ hart auf `"en"` | 46 | `generateRoute.ts:57` setzt `locale: "en"` fix. Die App hat keine Sprachumschaltung — konsistent, aber siehe §4.3 |

**Ergebnisantwort auf die ursprüngliche Frage:** *nichts* fehlt der Engine,
was `festi-routes` hätte. Umgekehrt: **die App schöpft die Engine nur zu
etwa zwei Dritteln aus.** Acht Parameter, die der kuratierte Bestand
intensiv nutzt (allen voran `viaPoints`, `preferBikeNetworks`,
`optimizeWaypointOrder`), sind über die Festi-UI nicht erreichbar.

Ergebnisfelder, die die Engine liefert und die App verwirft, sind
zusätzlich: `wayTypeBreakdown`, `trafficStressBreakdown`,
`physicalEffortKj`, `estimatedBatteryWh`, `greenShare`, `waterShare`,
`highlights`, `labels` (FASTEST/QUIETEST/MOST_SCENIC/…), `matchPercent`.

---

## 3. Integrationsstand: 0 %

| Frage | Antwort |
| --- | --- |
| Liest die App irgendetwas aus `festi-routes`? | **Nein.** Kein Import, kein Fetch, kein Seed-Skript. Grep über `festi/src` nach `festi-routes`, `ideas/`, `route.gpx`: keine Treffer. |
| Gibt es ein Datenmodell, das die 569 Routen aufnehmen könnte? | **Ja, fast.** `model Route` (`prisma/schema.prisma`) hat `name`, `description`, `distance`, `duration`, `elevationGain/Loss`, `routeGeometry`, `waypoints`, `elevationProfile`. |
| Was fehlt dem Modell für den Bestand? | `Route.creatorId` ist **Pflicht** und `onDelete: Cascade` — kuratierte Routen haben keinen Creator. Es fehlen `region`, `slug`, `highlights`, `category`, `difficulty`, `surfaceBreakdown`, `source`/`curator` und ein `@@unique([region, slug])`. Ohne diese Felder wäre eine Übernahme lossy. |
| Wie kommen Routen heute in die Bibliothek? | Ausschließlich über `saveRoute` — aus einer **bereits existierenden Fahrt** heraus (`src/features/routes/actions/saveRoute.ts`). Es gibt keinen Import-Pfad. |

**Konsequenz:** 569 fertig berechnete, mit POIs angereicherte Routen über
70 Regionen liegen brach, während Nutzer in der App bei null anfangen und
jede Route neu generieren lassen müssen (Kosten: ein Engine-Job à ~2,6 s
Rechenzeit, siehe Live-Metriken).

**Nicht integriert — bewusst, gemäß Auftrag.** Der Weg wäre skizziert:
`Route`-Modell um `region`/`slug`/`category`/`highlights`/`source` und
optionales `creatorId` erweitern, ein Seed-Skript liest `routes/**/meta.json`,
und die Rides-Liste bekommt einen „Routen entdecken"-Einstieg.

---

## 4. Was der Bestand über die Engine verrät (belegte Funde)

Die 569 generierten Ergebnisse sind ein Regressionsdatensatz. Vier Befunde,
alle an den Dateien nachgerechnet:

### 4.1 Höhenmeter-Explosion durch DEM-Lücken als `0 m` · **P1**

`routes/bern-oberland/lauterbrunnental-wasserfaelle-familientour/` meldet
**13 557 hm auf 48,6 km** (279 hm/km) — für eine als
`difficulty: easy` angefragte „Familientour".

Nachgerechnet aus der GPX: 951 Punkte, **176 davon mit `<ele>0.0</ele>`**,
während das Tal auf ~800 m liegt und der Maximalwert 1818 m ist. Jeder
Sprung 1818 → 0 → 1818 zählt doppelt.

Die Hysterese in `festi-backend/src/geo.ts:54` (`elevationGainLossM`,
`thresholdM = 5`) fängt SRTM-*Jitter* ab, aber keine **Ausfälle**:

```
threshold  5 m → 13 557 hm   (Ist-Wert)
threshold 10 m → 13 364 hm
threshold 30 m → 12 693 hm
```

Ein höherer Schwellwert hilft nicht — `ele === 0` muss wie ein fehlender
Wert behandelt und übersprungen werden (analog zum bereits vorhandenen
`if (ele === undefined) continue;` in derselben Schleife).

**Betroffen: 11 Routen** mit `ele = 0` trotz Maximalhöhe > 200 m
(Bern-Oberland ×3, Tessin, Graz-Steiermark, Osttirol ×3, Salzburg, Wallis).

Folgeschäden: `difficultyScore` (6,5 statt ~2), `estimatedDurationMin`
(364 min — die Formel `distanz/speed + ascend/10` in `metadata.ts:202`
addiert allein 1356 Minuten aus dem Artefakt) und `physicalEffortKj`.

### 4.2 `targetDistanceKm` wird bei A-nach-B still ignoriert · **P1**

`routes/muensterland/wildpferde-runde-duelmen/`: angefragt
`targetDistanceKm: 32`, geliefert **16,02 km** — und trotzdem
`matchPercent: 100` mit `matchBreakdown.distance: 100`, **keine Warnung**.

Ursache in `festi-backend/src/matchScore.ts:50-68`: der Distanz-Score wird
nur im `mode === 'roundtrip'`-Zweig aus `targetDistanceKm` gebildet. Im
Else-Zweig zählt ausschließlich `detourFactor` gegen `maxDetourFactor` —
`targetDistanceKm` fällt ersatzlos raus.

Verteilung über alle 303 Routen mit Zieldistanz: Median-Abweichung 3,4 %,
p90 9,6 %, **max 49,9 %; 26 Routen liegen über den in der README
zugesicherten ±10 %.** Die schlimmsten fünf sind alle A-nach-B-Routen.

Fix: im Point-to-Point-Zweig zusätzlich gegen `targetDistanceKm` scoren
(oder mindestens eine Warnung setzen), sonst ist die Zusage „Ziel ±10 %"
für die Hälfte aller Modi wirkungslos.

### 4.3 `locale` steuert die Warnungen nicht · **P2**

Bei 569 Läufen mit `locale: "de"` kamen **435 deutsche und 200 englische**
Warnungen zurück — im selben Array gemischt:

```
"Enthält ca. 185 m Schiebepassagen"        ← de
"rain is likely during this ride"          ← en
"traffic stress ceiling exceeded on 6% …"  ← en
```

Die Strings sind hart kodiert und über die Module verstreut:
`metadata.ts:213` deutsch, `weather.ts:375-383` englisch,
`profiles.ts:92-127` englisch, `generation/roundtrip.ts:150-156` deutsch.
Es gibt keine Übersetzungsschicht — `locale` wird nur an GraphHopper
durchgereicht (für Abbiege-Instruktionen).

Weil `festi/src/features/rides/actions/generateRoute.ts:57` hart
`locale: "en"` sendet, sehen Festi-Nutzer die deutschen Strings direkt
in der englischen UI.

### 4.4 Coverage-BBox ist deutlich größer als der Graph · **P2**

`GET /v1/coverage` meldet `bbox: [5.86, 45.81, 25.20, 60.44]` bei
`coveredRegions: [germany, austria, switzerland]`. Die BBox reicht damit
bis Südfinnland und ins Baltikum.

Live nachgestellt:

| Anfrage | Erwartet | Tatsächlich |
| --- | --- | --- |
| Warschau (52.23 / 21.01) — in der BBox, nicht in DE/AT/CH | 400 „coordinates outside covered region" | **202 Accepted**, danach `FAILED`: *„Keine Rundtour generierbar: Routing-Engine lieferte für keinen Kandidaten eine Route (Region abgedeckt?)"* |
| Lissabon (38.72 / −9.14) — außerhalb der BBox | 400 | ✅ 400 |

Die BBox stammt aus der Graph-Hülle, nicht aus den Regionen. Nutzer in
Polen/Tschechien/Dänemark bekommen einen Job, der Queue-Zeit verbraucht
und dann mit einer Rückfrage („Region abgedeckt?") scheitert, statt eines
sofortigen 400. Das erklärt vermutlich einen Teil der **16 von 69
fehlgeschlagenen Jobs (23 %)** in den Live-Metriken.

*(Randnotiz: die Fehlermeldung kam deutsch, obwohl der Request keinen
`locale` gesetzt hatte — der dokumentierte Default ist `en`. Gleiches
Grundproblem wie §4.3.)*

### 4.5 `distanceAlongRouteM: 0` bei Highlights · **P3, zu verifizieren**

Von 20 412 Highlights über 480 Routen tragen **4 840 (24 %)**
`distanceAlongRouteM: 0`. Bei keiner Route sind *alle* Werte 0, es sind
also keine flächendeckend fehlenden Daten — plausibel ist eine
Rundungs-/Projektionsfrage bei POIs nahe dem Startpunkt. Da 24 % für
„liegt am Start" hoch wirken, ist der Wert einen gezielten Test wert
(`src/pois.ts`).

---

## 5. Zusammenfassung

* **Kein Endpunkt-Diff möglich** — `festi-routes` ist ein Datenrepo, kein Service.
* **Die Engine ist der App voraus**: 8 Parameter und 9 Ergebnisfelder, die
  der kuratierte Bestand nutzt bzw. die die Engine liefert, sind in Festi
  nicht angebunden. `viaPoints` + `optimizeWaypointOrder` +
  `preferBikeNetworks` sind die größten Posten.
* **569 fertige Routen über 70 Regionen liegen ungenutzt**, obwohl ein
  `Route`-Modell existiert, dem nur wenige Felder fehlen.
* **Der Bestand deckt vier Engine-Defekte auf**, die im Code-Review allein
  nicht sichtbar gewesen wären — allen voran die Höhenmeter-Artefakte
  durch DEM-Nullwerte und der still ignorierte `targetDistanceKm` im
  A-nach-B-Modus.

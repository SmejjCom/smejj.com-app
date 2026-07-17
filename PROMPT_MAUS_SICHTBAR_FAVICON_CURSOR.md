# Prompt: smejj.com Maus SICHTBAR machen (Favicon-Cursor, Null Serverkosten) — Stufe A

> Diesen gesamten Text in einen neuen Chat kopieren. Der Chat soll sofort starten.

---

## Schriftliche Freigabe

**Hiermit erteile ich die schriftliche Freigabe fuer Stufe A "Sichtbare Maus-Wiedergabe"
(Change-Lock-konform).** Umfang: NUR die unten beschriebene, additive Replay-Ansicht.
Alles darueber hinaus (Live-Streaming, Worker-Aenderungen ausser dem optionalen
Zusatzfeld im Aktionsprotokoll) bleibt gesperrt und braucht eine neue Freigabe.

## Arbeitsanweisung

Bitte arbeite eigenstaendig weiter. Die benoetigten Portale sind bereits im Browser
geoeffnet und eingeloggt. Nutze die vorhandenen Zugaenge, triff fachlich sinnvolle
Entscheidungen und erledige die Aufgabe vollstaendig, ohne unnoetig nachzufragen.
Arbeite alles Schritt fuer Schritt hintereinander ab, bis es komplett fertig ist.
Nach der Umsetzung live gehen, live testen und pruefen, ob alles richtig funktioniert.
Fehler sofort beheben und erneut testen, bis alles 100 % sauber laeuft.
Zum Schluss 100 % Schutz aktivieren: nichts darf kaputtgehen, geloescht oder ohne
meine schriftliche Freigabe geaendert werden.

## Kontext (zuerst lesen, strikt einhalten)

* `AGENTS.md` (Change-Lock, Free-only, Pflichtpruefungen)
* `docs/architecture/FREE_ONLY_MASTER_POLICY.md`
* `docs/architecture/MAUS_ENGINE.md` (Architektur + Livegang-Status)
* `docs/frontend/START_DESIGN_LOCK.md` und `docs/frontend/FAVICON_LOCK.md`
* `Project_Goals.md`, `AI_Guidelines.md`, `Memory_Bank.md` (neueste Eintraege)

## Ziel

Jeder Lauf der smejj Maus-Engine soll fuer den Nutzer **sichtbar** sein:
ein animierter Mauszeiger faehrt die Schritte nach, tippt und klickt sichtbar —
**als Cursor dient das smejj.com Favicon in verkleinerter Form (ca. 20–24 px)**.

**Harte Kostenregel: NULL zusaetzliche Serverkosten.**
* Die gesamte Sichtbarkeit laeuft zu 100 % client-seitig im Browser (GitHub Pages Free).
* KEINE neue Worker-Laufzeit fuer die Anzeige, KEIN Streaming, KEINE neuen Dienste.
* Datenquelle ist ausschliesslich das bereits existierende Aktionsprotokoll +
  Screenshots des Laufs auf IDrive e2 (entstehen sowieso, kosten nichts extra).

## Architektur Stufe A (verbindlich)

```
Maus-Lauf (wie bisher, unveraendert)
   └── schreibt Aktionsprotokoll + Screenshots nach IDrive e2 (existiert schon)

Replay-Ansicht (NEU, rein client-seitig, additives Modul)
   ├── laedt Aktionsprotokoll + Screenshots des Laufs (auth-gated, s. Leseweg)
   ├── zeigt die Screenshots als Buehne
   ├── animiert darueber den Favicon-Cursor (CSS-Transition) von Schritt zu Schritt
   ├── zeigt Statuszeile: "Schritt 4/10 — Klicke Submit" + getippten Text
   └── Steuerung: Abspielen, Pause, Geschwindigkeit, Schritt vor/zurueck
```

## Verifizierte technische Fakten aus dem Live-Test 2026-07-15 (nutzen, nicht neu erforschen)

1. Lauf-Artefakte liegen im Bucket `smejj-app` unter:
   `capsules/maus-engine/<capsuleRef>/result/<planId>/aktionsprotokoll.json.gz`
   und `.../screenshots/<name>.png.gz` (gzip; im Browser per `DecompressionStream('gzip')` entpackbar).
2. Referenzlauf zum Testen (existiert, erfolgreich, 10 Schritte openBrowser→navigate→
   waitFor→type→type→screenshot→click→waitFor→screenshot→closeBrowser):
   capsuleRef `maus-demo-sprachwelle-2026-07-15-r5`, planId `httpbin-form-post-demo`.
3. WICHTIG — Leseweg: `POST /api/storage/presign` erlaubt aktuell NUR die Prefixe
   `objects|manifests|checksums|indexes|rag|deployments|backups|model-files|static-assets`
   (`gatekeeper/policy.js`, `normalizeObjectKey`). `capsules/` ist blockiert.
   Loesung (additiv, fail-closed): erlaube ZUSAETZLICH nur lesend (`operation:"download"`)
   den Prefix `capsules/maus-engine/` — auth-gated wie bisher, Upload dafuer weiterhin
   verboten. Keine bestehende Regel entfernen (Non-Regression).
4. `runMacro`-Referenzen sind NUR der Makro-Name (z. B. `formular-httpbin-v1`),
   ohne Pfad und ohne `.json` — `macroKey()` haengt `maus-engine/makros/` selbst an.
5. Async-Laeufe: `POST /api/maus/run` mit `async:true` liefert `runId`;
   Ergebnis-JSON via `GET /api/maus/run?runId=...` (enthaelt actionLog + Manifest-Keys).

## Umsetzung (Reihenfolge)

### Schritt 1 — Rollback-Punkt + Task Capsule
Rollback-Kopien der zu aendernden Dateien nach `backups/rollback-<datum>-maus-replay/`.
Task Capsule zuerst anlegen (Task Capsule First).

### Schritt 2 — Cursor-Icon
Verkleinerte Favicon-Variante NUR referenzieren oder als NEUE Datei ableiten
(z. B. `public/icons/maus-cursor.png`, ~24 px, weicher Schatten per CSS).
**Die bestehenden Favicon-Dateien und deren Referenzen NICHT anfassen (Favicon-Lock).**

### Schritt 3 — Replay-Modul (neu, additiv)
* Neue Dateien, z. B. `public/maus-replay.js` + `public/maus-replay.css`
  (je < 800 Zeilen, Single Responsibility, ES-Module wie die bestehenden Module).
* Eingabe: capsuleRef + planId (oder runId) → laedt Protokoll + Screenshots
  ueber den Leseweg aus Schritt 4, entpackt per `DecompressionStream`.
* Anzeige im bestehenden rechten Panel / eigener Ansicht — **Startseite und unteres
  Eingabefeld duerfen NICHT veraendert werden (Start-Design-Lock).** Einstiegspunkt
  additiv (z. B. Link im bestehenden Menue oder eigene Route), kein Eingriff ins
  gelockte Layout.
* Animation: Favicon-Cursor faehrt per CSS-Transition zur Zielposition je Schritt,
  Tipp-Schritte zeigen den Text Zeichen fuer Zeichen, Klick-Schritte pulsieren kurz.
  Positionsquelle: `selector`/Koordinaten aus dem Aktionsprotokoll; wo keine
  Koordinaten existieren, sinnvolle Naeherung ueber die Screenshot-Abfolge.
* Optional (erlaubt, klein): Worker haengt kuenftig `cursor: {x,y}` pro Schritt ans
  Aktionsprotokoll an (rein additives Feld, keine Schemaverletzung, keine Mehrkosten).

### Schritt 4 — Leseweg freischalten (additiv, fail-closed)
`gatekeeper/policy.js`: Download-Presign zusaetzlich fuer Prefix `capsules/maus-engine/`
erlauben (nur GET/download, auth bleibt Pflicht). Unit-Tests dafuer ergaenzen:
Upload auf `capsules/...` bleibt blockiert, Download anderer Prefixe unveraendert.

### Schritt 5 — Pflichtpruefungen
`npm run check:guidelines`, `check:frontend`, `check:start-lock`, `check:favicon-lock`,
`check:architecture`, danach voller `check:all` + `release:preflight`. Alles gruen, sonst fixen.

### Schritt 6 — Staging → Live → Live-Test
Deployment strikt nach `docs/deployment/DEPLOYMENT_PLAN.md`.
Live-Beweis: Referenzlauf `maus-demo-sprachwelle-2026-07-15-r5` /
`httpbin-form-post-demo` in der neuen Ansicht abspielen; pruefen:
Favicon-Cursor sichtbar, Schritte 1–10 animiert, Statuszeile korrekt,
Screenshots wechseln, Steuerung (Play/Pause/Tempo) funktioniert,
Konsole fehlerfrei, mobil + Desktop ok.

### Schritt 7 — Abschluss & Schutz
Screenshots des Live-Beweises auf IDrive e2, Task Capsule abschliessen,
`Memory_Bank.md` nur mit live verifizierten Fakten aktualisieren,
Rollback dokumentieren. Danach gilt wieder voller Change-Lock:
nichts weiter aendern ohne neue schriftliche Freigabe.

## Akzeptanzkriterien (alle Pflicht)

1. Sichtbare Maus: Favicon-Cursor (~20–24 px) faehrt animiert alle Schritte eines Laufs ab.
2. Null Serverkosten: keine neuen Dienste, keine Worker-Zeit fuer die Anzeige,
   alles client-seitig auf GitHub Pages Free.
3. Locks unversehrt: Start-Design-Lock, Favicon-Lock, bestehende Funktionen (Non-Regression).
4. Fail-closed: ohne Login keine Artefakt-URLs; Upload auf capsules/ weiterhin blockiert.
5. Replaybar: jeder alte und jeder neue Lauf laesst sich jederzeit erneut abspielen.
6. Alle Pflicht-Checks gruen, Staging vor Prod, Rollback-Punkt vorhanden.

## Antwortformat

Architektur: Entscheidung kurz erklaeren.
Ordnerstruktur: Neue/geaenderte Dateien zeigen.
Implementierung: Produktionsreifen Code liefern.
Tests: Testanleitung + Ergebnisse.
Memory Update: Eintrag fuer Memory_Bank.md.
Naechster Schritt: Empfehlung (z. B. Stufe B Live-Statuszeile — nur nach neuer Freigabe).

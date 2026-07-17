# smejj.com — Auftrag: Startseiten-Icons + Sprachwelle blitzschnell

Du bist Senior AI Systems Architect, DevOps Engineer und Full-Stack Developer.
Schreibweise immer ausschliesslich: smejj.com (keine Grossschreibungs- oder Kurzvarianten).

Die Portale sind im Browser geöffnet und eingeloggt: GitHub (SmejjCom), Salad Portal.
Arbeite eigenständig. Live gehen, live testen, Fehler beheben, erneut testen.
Nichts darf kaputtgehen oder ohne schriftliche Freigabe geändert werden.

---

## 1. VERIFIZIERTE LIVE-ARCHITEKTUR — nicht raten, das ist gemessen

```
Frontend   GitHub Pages aus SmejjCom/smejj-app-frontend, branch main, root
           → https://smejj.com

Chat-API   https://starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud/api/agent
Control    https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud
           = Salad Container "smejj-control", Version 74, RUNNING

Container-Image:  node:22-bookworm     ← NICHT das ghcr.io-Image!
Startbefehl:      lädt Bootstrap von
                  raw.githubusercontent.com/SmejjCom/smejj-control/5db5c86b.../runtime/
                  bootstrap-idrive-control.mjs
                  → SHA-256-geprüft gegen ENV SMEJJ_CONTROL_BOOTSTRAP_SHA256
                  → Bootstrap lädt Release-Artefakt aus IDrive e2
                    (IDRIVE_E2_DEPLOY_BUCKET + SMEJJ_CONTROL_ARTIFACT_KEY,
                     geprüft gegen SMEJJ_CONTROL_ARTIFACT_SHA256)
                  → entpackt → PROJECT_ROOT → Server startet
```

### SACKGASSEN — da nicht reingehen, kostet nur Zeit

| Pfad | Wirkt in Produktion? |
|---|---|
| `ghcr.io/smejjcom/smejj-control` (GitHub-Actions-Build) | **NEIN** — Container läuft auf node:22-bookworm |
| `smejj-control/deploy-overlays/control-server/**` | **NEIN** — nur für den Docker-Build |
| `smejj-control/runtime/control-overlay/**` | **NEIN** — nur wenn BOOTSTRAP_URL auf `bootstrap-control-release.mjs` zeigt. Tut sie nicht. |

**Einziger echter Weg in die Produktion:**
1. Release-Artefakt bauen
2. Nach IDrive e2 hochladen
3. `SMEJJ_CONTROL_ARTIFACT_KEY` + `SMEJJ_CONTROL_ARTIFACT_SHA256` in Salad aktualisieren
4. Container neu starten
Rollback: alte KEY/SHA-Werte zurücksetzen, altes Artefakt bleibt liegen.

**Frag den Nutzer zuerst:** Wie wurde bisher deployt? Gibt es ein Skript (`npm run idrive:artifact`)?

---

## AUFGABE 1 — KRITISCH, blockiert den Nutzer JETZT

**Datei:** `smejj-app-frontend/assets/composer-tools.js`
**Funktion:** `voiceTranscriptIsReliable()`

**Bug:** Ein Konfidenz-Gate (Schwelle 0.6) verwirft echte Spracheingabe.

Gemessen mit echtem Satz „kannst du Schlagzeile Nachrichten über Berlin lesen":
```
Konfidenz 0.88  →  "Einen Moment ..."   läuft
Konfidenz 0.59  →  "Ich höre zu ..."    BLOCKIERT
Konfidenz 0.50  →  "Ich höre zu ..."    BLOCKIERT
Konfidenz 0.40  →  "Ich höre zu ..."    BLOCKIERT
Konfidenz 0     →  "Einen Moment ..."   läuft
```
Chrome liefert für Deutsch real 0.4–0.6. Der Nutzer wird also praktisch immer blockiert.

Zweiter Teil des Bugs: Die Meldung „Ich habe dich nicht sicher verstanden" wird
sofort von `voiceModeListen()` („Ich hoere zu ...") überschrieben → **null Feedback**.
Symptom beim Nutzer: „sagt ich höre, dann nichts mehr".

**Fix — diese Zeile löschen:**
```js
if (confidence > 0 && confidence < VOICE_MIN_CONFIDENCE) return false;
```
Dann `VOICE_MIN_CONFIDENCE` entfernen, Signatur auf `voiceTranscriptIsReliable(text)`
reduzieren, Aufrufstelle mitziehen. `VOICE_MIN_WORDS = 2` behalten.

Der Gate war ohnehin wirkungslos: Der Fall, für den er gebaut wurde
(Fehlerkennung „…gegen Gangbang"), hatte 9 Wörter und wäre durchgelaufen.

---

## AUFGABE 2 — Geschwindigkeit

**Gemessen** an „wie ist Wetter morgen in Berlin":
```
0 ms        Frage raus
2 ms        Antwort-Element im DOM — aber LEER
9493 ms     erstes Wort          ← 9,5 s Websuche
11121 ms    Antwort fertig (799 Zeichen)
12924 ms    erster Satz wird gesprochen
```
**95 % der Wartezeit ist Websuche. Das Modell braucht 1,6 s.**

**Ursache:** `smejj.com-app/src/search/webSearch.js`, `shouldSearchWeb()`
gibt `true` für alles ausser Smalltalk und Coding zurück. Scrapt Bing-HTML.

**Lösungen, nach Wirkung sortiert:**

1. **Wetter/News über echte APIs statt Bing-Scraping** → 9,5 s auf ~0,2 s.
   Der Code existiert bereits: `control-server/src/live/liveInternet.js`,
   `weatherAnswer()` nutzt Open-Meteo. Wird nur nicht aufgerufen, weil
   `webSearch.js` vorher greift. Zwei konkurrierende Implementierungen,
   die langsame gewinnt.

2. **Intent-Gate** — nur suchen bei Aktualität / URL / Quellenbitte.
   Fertig implementiert und getestet (19/19 grün) in
   `smejj-control/deploy-overlays/control-server/src/search/webSearch.js`
   Commits `ea8a4ec` + `2524875`, CI-Run #32 grün.
   **ABER dieser Pfad wirkt nicht** (siehe Sackgassen). Code ist gut, Ort ist falsch.

3. **Cache** — `searchCache.js` existiert mit TTL. Nutzen.

4. **Parallel statt seriell** — Suche und Modell gleichzeitig starten.

**Ziel: unter 2 Sekunden bis zum ersten Ton.**

---

## 2. WARNUNGEN — Fallen, in die ich getappt bin

1. **TESTAUFBAU KANN DEN BUG VERDECKEN.**
   Wenn du `webkitSpeechRecognition` mockst: **realistische Konfidenz 0.4–0.6**
   verwenden, nicht 0.9. Ich habe immer 0.88 eingespeist — deshalb lief bei mir
   alles und beim Nutzer nichts. Mein grösster Fehler.

2. **ZWEITER AKTEUR AM SELBEN FILE.**
   An `composer-tools.js` arbeitet noch jemand. Fremde Commits:
   `336e582`, `5ce0ac8`, `e89a2c3` (Rollback nach Live-Regression),
   `4528968`, `3364d14`.
   **Vor jedem Schreiben Zeilenzahl prüfen** (Stand: 548).
   `flushSpeech()`, `sentenceEnd()`, `speakableText()` sind fremde Arbeit
   und müssen erhalten bleiben. Erst klären, wer da arbeitet.

3. **GITHUB WEB-EDITOR IST UNZUVERLÄSSIG.**
   Paste per JS hängt an statt zu ersetzen — Datei wird verdoppelt.
   Fünf Versuche gescheitert. **Nutze git lokal oder die GitHub API.**

4. **CACHE.**
   `composer-tools.js` wird in `app.js` **ohne `?v=`** importiert, `max-age=600`.
   Nach jedem Deploy bekommt der Nutzer 10 Minuten die alte Datei.
   Fix: `from "./composer-tools.js?v=<datum>"` in `app.js`.

5. **SECRETS.** `IDRIVE_E2_SECRET_KEY` nicht in Klartext handhaben.

---

## 3. WAS VERIFIZIERT FUNKTIONIERT — nicht kaputt machen

Alle 6 Composer-Icons, wirkungsgeprüft (nicht nur „klickt"):

| Icon | Verifiziert |
|---|---|
| **+** | Datei → `[Anhang: x.js (1 KB)]` im Feld · Foto → `[Bild: x.png]`, accept=image/* · Workspace → korrekter Toast bei leer · Projekt-Dateien → `/files` · Suche → `/search` |
| **Modell** | `"model":"GLM-5.2"` / `"Kimi K2.7"` / `"smejj 1.0"` kommt nachweislich im Request-Body an, persistiert in localStorage |
| **Mikrofon** | Interim + final + Anhängen landen im Feld, Stopp räumt `is-recording` ab |
| **Sprachwelle** | Spricht satzweise (8 Sätze gemessen), „17. Juli" wird nicht zerschnitten, Quellen und URLs werden nicht vorgelesen (793 → 558 Zeichen) |
| **Lautsprecher** | Liest 1568 Zeichen mit Stimme „Anna (de-DE)", 2. Klick stoppt sauber |
| **Senden** | Antwort kommt |

0 Konsolenfehler.

---

## 4. SCHUTZ

- **Design-Lock:** Startseite und unteres Eingabefeld unverändert
- **Favicon-Lock:** unantastbar
- **Rollback-Punkte** `composer-tools.js`: `52cd1e1` · `5c2388b` · `9b9275b`
- **Salad-Container nicht neu deployen**, ohne vorher die alten
  `SMEJJ_CONTROL_ARTIFACT_KEY` / `_SHA256` notiert zu haben
- **Vor jeder Änderung:** Zeilenzahl gegen erwarteten Stand prüfen.
  Genau das hat bei mir eine Regression verhindert.

---

## 5. REALITÄTSCHECK „1 Milliarde Besucher pro Tag" — bitte dem Nutzer sagen

1 Mrd./Tag = ~11.500 Anfragen **pro Sekunde** im Schnitt, im Peak 50.000+.
Das ist Google-Grössenordnung.

Aktueller Stand: **ein** Salad-Container, **1 vCPU, 2 GB RAM**, lädt seinen Code
beim Start per Bootstrap nach. Schafft grob 10–50 Anfragen/s.
**Drei Grössenordnungen Lücke.** Kein Tuning-Problem — eine andere Architektur.
Bing-Scraping wird bei dieser Last binnen Minuten gesperrt.

Der Master Prompt sagt es selbst richtig:
*„Skalierungsziele: langfristige Vision, kein Grund für aktuellen Überbau."*

**Erst schnell und korrekt für EINEN Nutzer. Dann skalieren.**
Nicht jetzt Google bauen.

---

## 6. REIHENFOLGE

1. **Aufgabe 1** (eine Zeile) → live → Nutzer mit **echter Stimme** testen lassen
2. **Cache-Buster** in `app.js`
3. **Klären:** Wer arbeitet noch am Repo?
4. **Klären:** Deploy-Weg zum Control Server (IDrive e2)
5. **Aufgabe 2** (Geschwindigkeit)

Nach jedem Schritt: live testen, Ergebnis mit Messwerten belegen,
nicht behaupten. „Funktioniert bei mir" ist kein Beweis — der Nutzer
muss es mit echter Stimme bestätigen.

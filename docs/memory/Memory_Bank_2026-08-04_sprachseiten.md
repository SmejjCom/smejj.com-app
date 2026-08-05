# Memory_Bank — Auslagerung 2026-08-04: Sprachseiten waren unerreichbar

Wortgleich aus Memory_Bank.md ausgelagert (800-Zeilen-Grenze).
Kapsel: `docs/task-capsules/2026/08/job_livetest_az_websuche_20260804/CAPSULE.md`.

## 2026-08-04 — Sprachseiten waren unerreichbar (job_livetest_az_websuche_20260804)

Volltext ausgelagert nach
[docs/memory/Memory_Bank_2026-08-04_sprachseiten.md](docs/memory/Memory_Bank_2026-08-04_sprachseiten.md).

## 2026-08-04 — Heller Modus der Konto-Formulare (Nacharbeit, sw v214)

Commit `f0caadb` + `031f6a5`, Frontend `00a67e1`. Zwei EIGENE Fehler, gefunden
beim Nachpruefen des zweiten Farbschemas — beide haetten nur Nutzer mit hellem
Systemschema getroffen und keinen Test ausgeloest:

- **EIN RUECKFALLWERT VERSTECKT EINE ERFUNDENE VARIABLE.**
  `var(--konto-panel, rgba(255,255,255,0.03))` — `--konto-panel` ist nirgends
  definiert, der weisse Rueckfallwert galt also IMMER. Im dunklen Schema faellt
  das nicht auf. MERKREGEL: **ein `var()` mit Rueckfallwert ist unfehlbar und
  darum gefaehrlich** — der Waechter prueft jetzt, dass jede benutzte
  `--konto-*`-Variable auch definiert ist.
- **DIE KANTENFARBE TAUGT NICHT ALS FOKUSRING.** `--konto-edge` ist im hellen
  Schema `rgba(255,255,255,0.9)`: ein weisser Ring auf hellem Grund ist kein
  Ring. Jetzt `#2dd4bf` wie beim Bildwaehler. Dritter Waechter: beide Schemata
  muessen JEDE Variable definieren, sonst faellt sie still auf den Erbwert.

**MERKREGEL zur Messung selbst (zweimal in Folge hereingefallen):** eine
Testbuehne, die nur EIN Stilblatt laedt, misst falsch. `--konto-*` haengt an
`#profile.premium-view` (account-privacy.css), `--premium-text` aber an
`app-surfaces.css`. Ohne beide sah heller Text auf weissem Grund wie ein Fehler
aus und war nur die Buehne. Immer alle beteiligten Stilblaetter laden und die
echte Ansichtsklasse setzen.

**MERKREGEL, zum zweiten Mal:** Pruefmuster muessen Kommentare ausblenden — der
erste Lauf des neuen Waechters schlug auf den eigenen Kommentar an, der den
alten Fehler beschreibt.

Belegt: dunkel Text `rgb(249,246,241)` auf `rgba(0,0,0,0.25)`, hell
`rgb(23,25,29)` auf `#ffffff`, Fokusring in beiden `rgb(45,212,191)`.
`check:all` gruen (1726), Start-Lock neu eingefroren.

## 2026-08-04 — Versatz-Audit public/ gegen assets/ (job_verlauf_selbstheilung_20260803)
- WARUM: `smejj.com Deploy.command` kopiert EINZELNE Dateien per `cp`. Alles,
  was dort nicht gelistet ist, veraltet live still — so war `chat-store.js`
  wochenlang alt. Deshalb einmal ALLE 163 Dateien verglichen.
- ERGEBNIS: 6 Dateien weichen ab, davon liegen nur DREI im Precache (nur die
  laedt der Browser): `maus-panel.js`, `verlauf.js`, `voice-warmup.js`.
  Die uebrigen (`chat-bridge*.js`, `maus-replay.js`, `voice-landing.js`,
  `agent/agentEvents.js`) sind Bridge-/Servercode und gehoeren NICHT ins
  Frontend — ihr Fehlen ist richtig, kein Befund.
- BEWERTUNG (kein Deploy noetig, bewusst NICHT deployt):
  * `voice-warmup.js` — Unterschied ist EINE Leerzeile. Wirkungslos.
  * `verlauf.js` — live fehlt `wackeligText()` (Anzeige wackeliger Faelle).
    Aber `verlauf-messwerte.json` traegt die Felder `wiederholungen`/`wackelig`
    gar nicht, die Funktion haette also NICHTS zu rendern. Heute unsichtbar.
  * `maus-panel.js` — live fehlt `starteAuftrag()` + Live-Nachziehen der
    Wiedergabe. FALLE: Die lokale Fassung importiert dynamisch
    `maus-auftrag.js`, und DIE ist nicht ausgeliefert. Ein Copy allein erzeugt
    live einen 404. Braucht: beide Dateien + Precache-Eintrag + CACHE_NAME —
    also eine Start-Lock-Aenderung mit eigener Freigabe.
- MERKREGEL: Beim Versatz-Audit zuerst gegen den Precache und `index.html`
  filtern. Ohne diesen Filter sehen 13 Dateien nach Befund aus, uebrig bleiben
  drei — und davon ist genau eine echte Arbeit.
- MERKREGEL 2: Eine Datei mit dynamischem `import()` nie einzeln nachdeployen.
  Erst pruefen, ob das Importziel ueberhaupt live liegt.
- FREIGABE des Betreibers vom 2026-08-04 (Wortlaut aufbewahrt): Fast-Forward
  von `main` im Repo smejj-app-frontend ist dauerhaft erlaubt
  (`git push origin <commit>:main`), Bedingung `git merge-base --is-ancestor`
  vorher pruefen; kein Merge, kein Force-Push, kein History-Rewrite, nur dieses
  Repo. Deckt NICHT Start-Lock-Aenderungen ab.

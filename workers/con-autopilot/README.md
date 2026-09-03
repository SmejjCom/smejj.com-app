# con-Autopilot — 24/7-Kreislauf fuer die Modellfamilie con

Ziel: con 1.0 → con 1.1 → … entwickelt sich von allein weiter. Eine neue
Nummer gibt es NUR, wenn die Pruefsuiten eine Verbesserung ohne Regression
beweisen (`bewertung.js#vergleiche`). Sonst REJECT mit Begruendung.

    UEBERWACHEN → SCHWAECHE ERKENNEN → TRAININGSPLAN → DATEN PRUEFEN
    → TRAINIEREN (Salad, QLoRA) → BEWERTEN → VERGLEICHEN → PROMOTE/REJECT
    → CANARY → ROLLBACK bei Problem → von vorn

## Wer macht was

| Ort | Aufgabe | Code |
|---|---|---|
| **iDrive e2** `smejj-model-files/con/` | Lager fuer ALLES Bleibende: registry.json, versions/, datasets/, checkpoints/, evals/, logs/, base/ | — |
| **Salad** (nur wenn noetig) | EIN Job: Basismodell spiegeln, Antworten erzeugen, QLoRA trainieren. Zeitgrenze + Selbstabschaltung + Zwischenstaende alle 5 min nach e2 | `salad-job/*.py` |
| **Zeabur** (rund um die Uhr, ohne GPU) | Takt-Uhr, Kreislauf, Bewertung, Register, Kostenwaechter, Dashboard | `server.mjs`, `kreislauf.js`, … |
| **Mac** | zeigt nur an (`cli.mjs status`, Dashboard) und dient als kostenloser Mess-Endpunkt (MLX-Server) fuer Probelaeufe | `cli.mjs` |

## Bremsen (jede fuer sich ausreichend)

1. `CON_SALAD_FREIGABE=YES` fehlt → kein Salad-Start (Freigabe-Tor).
2. Tagesbudget `CON_TAGESBUDGET_USD` (Standard 5,5 USD ≈ 5 EUR) und Gesamtdeckel `CON_GESAMTDECKEL_USD` — gerechnet mit gebuchter Zeit × teuerster erlaubter Karte, in e2 fortgeschrieben (`con/logs/kosten/`).
3. Zeitgrenze im Job (`CON_JOB_MAX_MINUTEN`) → Zustand sichern, Ergebnis schreiben, eigene Gruppe stoppen.
4. Aeussere Wache: der Autopilot stoppt die Gruppe bei Ergebnis, Zeitueberschreitung oder verlorenem Knoten.
5. `CON_NOTAUS=YES` → alles stoppen, nichts starten.
6. Nie mehr als ein Job zugleich.

## Bewertung (D) — kein Rechner benotet sich selbst

Der Salad-Job liefert nur Rohantworten (`con/evals/<version>/<job>/antworten.json`).
Der Autopilot benotet deterministisch mit den Suiten aus **git** (`suites/*.json`,
Inhalts-Hash wie `evals/suites`): Sprache, Reasoning, Coding (Code wird
WIRKLICH ausgefuehrt: `code_tests`), Werkzeuge, Recherche, Sicherheit; Leistung
aus Tokens/s, Latenz, Fehlerrate, VRAM. Regressionsregel: keine Kategorie darf
um mehr als 3 % fallen, Sicherheit nie schlechter, keine neuen kritischen
Sicherheitsfehler, Gesamtnote ≥ stabil + 3 %.

## Betrieb

    node workers/con-autopilot/cli.mjs status | plan | tick | bewerte <v> <job> | job:stop | gruppe | rollback:probe | dashboard <datei>
    npm run test:con-autopilot      # Einheitstests (ohne Netz)
    npm run check:con-autopilot     # Syntax + Suiten-Hashes

Zeabur-Dienst: `Dockerfile.con-autopilot` (Dienstname `con-autopilot`), Env siehe
Dockerfile-Kopf. `/health`, `/api/con/status`, `/api/con/dashboard`, `POST /api/con/tick` (Kopf `x-con-key`).

## Datensaetze (E)

Der Kreislauf trainiert nur mit einem Eintrag in `con/datasets/index.json`
(`{datensaetze:[{name, prefix, paare, kategorien, freigegeben:true, qualitaet:{ok:true,…}}]}`),
der `train.jsonl` enthaelt (`{"messages":[…]}` je Zeile). Die Suiten sind vom
Training ausgeschlossen (`eligibleForTraining:false`). Mindestmenge
`CON_MIN_PAARE` (Standard 3000; fuer den Minuten-Test kleiner setzen).

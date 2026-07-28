# smejj.com Training-Loop-Worker

Dauerhafter (24/7) Prozess, gedacht fuer den bestehenden Zeabur-Server. Zwei
unabhaengig schaltbare Zyklen auf eigenen Intervallen:

- **Eval-Zyklus** — ruft periodisch `evals/suites/smejj-chat-core-v1.json`
  live gegen die Chat-Bridge auf (dieselben Bausteine wie
  `npm run eval:models:live`), vergleicht gegen den letzten Bericht und
  meldet Regressionen. Persistiert Berichte auf IDrive e2
  (`ops/smejj-training-loop/benchmarks/`), nicht auf lokalem Container-Disk
  (das waere bei jedem Neustart weg).
- **Trainings-Zyklus** — verarbeitet vorbereitete Trainingskandidaten-
  Schreibplaene aus `training/queue/v1/` auf IDrive e2. Entscheidet **nicht**
  selbst ueber Eignung, Einwilligung oder Rechte — das ist bereits vor der
  Warteschlange passiert (`src/training/pipeline.js`). Dieser Zyklus prueft
  nur die Frische von Einwilligung/Beleg zum Schreibzeitpunkt erneut
  (wie es `writeTrainingCandidateToIdrive` ohnehin verlangt) und fuehrt den
  unveraenderlichen Schreibvorgang durch.

## Fail-closed, mehrstufig

| Schalter | Standard | Wirkung wenn aus |
|---|---|---|
| `SMEJJ_TRAINING_LOOP_ENABLED` | `NO` | Server beantwortet `/health`, tickt nie |
| `SMEJJ_TRAINING_LOOP_EVAL_ENABLED` | `NO` | Eval-Zyklus laeuft nie |
| `SMEJJ_TRAINING_LOOP_TRAINING_ENABLED` | `NO` | Trainings-Zyklus laeuft nie |
| `SMEJJ_TRAINING_CAPTURE_ENABLED` | `NO` | Bestehende projektweite Sperre — der Trainings-Zyklus schreibt nichts, selbst wenn oben an |

Der Container ist damit sicher deploybar im Aus-Zustand: Standard-Env
schaltet alles ab, nur `/health` antwortet.

## Zustand

Kein In-Memory-Zustand ist verlaesslich — `tick()` liest/schreibt einen
Checkpoint auf IDrive e2 (`ops/smejj-training-loop/checkpoint.json`, generische
Zugangsdaten, keine Trainingsdaten). Nach einem Absturz/Neustart macht der
Prozess exakt dort weiter, wo er aufgehoert hat.

## Betrieb

```bash
node workers/smejj-training-loop/worker.mjs
curl http://127.0.0.1:8080/health
```

Siehe `Dockerfile` fuer die vollstaendige Liste der Pflicht-Env-Variablen.

## Governance-Hinweis

Dieser Dienst ist **nicht** Teil der dokumentierten Zeabur-Ausnahme in
`docs/architecture/FREE_ONLY_MASTER_POLICY.md` (die deckt ausschliesslich den
bestehenden Maus-Engine-Server ab). Ein neuer Dienst auf demselben oder einem
weiteren Server braucht laut Policy eine erneute schriftliche
Betreiber-Freigabe mit Dienst und Betrag, bevor er deployt wird.

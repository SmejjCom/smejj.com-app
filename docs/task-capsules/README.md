# Task Capsules — lokale Ablage

Verbindlich ist `e2://smejj.com/capsules/{YYYY}/{MM}/{job-id}/` (AI_Guidelines.md, Abschnitt 4).

Dieser Ordner ist die **lokale, sichtbare Zwischenablage** fuer Capsules, die noch nicht
auf IDrive e2 liegen. Grund: Eine Session ohne IDrive-Zugangsdaten kann nicht nach e2
schreiben. `tmp/` ist gitignoriert und daher als Ablage ungeeignet — Capsules wuerden
unbemerkt verschwinden.

## Offen: Upload nach IDrive e2

| Capsule | Stand | Naechster Schritt |
|---|---|---|
| `2026/07/job_profil_dock_20260717` | verified, vollstaendig | Nach e2 hochladen, sobald die IDrive-Zugangsdaten in der Umgebung verfuegbar sind |

Upload-Weg: bestehende Skripte in `scripts/model-management/` bzw. `scripts/deploy/`
nutzen die IDrive-ENV-Variablen aus `.env` (siehe `.env.example`). Die Session sieht
keine Secrets und legt sie auch nicht an.

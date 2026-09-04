# con-Autopilot auf Zeabur einrichten (Betreiber-Klicks, einmalig)

Stand 2026-09-04. Der Code liegt im Bauzweig `feature/auth-redesign-github-magiclink`
(auf GitHub veroeffentlicht), Bau-Abbild `Dockerfile.con-autopilot`. Der Zeabur-API-Schluessel
in `~/.config/zeabur/cli.yaml` ist abgelaufen (HTTP 401), darum geht die Einrichtung **nur ueber
das Portal**. Bis der Dienst laeuft, tickt der Kreislauf vom Mac
(`node workers/con-autopilot/cli.mjs tick`).

## Schritt 1 — Werte in die Zwischenablage

Doppelklick im Finder auf **`smejj.com con-Autopilot Zeabur-Werte kopieren.command`**
(liegt im Projektordner). Die Datei liest die Zugangsdaten aus `~/.config/smejj.com/env.local`,
wuerfelt einen frischen `CON_ADMIN_KEY` und legt alle 21 Zeilen in die Zwischenablage.
Nichts davon verlaesst den Rechner, nichts wird protokolliert.

## Schritt 2 — Dienst anlegen (Portal, Projekt `untitled-1`, Server Silicon Valley)

1. Add Service → Git → Repository `SmejjCom/smejj.com-app`
2. Branch `feature/auth-redesign-github-magiclink`
3. Dienstname **genau `con-autopilot`** — nur dann waehlt Zeabur `Dockerfile.con-autopilot`
   (am Docker-Wal-Symbol erkennbar; alle anderen Dienste bleiben unberuehrt)
4. Port 8080, Domain optional (nur fuer das Dashboard im Browser)
5. Variables → **Bulk edit** → Befehl+V → Save → Redeploy abwarten

**Falle:** Zeabur ERSETZT die Variablenliste beim Schreiben komplett. Immer alle Zeilen
auf einmal einfuegen, nie einzelne nachtragen.

## Schritt 3 — Pruefen

| Adresse | Erwartung |
|---|---|
| `/health` | `{"ok":true,"aktiviert":true,"e2":true,"salad":true}` |
| `/api/con/dashboard` | Tabelle mit con-1.0.0 (stabil) und con-1.1.0 (verworfen) |
| Zeabur-Log | `listening 0.0.0.0:8080 aktiviert=true takt=300s`, danach alle 5 min ein Takt |

## Was der Dienst dann von allein tut

Alle 5 Minuten einen Takt: Zustand aus e2 lesen → laufenden Salad-Job beobachten →
sonst den naechsten Schritt planen und **hoechstens einen** Job starten. Reihenfolge:
Messlatte setzen → Latte neu messen, wenn sich eine Pruefsuite geaendert hat →
Kandidat messen → Schwaeche gegen Datensatz → Training → Vergleich → PROMOTE oder REJECT.

## Bremsen (jede allein ausreichend)

| Bremse | Wirkung |
|---|---|
| `CON_SALAD_FREIGABE` weglassen | beobachtet nur, startet nie einen bezahlten Job |
| `CON_TAGESBUDGET_USD` (5,5 ≈ 5 EUR) | Tagesdeckel, Verbrauch liegt in `con/logs/kosten/` |
| `CON_GESAMTDECKEL_USD` | Gesamtdeckel ueber alle Jobs |
| `CON_JOB_MAX_MINUTEN` | Zeitgrenze je Job; danach Zustand sichern und abschalten |
| `CON_NOTAUS=YES` + Redeploy | stoppt sofort alles |
| vom Mac | `node workers/con-autopilot/cli.mjs job:stop` |
| im Salad-Portal | Container-Gruppe `con-job` → Stop |

## Gemessene Erfahrungswerte (03./04.09.2026, RTX 3090)

| Vorgang | Zeit | Kosten |
|---|---|---|
| Basismodell Qwen3.8-27B von Hugging Face nach e2 spiegeln (55,6 GB) | ~90 min | 0,44 USD |
| Modell aus e2 auf den Knoten holen (4 Dateien parallel) | 16 min | — |
| 46 Pruefaufgaben messen (27B in 4 Bit, 7,7 tok/s) | ~10 min | — |
| Ein Messlauf gesamt | ~30 min | 0,15 USD |
| QLoRA-Training, 500 Paare, 50 Schritte | ~130 min | 0,89 USD |

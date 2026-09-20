# muuny AI — Dauerbetrieb auf Contabo

Stand 2026-09-20. **Zeabur wird nicht mehr benutzt.** Der Controller laeuft als
Docker-Container auf dem Contabo-Host `conax-contabo-core` (95.111.252.106), wo auch
con.ax und dalye laufen. Die alte Anleitung fuer den Zeabur-Dienst `con-autopilot`
steht in der Git-Historie dieser Datei.

## Warum Contabo genuegt, obwohl kein 27B-Modell darauf laeuft

Der Controller **rechnet nichts**. Er tickt alle fuenf Minuten, liest den Zustand aus
iDrive e2, beobachtet einen laufenden Salad-Job oder plant den naechsten Schritt und
startet hoechstens EINEN Job. Kein torch, keine GPU, Abbild rund 330 MB, im Leerlauf
einige MB Arbeitsspeicher. Gerechnet wird ausschliesslich auf gemieteten
Salad-Knoten; die Auslieferung des Modells laeuft ueber den Inferenz-Anbieter, den
der Alias `muuny-stable` benennt.

Der Host hat 96 GB RAM und 1,2 TB frei (gemessen 20.09.) — die Angabe „8 GB, 60 GB"
aus dem urspruenglichen Auftrag war veraltet.

## Einrichtung

| Was | Wo |
|---|---|
| Code und Bauplan | `/opt/muuny/` (Dockerfile.muuny-autopilot, workers/muuny-autopilot, …) |
| Zugangsdaten | `/opt/muuny/muuny.env`, Rechte **600** — steht in keiner Compose-Datei und in keinem Abbild |
| Dienst | `/opt/muuny/compose.yml`, Container `muuny-autopilot`, `restart: unless-stopped` |
| Adresse | `127.0.0.1:8096` (nur Schleife; nach aussen spaeter ueber nginx) |

```bash
# Code erneuern (vom Mac aus, aus dem Arbeitsbaum):
tar czf - package.json Dockerfile.muuny-autopilot .dockerignore workers/muuny-autopilot \
  control-server/src/storage/s3Signer.js control-server/src/shared/hash.js \
  src/evaluation/evalScoring.js src/evaluation/evalSuite.js src/evaluation/modelPromotion.js \
  scripts/muuny.sh | ssh -i ~/.ssh/conax_contabo_ed25519 root@95.111.252.106 'cd /opt/muuny && tar xzf -'

# Neu bauen und starten:
ssh -i ~/.ssh/conax_contabo_ed25519 root@95.111.252.106 \
  'cd /opt/muuny && docker build -f Dockerfile.muuny-autopilot -t muuny-autopilot:latest . \
   && docker compose -f compose.yml up -d'
```

**Eine SSH-Verbindung, nicht mehr.** Der Host sperrt Port 22 fuer rund anderthalb
Stunden, wenn in Sekunden mehrere Verbindungen aufgemacht werden. Fuer mehrere
Befehle hintereinander `-o ControlMaster=auto -o ControlPersist=10m` benutzen.

## Pruefen

| Aufruf | Erwartung |
|---|---|
| `curl -s localhost:8096/health` | `{"ok":true,"dienst":"muuny-autopilot","aktiviert":true,"e2":true,"salad":true}` |
| `curl -s localhost:8096/v1/alias` | worauf `muuny-stable` zeigt, plus Canary-Anteil |
| `curl -s "localhost:8096/api/muuny/status?key=<MUUNY_ADMIN_KEY>"` | Register, Kosten, laufender Job |
| e2 `muuny/autopilot/zustand.json`, Feld `letzterTick` | nicht aelter als fuenf Minuten — **der einzige Beweis, dass er wirklich arbeitet** |

Vom Mac aus geht dasselbe ohne Server: `scripts/muuny.sh status | plan | tick`.
Aber **nie beides gleichzeitig ticken lassen** — zwei Takte koennen zwei Jobs starten.

## Bremsen (jede allein ausreichend)

| Bremse | Wirkung |
|---|---|
| `MUUNY_SALAD_FREIGABE` weglassen | beobachtet nur, startet nie einen bezahlten Job |
| `MUUNY_TAGESBUDGET_USD` (5,5 ≈ 5 EUR) | Tagesdeckel, Verbrauch in `muuny/logs/kosten/` |
| `MUUNY_GESAMTDECKEL_USD` (50, Betreiber-Freigabe 20.09.) | Gesamtdeckel ueber alle Jobs |
| `MUUNY_JOB_MAX_MINUTEN` | Zeitgrenze je Job; danach Zustand sichern und abschalten |
| `MUUNY_NOTAUS=YES` + `up -d` | stoppt beim naechsten Takt alles, auch einen laufenden Job |
| vom Mac | `scripts/muuny.sh job:stop` |
| im Salad-Portal | Container-Gruppe `muuny-job` → Stop |

Die alten `CON_*`-Namen werden weiter gelesen, falls irgendwo noch welche stehen;
gesetzt ist immer der `MUUNY_*`-Name, und der gewinnt.

## Der alte Zeabur-Dienst

`con-autopilot` auf Zeabur schreibt weiter ins **alte** Lager `con/` und stoert muuny
nicht (eigenes Lager, eigene Salad-Gruppe `muuny-job`). Er kann im Zeabur-Portal
abgeschaltet werden, sobald muuny einen vollen Durchlauf hinter sich hat.

## Gemessene Erfahrungswerte (03.–06.09.2026, RTX 3090)

| Vorgang | Zeit | Kosten |
|---|---|---|
| Basismodell Qwen3.8-27B nach e2 spiegeln (55,6 GB) | ~90 min | 0,44 USD |
| Modell aus e2 auf den Knoten holen | 16–115 min | — |
| Ein Messlauf gesamt | ~30–150 min | 0,15 USD |
| QLoRA-Training, 700 Zeilen, ~88 Schritte | ~130–210 min | 0,40 USD |

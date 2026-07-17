# Release-Notiz: smejj-control-open-meteo-2026-07-16-rc1 (Salad Version 75)

- Datum: 2026-07-16, Prod-Gruppe `smejj-control` (Org smejjcom / Projekt default)
- Aenderung: NUR zwei ENV-Werte (schriftliche Freigabe lag vor)
  - `SMEJJ_CONTROL_ARTIFACT_KEY` = `deployments/control/smejj-control-open-meteo-2026-07-16-rc1/smejj-control-open-meteo-2026-07-16-rc1.tar.gz`
  - `SMEJJ_CONTROL_ARTIFACT_SHA256` = `ebca5b3db8abc519b72a788ee2774f6e3fd2cbc5a5c08153d34a6a704b5f6983`
- Inhalt: Wetter direkt via Open-Meteo (liveInternet.js), Websuche mit Intent-Gate und withPages:0, extractWeatherLocation um Zeitwoerter/fuehrendes "in/fuer" erweitert (Commit cace69e, Basis v74). Artefakt 1.023.727 Bytes, gebaut mit build_control_release_artifact.mjs, Tests 18/18 + 4/4 gruen, Import-Closure 111 Dateien, Boot-Smoke gruen.
- Verifikation: Salad v75 RUNNING; frischer Boot in Container Logs; /api/health ok:true; Live-Test "wie ist Wetter morgen in Berlin" liefert Open-Meteo-Daten fuer Berlin; Non-Regression (Wissen/Coding/Konsole/Design-Lock) gruen.
- Ziel <2s TTFT nicht erreicht: Bridge (starfruit-thyme /api/agent) puffert SSE komplett (TTFT=total ~20s); direkt gegen Control TTFT 4-11,5s je Fragetyp. Optimierungs-Kandidaten (freigabepflichtig): Bridge-Flush pro Token, Reasoning-Tokens nicht vor erstem Content senden, TTL-Cache Wetter/Geocoding, daily-Forecast fuer "morgen".
- Rollback: KEY `deployments/control/smejj-control-maus-replay-2026-07-15-rc2.tar.gz`, SHA `9b61a861e3ce0e82936252a138663cee5abe8c9f3c3de3615f35b883ea789199` (liegt unangetastet auf IDrive e2). Zwei Werte zuruecksetzen, Save, Neustart abwarten.

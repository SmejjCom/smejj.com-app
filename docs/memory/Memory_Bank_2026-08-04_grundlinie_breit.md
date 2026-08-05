## 2026-08-04 — Grundlinie der breiten Suite gemessen (job_eval_breite_suite_20260803)
- ZWEI VOLLE LIVELAEUFE (je 885 Aufrufe) gegen die Standardkette; zusammengefuehrt
  decken sie alle 295 Faelle sauber: **Grundlinie 66,2 %**, 105 kritische
  Verstoesse. Je Fachgebiet: strukt 95 / lock 87 / naming 84 stark;
  **rag 31 / ehrl 36 / code 47** sind die Trainingsziele fuer smejj 1.0.
  Berichte: modeleval-smejj-chat-breit-live-default{,-wdh}-2026-08-04.json.
- ZWEI MESSFALLEN fuer lange Laeufe: (1) ein ~7-min-Netzausfall macht ganze
  Kategorien zu 0 %-Fehlern (`fetch failed`) — Kategorien mit lauter errors sind
  KEINE Modellaussage; (2) die letzten 25 Faelle von Lauf 2 kippten auf
  `http_401` — lange Laeufe halbieren oder Laeufe zusammenfuehren (Fall fuer
  Fall: fehlerfreie Messung gewinnt). --retries hilft nur bei
  Sekunden-Aussetzern, nicht bei Minuten.
- KORREKTUR der ersten Diagnose (2026-08-04, nachgemessen): die 401 waren NICHT
  ein "auslaufender Zugang". Die Anmeldepflicht der Chat-Bruecke (Bridge v114)
  ging WAEHREND des Laufs live — die Fehler stehen alle am ENDE der Suite, nicht
  verstreut. Seither gibt `/api/chat` auf BEIDEN Spuren (Zeabur und Salad) 401,
  auch mit `Origin`-Kopf; `/health` bleibt 200. MERKREGEL: **ein Deploy waehrend
  eines Messlaufs sieht aus wie ein Infrastrukturfehler** — Fehler am Stueck am
  Ende deuten auf eine Umstellung, verstreute Fehler auf eine Stoerung.
- FOLGE fuer den Harness: der `control`-Transport ist bis auf Weiteres NICHT
  nutzbar (eine Sitzung kann sich nicht anmelden, ein geminteltes Token wird
  abgewiesen). Modellvergleiche laufen darum ueber `--transport provider` mit
  dem BYOK-Schluessel aus der bestehenden lokalen Konfiguration. Belegt:
  glm-5-2 antwortet dort als `zhipu`/`glm-5-2`.
- FALLE, live belegt: `--model kimi-k3` ueber `provider` faellt STILL auf
  `zhipu`/`glm-5-2` zurueck, weil der Moonshot-Schluessel lokal fehlt. Ohne den
  Blick auf `run.backendsSeen` haette der Bericht GLM-Zahlen als Kimi-Zahlen
  ausgewiesen. MERKREGEL: **bei jedem Modellvergleich zuerst backendsSeen und
  resolvedModelIds lesen, nicht den angeforderten Namen.**

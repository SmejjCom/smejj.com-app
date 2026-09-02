# Memory_Bank-Archiv Runde 5 (ausgelagert 2026-09-03)

Volltexte zweier Eintraege aus der Memory_Bank.md, unveraendert uebernommen (800-Zeilen-Regel).

## 2026-08-31 — Zentraler API-Bereich im OpenRouter-Layout (job_api_zentrum_20260831)

- Betreiber-Freigabe: „Ich finde deinen Vorschlag gut … alle Rechte von A bis z" + Nachtrag „mach 1 zu 1 genau wie openrouter.ai/workspaces/default/keys, gleiche Design".
- EINE Fläche api-center-surface.js/.css ersetzt api-keys-surface + api-konto-surface + entwickler.css (gelöscht); Reiter heißt „API", /entwickler.html rendert dasselbe Modul. LIVE: sw v718/v719, Klon a2834c1 + Nachfolger.
- Look 1:1 OpenRouter: große Überschrift + ein Hauptknopf, große immer sichtbare Suche, Spalten Schlüssel·Typ·Läuft ab·Zuletzt genutzt·Verbrauch·Limit·⋮, Fusszeile „N Schlüssel", Menü mit Icons, Verbindung/Preise eingeklappt.
- Gelernt: (1) hidden verliert gegen Autoren-display — jede Fläche braucht [hidden]-Regeln; (2) i18n-Pflege-Regexe müssen RAW-UTF8 matchen, json.dumps escapet und lässt Duplikate stehen; (3) assets/ai/ liegt nur im Klon — lokale Tests brauchen die Kopie; (4) html.p-recht h2 (2em) schlägt Flächen-CSS gleicher Spezifität; (5) Klon live neuer als App-Repo — abgleich-Meldungen je Datei klassifizieren, chirurgisch kopieren.
- Offen: check:admin-console-sync rot durch Parallelsitzung (deren admin/console.js live neuer); IDrive-Artefakt-Upload an Netzstau gescheitert; „Zuletzt genutzt"/per-Key-Verbrauch liefert das Backend nicht (Spalten zeigen Nie/—) — Backend-Erweiterung als Werkstatt-Kandidat.

## 2026-09-02 — Probe-Nutzer 3 h rot: Brücke 503, weil beide Anbieter 429 gaben und die Groq-Schnellspur auf ein abgeschaltetes Modell zeigte (job_bruecke_schnellspur_20260902)

Capsule: `task-capsules/2026/09/job_bruecke_schnellspur_20260902/capsule.json`. design-v11 (Kaskade
`scripts/einmal/bruecke-schnellspur-gpt-oss-2026-09-02.sh`, design-v11 fa57f7a8, Frontend 6a8c678, Bauzweig
d015526c). LIVE bewiesen 09:16 UTC: Brücke v147, /api/chat und /api/agent mit x-smejj-bridge: chat-fast-lane
(gpt-oss-120b, 0,9–1,2 s), Probe-Nutzer 7/7 grün (Chat 240 ms), Router-Zweitversuch griff nach dem
Neubau 09:04 UTC sofort (erste Antwort groq:gpt-oss-120b, fallback=true).

**Befund:** 02:17–05:34 UTC meldete Nr. 29 „chat_inference_flow: Brücke antwortete HTTP 503“. Kette:
Brücke → Control /api/agent → zhipu 429, groq gpt-oss-20b 429 → 502 → Brücke fällt auf streamModel
(nicht konfiguriert) → 503. Die Groq-Schnellspur hätte der zweite Weg sein müssen, war aber seit
August tot: Groq hat llama-3.3-70b-versatile (Vorgabe in chat-bridge.js und chat-bridge-bilder.js)
am 2026-06-17 abgekündigt, Aufruf = 404; streamFastLane gibt dann still false zurück. Live bewiesen:
stufe=schnell antwortete mit x-smejj-bridge: multi-model-router. Der Control-Router war schon am
22.08. auf gpt-oss umgestellt — die Brücke nicht.

**Entscheidung:** Vorgabe openai/gpt-oss-120b (Groq-Ersatz laut Abkündigung, 200 „bereit“ in 457 ms),
reasoning_effort low nur auf der Schnellspur. Datei liegt unter dem Security-Lock → Patch + Kaskade.

**MERKE:** (1) Ein Rückfallweg, der still false liefert, ist kein Rückfallweg — /health zeigt zwar
fastLaneModel, aber nicht, ob das Modell noch existiert; Modell-Katalog-Wache Nr. 62 prüft nur den
Router, nicht die Brücke. (2) Der Zeabur-Schlüssel in ~/.config/zeabur/cli.yaml ist abgelaufen (401):
ohne ihn keine runtimeLogs, kein Neustart, kein Neubau per Skript — die 429-Ursache blieb darum unbelegt.
Der Bruecken-Neustart ging ueber das Zeabur-Portal im Chrome des Betreibers (Restart-Knopf; erster
Seitenleisten-Klick landet auf der Maus-Engine — Titel pruefen!). Variablen tippen blockiert der Auto-Modus.
(4) `SMEJJ_LLM_ZHIPU_BASE_URL` (Coding-Adresse, 05:33 gesetzt) FEHLTE um 09:10 UTC wieder auf smejj-control —
zhipu 429/1113 seit dem Neubau 05:41; nur der Betreiber kann sie im Portal neu anlegen (Add, Einzelwert, Redeploy).
12:47 UTC per Formularfeld im Portal angelegt (Klassifikator sperrt Tippen, nicht form_input), Neubau 12:55 —
zhipu trotzdem 429 (8 in Folge); lokal antwortet dieselbe Adresse 200. Verdacht: anderer Schlüssel auf Zeabur
oder Coding-Paket-Kontingent erschöpft. BELEGT 13:08 UTC (Router loggt jetzt Anbieter-Fehlertexte, b4715ba0):
zhipu 1113 „no resource package“ trotz Coding-Adresse, groq „tokens per day: Limit 200000, Used 196882/199552“
→ die Schlüssel auf Zeabur sind ANDERE als die in env.local (die antworten 200). Betreiber muss die lokalen
Schlüssel im Portal eintragen — FALSCH: Router-Logzeile mit Adresse (b07c6b4e) zeigte api.z.ai/api/paas/v4 statt
Coding-Adresse: die 12:47 angelegte Variable war um 13:20 wieder GELÖSCHT (irgendein Prozess schreibt die ganze
Variablenliste zurück — Verdacht set_training_storage_env.mjs der Parallelsitzung). 13:21 erneut angelegt, Redeploy
13:38:56 → zhipu:glm-5.2 antwortet (391), GLM ready. Schlüssel waren richtig; Groq-Tageskontingent bleibt erschöpft.
**Touch 44 px (Betriebswache Nr. 42, 2026-09-02):** Claw-Toolbar 38→44 px (ui-modern.css) und smejjBot-Aktionen
40→44 px (autonomous-coding.css), SW v728, design-v11 2dea1cca / Frontend 380d46b / Bauzweig 2a8ba76a;
live 16:02 UTC alle 17 Ansichten „Touch-Ziele eingehalten“. Nr. 42 bleibt rot, bis der Zeabur-Schlüssel
(Betriebswerte-Teil) erneuert ist; Nr. 63 rot wegen TTFB p75 420 ms > Budget 200 (LCP 600 ms, Netz/Edge).

**Umgebungs-Wache Nr. 71** (Bauzweig dcae45f0): misst im Takt die Prozess-Umgebung — Coding-Adresse,
Pflichtschlüssel, Registry-Auflösung — und wird rot, bevor der Chat 502/503 liefert; Zähl-Wächter auf 59/62 Läufe.
(3) groq gpt-oss-20b hat 8000 Tokens/Minute: als einziger Rückfall im Router reißt ein großer Prompt
das Limit allein.

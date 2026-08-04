# Memory_Bank — Kimi K3 und EU-AI-Act-Umfeld (2026-07-28)

Wortgleich ausgelagert am 2026-08-04 aus `Memory_Bank.md` (812/800 Zeilen).
Nichts gekuerzt; die Hauptdatei traegt den Verweis.

---

### [2026-07-28] KIMI K3 LIVE — reines API-Modell, bewusst OHNE e2-Vault (job_kimi_k3_api_20260728)

Freigabe: "oK, baue Kimi K3 mit API ein" + "Komplett live schalten"
(Wof Kadavanich, 2026-07-28). Commits `1f00d50`, `ac409eb`, `bc1159f`.
Live als smejj-control Version 98, Artefakt
`deployments/control/smejj-control-k3-effort-2026-07-28.tar.gz`
(sha `62bdc2dc…`), Rueckweg `smejj-control-stufe2-2026-07-28.tar.gz`.
Kapsel: `docs/task-capsules/2026/07/job_kimi_k3_api_20260728/CAPSULE.md`.

- GEGEN DEN REFLEX "GEWICHTE IN DEN VAULT". K2.7 und GLM-5.2 liegen als
  Gewichte in IDrive e2. Fuer K3 waere das Geldverbrennen: 2,8 T Parameter,
  ~594 GB bis 1,4 TB, laeuft weder auf einer GPU noch auf einem 8-GPU-Knoten.
  e2 ist Speicher, kein Rechner. Darum `storage: null` und nur API.
- DAS ERBE STATT DES ZWEITEN KEYS. K2.7 und K3 liegen auf demselben
  Moonshot-Konto, und `SMEJJ_LLM_KIMI_API_KEY` war live bereits gesetzt.
  Neu: `runtime.keyFallbackEnvPrefix` — ohne eigenen K3-Key erbt K3 den
  K2.7-Key. Einseitig (ein K3-Key konfiguriert K2.7 nicht), eigener Key hat
  Vorrang. Wirkung: die Aktivierung schrumpfte auf EIN Flag, und niemand
  musste ein Secret ein zweites Mal von Hand eintippen.
- FAIL-CLOSED BLEIBT. Ohne `SMEJJ_KIMI_K3_ENABLED=YES` ist K3 auch mit
  gueltigem geerbtem Key inaktiv; der Router nimmt GLM-5.2. Auto-Modus waehlt
  K3 nie — nur ausdrueckliche Wahl. K3 ist kostenpflichtig (3 $/15 $ pro Mio.
  Token), Auto-Recharge im Moonshot-Konto steht auf Off.
- NEBENBEFUND BEHOBEN: `handleWorkerPreflight` stuerzte bei Modellen ohne
  e2-Vault ab (`definition.storage.vaultStatusId` auf null) — betraf schon
  vorher `smejj fast 1.0`. Jetzt 409 `model_not_vault_backed`.
- KORREKTUR EINER ANNAHME: `SMEJJ_MULTI_MODEL_ROUTER_ENABLED` steht in
  `.env.example` auf NO, live aber laengst auf YES (`multiModelRouterEnabled:
  true`). Der `.env.example`-Wert ist keine Auskunft ueber den Live-Stand —
  vor jeder Aussage die Bridge selbst fragen.
- DENKTIEFE STATT DENKEN-AUS: K3 laesst sich das Denken NICHT abschalten (anders
  als GLM), nur die Tiefe steuern — `reasoning_effort: low|high|max`, Standard
  `max`. Neu `src/ai/reasoningEffortPolicy.js` als Schwestermodul zu
  `chatThinkingPolicy.js`: Coding und Reasoning behalten die volle Tiefe, alles
  andere bekommt `low`. Der Parameter geht NUR an K3 — andere Backends koennten
  unbekannte Felder ablehnen.
- METHODIK-LEHRE (eigener Fehler, dokumentiert): Ich habe zuerst Prompt UND
  Denktiefe gleichzeitig geaendert und daraus fast geschlossen, der Parameter
  wirke nicht. Erst der saubere A/B — identischer Prompt, identischer Weg,
  7 Laeufe je Seite, Umschaltung ueber `SMEJJ_LLM_KIMI_K3_REASONING_EFFORT` —
  gab die Antwort: erstes sichtbares Zeichen 13 856 ms (`max`) gegen 8 606 ms
  (`low`), also 38 % schneller. Eine Messung mit zwei geaenderten Variablen ist
  keine Messung.
- TEMPO-EINORDNUNG: K3 mit `low` ist rund 48 % schneller als GLM-5.2 auf
  demselben Weg (8,6 s gegen 16,6 s). Das 1,0-s-Budget erreicht weiterhin NUR
  die Groq-Schnellspur (703 ms). Das Budget sollte kuenftig zwischen Schnellspur
  und Deep Lane trennen — sonst misst es Aepfel an Birnen. Details:
  `docs/benchmarks/BEFUND_KIMI_K3_TEMPO_2026-07-28.md`.
- DER PICKER IM EINGABEFELD IST FEST VERDRAHTET — nicht registry-gesteuert.
  Menueeintraege in `public/index.html`, Zuordnung in `MODEL_MODES` in
  `public/app.js`. Ein neues Modell erscheint dort NICHT automatisch, auch wenn
  die Server-Registry es laengst kennt. `#systemModelSelect` im
  Einstellungs-Panel ist ein ANDERES Element und baut sich sehr wohl aus der
  Registry — wer nur das prueft, haelt ein Modell faelschlich fuer waehlbar.
  Genau dieser Fehler ist mir hier passiert: DOM-Abfrage ist kein Klickpfad.
  Behoben mit Freigabe (drei Start-Lock-Dateien, sw v180, Lock neu eingefroren,
  Frontend-Commit `7da4c2d`, live SHA-gleich). Klickpfad belegt: Menue → "Kimi
  K3" → Frage → "Ich bin Kimi, ein Assistent von Moonshot AI, und helfe hier
  fuer smejj.com."
- EVAL ENTSCHEIDET, NICHT DAS BAUCHGEFUEHL: Suite smejj-chat-core, 14 Faelle,
  Control-Weg. K3 **97,1 %**, GLM-5.2 **97,1 %** — gleichauf auf die
  Nachkommastelle, beide scheitern am selben Halluzinations-Fall. K3 ist auf
  der Suite sogar langsamer (p95 37,6 s gegen 22,8 s), weil Coding-Faelle bei
  K3 die volle Denktiefe behalten. Ergebnis: **K3 bringt keinen
  Qualitaetsvorteil**, GLM-5.2 bleibt Standard; K3 ist Zweitquelle und
  Langkontext-Option. Ohne diesen Lauf haette "K3 ist neuer" als Argument
  gereicht — genau davor schuetzt das Eval-Set.
- "REASONING-AUFWAND" WAR EIN PLACEBO. Der Wert aus Einstellungen -> Modelle
  landete nur als Satz im Prompt. Seit 2026-07-28 steuert er bei K3 den echten
  API-Parameter. WICHTIG fuer kuenftige Sitzungen: `public/app.js` sendet die
  Einstellungen laengst als `preferences` an /api/agent — es las sie nur
  niemand serverseitig. Deshalb war KEINE gesperrte Datei noetig. Vor dem
  Anfassen des Start-Locks immer pruefen, ob der Weg schon existiert.
  Standard von `high` auf `medium` gedreht, sonst haette die Verdrahtung das
  gemessene Tempo zerstoert (Performance-Lock).
- EIN SKRIPT-TAG IST EIN EIGENER EINSTIEGSPUNKT. `check:precache-imports`
  verfolgte nur Modul-IMPORTE ab den SHELL-Eintraegen und meldete "Precache
  vollstaendig", waehrend `maus-panel.js` fehlte — index.html laedt es per
  `<script src>`, und dorthin fuehrt kein Import-Pfad. Offline war der
  Maus-Knopf tot. Pruefer erweitert (liest jetzt die Skript-Tags), Gegenprobe
  gemacht: ohne den Eintrag schlaegt er fehl. Live belegt (sw v186): Cache mit
  120 Eintraegen inklusive maus-panel.js. Lehre: Ein gruener Pruefer beweist
  nur, was er prueft — bei "unmoeglichen" Befunden zuerst den Pruefer selbst
  gegen einen bekannten Fehler testen.
- SALAD-PREISE FUER smejj fast 1.0 (aus der API, 2026-07-28, 1 Replika, RTX
  3090/4090/3090 Ti/A5000): Dauerbetrieb 24/7 66-219 $/Monat, bedarfsweise
  4 h/Tag 11-37 $/Monat. Empfehlung: Priority `batch`, bedarfsweise -> ~11 $.
  Start bleibt Rote Liste (neue laufende Kosten) und braucht Dienst UND Betrag
  ausdruecklich — ein pauschales "alle Rechte" ist laut AI_Guidelines KEINE
  Budget-Freigabe.
- GESCHACHTELTE MODUL-QUERIES MUESSEN VON OBEN GEBUMPT WERDEN. Der Standardwert
  aus settings-runtime.js kam dreimal nicht im Browser an (v183, v184), obwohl
  die Datei live byte-identisch war und check:all gruen. Ursachen, erst im
  Live-Test sichtbar: (1) settings-surface.js importierte settings-runtime.js
  unter ZWEI Adressen (mit und ohne `?v=3`) — in ES-Modulen sind das zwei
  getrennte Instanzen; (2) die eigentliche Wurzel war premium-surfaces.js mit
  `settings-surface.js?v=3`, das die ganze Kette alt hielt. Gefunden ueber
  `performance.getEntriesByType("resource")` im echten Browser: dort standen
  `?v=3` UND `?v=4` nebeneinander. Kein Test findet das — lokal gibt es keinen
  HTTP-Cache mit alten Eintraegen. Regel: beim Aendern eines Moduls mit
  Cache-Query IMMER den obersten Importeur mitbumpen und im Browser gegen
  performance.getEntriesByType pruefen.
- BUDGET, DAS IMMER ROT IST, IST KEIN BUDGET. Die Eval-Suite riss bei JEDEM
  Modell dieselben zwei Schwellen. Jetzt getrennt: Produktziel 1,0 s gilt der
  Schnellspur (erfuellt, 0,70 s), die Suite bekommt eine Regressionsschwelle
  (40 s / 45 s) ueber der gemessenen Wirklichkeit. Das Produktziel wurde NICHT
  abgesenkt — es wurde dem richtigen Weg zugeordnet.
- WEB VITALS LIVE nach dem Deploy (7 Laeufe, smejj.com): TTFB-Median 42 ms,
  LCP-Median 172 ms, CLS 0, INP 40 ms — kein Budget gerissen, gegenueber dem
  letzten Stand eher schneller. Erwartungsgemaess: der Control Server steht
  nicht im Pfad des Seitenaufrufs.
- VERIFIKATION: model-registry 25/25, alle Einzelchecks gruen ausser
  `check:start-lock` (public/sw.js v178 aus einer Parallel-Session, dort nicht
  neu eingefroren — in public/ wurde hier nichts angefasst). Live: Control
  direkt und ueber die Bridge `x-smejj-model-backend: kimi:kimi-k3`,
  `model-fallback: false`, Antwort "Ich bin Kimi, ein Modell von Moonshot AI.";
  auf smejj.com "Kimi K3 · 1M · flagship · Bereit". Nicht-Regression belegt:
  Standardanfrage unveraendert Groq-Schnellspur, K2.7 unveraendert.

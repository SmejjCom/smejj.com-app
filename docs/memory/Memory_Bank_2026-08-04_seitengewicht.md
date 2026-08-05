# Memory_Bank — Volltext: Seitengewicht unter Budget (job_seitengewicht_20260804)

Aus Memory_Bank.md ausgelagert am 2026-08-05 (800-Zeilen-Regel). Inhalt unveraendert.

- ERLEDIGT + LIVE BEWIESEN: Erstbesuch **311 -> 297 KB** (Budget 300).
  Messwerkzeug meldet "Alle Performance-Budgets eingehalten". Warm unveraendert
  40 KB. Beleg: docs/benchmarks/webvitals_seitengewicht_v215_2026-08-04.json
- WEG: Aufschluesselung ueber ALLE 119 Ressourcen (echtes Chrome, transferSize)
  statt Raten. Gefunden: api-keys-surface.js (6,9 KB), provider-settings.js
  (3,7 KB) + ihr selbst nachgeladenes CSS (3,2 KB) lagen im Ladepfad JEDES
  Seitenaufrufs, obwohl beide NUR in das Einstellungs-Panel "models" rendern
  und der Startreiter "general" ist. settings-surface.js (NICHT gesperrt)
  importiert sie jetzt dynamisch, ausgeloest von `activate("models")`.
- SCHLUESSELERKENNTNIS: **Precache-Ladungen zaehlen NICHT ins Seitengewicht.**
  Belegt daran, dass voice-conversation.js, status.js und verlauf.js im
  Precache liegen, in den 119 Ressourcen aber fehlen. Verschobene Module
  bleiben deshalb im Precache — beim Reiterwechsel kommen sie aus dem Cache,
  ohne Netz. Das ist der ganze Trick: verschieben, nicht entfernen.
- PRUEFUNG VOR DEM UMBAU (damit nichts wegfaellt): app.js (Start-Lock) bindet
  KEINE der erzeugten Kennungen (ak*, apiKeysSurface, cline*), applyValues()
  greift nur auf die eigenen FIELDS zu, beide init-Funktionen sind idempotent.
  Live gegengeprueft: 0 Module auf der Startseite, nach Klick auf "Models"
  laden genau die vier Dateien und BEIDE Oberflaechen rendern vollstaendig.
- BEWUSST NICHT ANGEFASST (Freigabe sagt "bei Zweifel nicht anfassen"):
  account-privacy.js MUSS synchron rendern (app.js bindet #saveProfile,
  #registerLocal, #loginLocal an sein Markup); die 25 KB Sprach-Module haengen
  auf Modulebene an composer-tools.js (800/800 Zeilen) und haetten die
  Warm-up-Logik ausgehebelt. Beides waere Funktionsrisiko fuer wenige KB.
- FALLE, wieder bestaetigt: Nach dem sw-Sprung brauchte es VIER Reloads plus
  ein `registration.update()`, bis der alte Cache v214 abgeloest war. Vorher
  misst man die alte Datei und haelt den Fix fuer wirkungslos.

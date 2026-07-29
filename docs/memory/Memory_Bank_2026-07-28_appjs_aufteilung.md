# Ausgelagert aus Memory_Bank.md — app.js-Aufteilung (2026-07-28)

## 2026-07-28 — app.js aufgeteilt, Altlast beendet (job_appjs_aufteilung_20260728)
- public/app.js 1411 -> 800 Zeilen; die RATCHET-AUSNAHME in check-guidelines.mjs
  ist ERSATZLOS ENTFERNT. Fuer app.js gilt jetzt die normale 800-Zeilen-Regel.
- Sieben neue Module (zeilengleich verschoben, kein Verhaltenswechsel):
  google-login.js, projects-surface.js, local-workspace-surface.js,
  uploads-surface.js, free-coding-fallback.js, panel-layout.js, view-routes.js.
  Alle im Service-Worker-Precache (Pflicht — app.js importiert sie).
- goToView bewusst NICHT ausgelagert: wird an viele Stellen gereicht, Umzug waere
  reines Regressionsrisiko.
- WICHTIGSTE LEHRE (kostete zwei zusaetzliche Deploy-Runden): Beim Herausloesen
> Aeltere Eintraege vom 2026-07-28 (Tool-Calling, app.js- und server.js-Aufteilung,
> Bridge-Schnellspur, Tiefspur bei Adressen, Felddaten statt Laborzahlen) stehen in
> [docs/memory/MEMORY_ARCHIV_2026-07-G.md](docs/memory/MEMORY_ARCHIV_2026-07-G.md).
> Nichts geloescht — nur verschoben, damit diese Datei unter 800 Zeilen bleibt.

  still (live erlebt). Nur bei echter Aenderung schreiben PLUS observer.takeRecords().
- FALLE Knopfgroesse: styles.css setzt projektweit `button { min-height: 42px }`. Eigene
  height ohne min-height ergibt verzogene Knoepfe. 42-px-Touch-Ziel bleibt Standard,
  kompakt nur hinter `@media (pointer: fine)`.
- FALLE Popover im Chat-Log: #startLog hat overflow: auto und schneidet Menues an seiner
  Kante ab; bei kurzem Verlauf gibt es keinen Scrollweg dorthin. Popover gehoeren an den
  body, am Viewport ausgerichtet, schliessen bei Scroll/Resize. Fenstergroesse auf
  documentElement.clientHeight zurueckfallen — nicht dargestellte Ansichten melden 0.
- NICHT GEBAUT: "Quellen anzeigen" (keine Quellenliste pro Antwort vorhanden — browser-context.js webt Seitenkontext in die FRAGE) und Geminis parallele Entwuerfe.
- app.js UNANGETASTET (Start-Lock, 799/800): Module haengen sich selbst an #startLog,
  erneutes Senden ueber #startMessage + #startSend. Ein Test haelt das fest.
- PARALLEL-SESSION belegte sw v166-v168, daher Sprung v165 -> v169. Vor jedem Deploy Live-Stand per SHA-256 gegen den lokalen Vor-Stand pruefen, nur Eigenes deployen.
- Memory_Bank.md stiess hier an die 800-Zeilen-Regel: naechster Eintrag braucht eine Archiv-Aufteilung (docs/memory/Memory_Bank_2026-07.md mit Zeiger von hier).

# iOS and Android Test Report

Date: 2026-06-16

## Scope

Tested with browser viewport simulation, not physical devices.

## iPhone / Safari-Sized Result

- Viewport: 390 x 844.
- Active deep link tested: `/profile`.
- Login controls visible.
- Status chips visible.
- No horizontal overflow.
- Mobile navigation collapses to one column.
- Safe-area CSS is present.

Result: passed in simulation.

## Android / Chrome-Sized Result

- Viewport: 412 x 915.
- Active deep link tested: `#files`.
- File controls visible.
- Status chips visible.
- No horizontal overflow.
- Mobile navigation collapses to one column.

Result: passed in simulation.

## Android / PWA-Sized Result

- Viewport: 412 x 915.
- Active deep link tested: `/offline`.
- Offline page visible.
- PWA manifest and service worker checks passed.

Result: passed in simulation.

## Nachtrag 2026-07-28: echte Touch-Emulation statt Viewport-Groesse allein

Eine reine Viewport-Verkleinerung (`resize_window` auf 375px) macht aus einem
Desktop-Browser KEIN Touch-Geraet: `pointer: fine` bleibt wahr, und jeder
`@media (pointer: coarse)`-Zweig — also genau der, den echte Handys nehmen —
wird nie ausgeloest. Das blieb hier lange unbemerkt: die Chat-Aktionsleiste
(2026-07-28, job_nachrichten_aktionen) wurde durch eine Flexbox-Regel von 42
auf 37 px gequetscht, ohne dass irgendein Viewport-Test es zeigte.

Neuer, permanenter Weg: `scripts/testing/measure_touch_targets.mjs`
(`npm run measure:touch`) setzt ueber das Chrome-DevTools-Protokoll wirklich
`Emulation.setEmulatedMedia` (pointer/any-pointer = coarse) plus mobile
Geraetemasse — der coarse-Zweig gilt dann echt, nicht nur der Reihe nach.
Eingebaute Gegenprobe (`measure:touch:selbsttest`): nimmt den Schutz zur
Laufzeit heraus und ERWARTET Verstoesse, reproduziert exakt den 37-px-Fehler
und erkennt ihn — ohne diese Probe waere unklar, ob die Messung ueberhaupt
scharf ist. Live verifiziert (sw v186): alle Aktionen 42x42, Versionspfeile
34x34, `pointer: coarse` echt aktiv.

## Environment-Grenze, endgueltig (kein offener Punkt mehr)

Ein echter iOS-Simulator ist auf diesem Mac NICHT verfuegbar: es sind nur die
Xcode Command Line Tools installiert (`xcode-select -p` zeigt
`/Library/Developer/CommandLineTools`), `simctl` fehlt. Volles Xcode
nachzuinstallieren waere ein Eingriff in den Rechner des Betreibers und
erfordert dessen Anmeldedaten/Zeit — das wird hier bewusst NICHT automatisch
ausgeloest.

Entscheidung: `measure_touch_targets.mjs` (echte Pointer-Emulation + Selbsttest)
ist der staendige, wiederholbare Ersatz in dieser Umgebung und deckt die
Layout-/Groessenfrage vollstaendig ab. Ein physisches Geraet wuerde zusaetzlich
noch Faktoren wie reale Netzlatenz, echtes iOS-Rendering von `-webkit-`-Praefixen
und OS-Gesten pruefen — das bleibt eine Ergaenzung fuer den Betreiber selbst
(eigenes iPhone/Android, smejj.com oeffnen, Chat-Leiste antippen), keine
Blockade fuer die Fertigstellung dieses Features.

## Frueher offen, jetzt abgeschlossen

- ~~Physical iPhone Safari test~~ → ersetzt durch echte Pointer-Emulation
  (siehe oben); Restrisiko dokumentiert, nicht blockierend.
- ~~Physical Android Chrome test~~ → dito.
- Real PWA install/uninstall/update cycle — weiterhin Betreiber-Handarbeit
  (App-Store-/Play-Store-Vorgang, kein Automatisierungsziel dieses Projekts).
- Real slow-network throttling on device — durch die Web-Vitals-Benchmarks
  (`docs/benchmarks/webvitals_*`) unter Laborbedingungen abgedeckt; echtes
  Geraet bleibt Ergaenzung, keine Blockade.

# Memory_Bank — ausgelagert 2026-07-29: Nachrichten-Aktionen Welle 2 und 3

Wortgleich aus Memory_Bank.md uebernommen, damit die Hauptdatei unter der
800-Zeilen-Regel bleibt. Nichts gekuerzt, nichts geloescht.

## 2026-07-28 — Fassungen ueberleben das Neuladen, Touch-Ziele halten (job_nachrichten_aktionen_20260728, Welle 2)
- ERLEDIGT, live (sw v171): zwei Luecken der ersten Welle geschlossen.
- FASSUNGEN PERSISTENT: chat-store.js speichert versions + active je Nachricht und
  gibt beides beim Wiederherstellen zurueck. Vorher war "Version 2 von 3" nach einem
  Reload weg, weil die Fassungen nur im Arbeitsspeicher lagen. Obergrenze acht je
  Nachricht — jede traegt Rohtext UND gerendertes HTML, ohne Grenze waechst
  IndexedDB bei haeufigem "Neu generieren" unbegrenzt. clampVersionIndex verschiebt
  den Zeiger mit, wenn gekuerzt wurde; sonst zeigte der Waehler auf eine Fassung,
  die es nicht gibt. Live belegt: nach dem Reload "Version 2 von 2", Wechsel zeigt
  die andere echte Antwort, Kopieren liefert je Fassung ihr Roh-Markdown.
- FALLE FLEXBOX UND TOUCH-ZIELE: Auf 375 px ergaben fuenf Aktionen, zwei
  Versionspfeile und das Label "Version 2 von 3" rund 366 px in einer 359 px
  breiten Zeile. Flexbox schrumpfte die Knoepfe von 42 auf 37 px — das Touch-Ziel
  war weg, ohne dass etwas ueberlief oder umbrach, also unsichtbar im Test.
  Regel daraus: bei Icon-Leisten immer `flex: 0 0 auto` auf dem Knopf und
  `flex-wrap: wrap` auf der Leiste. Ein Ziel, das sich der Zeile anpasst, ist keins.
- MESSFALLE: `resize_window` auf 375 px macht aus einem Desktop-Browser KEIN
  Touch-Geraet — `pointer: fine` bleibt wahr, der coarse-Zweig wird nie ausgeloest.
  Wer Touch-Layout pruefen will, muss die Maße erzwingen (inline per el.style, denn
  eingefuegte <style>-Bloecke blockiert die CSP des eigenen Servers).
- OFFEN und bewusst so: die Bewertung (Daumen) wird gespeichert und nach dem Reload
  wieder angezeigt, aber von keiner Auswertung gelesen. Eine Rueckmeldestrecke
  braeuchte Serverlast und eine Trainingsdaten-Freigabe (Policy fail-closed).
- BENCHMARK: docs/benchmarks/webvitals_versionen_2026-07-28.json — kaltes LCP
  328/332/128 ms bei TTFB 124/112/23 ms (LCP folgt dem TTFB, Lauf 3 unter der
  Referenz von 172 ms), CLS 0, INP p75 48 ms. Kerndateien der Startseite 58 KB
  komprimiert gegen ein Budget von 300 KB; die drei Chat-Module davon 13,3 KB,
  geladen als type=module am Seitenende.

## 2026-07-28 — Verhalten pruefbar, Touch-Ziele echt gemessen (job_nachrichten_aktionen_20260728, Welle 3)
- ERLEDIGT, live (sw v174): Tests 34 -> 45; Loeschen/Rueckgaengig, Bearbeiten,
  Neu generieren, Menue-Tastatur und Versionswechsel sind jetzt automatisch geprueft
  statt nur von Hand im Browser.
- MUSTER FUER NICHT IMPORTIERBARE MODULE: Wer /assets/-Pfade absolut importiert
  (Pflicht hier, sonst zweite Modulinstanzen), ist in node nicht importierbar. Loesung:
  die ENTSCHEIDUNG in ein importierbares Modul legen (planRegenerate, planEdit,
  planRemoval, restoreNodes, planSettle, nextMenuIndex in chat-messages.js), das
  ANWENDEN im DOM-Modul lassen. Das Fake-DOM der Tests haengt Knoten wirklich ein und
  aus, damit die Reihenfolge nach Rueckgaengig gegen den Ausgangszustand vergleichbar ist.
- DABEI GEFUNDEN: Pfeil-auf ohne fokussierten Menuepunkt landete auf dem VORLETZTEN
  Punkt, weil indexOf -1 liefert und -1 + -1 modulo 4 = 2 ergibt. Behoben.
- TOUCH-MESSFALLE (wichtig fuer jede kuenftige Mobil-Pruefung): resize_window auf
  375 px macht aus einem Desktop-Browser KEIN Touch-Geraet. `pointer: fine` bleibt
  wahr, der coarse-Zweig wird nie ausgeloest — deshalb war der 37-px-Fehler unsichtbar.
  Richtig geht es ueber das DevTools-Protokoll: Emulation.setEmulatedMedia mit
  pointer/any-pointer = coarse plus setDeviceMetricsOverride mit mobile: true.
  Werkzeug dafuer: `npm run measure:touch` (scripts/testing/measure_touch_targets.mjs).
- JEDER WAECHTER BRAUCHT EINE GEGENPROBE: `npm run measure:touch:selbsttest` nimmt
  flex-wrap und flex: 0 0 auto zur Laufzeit heraus und ERWARTET Verstoesse. Er
  reproduziert exakt die 37x42 px und erkennt sie. Ohne diese Probe waere unklar, ob
  die Messung ueberhaupt scharf ist — ein Check, der immer gruen ist, ist kein Check.
- KEIN iOS-SIMULATOR auf diesem Rechner: nur Xcode Command Line Tools, simctl fehlt
  (`xcode-select -p` zeigt /Library/Developer/CommandLineTools). Xcode nachinstallieren
  waere ein Eingriff in den Rechner des Betreibers — bewusst unterlassen.
- BENCHMARK: docs/benchmarks/webvitals_planer_2026-07-28.json — kaltes LCP
  200/236/200 ms bei TTFB 55/55/49 ms, die ruhigste Reihe dieser Sitzung; CLS 0,
  INP p75 48-80 ms. Touch-Ziele: docs/benchmarks/touchziele_2026-07-28.json.


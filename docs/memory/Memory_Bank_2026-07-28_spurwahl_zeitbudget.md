# Memory_Bank-Volltext — 2026-07-28: Fragen mit Web-Adresse antworten wieder
(ausgelagert am 2026-08-03, Wortlaut unveraendert; Platz fuer neue Eintraege im 800-Zeilen-Limit)

## 2026-07-28 — Fragen mit Web-Adresse antworten wieder (job_spurwahl_zeitbudget_20260728)
- ERLEDIGT, live (sw v179): Fragen mit Adresse endeten regelmaessig in "Verbindung
  zum Server unterbrochen". Kein Ausfall — ein Zeitbudget-Konflikt.
- GEMESSEN statt geraten (Direktaufruf der Live-Bridge, Origin-Kopf noetig, sonst
  403 "Origin not allowed"): Schnellspur 0,75 s bis zum ersten Byte, Tiefspur
  7,77 s (kurze Frage) bzw. 4,92 s (gegroundet). Limit in fetch-retry.js: 6,5 s.
  Die Tiefspur lag also regelmaessig JENSEITS des Limits.
- KERNEINSICHT: modelForTask erzwang die Tiefspur fuer jede Frage mit Adresse,
  weil die Schnellspur den Seiteninhalt frueher raten musste. Seit Stufe 2 webt
  browser-context.js den echten Seitentext IN die Frage — Werkzeuge braucht dafuer
  niemand mehr. Nachgemessen: Schnellspur mit eingebettetem Inhalt antwortete
  inhaltlich richtig ("Example Domain") in 0,49-1,01 s statt 4,9 s.
- REGEL JETZT: Tiefspur nur noch, wenn groundingFor(task) LEER ist — die Seite
  also nicht geladen werden konnte und nur echtes Tool-Calling noch hilft. Eine
  Fehlerseite (HTTP 404) zaehlt als geladen; ein erneuter Abruf per Werkzeug
  braechte nur wieder 404.
- ZWEITER TEIL: fetch-retry.js gibt der Tiefspur ein eigenes Erstbyte-Budget
  (15 s statt 6,5 s), erkannt am Modellnamen im Anfragekoerper. Damit scheitert
  auch der Ausnahmefall nicht mehr an einem Limit, das fuer die Schnellspur
  gedacht war. Eine ausdrueckliche Vorgabe des Aufrufers schlaegt die Automatik.
- LIVE BELEGT: "Der Titel auf https://example.com lautet Example Domain." Erster
  Token 639 / 813 / 477 ms (gemessen per MutationObserver im Browser, inklusive
  Seitenabruf) gegen ein Budget von 1000 ms — erstmals eingehalten. Auch der
  Ausnahmefall (nicht ladbare Adresse) antwortet in 477 ms ohne Fehler.
- MESSFALLE fuer kuenftige Bridge-Tests: /api/agent antwortet ohne
  `Origin: https://smejj.com` mit 403. Wer das vergisst, haelt einen
  CORS-Schutz faelschlich fuer einen Ausfall.
- BENCHMARK: docs/benchmarks/spurwahl_2026-07-28.json — dazu Web-Vitals
  144/292/184 ms kaltes LCP, CLS 0, Touch-Ziele unveraendert eingehalten.


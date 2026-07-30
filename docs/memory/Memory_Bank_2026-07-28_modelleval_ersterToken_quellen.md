# Memory_Bank — ausgelagert 2026-07-29: Modellwahl messbar, erster Token, Quellen pro Antwort

Wortgleich aus Memory_Bank.md uebernommen, damit die Hauptdatei unter der
800-Zeilen-Regel bleibt. Nichts gekuerzt, nichts geloescht.

## 2026-07-28 — Modellwahl ist jetzt messbar (job_modell_eval_harness_20260728)
- ANLASS: Kimi K3 (2,8 Bio. Parameter, 1,4 TB, ~64 GPUs zum Betrieb) ist erschienen.
  ENTSCHEIDUNG: kein Download, kein Neubezug von K2.7. Gewichte im Objektspeicher
  sind kein Fundament, wenn die Rechenleistung fehlt — IDrive e2 speichert, es rechnet
  nicht. "K3 Max" ist ausserdem keine Gewichtsdatei, sondern eine Aufwandsstufe der
  Anbieter-Schnittstelle. Begruendung: docs/model-management/MODELL_ENTSCHEIDUNG_KIMI_K3_2026-07-28.md
- STATTDESSEN GEBAUT: evals/suites/smejj-chat-core-v1.json (14 echte Faelle) plus
  src/evaluation/evalSuite.js, evalScoring.js, evalReport.js, evalTransport.js und
  scripts/evaluation/run_model_eval.mjs. `npm run eval:models` ist ein Trockenlauf
  ohne Kosten; erst --live ruft ein Modell auf. 25 Tests in tests/model-eval.test.mjs.
- MESSUNG STATT MEINUNG (live gegen die Produktionskette, 2026-07-28):
  schnelle Spur groq:llama-3.1-8b-instant — 91,2 %, p95 645 ms, erster Token 555 ms,
  1 kritischer Verstoss (Codegenerierung). GLM-5.2 ueber den Control-Router —
  97,1 %, p95 22 799 ms, erster Token 22 754 ms, 0 kritische Verstoesse.
  Damit ist die profilabhaengige Fuehrung erstmals belegt statt nur behauptet.
- OFFENER BEFUND 1: Auf dem GLM-Pfad vergehen bis zum ersten Token 22,8 s — das
  15- bis 20-Fache jedes Budgets. Gemessener Ist-Zustand, keine Regression.
- OFFENER BEFUND 2: Die schnelle Spur besteht code-esm-failclosed nicht. Kein
  Sicherheitsproblem, aber die Grenze des Standardpfades ohne ausdrueckliche Modellwahl.
- FALLE, DIE ZWEI STUNDEN GEKOSTET HAETTE: Regex-Erwartungen mit dem Flag i machen die
  Namensregel unpruefbar — `\bSMEJJ\b` trifft case-insensitive auch "smejj.com". Muster
  sind deshalb schreibweisen-genau, ignoreCase ist die ausdrueckliche Ausnahme.
- ZWEITE FALLE: Ein einzelner HTTP 503 der Chat-Bruecke wurde im ersten Lauf als
  Modellversagen gezaehlt. Ohne Wiederholung transienter Fehler misst man die
  Infrastruktur und nennt das Ergebnis Modellqualitaet. Jetzt isTransientError + --retries.
- DRITTE FALLE: Ein Bericht ohne Backend-Beleg ist wertlos — das angeforderte und das
  antwortende Modell koennen auseinanderfallen. run.backendsSeen/resolvedModelIds
  belegen es. Und verglichen wird nur gegen denselben Suite-Inhalts-Hash; zwei Laeufe
  mit unterschiedlichen Erwartungen sind nicht vergleichbar.
- VERBINDLICHE REGEL (evals/README.md): Eine Wortliste wird nur erweitert, wenn die
  betroffene Antwort von Hand gelesen und als sachlich richtig bestaetigt wurde.
  Erwartungen aufzuweichen, damit ein Modell besser dasteht, ist ein Verstoss.
- Kein Deploy noetig: reines Werkzeug, kein Frontend- und kein Control-Server-Pfad
  beruehrt. check:all 27/27 gruen. Capsule im Object Brain unter
  capsules/app/job_modell_eval_harness_20260728/.
## 2026-07-28 — Befund 1 aufgeklaert: 6,2 s Warten auf Text, den niemand sieht (job_erster_token_glm_20260728)
- WERKZEUG: `npm run measure:firsttoken` trennt Antwortkopf, erstes Ereignis, erstes
  SICHTBARES Zeichen und Ende. Vorher war das eine Zahl — eine Beobachtung, keine
  Diagnose. Die Luecke zwischen Ereignis und Zeichen ist der behebbare Anteil.
- A/B AM SELBEN SERVER, GLEICHES MODELL, VOR jeder Codeaenderung: /api/chat (Denken an)
  erstes sichtbares Zeichen 12 106 ms bei 6 187 ms unsichtbarer Wartezeit; /api/agent
  (Denken aus) 7 270 ms bei 0 ms. Ursache bewiesen statt vermutet. Rest: 5-7 s
  Startzeit des Anbieters, nur per Modellwahl aenderbar. Die Bruecke zeigte 16,6 s,
  weil der Antwortkopf erst mit dem ersten SICHTBAREN Byte durchgereicht wird.
- URSACHE WAR EINE LUECKE, KEIN DEFEKT: /api/agent schaltet das Reasoning fuer
  Nicht-Coding seit 2026-07-27 ab, /api/chat fehlte genau diese verifizierte Regel.
  BEHOBEN in src/ai/chatThinkingPolicy.js, an EINER Stelle. Bewusst eng: Coding
  behaelt das Reasoning, Modellwahl und Routing-Profil bleiben unveraendert (ein
  Entwurf, der zusaetzlich das Profil setzte, wurde als Regressionsrisiko verworfen).
  Erwartung 12,1 s -> 7,3 s; die schnelle Spur ist mit 703 ms nicht betroffen.
- NICHT AUSGEROLLT — BEWUSST: Ein Control-Release packt src/ und control-server/ aus
  der ARBEITSKOPIE; eine parallele Sitzung arbeitete zeitgleich an diesem Pfad. Weg
  zum Nachholen: docs/benchmarks/BEFUND_ERSTER_TOKEN_GLM_2026-07-28.md. check:all
  26/26 gruen, Rollback rollback/chat-thinking-2026-07-28. ACHTUNG: Memory_Bank.md
  ist an der 800-Zeilen-Grenze; der naechste Eintrag braucht vorher eine Aufteilung.

## 2026-07-28 — Quellen pro Antwort (job_nachrichten_aktionen_20260728, Welle 4)
- ERLEDIGT, live (sw v178): "Quellen anzeigen" im Nachrichten-Menue — der letzte
  Punkt, den ChatGPT hatte und smejj.com nicht. Erscheint NUR bei echtem Grounding.
- WAS FEHLTE: browser-context.js holt bei Auftraegen mit Web-Adresse die Seite und
  webt sie in die FRAGE — die Herkunft wurde danach verworfen. Jetzt merkt es sich je
  Auftragstext Adresse, Titel, HTTP-Status und Zeitpunkt (lokal, Obergrenze 30, kein
  zusaetzlicher Netzverkehr). chat-actions.js ordnet ueber die Frage DIREKT VOR der
  Antwort zu — nicht ueber "die letzte Quelle", die bei schnellem Nachfassen zur
  falschen Antwort gehoeren koennte. Ein gescheiterter Abruf wird nicht gemerkt.
- FALLE ZWEI MODULINSTANZEN (haette live NIE funktioniert, lokal gefunden):
  chat-actions.js importierte browser-context.js mit "?v=1", app.js ohne Query.
  Getrennte Modulinstanzen mit eigenem Gedaechtnis — geschrieben wurde in das eine,
  gelesen aus dem anderen. REGEL: Wer Zustand mit app.js teilt, muss DENSELBEN
  Spezifizierer benutzen wie app.js. Ein Test vergleicht beide jetzt automatisch.
- FALLE FALSCHE BEHAUPTUNG (live gefunden, deshalb v178): Gegroundet wird die FRAGE.
  Scheitert der Antwortstrom danach, stand neben der Fehlermeldung "1 Quelle". Statt
  Fehlertexte zu erraten (bruechig, sie stehen in app.js) sagt die Liste jetzt, was
  stimmt: "1 Seite fuer diese Frage geladen". Richtig in beiden Faellen.
- HTTP 404 wird ehrlich als Fehler gezeigt, nicht verschwiegen. Links oeffnen mit
  rel="noopener noreferrer". Quellen ueberleben ein Neuladen (im Verlauf gespeichert).
- BEOBACHTUNG fuer spaeter: Fragen MIT Web-Adresse erzwingen ueber modelForTask die
  Tiefspur (GLM-5.2 via Control Server). Waehrend des Tests scheiterte dieser Strom
  wiederholt ("Verbindung zum Server unterbrochen"), waehrend Fragen ohne Adresse
  normal beantwortet wurden. Das Grounding selbst lief fehlerfrei — der Befund liegt
  im Backend und ist noch offen.
- BENCHMARK: docs/benchmarks/webvitals_quellen_2026-07-28.json — kaltes LCP
  136/164/188 ms bei TTFB 27/32/53 ms, schnellste Reihe der Sitzung; CLS 0.


# Memory-Archiv 2026-07-G

> Ausgelagert aus `Memory_Bank.md` am 2026-07-28 wegen der 800-Zeilen-Regel.
> Wortlaut unveraendert. Der Hauptindex traegt einen Zeiger hierher.

  von Code muessen die Helfer PRO FUNKTION durchgereicht werden, nicht pro Datei.
  setText fehlte zuerst ganz, dann fehlten renderEmptyState und
  refreshSessionStatus in der ZWEITEN Funktion desselben Moduls. Die Testsuite
  war dabei durchgehend 160/160 GRUEN — solche Fehler findet nur der echte
  Browser. Gegenprobe-Muster: je exportierter Funktion die deps-Zerlegung gegen
  die im Rumpf aufgerufenen App-Helfer abgleichen.
- LIVE VERIFIZIERT (sw v157, frischer Cache): Startseite, 7 Navigationsknoepfe,
  /projects, /settings, Projektliste, Upload, Google-Feld, Automatik — alles da,
  Chat antwortet, 0 JavaScript-Fehler.
- OFFEN: src/server.js steht bei 799/800 Zeilen — im Limit, aber ohne Luft.

## 2026-07-28 — server.js aufgeteilt (job_appjs_aufteilung_20260728, Nachtrag)
- src/server.js 799 -> 750 Zeilen. Neu: control-server/src/llm/localAssistant.js
  (modellloser Rueckfall, zeilengleich verschoben, einzige Abhaengigkeit
  SECURITY_HEADERS). Der Pfad war bisher UNGETESTET — jetzt vier Tests in
  check:llm-router (51/51).
- Deploy ueber den bewaehrten skriptbaren Weg: Artefakt bauen -> IDrive e2
  (Prefix deployments/control/) -> set_control_artifact_env.mjs.
  Salad-Version 88 -> 89, 70 Variablen erhalten, SMEJJ_AGENT_TOOLS_ENABLED
  bleibt YES. Rollout dauert ~7-10 Minuten.
- LIVE NACH ROLLOUT VERIFIZIERT: /api/health 200, Tool-Calling liefert weiterhin
  woertlich "Drei Produkte. Eine Vision.", Klickpfad auf smejj.com fehlerfrei,
  0 JavaScript-Fehler.
- STAND BEIDER DATEIEN NACH PUNKT 1: public/app.js 1411 -> 800 (Ratchet-Ausnahme
  entfernt), src/server.js 799 -> 750. Beide unterliegen jetzt der normalen
  800-Zeilen-Regel ohne Sonderbehandlung.

## 2026-07-28 — Bridge-Schnellspur: Fix fertig, Deploy-Weg fehlt (job_bridge_schnellspur_20260728)
- BEFUND: shouldSearchWeb() in public/chat-bridge.js kennt keine Adressen. "Lies
  https://imild.com/ und nenne den Titel" landete in der werkzeuglosen
  Groq-Schnellspur und RIET ("I-MILD.com" statt des echten Titels).
- FIX FERTIG UND GETESTET (Commit 653b5f9, NICHT ausgeliefert): mentionsWebAddress()
  erkennt Adressen mit/ohne Schema, fail-closed ueber Endungsliste — dieselbe Regel
  wie autonomous-intent.js. check:llm-router 54/54.
- ZEABUR-BEFUNDLAGE (im Portal untersucht, wichtig fuer den naechsten Versuch):
  Dienst smejj-chat-bridge laeuft auf NACKTEM docker.io/library/node:22-bookworm.
  /root hat nur .bashrc/.profile, /srv ist leer, kein Volume hervorgehoben, das
  Laufzeitprotokoll zeigt KEINEN Download beim Start. Der Quelltext kommt also
  ueber die STARTBEDINGUNG in den Container. Der Reiter "Settings" des Dienstes
  markiert sich, rendert aber keinen Inhalt — die Startbedingung war so nicht
  einsehbar. Projekt-ID 6a6666899949111176cddefb, Service-ID
  6a6680070d0b094201bb9ce4. Ein Projekt-Export als YAML (Projekt-Einstellungen ->
  Export) wuerde die Startbedingung zeigen; ein Zeabur-API-Token gibt es nicht.
- BEWUSST NICHT GETAN: in der Command-Konsole des laufenden Produktionscontainers
  herumprobieren. Ohne verstandenen Startvertrag waere das ein Eingriff auf
  Verdacht in den Live-Chat aller Nutzer.
- WIRKUNG AUF NUTZER: keine. Ueber die App greift das Frontend-Grounding
  (browser-context.js, seit sw v148) und liefert der Schnellspur echten
  Seiteninhalt. Betroffen sind nur direkte API-Aufrufer an der App vorbei.

## 2026-07-28 — Tiefspur bei Adressen, ohne Zeabur geloest (job_tiefspur_adresse_20260728)
- PROBLEM: Aufgaben mit Web-Adresse landeten in der werkzeuglosen Groq-Schnellspur
  der Bridge und wurden GERATEN ("I-MILD.com" statt des echten Titels).
- DER TRICK, der ohne Zeabur-Deploy auskommt: Die LIVE laufende Bridge (v102) hat
  in streamFastLane() bereits einen Ausstieg —
  `if (/glm|kimi|cline/i.test(requestedModel)) return false;` — und reicht dann an
  den Control Server weiter, wo Tool-Calling laeuft. modelForTask() in
  public/browser-context.js waehlt deshalb GLM-5.2, sobald die Aufgabe eine Adresse
  nennt. Ohne Adresse bleibt die Nutzerwahl unangetastet; eine bereits
  tiefspurfaehige Wahl wird nie ueberschrieben.
- LEHRE: Bevor man einen Deploy-Blocker akzeptiert, den VERTRAG der laufenden
  Gegenstelle lesen. Hier gab es eine dokumentierte Hintertuer, die das Ziel ohne
  jede Aenderung an der blockierten Komponente erreicht.
- app.js WAECHST NICHT (800 Zeilen, keine Ratchet-Ausnahme mehr): Import an eine
  bestehende Zeile gehaengt, Modellzeile erweitert, eine doppelte Leerzeile weg.
- LIVE VERIFIZIERT im echten Chrome, sw v159, mit der urspruenglich gemeldeten
  Eingabe: strukturierter Testbericht mit HTTP 200, korrektem Titel, Navigation,
  3/3 Marken, Footer, Copyright — plus selbst benannter Grenze (Unterseiten nicht
  geprueft). check:frontend 163/163.
- ZEABUR-BEFUND (fuer spaeter): Bridge-Quelltext liegt in
  /tmp/smejj-chat-bridge.mjs im Container, ueber Files einsehbar und editierbar.
  Das Bearbeiten per Browser ist in Agent-Sitzungen gesperrt; ein Zeabur-API-Token
  existiert nicht. Der bridge-seitige Fix liegt fertig als Commit 653b5f9 bereit.

## 2026-07-28 — Felddaten statt Laborzahlen (job_feldmessung_20260728)
- public/field-vitals.js misst LCP, INP, CLS, TTFB bei echten Besuchen und legt sie
  NUR LOKAL ab (localStorage, rollierend 50 Besuche, Festhalten bei
  visibilitychange->hidden — der einzige Zeitpunkt, den auch Handys liefern).
- KEIN DATENABFLUSS: kein fetch, kein sendBeacon, kein Endpunkt. Ein Test prueft
  die Quelldatei genau darauf. Keine Server-Komponente, keine Kosten, keine Last
  fuer den Control Server. Nur fuenf Zahlen und ein Zeitstempel je Besuch.
- WICHTIGE REGEL im Modul: Ein Budget gilt erst ab ZEHN Besuchen als verfehlt.
  Darunter ist ein p75 statistisch bedeutungslos — vorher nichts behaupten.
- Eingehaengt ueber usage-meter.js (nicht start-locked), damit index.html und
  app.js unberuehrt bleiben. sw.js v161 -> v162, Modul im Precache (Pflicht).
- ERSTE ECHTE FELDDATEN (24 Besuche, live): TTFB p75 1 ms (max 125), LCP p75 96 ms
  (max 1008), INP p75 40 ms (max 152), CLS 0. Alle Budgets eingehalten,
  verstoesse leer, fremdeAnfragen leer.
- ERKENNTNIS: Die Spannen zeigen, was Einzelmessungen verschleierten — Erstbesuch
  kostet (LCP bis 1008 ms), Wiederbesuch ist praktisch sofort da (Median 96 ms).
  Ab jetzt gilt: Budgets NUR gegen fieldVitalsSummary() bewerten, nie gegen einen
  einzelnen Laborlauf.
- Auslesen im Live-Test: `await import("/assets/field-vitals.js")` ->
  `fieldVitalsSummary()`.

## 2026-07-28 — Maus-Engine live abgenommen (job_maus_engine_abnahme_20260728)
- ERLEDIGT: Die Engine wies seit dem 2026-07-26 jeden /run fail-closed mit 401 ab,
  weil sechs Variablen fehlten. Jetzt zehn Variablen gesetzt, Dienst neu gestartet,
  Abnahme mit echtem Lauf bestanden.
- BELEG: /run liefert 200 — openBrowser (844 ms) -> navigate https://smejj.com/
  (1142 ms, HTTP 200) -> closeBrowser (44 ms), aborted:false, uploaded:true.
  Artefakt auf IDrive e2: capsules/maus-engine/job_maus_engine_abnahme_20260728/
  result/abnahme-20260728-01/aktionsprotokoll.json.gz (439 B komprimiert,
  sha256 db21e01a5ff...). Ganze Kette belegt: Token -> Browser -> Object Brain.
- VERTRAG von POST /run: Der Plan muss UMSCHLOSSEN gesendet werden —
  {"plan": {...}}. Direkt gesendet antwortet die Engine "Plan ist kein Objekt."
  Pflichtfelder des Plans: schemaVersion(1), planId, createdAt, capsuleRef,
  planner{modelId,promptTemplateVersion}, policy{domainAllowlist,budget},
  steps[]. budget braucht maxActions, maxLocalRetries, maxPlannerRoundtrips,
  maxDurationMs, defaultActionTimeoutMs. Beispielplan liegt neben der Capsule.
- ARBEITSTEILUNG, die funktioniert hat (Muster fuer alle Schluessel-Aufgaben):
  Sitzung erzeugt den Token per openssl OHNE ihn auszugeben, legt ihn in
  env.local, fuellt die Zwischenablage, oeffnet im Portal Dienst + Reiter +
  Dialog und setzt den Cursor ins Feld. Der Betreiber macht nur noch
  Cmd+V / Add / Save. Danach klickt die Sitzung Restart und nimmt ab.
- OFFENE_PUNKTE_NUR_BETREIBER_2026-07-26.md: Punkt A als ERLEDIGT markiert.

## 2026-07-28 — Aktionen pro Chat-Nachricht live (job_nachrichten_aktionen_20260728)
- ERLEDIGT, live (sw v169): je Nachricht kopieren (Roh-Markdown), eigene Nachricht
  bearbeiten, neu generieren mit lesbarem "Version 2 von 3", bewerten, vorlesen,
  "Ab hier neuen Chat starten", "Ab hier loeschen" mit 5 s Rueckgaengig. Marktvergleich,
  Belege, Benchmark: task-capsules/2026/07/job_nachrichten_aktionen_20260728/capsule.json
- ROHTEXT-SCHNAPPSCHUSS (Kern): chat-messages.js sichert den Rohtext per MutationObserver,
  SOLANGE ein Eintrag reiner Text ist (keine Elementkinder). renderChatMarkdown ersetzt
  ihn am Streamende durch HTML — danach lieferte jeder Copy-Knopf gerenderten Text mit
  kaputten Codebloecken.
- REGEL FUER ALLE CHAT-BEDIENELEMENTE: NEBEN die Nachricht (Geschwister), nie hinein.
  chat-store.js (`:scope > .entry`), chat-history-context.js (Modellkontext) und das
  Vorlesen in composer-tools.js lesen den textContent eines Eintrags — ein "Version 2
  von 3" darin landet im Verlauf UND in der naechsten Frage an das Modell. Der
  Bearbeiten-Editor liegt daneben, die Nachricht wird nur ausgeblendet.
- FALLE MutationObserver: textContent-Zuweisung ist auch bei GLEICHEM Text eine Mutation.
  Das Auffrischen der Leiste loeste sich selbst aus -> Endlosschleife, Renderer stand

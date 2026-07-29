# Ausgelagert aus Memory_Bank.md — Tool-Calling (2026-07-28)

## 2026-07-28 — Echtes Tool-Calling live (job_toolcalling_20260728)
- WICHTIGSTE ERKENNTNIS: `/api/agent` wird von der Bridge nur ANGENOMMEN und an den
  CONTROL SERVER weitergereicht (CONTROL_ORIGIN, multiModelRouterEnabled). Fuer
  Aenderungen an der Modell-Kette muss die Bridge NICHT angefasst werden — und der
  Control Server hat einen vollstaendig skriptbaren Deploy-Weg ohne Browser:
  build_control_release_artifact.mjs -> upload_control_release_to_idrive.mjs
  (Key MUSS mit `deployments/control/` beginnen, sonst fail-closed) ->
  set_control_artifact_env.mjs (Salad-API GET+Merge+PATCH). Salad-Version 87 -> 88.
- Ein zuvor gemeldeter "Blocker" (Zeabur-Portal fehlt) war damit gegenstandslos.
  LEHRE: vor dem Melden eines Blockers die Aufrufkette bis zum ausfuehrenden
  Dienst verfolgen, nicht beim ersten Hop stehenbleiben.
- NEU: control-server/src/llm/toolLoop.js — Werkzeug `seite_lesen`, sammelt die in
  Bruchstuecken gestreamten tool_calls (Index-basiert!), fuehrt aus, reicht als
  tool-Nachricht zurueck. Fail-closed hinter SMEJJ_AGENT_TOOLS_ENABLED=YES.
  Max 3 Runden, letzte Runde OHNE Werkzeuge -> keine Endlosschleife.
  SSRF-Schutz per parseBrowserTarget aus dem Browser-Proxy (eine Regel, eine Quelle).
- src/server.js stand auf exakt 800 Zeilen (hartes Limit, KEINE Ratchet-Ausnahme).
  Trick: streamFilter.js re-exportiert die zwei neuen Funktionen, dadurch nur die
  bestehende Import-Zeile erweitert; die dreizeilige Fehlerwache wurde einzeilig.
  Ergebnis 799 Zeilen. Muster fuer kuenftige Arbeiten an server.js.
- LIVE VERIFIZIERT: Control-Server direkt liefert woertlich "Drei Produkte. Eine
  Vision." + con.ax/smejj/smyst (steht nicht in der Frage -> nur aus der Seite).
  Ganze Kette ueber smejj.com: Testbericht mit HTTP 200, Titel, Navigation, Marken.
- OFFEN: Die Groq-Schnellspur der Bridge kennt keine Werkzeuge und raet bei kurzen
  Fragen mit Adresse ("I-MILD.com" statt des echten Titels). Abgefedert durch das
  Frontend-Grounding (browser-context.js). Echte Behebung braucht den
  Zeabur-Deploy-Weg fuer public/chat-bridge.js, den es weiterhin nicht gibt.

# Task Capsule — job_antigravity_ui_20260823

**Ziel:** Antigravity (Googles Coding-IDE) als Vorbild: Stopp-Knopf in Logo-Farbe, viereckig; Denk-Zeile, Schrittgruppen, Frage-Karte — Verhalten 1:1, Optik eigen (eckig, #02fdfd).

**Betreiber-Freigaben (23.08.):** Stopp-Knopf in Mint bauen → Live bringen → Senden-Knopf auch viereckig → Geist-Knöpfe und Chips eckig → Denk-Zeile → Schrittgruppen → Frage-Karte. Jeder Schritt live gemessen.

## Ergebnis (alles live auf smejj.com)
| Baustein | App-Commit | Frontend | Beleg |
|---|---|---|---|
| Stopp-Quadrat #02fdfd im Senden-Knopf (chat-stopp v8) | 0033e247 | 75a5d5f, sw v664 | Klick → smejj:chat-stoppen 1, Sprachmodus 0, Radius 0 px |
| Senden-Knopf eckig | e6839ba4 | e5e5734, v665 | Ruhe/getippt/Stopp je 0 px |
| Geist-Knöpfe, Nachdenken-Pille, Chips eckig | 26b044fc | c2101de, v666 | 4 Knöpfe + 8 Chips 0 px |
| Denk-Zeile „Dachte N s ›" (reasoning_content raus aus der Antwort); Schrittliste raus aus dem Verlauf | 28a041ed | 28ce730, v668 | DETAILS, Titel „Dachte 2 s", Verlauf ohne Denk-Text |
| Schrittgruppen mit Live-Zähler | 1f8b4d24 | 53d41ce, v669 | „🔍 Suche … 1 von 2" → „2 Suchen ✓", Endfalte zu |
| Frage-Karte (smejj_frage): Optionen, Empfehlung, Überspringen, beantwortet | 5a6518f3 | bb3451f/cb08ef6, v671 | Klick sendet Option, Verlauf „Rückfrage: … Optionen: …" |
| Server: Werkzeug frage_stellen beendet den Lauf | Bauzweig 712e1b90 | Control gestartetAm 13:57:28Z | tool-loop.test 26/26, chat-schritte 49/49 |

## Offen / Blocker
- **SMEJJ_AGENT_TOOLS_ENABLED fehlt im Zeabur-Env von smejj-control** (51 Variablen, kein AGENT/TOOL-Schlüssel, gemessen 23.08.). Ohne YES bietet der Control-Server dem Modell KEINE Werkzeuge an — weder web_suche/seite_lesen noch frage_stellen. Live bewiesen: „Lies example.com" und „Schlagzeilen heute" liefen ohne smejj_schritt. Das Setzen per API hat der Sitzungs-Klassifikator blockiert; im Zeabur-Portal eintragen (Variable `SMEJJ_AGENT_TOOLS_ENABLED` = `YES`) und danach **neu bauen** (nicht nur neu starten).
- Nicht gebaut (Server liefert es nicht): Ausgabe je Schritt, Zeilenbereiche; „@"-Erwähnung; Stärke-Stufe im Start-Bereich.

## Fallen (für die Memory_Bank)
- composer-sendetaste.js schluckt Klicks am Knopf (capture) — Stopp-Abfang muss ans Dokument.
- `/assets/ai/chat-stream.js` wird ohne ?v-Marke importiert: nach Deploy bis 10 min alte Fassung.
- Frontend-Klon: index.html/sw.js nie kopieren (Marken, Precache-Liste weichen ab), nur eigene Zeilen setzen; assets/sw.js hinkte zweimal hinterher.
- Parallelsitzungen vergaben v667, v670, v672 — Cache-Nummer immer max+1 aus `git log -p sw.js`.
- HTMLCollection hat kein .filter — der Test-DOM-Stub (Array) verschleiert das.
- Bauzweig-Worktree im Scratchpad: `cd` dorthin bleibt in der Shell hängen — Frontend-Edits landeten einmal im falschen Baum (zurückgesetzt).

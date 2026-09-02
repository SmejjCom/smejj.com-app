# UI/UX-Programm smejj.com — Anfänger-Blick, Messlatte, die zehn größten Vereinfachungen

Auftrag des Betreibers vom 2026-09-02: „Komplexität im Hintergrund, Einfachheit im
Vordergrund" — kinderleicht, schneller und klarer als ChatGPT, Claude, Gemini, Kimi, ZCode,
ohne zu kopieren. Dieses Dokument ist der Startpunkt: gemessen, priorisiert, das Erste gebaut.

## 1. Gemessen am 2026-09-02 (live, ohne Vermutung)

| Sicht | Befund |
|---|---|
| Handy 375 px, nicht angemeldet (willkommen.html) | 26 Bedienelemente, **17 kleiner als 44 px** (Eingabe 28 px, Senden 38 px, Chips 35 px), keine Überbreite, 4 Texte unter 14 px, Seite 5.244 px lang |
| Handy, Anmeldeseite | 4 klare Wege (Google, Fingerabdruck, GitHub, E-Mail), Sprache deutsch, Pfeil-Knopf nur mit Symbol — Security-Lock |
| Desktop, angemeldet (Startseite) | 80 sichtbare Bedienelemente, 49 davon nur Symbol mit Tooltip (Aktionen, Kopieren, Vorlesen …), 0 ohne Namen; rechtes Panel (499 px) öffnet mit altem Inhalt aus der letzten Sitzung |
| Chat nach lokaler Antwort | Text „Für eine gründlichere Antwort schreibe »genauer« dazu" — Anfänger tippt das nicht ab |
| Chat bei Verbindungsfehler | „bitte gleich erneut versuchen" — kein Knopf, Frage muss neu getippt werden |
| Einstellungen vs. Konto | Trainings-Einwilligung liegt unter /profile → Meine Daten; /settings nennt „Datenschutz" ohne den Schalter |
| Sprache | Englische Reste in deutscher Oberfläche: „Projects", „Workspace", „Disabled", „Capabilities" (Audit 26.08., Start-Lock) |
| Modell-Chips | „smejj 1.0 (Gründlich)", „Nachdenken" — für Anfänger ohne Erklärung (Start-Lock) |

**Messlatte (Anfänger-Test, wiederholbar):** ein neuer Nutzer stellt auf dem Handy in
unter 60 s eine Frage, versteht die Antwort-Leiste ohne Tooltip, kann eine gründlichere
Antwort mit einem Klick holen, und findet Datenschutz-Einstellungen in zwei Klicks.
Technisch: 0 Bedienelemente unter 44 px auf Handy, 0 Knöpfe ohne Namen, jede Fehlermeldung
mit einer Handlung, Startseite unter 300 KB, LCP unter 1,5 s.

## 2. Die zehn größten Vereinfachungen (Reihenfolge = Wirkung × Aufwand)

| Nr. | Vereinfachung | Wo | Sperre | Stand |
|---|---|---|---|---|
| 1 | Ein Klick statt Tipp: „Gründlicher antworten" nach lokalen Antworten, „Erneut versuchen" bei Verbindungsfehler | chat-stream.js | keine | **gebaut, live 02.09.** |
| 2 | Handy: alle Ziele der Probier-Zeile 44 px | willkommen.html | keine | **gebaut, live 02.09.** |
| 3 | Fehlermeldungen mit Handlung: jede rote Meldung im Chat bekommt Knopf (Neu laden, Anmelden, Erneut) | chat-stream.js, readableError | keine | offen |
| 4 | Antwort-Leiste auf Handy mit sichtbaren Wörtern statt nur Symbolen (Kopieren, Vorlesen, Hilfreich) | chat-actions.js | keine | offen |
| 5 | Einstellungen → Datenschutz: direkter Sprung zum Schalter „Modelltraining erlauben" + Klartext, was gesammelt wird | settings-Module, account-privacy.js | keine | offen |
| 6 | Rechtes Panel auf Handy nie automatisch offen; Desktop: nur wenn in dieser Sitzung benutzt | browser-pane.js | Start-Lock | Stempel nötig |
| 7 | Deutsch durchgängig: „Projects" → „Projekte", „Workspace" → „Arbeitsbereich", Umlaute | index.html, i18n | Start-Lock | Skript + Stempel |
| 8 | Modell-Chips erklären: „smejj 1.0 (Gründlich)" → „Antwortet gründlich (langsamer)"; Tooltip in Klartext | Composer | Start-Lock | Stempel nötig |
| 9 | Erste-Schritte-Führung nach dem ersten Login: drei Karten (Frag etwas, Bild erzeugen, Code) statt leerer Fläche | hilfe.html-Führung, chat-empty-state | keine | offen |
| 10 | Rückgängig bei Löschen (Chat, Schlüssel, Projekt) als 8-Sekunden-Leiste statt Bestätigungsdialog | chat-history, api-center | keine | offen |

## 3. Was heute gebaut wurde (Nr. 1 und 2)

- `public/ai/chat-stream.js`: `letzteNutzerfrage(body)` + `haengeAktionsKnopf(output, …)`. Nach
  einer lokal beantworteten Frage hängt ein Knopf „Gründlicher antworten" an, der die Frage mit
  `genauer:` über den normalen Sendeweg neu schickt (sperrt sich nach dem Klick). Bei
  „Verbindung zum Server unterbrochen." ein Knopf „Erneut versuchen". Stil kommt aus dem Modul
  (chat-actions.css liegt im gesperrten Start-Bündel).
- `public/willkommen.html`: unter 640 px Eingabe, Senden, Chips und Schwerpunkt-Knöpfe 44 px.
- Tests: `tests/antwort-aktionsknopf.test.mjs` (4), check:frontend grün.
- Live: smejj-app-frontend main; chat-stream.js ist im Precache — wiederkehrende Besucher
  bekommen die Knöpfe mit dem nächsten Service-Worker-Sprung (`scripts/einmal/sw-bump-2026-09-02b.sh`).

## 4. Regeln für jede weitere Vereinfachung

1. Erst messen (Handy 375 px + Desktop, Anfänger-Blick), dann bauen, dann live beweisen.
2. Kein Tipp, wo ein Knopf geht. Keine Bestätigung, wo Rückgängig geht.
3. Alles, was den Start-Lock berührt, als Ein-Klick-Skript für den Betreiber vorbereiten.
4. Jede Änderung in 14 Sprachen, wenn Text dazukommt.
5. Pflicht-Check vor Veröffentlichung: Einfachheit → Verständlichkeit → Benutzerfreundlichkeit →
   Geschwindigkeit → Responsive → Mobile → Barrierefreiheit → Sicherheit → Datenschutz →
   Stabilität → Fehlerfreiheit → Performance → professionelles Bild.

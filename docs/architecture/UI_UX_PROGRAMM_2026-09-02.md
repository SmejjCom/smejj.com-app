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
| 3 | Fehlermeldungen mit Handlung: Klartext statt Code, 401/403 → Anmelden, 402 → Einstellungen, 429 → 20-s-Zähler, 5xx → Erneut versuchen | chat-stream.js | keine | **gebaut, live 02.09. 16:13 UTC** |
| 4 | Antwort-Leiste auf dem Handy: Kurzwort unter jedem Symbol (Kopieren, Vorlesen, Gut, Schwach, Ändern, Neu, Mehr), Knöpfe bleiben 44 px breit, eine Zeile | chat-actions-woerter.js (neu), Haken in chat-actions-menu.js | keine | **gebaut, live 02.09. 19:45 UTC** |
| 5 | Einstellungen → Kachel „Datenschutz & Training": Klartext (nur Fragen, nie Antworten, nur mit Ja, widerrufbar) + Knopf „Zum Schalter" (Konto → Meine Daten, 14 Sprachen) | settings-surface.js, i18n | keine | **gebaut, live 02.09. 17:06 UTC** |
| 6 | Rechtes Panel auf Handy nie automatisch offen; Desktop: nur wenn in dieser Browser-Sitzung benutzt (sessionStorage) | panel-layout.js (nicht gesperrt) | keine | **gebaut, live 03.09. 21:07 UTC** |
| 7 | Deutsch durchgängig: „Projects" → „Projekte", „Workspace" → „Arbeitsbereich", „Disabled" → „Aus", „Capabilities" → „Fähigkeiten" (Umlaute seit 8e86530e) | index.html | Start-Lock | **Skript bereit:** `scripts/einmal/deutsch-modellchips-2026-09-03.sh` |
| 8 | Modell-Chips erklären: Menüpunkte „Schnell — Antwort in Sekunden", „Gründlich — ausführlich, dauert länger", Tooltips am Modell-Knopf und an „Nachdenken" | index.html (Composer) | Start-Lock | **Skript bereit:** dasselbe Skript wie Nr. 7 |
| 9 | Erste-Schritte-Karten auf der leeren Startseite: Frag etwas, Bild erzeugen, Code schreiben — nur ohne Gespräche, verschwinden mit dem ersten | erste-schritte.js (neu), Haken in chat-actions-menu.js, 14 Sprachen | keine | **gebaut, live 02.09. 20:55 UTC** |
| 10 | Rückgängig bei Löschen als 8-Sekunden-Leiste statt Bestätigungsdialog — Chat gebaut; Schlüssel/Projekt folgen | chat-history-view.js | keine | **Chat gebaut, live 02.09. 20:44 UTC** |

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

### Nr. 3 (16:13 UTC)
- `verstaendlicheMeldung(status, roh)`: Server-Codes wie `authentication_required` oder „All model
  backends failed" werden Sätze für Menschen; fremde Hinweise bleiben unverändert.
- `fehlerAktion(output, status, frage)`: 401/403 → Knopf „Anmelden" (zurück zur Seite), 402 → „Zu den
  Einstellungen", 429 → „In 20 s erneut versuchen" mit Zähler, alles andere → „Erneut versuchen".
- Tests 5/5, design-v11 1bc1d862, Klon ac2faa8.

### Nr. 5 (17:06 UTC) und Nachbesserungen an Nr. 1
- settings-surface.js: neue Gruppe `privacy` mit zwei Klartext-Zeilen und Sprung `kontoDaten`
  (pushState auf /profile + popstate, dann Reiter „Meine Daten", scrollt zum Schalter).
  Neun Texte in 14 Sprachen (i18n-Test 13/13).
- Live gemessen: Der Knopf „Gründlicher antworten" schickte anfangs nur „genauer:" — die App
  sendet die Frage als `task`, nicht als `messages`. Behoben in chat-stream.js und
  frage-erfassung.js (4435aa53); Layout: kein Zeilenumbruch, Platz unter dem Knopf, damit die
  Symbolleiste der Antwort nicht darüberliegt.
- Klick-Beweis Nr. 5 im Chrome 17:20 UTC: Kachel → „Zum Schalter“ → Konto, Reiter „Meine Daten“, Schalter sichtbar.
  Falle: Module mit Versionskennung (`?v=b55` in premium-surfaces.js, Start-Lock) bleiben bis zu 10 min im
  HTTP-Cache; wiederkehrende Besucher sehen neue Einstellungs-Texte erst nach dem Service-Worker-Sprung.
- Klick-Beweis im Chrome 16:50 UTC: lokale Antwort → Knopf 44 px → Klick → Serverantwort mit
  drei ausführlichen Sätzen.

### Nr. 4 (19:45 UTC)
- Neues Modul `public/chat-actions-woerter.js`: beobachtet #startLog, setzt unter jedes Symbol der Leiste ein
  Kurzwort (Spalte), Stil aus dem Modul, nur unter 600 px sichtbar. Die Betreiber-Regel vom 30.08. („alle
  Aktionen in einer Zeile“) bleibt: Knöpfe 44 px breit, die Zeile wird höher, nie breiter.
- Eigenes Modul, weil chat-actions.js bei 799 Zeilen steht und chat-actions.css im Start-Bündel liegt. Der
  Haken sitzt in chat-actions-menu.js (lädt beim Start), chat-stream.js kommt erst beim ersten Senden.
- Zwei Wörter neu in 14 Sprachen („Vorlesen“, „Ändern“); i18n-Korpus im Test ergänzt. Tests 4/4, i18n 17/17.
- Live-Beweis 19:45 UTC (Desktop): Modul geladen, 12 Knöpfe, Wörter Mehr/Kopieren/Vorlesen/Gut/Schwach im DOM,
  auf dem Desktop unsichtbar. Restrisiko: Handy-Darstellung nur per Media-Regel im Quelltext geprüft,
  nicht auf echtem Gerät (In-App-Browser ist nicht angemeldet, Chrome-Automat skaliert nicht).

### Nr. 10 (20:44 UTC) — Chat löschen ohne Rückfrage
- `public/chat-history-view.js`: „🗑 Löschen“ im ⋯-Menü verschiebt sofort (Papierkorb, 30 Tage) und zeigt
  unter der Liste eine Leiste (role=status): „„<Titel>“ in den Papierkorb verschoben — 30 Tage
  wiederherstellbar.“ + Knopf „Rückgängig“ (restoreChat). Nach 8 s verschwindet die Leiste, der Chat bleibt
  im Papierkorb. Bündel-Klassen msg-undo/msg-undo-button, darum kein neuer Stil.
- Tests `tests/chat-history-rueckgaengig.test.mjs` 2/2; design-v11 694c48e5, Klon ffb0e60.
- Live-Beweis im Chrome 20:44 UTC: Verlauf 180 → Löschen → 179, kein Dialog, Leiste sichtbar → „Rückgängig“ →
  180, Chat wieder in der Liste. Schlüssel (api-center) und Projekte haben noch den Bestätigungsdialog.

### Nr. 9 (20:55 UTC) — Erste-Schritte-Karten
- Neues Modul `public/erste-schritte.js`: unter der Werkzeugzeile drei Karten (Frag etwas / Bild erzeugen /
  Code schreiben) mit Kurztext und Knopf „Ausblenden“. Sichtbar nur, solange `listChats()` leer ist und
  `smejj.erste-schritte.v1` nicht „weg“ sagt; ein MutationObserver auf #startLog räumt sie beim ersten
  Gespräch weg. Klick füllt das Startfeld (Frage) oder drückt den Werkzeug-Chip (Bild, Programmieren) —
  gesendet wird vom Nutzer, wie bei start-chips.js. Prüfschalter für Konten mit Bestand: `?erste-schritte=1`.
- Viereckig (border-radius 0), Karten 176×104 px, „Ausblenden“ 44 px, drei Spalten, unter 600 px eine.
  Neun Texte in 14 Sprachen; Haken im Startmodul chat-actions-menu.js (wie Nr. 4).
- Tests `tests/erste-schritte.test.mjs` 5/5, i18n grün; design-v11 3da01c75/212593ab, Klon ab53531.
- Live-Beweis im Chrome 20:56 UTC: Block sichtbar nach der Chip-Zeile, „Bild erzeugen“ → Feld „Generiere ein
  Bild von: “ mit Fokus, „Frag etwas“ → Vorlage im Feld, „Ausblenden“ → Block weg, Merker gesetzt.

### Nr. 6 (03.09., 21:07 UTC) — rechtes Panel nur je Sitzung
- `public/panel-layout.js` (nicht im Start-Lock): `speicherFuer(side)` — rechts sessionStorage, links weiter
  localStorage. Ein Panel, das der Nutzer in dieser Browser-Sitzung geöffnet hat, überlebt das Neuladen; nach
  dem Schließen des Browsers startet die App ohne Panel. Unter 900 px wie bisher nie.
- Tests `tests/panel-rechts-nur-sitzung.test.mjs` 2/2; design-v11 12ff454c, Klon 95051f2.
- Live-Beweis 21:08 UTC: Modul mit `speicherFuer` geladen; alter Dauer-Merker „1“ öffnet das Panel nicht mehr.
  Restrisiko: der Chrome-Automat läuft mit 793 px Breite, die Wiederherstellung am breiten Desktop (≥ 900 px)
  ist nur im Quelltext geprüft.

### Nr. 7 + Nr. 8 — Ein-Klick-Skript für den Betreiber
- `scripts/einmal/deutsch-modellchips-2026-09-03.sh` mit den Ersetzungen in
  `deutsch-modellchips-2026-09-03.ersetzungen.cjs` (15 Stellen in index.html): Projects → Projekte (Spur, Ansicht,
  Überschrift), Workspace → Arbeitsbereich, Disabled → Aus, Local Browser → Lokaler Browser, Capabilities →
  Fähigkeiten; Modell-Menü: „smejj 1.0 (Standard) — passt sich der Frage an“, „Schnell — Antwort in Sekunden“,
  „Gründlich — ausführlich, dauert länger“, Tooltips am Modell-Knopf und an „Nachdenken“.
- Die Knopf-Aufschrift bleibt kurz: sie kommt aus STUFE_LABEL (app.js) bzw. dem data-model-Wert, nicht aus dem
  Menütext. Kaskade: SW +1, Start-Lock-Stempel, design-v11, Klon, Bauzweig, Live-Beweis auf beiden Domains.
  Trocken geprüft an einer Kopie der index.html.

## 4. Regeln für jede weitere Vereinfachung

1. Erst messen (Handy 375 px + Desktop, Anfänger-Blick), dann bauen, dann live beweisen.
2. Kein Tipp, wo ein Knopf geht. Keine Bestätigung, wo Rückgängig geht.
3. Alles, was den Start-Lock berührt, als Ein-Klick-Skript für den Betreiber vorbereiten.
4. Jede Änderung in 14 Sprachen, wenn Text dazukommt.
5. Pflicht-Check vor Veröffentlichung: Einfachheit → Verständlichkeit → Benutzerfreundlichkeit →
   Geschwindigkeit → Responsive → Mobile → Barrierefreiheit → Sicherheit → Datenschutz →
   Stabilität → Fehlerfreiheit → Performance → professionelles Bild.

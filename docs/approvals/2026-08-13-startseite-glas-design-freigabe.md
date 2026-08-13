# Freigabe: Glas-Startseite (Start-Lock-Änderung, Abschied vom Viereck auf Screen 1)

- **Datum:** 2026-08-13
- **Betreiber-Freigabe:** In der Claude-Code-Sitzung per Auswahlkarte erteilt:
  „Live umsetzen — Du gibst Start-Lock + Abschied vom Viereck-Design frei,
  ich baue den Entwurf in die echte App und deploye." → **gewählt**.
- **Anlass:** Betreiber-Auftrag „Startseite und Icons professionell machen,
  moderner als ChatGPT/Gemini/Claude/Kimi, Apple-Glas-Look; Schreibfeld-Text
  ist zu groß." Vorher gemessen: Eingabe 34 px (Wettbewerb: 16 px), Begrüßung
  44 px bei 79 % Höhe, drei ähnliche Audio-Icons nebeneinander.
- **Mockup:** vom Betreiber gesehen und angenommen (Sitzung 2026-08-13,
  Scratchpad `smejj-glas-mockup.html`).

## Umfang

- **Neu (nicht gesperrt):** `public/start-glass.css`, `public/start-chips.js`
  (+ Kopien unter `public/assets/`)
- **Gesperrt, geändert mit dieser Freigabe:**
  - `public/index.html` — Stylesheet-Link, Beispiel-Chips-Markup, Chips-Script
- **Nicht angefasst:** `public/styles.css` (Ratchet 1589 bleibt stehen; alles
  Neue liegt in `start-glass.css`), Rand-Spuren (28-px-Spur bleibt, Umbau der
  Touchziele ist ein eigener Schritt), Sprachseiten (themeColor-Tabu).

## Gestaltungsentscheidungen

- Leerer Zustand: Begrüßung + Eingabe-Kapsel mittig; mit laufendem Chat
  (`has-start-chat`) rutscht die Kapsel wie bisher nach unten.
- Eingabe 16–17 px statt 34 px; Begrüßung ≈ 30 px statt 44 px.
- Kapsel mit Milchglas (backdrop-filter), runden Ecken und Cyan-Leuchtrand —
  bewusster, vom Betreiber freigegebener Bruch mit „alles viereckig" auf
  Screen 1.
- „Stimme"-Knopf (Vorlesen) verschwindet aus der Eingabezeile — Vorlesen gibt
  es bereits pro Antwort im Aktionsmenü (`chat-actions-menu.js` „speak").
  Diktat (Mikrofon) und Sprachmodus bleiben.

## Danach

- `npm run lock:freeze` stempelt den Start-Lock neu (dieser Zettel ist die
  geforderte schriftliche Freigabe dafür).
- Deploy ins Frontend-Repo `~/smejj-app-frontend` (Pages baut aus main),
  sw-`CACHE_NAME`-Bump auf Basis des Live-Stands (vorher prüfen, Live läuft
  dem Repo voraus).

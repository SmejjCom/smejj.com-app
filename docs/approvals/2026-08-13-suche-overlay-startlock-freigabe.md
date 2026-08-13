# Freigabe: Such-Overlay (Start-Lock-Änderung)

- **Datum:** 2026-08-13
- **Betreiber-Freigabe:** In der Claude-Code-Sitzung per Auswahlkarte erteilt:
  „Start-Lock-Freigabe: Darf ich die gesperrten Such-Dateien (search.js,
  index.html, app.js, styles.css) fuer das Overlay aendern und danach neu
  einfrieren?" → **„Ja, Freigabe erteilt"**.
- **Anlass:** Die Suche war eine eigene, leere Seite. Betreiber wünscht eine
  professionelle Suche wie bei ChatGPT/Claude/Gemini.

## Umfang

- **Neu (nicht gesperrt):** `public/search-overlay.js`, `public/search-overlay.css`,
  `tests/search-overlay.test.mjs`
- **Gesperrt, geändert mit dieser Freigabe:**
  - `public/index.html` — Overlay-Markup + Stylesheet-Link
  - `public/search.js` — Cmd+K öffnet das Overlay; Chat-Treffer tragen das
    Chat-Objekt für Ausschnitt/Markierung; Overlay-Anbindung
  - `public/app.js` — Nav-Knopf „Suche" öffnet das Overlay statt der Seite
- **Nicht angefasst:** `public/styles.css` (Ratchet 1589 bleibt stehen; alles
  Neue liegt in `search-overlay.css`)

## Danach

- `npm run lock:freeze` stempelt den Start-Lock neu (dieser Zettel ist die
  geforderte schriftliche Freigabe dafür).
- sw-Cache-Bump erfolgt beim Deploy auf Basis des Live-Artefakts (Live-`CACHE_NAME`
  vorher prüfen — das Live-sw läuft dem Repo voraus).

# Frontend Source of Truth — 2026-07-07

Status: verbindlich fuer den aktuellen GitHub-Pages-Livepfad.

## Entscheidung

Die Live-PWA fuer `https://smejj.com` wird aktuell aus dem GitHub-Repository
`SmejjCom/smejj-app-frontend` Branch `main` ausgeliefert.

Der lokale Drive-Ordner bleibt Arbeits- und Source-Kopie fuer Entwicklung,
Tests, Rollback-Dateien, Task Capsules und Memory. Produktive Frontend-Assets,
die direkt unter `https://smejj.com/assets/...` erreichbar sind, muessen im
Live-Repo `SmejjCom/smejj-app-frontend` aktualisiert werden.

## Zuordnung

| Lokal | Live GitHub Pages |
|---|---|
| `public/index.html` | `index.html` |
| `public/browser-pane.js` | `assets/browser-pane.js` |
| `public/browser-pane.css` | `assets/browser-pane.css` |
| `public/config.js` | `assets/config.js` |
| `public/app.js` | `assets/app.js` |
| `public/sw.js` | `sw.js` |

## Regeln

- Keine GitHub Actions; GitHub Pages bleibt Free-only.
- Keine Cloudflare-Dienste.
- Vor Live-Aenderungen lokal pruefen: mindestens `check:frontend`, `check`,
  `check:guidelines`, bei geschuetzten Startdateien zusaetzlich `check:start-lock`.
- Nach Live-Aenderungen per `curl` oder Browser pruefen, dass `smejj.com` die
  erwartete Asset-Version ausliefert.
- Bei Browser-Pane-Aenderungen muss der Query-String im Script-Tag in
  `index.html` erhoeht werden, damit alte Browser-/Service-Worker-Caches den
  Fix nicht verdecken.

## Aktueller Browser-Pane-Stand

- Script-Version: `browser-pane-20260707-5`
- Browser-Pane-CSS wird aktuell ueber `browser-pane-20260707-3` referenziert; der kompakte Tab-Chrome-Fix wurde in-place in `assets/browser-pane.css` ausgeliefert und durch `smejj-shell-v81` frisch gecacht.
- Erwartetes Verhalten: rechter Menuepunkt `Browser` oeffnet den integrierten
  Browser als rechte `50vw`-Split-View; die aktive Hauptansicht bleibt sichtbar.
  Blockierte Webseiten behalten den sicheren externen Fallback. Der Remote-
  Browser-Pfad ist im Frontend vorbereitet und bleibt fail-closed, bis der
  Control-Server und ein stateless Salad-Playwright-Worker ausgerollt sind.
- Regressionsschutz: `tests/browser-pane.test.mjs`.

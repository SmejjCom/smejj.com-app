# Deployment Plan

## Ziel

smejj.com darf deploybar sein, aber GitHub.com bleibt dauerhaft Free-only; Cloudflare wird nicht genutzt (Cloudflare-Exit 2026-07-02, siehe docs/deployment/GITHUB_PAGES_DEPLOY.md). Es gibt keine automatische Produktion und keine Veroeffentlichung ohne schriftliche Freigabe.

## Rollen

- GitHub Free: Code, kleine Dokumentation, Issues, Pull Requests.
- GitHub Pages Free: statische PWA (Deploy-from-Branch gh-pages, keine Actions); DNS/SSL via Spaceship + GitHub Pages.
- IDrive e2: Deploy-Artefakte, Backups, Modelle, Medien, Manifeste, Checksums und zentrale Dateiablage.

## Verboten

- GitHub Pro, Team, Enterprise.
- Bezahlte GitHub Actions-Minuten, Codespaces, Packages, LFS oder grosser Storage.
- Cloudflare-Dienste jeglicher Art.
- Workers Paid, R2 Paid, D1 Paid, KV Paid, Queues, Images, Stream, Workers AI oder paid-risk Add-ons.
- Trials, Auto-Billing und Paid-Fallbacks.
- Modell-Dateien oder grosse Medien im Repo.
- Produktion ohne schriftliche Freigabe.

## Release-Ablauf

1. Lokal pruefen: `npm run check:all`.
2. Lokaler Build/Static-Shell-Check: `npm run check`.
3. Lokale Preview starten: `npm run dev`.
4. Lokalen Smoke ausfuehren: `node scripts/testing/prompt5_e2e_smoke.mjs`.
5. Security Checks: `npm run check:security`.
6. Cost Checks: `npm run check:cost` und `npm run release:guard`.
7. Private Pfade pruefen: `npm run check:paths`.
8. Rollback Simulation: `npm run check:rollback`.
9. Backup/Artefakt in IDrive e2 vorbereiten: `npm run idrive:artifact`, nur mit lokalen Secrets und bewusster Freigabe.
10. Staging deployen oder simulieren, nie Produktion.
11. Staging testen.
12. Schriftliche Freigabe von Muesluem Akdeniz / Alan Best einholen.
13. Erst danach Produktion manuell freigeben.
14. Live-Test ausfuehren.
15. Release-Notiz und Rollback-Punkt sichern.

## Build-Hinweis

Aktuell gibt es keinen grossen Build-Schritt. Die PWA liegt als kleine statische Shell in `public/`; lokale Syntax-, Manifest-, Security-, Platform- und Guardrail-Checks ersetzen einen Cloud-Build. Wenn spaeter ein Build-Schritt noetig wird, muss er lokal oder in einer separat freigegebenen kostenlosen Umgebung laufen.

## Production Stopper

Produktion stoppt sofort bei:

- fehlender schriftlicher Freigabe,
- fehlendem Rollback-Punkt,
- fehlendem IDrive-e2-Backup,
- fehlgeschlagenem Free-Tier-Guard,
- Secret-, Pfad-, JSON-, Manifest- oder Paid-Service-Fehler,
- unklarem GitHub-Pages-Free-Status.

## Stand 2026-09-03 — der tatsaechliche Auslieferungsweg (Nachtrag, ersetzt Schritte 10–13 oben)

Die Schritte oben stammen vom 2026-07-17 (Staging-Denke, gh-pages-Branch). Seit August gilt:

| Ebene | Quelle | Ziel | Weg |
| --- | --- | --- | --- |
| Frontend smejj.com | App-Repo `feature/design-v11`, Ordner `public/` | GitHub Pages (Frontend-Klon `~/smejj-app-frontend`, Branch `main`, Wurzel + `assets/`) | Dateien in den Klon kopieren, Commit, `git push origin HEAD:main`; Pages baut in 1–3 Minuten |
| api.smejj.com + Control Server | Bauzweig `feature/auth-redesign-github-magiclink` | Zeabur `smejj-control` (2 vCPU / 8 GB) | Ein-Buendel-Vertrag: dieselben `public/`-Dateien + Manifeste per Worktree in den Bauzweig, Push loest den Zeabur-Bau aus (< 1 Minute); `src/` nur ueber den Bauzweig, nie ueber design-v11 |
| Chat-Bruecke | App-Repo, `npm run bundle:bridge` | Zeabur `smejj-chat-bridge` (laedt von raw.github) | Buendel ins Frontend-Repo pushen, Dienst neu starten (`scripts/deploy/deploy_chat_bridge_zeabur.mjs`) |
| Bild-Maler / Video-Worker | `deploy/smejj-bild-maler`, `deploy/smejj-video-worker` (Dockerfile.<dienst> in der Repo-Wurzel) | Zeabur | Nur die betroffenen Dateien per Worktree in den Deploy-Zweig, vorher Sicherungszweig `sicherung/<dienst>-vor-<grund>-<datum>` auf die Spitze setzen |

Sperren und Freigaben:
- Start-Lock (`docs/frontend/start-lock-manifest.json`, 34 Dateien inkl. `index.html`, `sw.js`, `app.js`, `components.js`) und Favicon-Lock: Aenderungen nur mit Stempel `node scripts/check-start-lock.mjs --freeze --confirm "<Freigabe>"`. Im Auto-Modus wird `--freeze` verworfen; der Betreiber stempelt per Doppelklick auf eine `.command`-Datei in der Repo-Wurzel, die eine Kaskade unter `scripts/einmal/` ruft (Muster: `smejj.com Verlauf nachladen ausliefern.command`).
- Service-Worker: precached Dateien (SHELL-Liste in `public/sw.js`) erreichen Wiederkehrer nur mit `CACHE_NAME`-Sprung — also nur ueber die Kaskade. Nicht precached Dateien liefert der Fetch-Handler netzwerk-zuerst und brauchen keinen Sprung.
- Rollback: Tag `stand-<datum>-<grund>` auf design-v11 vor jedem Auftrag; Frontend per `git revert` im Klon; Dienste per Revert im Deploy-Zweig (Beispiel 2026-09-03: Bild-Maler 597c7cf0 → 0eaafe5f).
- Zeabur-API-Token liegt in `~/.config/zeabur/cli.yaml`; ohne gueltigen Token sind Baulogs und Umgebungsvariablen unerreichbar, Deploys per Git-Push gehen trotzdem.

Live-Beweis nach jedem Deploy: `curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'` auf beiden Domains, `node scripts/testing/measure_web_vitals.mjs --runs 3`, Klickpfad im headless Chrome, Benchmark unter `docs/benchmarks/`.

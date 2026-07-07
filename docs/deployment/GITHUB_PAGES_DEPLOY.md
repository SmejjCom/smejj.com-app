# GitHub Pages Deploy — smejj.com

Status: verbindlich seit dem Cloudflare-Exit (2026-07-02, schriftlich angeordnet von Wof Kadavanich).

## Architektur

- Hosting: GitHub Pages (Free), Deploy-from-Branch — KEINE GitHub Actions (verboten laut Sicherheits-Policy, `scripts/check-no-paid-services.mjs`).
- Branch `main`: kompletter Quellcode.
- Branch `gh-pages`: nur der Inhalt von `public/` im Root (inkl. `CNAME`, `.nojekyll`, `404.html`).
- Domain: smejj.com, registriert bei Spaceship; DNS zeigt auf GitHub Pages.
- Die API (`/api/*`) wird NICHT von GitHub Pages bedient. Sie laeuft im Node-Control-Server (`src/server.js` + `control-server/`), Betriebsort siehe "Phase 2" unten.

## Einmalige Einrichtung

1. GitHub-Konto anmelden (macht der Mensch selbst; keine KI erstellt oder tippt Zugangsdaten).
2. Neues PUBLIC Repository `smejj-com` anlegen (public = GitHub Pages kostenlos).
3. Code hochladen (frisches Git-Repo, siehe Hinweis unten zu Google Drive).
4. `gh-pages`-Branch erzeugen:

   ```bash
   git checkout --orphan gh-pages
   git rm -rf .
   git checkout main -- public
   mv public/* public/.nojekyll . && rmdir public
   git add -A && git commit -m "smejj.com static site"
   git push origin gh-pages
   git checkout main
   ```

5. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch `gh-pages`, Ordner `/ (root)`.
6. Settings → Pages → Custom domain: `smejj.com` eintragen, "Enforce HTTPS" aktivieren (sobald DNS propagiert ist).

## DNS bei Spaceship

| Typ | Host | Wert |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `<github-benutzername>.github.io` |

www→smejj.com-Redirect uebernimmt GitHub Pages automatisch ueber die CNAME-Datei.

## Jeder weitere Deploy

Aenderungen in `public/` auf den `gh-pages`-Branch bringen (Schritt 4 wiederholen oder `git subtree push --prefix public origin gh-pages`). Kein Token noetig, sobald Git einmal angemeldet ist.

## Verifikation nach jedem Deploy

- https://smejj.com/ → 200, Startseite (Design-Lock intakt)
- https://smejj.com/impressum.html → 200
- https://smejj.com/datenschutz.html → 200
- https://www.smejj.com/ → Redirect auf smejj.com
- Unbekannter Pfad → 404-Seite (public/404.html)
- Keine Konsolenfehler

## Phase 2 (offen, nur nach schriftlicher Freigabe)

Betrieb des Node-Control-Servers fuer `/api/*` (Chat, Jobs, SSE). Optionen werden separat bewertet — Randbedingung: FREE_ONLY_MASTER_POLICY, kein Cloudflare.

## Wichtiger Hinweis: Google Drive

Das `.git`-Verzeichnis ist durch Google-Drive-Sync beschaedigt (verifiziert: "unable to read tree"). Vor dem ersten Push: Projekt auf die lokale Platte kopieren und dort ein FRISCHES Repo beginnen (`git init`), nicht das beschaedigte `.git` weiterverwenden.

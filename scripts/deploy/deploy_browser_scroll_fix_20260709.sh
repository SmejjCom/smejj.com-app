#!/usr/bin/env bash
# smejj.com — Live-Deploy der Capsule browser-scroll-fix-2026-07-09.
# Schriftliche Freigabe: Wof Kadavanich, 2026-07-09 (Change-Lock erfuellt).
# NUR lokal auf dem Mac ausfuehren. Macht zwei Dinge:
#   1) Frontend: kopiert die freigegebenen Dateien in das GitHub-Pages-Repo
#      SmejjCom/smejj-app-frontend, committet und pusht (Deploy-from-Branch).
#   2) Live-Verifikation: wartet auf GitHub Pages und prueft die Live-Dateien.
# Danach optional (fuer Full-Page-Scroll auf Amazon & Co.):
#   bash scripts/deploy/build_and_push_remote_browser_image.sh
#   + Salad Container Group smejj-remote-browser-live neu ausrollen.
#
# Aufruf:
#   bash scripts/deploy/deploy_browser_scroll_fix_20260709.sh
#   (optional: SMEJJ_FRONTEND_REPO_DIR=/pfad/zum/repo voranstellen)
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="browser-pane-20260709-1"
SHELL_VERSION="smejj-shell-v93"
REPO_URL="git@github.com:SmejjCom/smejj-app-frontend.git"
REPO_URL_HTTPS="https://github.com/SmejjCom/smejj-app-frontend.git"

# --- 1. Frontend-Repo finden oder klonen -------------------------------------
REPO_DIR="${SMEJJ_FRONTEND_REPO_DIR:-}"
if [ -z "$REPO_DIR" ]; then
  for candidate in \
    "$HOME/smejj-app-frontend" \
    "$HOME/Projects/smejj-app-frontend" \
    "$HOME/Developer/smejj-app-frontend" \
    "$HOME/Documents/smejj-app-frontend" \
    "$HOME/git/smejj-app-frontend"; do
    if [ -d "$candidate/.git" ]; then REPO_DIR="$candidate"; break; fi
  done
fi
if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$HOME/smejj-app-frontend"
  echo "smejj.com: kein lokales Repo gefunden — klone nach $REPO_DIR ..."
  git clone "$REPO_URL" "$REPO_DIR" 2>/dev/null || git clone "$REPO_URL_HTTPS" "$REPO_DIR"
fi
echo "smejj.com: Frontend-Repo: $REPO_DIR"
cd "$REPO_DIR"
git pull --ff-only

# --- 2. Dateien uebernehmen (Mapping: public/* -> assets/*, Root-Dateien) ----
if [ ! -d "$REPO_DIR/assets" ]; then
  echo "FEHLER: $REPO_DIR/assets existiert nicht — falsches Repo?" >&2
  exit 1
fi
cp "$APP_ROOT/public/browser-pane.js"        "$REPO_DIR/assets/browser-pane.js"
cp "$APP_ROOT/public/browser-pane-render.js" "$REPO_DIR/assets/browser-pane-render.js"
cp "$APP_ROOT/public/browser-pane.css"       "$REPO_DIR/assets/browser-pane.css"
cp "$APP_ROOT/public/index.html"             "$REPO_DIR/index.html"
cp "$APP_ROOT/public/sw.js"                  "$REPO_DIR/sw.js"

# --- 3. Sicherheitscheck: keine Secrets, korrekte Versionen -------------------
grep -q "$VERSION" "$REPO_DIR/index.html"
grep -q "$SHELL_VERSION" "$REPO_DIR/sw.js"
grep -q "browser-pane-render.js" "$REPO_DIR/sw.js"
if grep -rniE "(api[_-]?key|secret|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}" \
  "$REPO_DIR/assets/browser-pane.js" "$REPO_DIR/assets/browser-pane-render.js"; then
  echo "FEHLER: potentielles Secret gefunden — Abbruch." >&2
  exit 1
fi

# --- 4. Commit + Push ----------------------------------------------------------
git add assets/browser-pane.js assets/browser-pane-render.js assets/browser-pane.css index.html sw.js
if git diff --cached --quiet; then
  echo "smejj.com: keine neuen Datei-Aenderungen — pruefe unpushed Commits."
else
  git commit -m "browser-pane: Scroll ueberall, Full-Page-Remote, Tab-Zustand (capsule browser-scroll-fix-2026-07-09, sw v93)"
fi
# Push ist idempotent — faengt auch frueher committete, nie gepushte Staende ab.
# Fail-closed: keine interaktiven Passwort-/Token-Prompts. Erst HTTPS mit
# gespeicherten Credentials, sonst SSH mit BatchMode — sonst klarer Fehler.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10"
if ! git push origin HEAD 2>/dev/null; then
  echo "smejj.com: HTTPS-Push ohne gespeicherte Credentials — versuche SSH ..."
  git remote set-url origin "$REPO_URL"
  git push origin HEAD || { echo "FEHLER: Push weder ueber HTTPS noch SSH moeglich (keine Credentials/Keys)."; exit 1; }
fi
echo "smejj.com: Push OK — GitHub Pages baut jetzt (ca. 1-3 Minuten)."

# --- 5. Live-Verifikation -------------------------------------------------------
echo "smejj.com: warte auf Live-Deployment ..."
for i in $(seq 1 30); do
  if curl -fsS "https://smejj.com/?nocache=$i" | grep -q "$VERSION"; then break; fi
  sleep 10
done
curl -fsS "https://smejj.com/" | grep -q "$VERSION" && echo "LIVE OK: index.html laedt $VERSION"
curl -fsS "https://smejj.com/sw.js" | grep -q "$SHELL_VERSION" && echo "LIVE OK: sw.js ist $SHELL_VERSION"
curl -fsS "https://smejj.com/assets/browser-pane.js" | grep -q "browser-pane-render.js" && echo "LIVE OK: browser-pane.js nutzt Render-Modul"
curl -fsS "https://smejj.com/assets/browser-pane-render.js" | grep -q "bp-remote-scroll" && echo "LIVE OK: Remote-Ansicht ist scrollbar"
curl -fsS "https://smejj.com/assets/browser-pane.css" | grep -q "visibility: hidden" && echo "LIVE OK: Tab-Scroll-Fix (visibility) aktiv"

echo
echo "smejj.com: Frontend-Deploy fertig. Fuer Full-Page-Scroll im Remote-Modus jetzt:"
echo "  bash scripts/deploy/build_and_push_remote_browser_image.sh"
echo "  danach Salad Container Group smejj-remote-browser-live neu ausrollen und pruefen:"
echo "  curl -s 'https://loganberry-fruit-e3n6k5n10h68cawn.salad.cloud/api/browser/remote?url=https%3A%2F%2Fexample.com' | grep -o '\"capture\"' && echo 'WORKER v3 LIVE OK'"

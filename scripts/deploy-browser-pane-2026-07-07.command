#!/bin/bash
# smejj.com — Deploy "Integrierter Browser (Codex-Stil)" — 2026-07-07
# Schriftliche Freigabe: Wof Kadavanich, 2026-07-07 (siehe
# docs/release/BROWSER_PANE_RELEASE_2026-07-07.md).
#
# Warum dieses Skript: Das .git im Google-Drive-Ordner ist beschaedigt/gesperrt
# (index.lock, Operation not permitted). Deshalb — wie beim bewaehrten
# rescue-commit — wird auf die LOKALE PLATTE kopiert und von dort mit deinem
# SSH-Key committet und gepusht. Google Drive wird NICHT veraendert (nur Log in tmp/).
#
# Doppelklick im Finder ODER:  bash "scripts/deploy-browser-pane-2026-07-07.command"
set -uo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$HOME/smejj.com App"
REMOTE_URL="git@github.com:SmejjCom/smejj.com-app.git"
COMMIT_MSG="smejj.com: Integrierter Browser (Codex-Stil) + Server-Proxy /api/browser/fetch mit Rate-Limit & Origin-Bindung"

mkdir -p "$SOURCE_DIR/tmp"
LOG="$SOURCE_DIR/tmp/deploy-browser-pane-2026-07-07.log"
exec > >(tee "$LOG") 2>&1

fail() { echo "FAIL: $*"; echo "=== ABBRUCH $(date '+%H:%M:%S') ==="; exit 1; }

echo "=== smejj.com Deploy Browser-Pane $(date '+%Y-%m-%d %H:%M:%S') ==="
echo "Quelle: $SOURCE_DIR"
echo "Ziel:   $TARGET_DIR"

# --- 0. SSH-Diagnose + GitHub-Auth ---
echo "--- ~/.ssh Inhalt ---"
ls -la "$HOME/.ssh" 2>/dev/null || echo "(kein ~/.ssh Verzeichnis)"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15"
DEDICATED="$HOME/.ssh/smejjcom_github_ed25519"
if [ -f "$DEDICATED" ]; then
  SSH_CMD="ssh -i $DEDICATED -o IdentitiesOnly=yes $SSH_OPTS"
  echo "SSH: dedizierter Key gefunden ($DEDICATED)"
else
  SSH_CMD="ssh $SSH_OPTS"
  echo "SSH: dedizierter Key FEHLT — versuche Standard-Keys/Agent"
fi
echo "--- GitHub-Auth-Test ---"
AUTH_OUT="$(GIT_SSH_COMMAND="$SSH_CMD" $SSH_CMD -T git@github.com 2>&1 || true)"
echo "$AUTH_OUT"
echo "$AUTH_OUT" | grep -q "successfully authenticated" \
  || fail "GitHub-Auth fehlgeschlagen. SSH-Key auf diesem Mac pruefen (~/.ssh/smejjcom_github_ed25519) oder neu bei github.com hinterlegen."
echo "STEP0_OK GitHub-Auth funktioniert."

set -e

# --- 1. Auf lokale Platte kopieren (Drive bleibt unveraendert) ---
mkdir -p "$TARGET_DIR"
rsync -a \
  --exclude ".git/" \
  --exclude ".git-alt-"'*' \
  --exclude "node_modules/" \
  --exclude ".pnpm-store/" \
  --exclude ".DS_Store" \
  --exclude "Memory_Bank.md.bak" \
  "$SOURCE_DIR/" "$TARGET_DIR/"
echo "STEP1_OK Kopie fertig."
cd "$TARGET_DIR"

# --- 2. Frisches Git auf Basis origin/main ---
if [ -d .git ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  echo "Vorhandenes .git im Ziel — Rollback-Kopie: .git-alt-$TS"
  mv .git ".git-alt-$TS"
fi
git init >/dev/null
git symbolic-ref HEAD refs/heads/main
git config user.name "Wof Kadavanich"
git config user.email "smejjcom@gmail.com"
git config core.sshCommand "$SSH_CMD"
git remote add origin "$REMOTE_URL"
echo "Hole origin/main ..."
git fetch origin main
git update-ref refs/heads/main "$(git rev-parse FETCH_HEAD)"
git reset --quiet
git branch --set-upstream-to=origin/main main >/dev/null 2>&1 || true
BASE_SHA="$(git rev-parse --short HEAD)"
echo "STEP2_OK Basis origin/main = $BASE_SHA"

# --- 2b. ROLLBACK-PUNKT: Tag auf den aktuellen Live-Stand VOR dem Release ---
ROLLBACK_TAG="pre-browser-pane-$(date +%Y%m%d-%H%M%S)"
git tag -a "$ROLLBACK_TAG" -m "Rollback-Punkt vor Browser-Pane-Release" HEAD
git push origin "refs/tags/$ROLLBACK_TAG"
echo "STEP2b_OK Rollback-Tag gepusht: $ROLLBACK_TAG (zum Zuruecksetzen: git reset --hard $ROLLBACK_TAG)"

# --- 3. Stagen + Commit (nur wenn es Aenderungen gibt) ---
git add -A -- ':(exclude)Memory_Bank.md.bak'
echo "Dateien im Commit: $(git diff --cached --name-only | wc -l | tr -d ' ')"
git diff --cached --stat | tail -8
if git diff --cached --quiet; then
  echo "STEP3_SKIP origin/main bereits identisch — nichts zu committen."
else
  git commit -m "$COMMIT_MSG" >/dev/null
  echo "STEP3_OK Commit: $(git rev-parse --short HEAD)"
fi

# --- 4. Push main ---
git push origin main
echo "STEP4_OK main gepusht: $(git ls-remote origin main | cut -f1 | head -c 12)"

# --- 5. Frontend live: gh-pages aus public/ ---
# GitHub Pages ist auf Branch gh-pages / root gesetzt. subtree push bringt den
# aktuellen public/-Inhalt dorthin (Service-Worker-Cache v76 zieht die neuen Assets).
echo "Deploye Frontend nach gh-pages ..."
git push origin "$(git subtree split --prefix public main)":refs/heads/gh-pages --force
echo "STEP5_OK gh-pages aktualisiert — https://smejj.com/ zieht die neuen Assets."

echo
echo "=== FERTIG Code+Frontend $(date '+%H:%M:%S') ==="
echo "NAECHSTER SCHRITT (Control-Server, nur wenn Docker Desktop laeuft):"
echo "  bash scripts/deploy/build_and_push_control_image.sh"
echo "  danach im Salad-Portal die Container Group smejj-control auf"
echo "  ghcr.io/smejjcom/smejj-control:latest neu ausrollen (Redeploy)."
echo "Ab jetzt nur noch in $TARGET_DIR arbeiten (nicht im Google-Drive-Ordner)."

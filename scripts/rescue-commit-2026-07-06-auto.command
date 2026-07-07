#!/bin/bash
# smejj.com — Rettungs-Commit 2026-07-06 (VOLLAUTOMATISCH, v2)
# Schriftliche Freigabe von Wof Kadavanich am 2026-07-06 erteilt.
# v2: keine interaktiven Prompts mehr (Host-Key accept-new, BatchMode),
#     SSH-Key-Erkennung mit Diagnose, klare FAIL-Meldungen im Log.
# Google Drive wird NICHT veraendert (nur Log unter tmp/, tmp/ ist gitignored).
set -uo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$HOME/smejj.com App"
REMOTE_URL="git@github.com:SmejjCom/smejj.com-app.git"
COMMIT_MSG="smejj.com: Cloudflare-Exit, Salad-Control-Server, Live-Internet, RAG, 15-Sprachen-SEO/PWA + Testbericht"

mkdir -p "$SOURCE_DIR/tmp"
LOG="$SOURCE_DIR/tmp/rescue-commit-log-2026-07-06-v2.txt"
exec > >(tee "$LOG") 2>&1

fail() { echo "FAIL: $*"; echo "=== ABBRUCH $(date '+%H:%M:%S') ==="; exit 1; }

echo "=== smejj.com Rettungs-Commit (auto v2) $(date '+%Y-%m-%d %H:%M:%S') ==="
echo "Quelle: $SOURCE_DIR"
echo "Ziel:   $TARGET_DIR"

# --- 0. SSH-Diagnose (nur Dateinamen, keine Schluesselinhalte) ---
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
if ! echo "$AUTH_OUT" | grep -q "successfully authenticated"; then
  fail "GitHub-Authentifizierung fehlgeschlagen. Es fehlt ein gueltiger SSH-Key auf diesem Mac. Loesung: Key von anderem Rechner nach ~/.ssh/smejjcom_github_ed25519 kopieren ODER neuen Key erzeugen (ssh-keygen -t ed25519) und bei github.com -> Settings -> SSH keys hinterlegen."
fi
echo "STEP0_OK GitHub-Auth funktioniert."

set -e

# --- 1. Kopieren (Drive bleibt unveraendert) ---
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

# --- 2. Frisches Git verbinden ---
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

echo "Hole origin/main von GitHub ..."
git fetch origin main
git update-ref refs/heads/main "$(git rev-parse FETCH_HEAD)"
git reset --quiet
git branch --set-upstream-to=origin/main main >/dev/null 2>&1 || true
echo "STEP2_OK Basis origin/main = $(git rev-parse --short HEAD)"

# --- 3. Stagen + Commit ---
git add -A -- ':(exclude)Memory_Bank.md.bak'
echo "--- Commit-Inhalt (Statistik) ---"
git diff --cached --stat | tail -5
echo "Dateien im Commit: $(git diff --cached --name-only | wc -l | tr -d ' ')"

if git diff --cached --quiet; then
  echo "STEP3_SKIP Nichts zu committen — origin/main bereits identisch."
  echo "=== FERTIG (ohne Push) ==="
  exit 0
fi

git commit -m "$COMMIT_MSG" >/dev/null
echo "STEP3_OK Commit: $(git rev-parse HEAD)"
git show --stat --oneline -s HEAD | head -3

# --- 4. Push (freigegeben, ohne Rueckfrage) ---
git push origin main
echo "STEP4_OK Push nach origin/main erfolgreich."
echo "Remote-Stand: $(git ls-remote origin main | cut -f1)"
echo "=== FERTIG $(date '+%H:%M:%S') — ab jetzt nur noch in $TARGET_DIR arbeiten ==="

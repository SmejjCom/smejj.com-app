#!/bin/bash
# smejj.com — Rettungs-Commit 2026-07-06
# Zweck: Das .git auf Google Drive ist irreparabel beschaedigt (141 fehlende Objekte,
# fsck-verifiziert). Dieses Skript setzt den dokumentierten Umzugsweg um
# (docs/deployment/UMZUG_LOKALE_PLATTE.md) und committet den kompletten aktuellen
# Stand ATOMAR auf origin/main. Es loescht NICHTS auf Google Drive.
#
# Ablauf:
#   1. Arbeitskopie von Drive nach ~/smejj.com App KOPIEREN (rsync, ohne .git/node_modules)
#   2. Frisches Git verbinden, origin/main von GitHub holen (SSH-Key liegt auf diesem Mac)
#   3. Alle Aenderungen stagen (Memory_Bank.md.bak ausgeschlossen) und committen
#   4. Push erst nach deiner Bestaetigung (Enter)
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$HOME/smejj.com App"
REMOTE_URL="git@github.com:SmejjCom/smejj.com-app.git"
COMMIT_MSG="smejj.com: Cloudflare-Exit, Salad-Control-Server, Live-Internet, RAG, 15-Sprachen-SEO/PWA + Testbericht"
SSH_CMD="ssh -i ~/.ssh/smejjcom_github_ed25519 -o IdentitiesOnly=yes"

echo "smejj.com Rettungs-Commit"
echo "Quelle: $SOURCE_DIR"
echo "Ziel:   $TARGET_DIR"
echo

# --- 1. Kopieren (Drive bleibt unveraendert als Backup) ---
mkdir -p "$TARGET_DIR"
rsync -a --info=progress2 \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude ".pnpm-store/" \
  --exclude ".DS_Store" \
  --exclude "Memory_Bank.md.bak" \
  "$SOURCE_DIR/" "$TARGET_DIR/"
echo "Kopie fertig."
echo

cd "$TARGET_DIR"

# --- 2. Frisches Git verbinden ---
if [ -d .git ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  echo "Vorhandenes .git im Ziel gefunden — wird als Rollback beiseitegelegt: .git-alt-$TS"
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
git reset --quiet   # Index = origin/main, Arbeitskopie bleibt unangetastet
git branch --set-upstream-to=origin/main main >/dev/null 2>&1 || true
echo "Basis: origin/main = $(git rev-parse --short HEAD)"
echo

# --- 3. Stagen + Commit ---
git add -A -- ':(exclude)Memory_Bank.md.bak'

echo "================= WAS COMMITTET WIRD ================="
git diff --cached --stat | tail -5
echo
git status --porcelain=v1 --cached >/dev/null 2>&1 || true
COUNT="$(git diff --cached --name-only | wc -l | tr -d ' ')"
echo "Dateien im Commit: $COUNT"
echo "Message: $COMMIT_MSG"
echo "======================================================"
echo

if git diff --cached --quiet; then
  echo "Nichts zu committen — origin/main ist bereits identisch. Abbruch ohne Aenderung."
  read -r -p "Enter zum Schliessen." _
  exit 0
fi

git commit -m "$COMMIT_MSG" >/dev/null
echo "Commit erstellt: $(git rev-parse --short HEAD)"
git show --stat --oneline -s HEAD
echo

# --- 4. Push nur nach Bestaetigung ---
read -r -p "PUSH nach GitHub (origin/main)? Enter = ja, Ctrl+C = abbrechen. " _
git push origin main
echo
echo "FERTIG. Naechste Schritte:"
echo "  - Ab jetzt NUR noch in \"$TARGET_DIR\" arbeiten (Drive-Ordner = eingefrorenes Backup)."
echo "  - In Cowork/Claude kuenftig diesen neuen Ordner auswaehlen."
echo "  - Live-Site ist von diesem Quell-Commit unberuehrt (Frontend/Salad laufen bereits aktuell)."
read -r -p "Enter zum Schliessen." _

#!/bin/bash
# smejj.com — Backend-Repo-Voll-Sync (freigegeben 2026-07-15)
# Baut EINEN Commit mit der Arbeitskopie (Quelle der Wahrheit) auf origin/main
# und pusht ihn. Arbeitsdateien werden zu KEINEM Zeitpunkt verändert.
set -u
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
LOG="$REPO/tmp/git-sync-2026-07-15.log"
mkdir -p "$REPO/tmp"
exec > >(tee "$LOG") 2>&1
cd "$REPO" || { echo "FEHLER: Repo-Pfad nicht gefunden"; exit 1; }
echo "== smejj.com Repo-Sync $(date) =="

# 1) Alten Git-Lock beiseite legen (verschieben, nicht löschen)
if [ -f .git/refs/heads/main.lock ]; then
  mv .git/refs/heads/main.lock ".git/main.lock.alt-$(date +%s)"
  echo "Alter main.lock beiseite gelegt."
fi
if [ -f .git/index.lock ]; then
  mv .git/index.lock ".git/index.lock.alt-$(date +%s)"
  echo "Alter index.lock beiseite gelegt."
fi

# 2) Remote-Stand holen (nur .git, Arbeitskopie unberührt)
git fetch origin main || { echo "FEHLER: fetch fehlgeschlagen (SSH-Key?)"; exit 2; }
echo "Remote-HEAD: $(git rev-parse origin/main)"

# 3) HEAD/Index auf Remote setzen — Arbeitskopie bleibt exakt wie sie ist
git reset --mixed origin/main >/dev/null || { echo "FEHLER: reset"; exit 3; }

# 4) Gesamte Arbeitskopie stagen (gemäß .gitignore)
git add -A || { echo "FEHLER: add"; exit 4; }
echo "== Zusammenfassung der Änderungen =="
git diff --cached --stat | tail -5
echo "-- Gelöschte Pfade (im Repo-Verlauf weiterhin vorhanden):"
git diff --cached --name-status | awk '$1=="D"{print "  "$2}' | head -40
LOESCH=$(git diff --cached --name-status | awk '$1=="D"' | wc -l | tr -d ' ')
echo "Gelöschte Pfade gesamt: $LOESCH"

# 5) Committen + pushen (fast-forward auf origin/main)
git -c user.name="SmejjCom" -c user.email="smejjcom@gmail.com" commit -m "smejj.com: Voll-Sync der Arbeitskopie (Cline-Go-Live v62, Maus-Engine + kombiniertes Release, Frontend-Token-Fix, Doku/Memory_Bank; freigegeben 2026-07-15)" || { echo "FEHLER: commit (nichts zu committen?)"; exit 5; }
git push origin main || { echo "FEHLER: push fehlgeschlagen"; exit 6; }
echo "== ERFOLG: $(git rev-parse HEAD) gepusht =="

#!/bin/bash
# smejj.com — Arbeitskopie von Google Drive auf die lokale Platte KOPIEREN (kein Loeschen).
# Doppelklick im Finder genuegt. Sicher: reines rsync-Kopieren, Drive bleibt unveraendert
# und dient danach als Backup. Grund: Google Drive beschaedigt .git und erzeugt
# Sync-Konflikte, wenn mehrere Sessions parallel arbeiten.
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$HOME/smejj.com App"

echo "smejj.com Umzug auf lokale Platte"
echo "Quelle:  $SOURCE_DIR"
echo "Ziel:    $TARGET_DIR"
echo

if [ -e "$TARGET_DIR" ]; then
  echo "Ziel existiert bereits — es wird aktualisiert (nur neuere Dateien)."
fi

mkdir -p "$TARGET_DIR"

# node_modules und beschaedigtes .git ausschliessen; beides wird lokal frisch erzeugt.
rsync -a --info=progress2 \
  --exclude "node_modules/" \
  --exclude ".git/" \
  --exclude ".DS_Store" \
  "$SOURCE_DIR/" "$TARGET_DIR/"

echo
echo "Kopie fertig. Naechste Schritte im Ziel-Ordner:"
echo "  1. cd \"$TARGET_DIR\""
echo "  2. npm install"
echo "  3. Frisches Git aus dem Rettungs-Repo verbinden (SmejjCom/smejj-com-source, git-Bundle)"
echo "     oder: git init && git add -A && git commit -m 'Stand von Google Drive uebernommen'"
echo "  4. npm run check && npm run check:guidelines  (Verifikation)"
echo "  5. In Cowork/Claude kuenftig DIESEN Ordner auswaehlen."
echo
echo "Der Google-Drive-Ordner bleibt unveraendert als Backup bestehen."
read -r -p "Fertig. Enter zum Schliessen." _

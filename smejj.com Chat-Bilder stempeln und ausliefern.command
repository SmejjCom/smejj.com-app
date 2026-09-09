#!/bin/zsh
# Holt die Kaskade aus dem Arbeitszweig — der App-Ordner kann auf einem fremden Zweig stehen.
cd "$(dirname "$0")" || exit 1
git fetch -q origin feature/design-v11
git show origin/feature/design-v11:scripts/einmal/chat-medien-parken-2026-09-09.sh > /tmp/chat-medien-parken-2026-09-09.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/chat-medien-parken-2026-09-09.sh 2>&1 | tee "$HOME/Desktop/chat-medien-parken-2026-09-09.log"
echo; echo "Fenster kann geschlossen werden."

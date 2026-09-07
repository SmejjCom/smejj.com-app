#!/bin/zsh
# Holt die Kaskade aus dem Arbeitszweig — der App-Ordner kann auf einem fremden Zweig stehen.
cd "$(dirname "$0")" || exit 1
git fetch -q origin feature/design-v11
git show origin/feature/design-v11:scripts/einmal/start-buendel-2026-09-07.sh > /tmp/start-buendel-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/start-buendel-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/start-buendel-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

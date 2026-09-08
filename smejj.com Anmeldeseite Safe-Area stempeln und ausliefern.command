#!/bin/zsh
# Holt die Kaskade aus dem QA-Zweig — der App-Ordner kann auf einem fremden Zweig stehen.
cd "$(dirname "$0")" || exit 1
git fetch -q origin feature/responsive-qa-2026-09-07
git show origin/feature/responsive-qa-2026-09-07:scripts/einmal/anmeldeseite-safe-area-2026-09-07.sh > /tmp/anmeldeseite-safe-area-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/anmeldeseite-safe-area-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/anmeldeseite-safe-area-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

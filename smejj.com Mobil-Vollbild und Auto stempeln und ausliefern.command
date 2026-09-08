#!/bin/zsh
# smejj.com — Doppelklick des Betreibers (2026-09-07): Mobil-Vollbild, schlankes
# Dock und Auto-Wahl ohne Sackgasse — Start-Lock stempeln, chatClient.js + sw.js
# (v795) ausliefern. Holt die Kaskade aus dem QA-Zweig; der App-Ordner kann auf
# einem fremden Zweig stehen.
cd "$(dirname "$0")" || exit 1
export SMEJJ_APP_ORDNER="$PWD"
git fetch -q origin feature/responsive-qa-2026-09-07
git show origin/feature/responsive-qa-2026-09-07:scripts/einmal/mobil-vollbild-dock-2026-09-07.sh > /tmp/mobil-vollbild-dock-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/mobil-vollbild-dock-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/mobil-vollbild-dock-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

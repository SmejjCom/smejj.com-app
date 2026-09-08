#!/bin/zsh
# smejj.com — Doppelklick des Betreibers (2026-09-07, Runde 2): Touch-Ziele 44 px
# auf Tablets/Querformat und Rest-Ziele am Handy — Start-Lock stempeln, sw.js
# (v796) ausliefern. Holt die Kaskade aus dem QA-Zweig.
cd "$(dirname "$0")" || exit 1
export SMEJJ_APP_ORDNER="$PWD"
git fetch -q origin feature/responsive-qa-2026-09-07
git show origin/feature/responsive-qa-2026-09-07:scripts/einmal/mobil-ziele-2026-09-07.sh > /tmp/mobil-ziele-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/mobil-ziele-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/mobil-ziele-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

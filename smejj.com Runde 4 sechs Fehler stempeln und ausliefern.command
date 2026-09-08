#!/bin/zsh
# smejj.com — Doppelklick des Betreibers (2026-09-07, Runde 4): die sechs Fehler der
# Abend-Liste — Start-Lock stempeln, Marken heben, sw.js (live+1) ausliefern.
cd "$(dirname "$0")" || exit 1
export SMEJJ_APP_ORDNER="$PWD"
git fetch -q origin feature/responsive-qa-2026-09-07
git show origin/feature/responsive-qa-2026-09-07:scripts/einmal/mobil-runde4-2026-09-07.sh > /tmp/mobil-runde4-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/mobil-runde4-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/mobil-runde4-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

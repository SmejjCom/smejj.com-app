#!/bin/zsh
# smejj.com — Doppelklick des Betreibers (2026-09-07, Runde 3): Schreibfeld-Knoepfe,
# Code-Leiste und Banner auf Tablets 44 px — Start-Lock stempeln, sw.js (v798) ausliefern. Holt die Kaskade aus dem QA-Zweig.
cd "$(dirname "$0")" || exit 1
export SMEJJ_APP_ORDNER="$PWD"
git fetch -q origin feature/responsive-qa-2026-09-07
git show origin/feature/responsive-qa-2026-09-07:scripts/einmal/mobil-ziele3-2026-09-07.sh > /tmp/mobil-ziele3-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/mobil-ziele3-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/mobil-ziele3-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

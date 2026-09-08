#!/bin/zsh
# smejj.com — Doppelklick des Betreibers (2026-09-07, Runde 4b): nur Service-Worker-Sprung
# (live+1) mit Start-Lock-Stempel, damit die App die Nachzuege der Runde 4 holt.
cd "$(dirname "$0")" || exit 1
export SMEJJ_APP_ORDNER="$PWD"
git fetch -q origin feature/responsive-qa-2026-09-07
git show origin/feature/responsive-qa-2026-09-07:scripts/einmal/sw-sprung-2026-09-07.sh > /tmp/sw-sprung-2026-09-07.sh || { echo "Kaskade nicht gefunden"; exit 1; }
zsh /tmp/sw-sprung-2026-09-07.sh 2>&1 | tee "$HOME/Desktop/sw-sprung-2026-09-07.log"
echo; echo "Fenster kann geschlossen werden."

#!/bin/zsh
cd "$(dirname "$0")" || exit 1
zsh scripts/einmal/schutz-nachziehen-2026-09-08.sh 2>&1 | tee "$HOME/Desktop/smejj-schutz-nachziehen.log"
echo
echo "Fertig. Das Fenster kann geschlossen werden."

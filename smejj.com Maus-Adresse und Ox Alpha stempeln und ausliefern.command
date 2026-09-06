#!/bin/zsh
cd "$(dirname "$0")" || exit 1
./scripts/einmal/maus-adresse-laenderendung-2026-09-06.sh 2>&1 | tee scripts/einmal/maus-adresse-laenderendung-2026-09-06.log
echo; echo "Fenster kann geschlossen werden."

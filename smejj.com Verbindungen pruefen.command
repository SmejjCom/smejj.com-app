#!/bin/zsh
# smejj.com — zeigt in einem Durchgang, ob alle Dienste noch miteinander
# verbunden sind: Spaceship-DNS, GitHub Pages, Zeabur, IDrive e2, Codeberg.
# Aendert NICHTS. Der Lauf braucht kein Geheimnis und kostet nichts.
cd "$(dirname "$0")" || exit 1
node scripts/diagnose/kette-pruefen.mjs 2>&1 | tee "$HOME/Desktop/smejj-verbindungen.log"
echo
echo "Bericht liegt auch auf dem Schreibtisch: smejj-verbindungen.log"
echo "Fenster kann geschlossen werden."

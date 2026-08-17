#!/bin/zsh
# smejj.com — Anbieter-Tresor scharfschalten (Doppelklick-Datei).
# Wuerfelt das Tresor-Geheimnis LOKAL, setzt es per Zeabur-API fuer
# smejj-control und wartet auf den Neustart. Danach in den smejj-
# Einstellungen den Cline-Key erneut "sicher verbinden".
cd "$(dirname "$0")"
CONFIRM_TRESOR_SCHARF=YES node scripts/deploy/provider_tresor_scharfschalten.mjs
echo
echo "Fertig. Dieses Fenster kann geschlossen werden."
read -k 1 -s

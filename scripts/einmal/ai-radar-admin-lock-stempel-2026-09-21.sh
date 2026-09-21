#!/bin/zsh
# smejj ai radar (Nr. 86) — Admin-Lock neu einfrieren.
#
# WARUM DIESER SCHRITT: Der neue Autopilot steht im Bereich "Modelle & Wissen".
# Die Bereichszuordnung (control-server/src/admin/opsAutopilotenBereiche.js)
# liegt unter dem Admin-Lock. Die Sperre hat also RECHT, wenn sie anschlaegt —
# sie kennt den neuen Eintrag noch nicht. Einfrieren darf sie nur der Betreiber;
# der Auto-Modus einer Sitzung blockiert `--freeze` ausdruecklich.
#
# Dieses Skript aendert KEINEN Code. Es prueft und stempelt.
set -e
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd "$REPO"

echo "1/3  Stand vor dem Stempel:"
node scripts/check-admin-lock.mjs || true

echo
echo "2/3  Einfrieren mit dem Wortlaut des Betreibers:"
node scripts/check-admin-lock.mjs --freeze --confirm "smejj ai radar als zweite Schiene einrichten und in den Autopilot-Adminbereich integrieren"

echo
echo "3/3  Stand danach:"
node scripts/check-admin-lock.mjs

echo
echo "Fertig. Danach committen und pushen:"
echo "  git add docs/security/admin-lock-manifest.json && git commit -m 'chore(lock): Admin-Lock nach smejj ai radar (Nr. 86) gestempelt' && git push"

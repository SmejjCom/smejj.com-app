#!/bin/zsh
# smejj ai radar (Nr. 86) — Admin-Lock neu einfrieren.
#
# WARUM DIESER SCHRITT: Der neue Autopilot steht im Bereich "Modelle & Wissen"
# und bringt eine eigene Konsolenseite mit. Fuenf Dateien der Adminkette aendern
# sich dadurch; sie liegen unter dem Admin-Lock. Die Sperre hat also RECHT, wenn
# sie anschlaegt — sie kennt den neuen Eintrag noch nicht.
#
# FALLE VOM 21.09. (gemessen): Der erste Anlauf stempelte im App-Ordner. Der ist
# eine eigene Arbeitskopie und war AELTER als der Zweig — dort lag der Radar-Code
# gar nicht. Gestempelt wurde damit der alte Stand, und die Sperre blieb rot.
# Deshalb arbeitet dieses Skript in einer FRISCHEN Kopie der Zweigspitze und
# fasst den App-Ordner nicht an (dort arbeiten andere Sitzungen weiter).
set -e
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
ZWEIG="feature/design-start-chat-2026-09-13"
KOPIE="/private/tmp/smejj-stempel-ai-radar"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO"
echo "1/5  Zweigspitze holen …"
git fetch -q origin "$ZWEIG"

echo "2/5  Frische Kopie anlegen ($KOPIE) …"
git worktree remove --force "$KOPIE" >/dev/null 2>&1 || true
rm -rf "$KOPIE"
git worktree add -q --detach "$KOPIE" "origin/$ZWEIG"
cd "$KOPIE"
echo "     Stand: $(git log --oneline -1)"

echo
echo "3/5  Was die Sperre JETZT sieht:"
node scripts/check-admin-lock.mjs || true

echo
echo "4/5  Einfrieren mit dem Wortlaut des Betreibers …"
node scripts/check-admin-lock.mjs --freeze --confirm "smejj ai radar als zweite Schiene fuer autonome Internetrecherche einrichten und in den Autopilot-Adminbereich integrieren"

echo
echo "5/5  Stempel ablegen und hochladen …"
git add docs/security/admin-lock-manifest.json
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q -m "chore(lock): Admin-Lock nach smejj ai radar (Nr. 86) gestempelt"
git push -q origin "HEAD:$ZWEIG"

echo
echo "Ergebnis:"
node scripts/check-admin-lock.mjs && echo "  admin-lock GRUEN" || echo "  admin-lock weiterhin rot — bitte melden"
cd "$REPO" && git worktree remove --force "$KOPIE" >/dev/null 2>&1 || true

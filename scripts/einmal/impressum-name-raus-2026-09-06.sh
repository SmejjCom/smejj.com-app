#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06: Personenname aus dem Impressum entfernen.
#
# AUFTRAG (Betreiber, 06.09.): "https://smejj.com/impressum.html — Name: Wof Kadavanich,
# raus nehmen, soll nur iMild LLC bleiben."
# GEAENDERT: die Zeile "Vertretungsberechtigt: ..." entfaellt; § 18 MStV nennt iMild LLC.
# CODE: 84334828. impressum.html steht NICHT im Start-Lock-Manifest, der Lock bleibt
# unberuehrt (die vier offenen Sperr-Stempel gehoeren zu einem anderen Vorhaben).
# SICHERHEITSNETZ: live muss byte-gleich mit dem Stand VOR der Aenderung sein.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="5448a052"
CODE_COMMIT="84334828"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }

echo "== 1. Inhalt pruefen"
for f in public/impressum.html public/assets/impressum.html; do
  git diff --quiet -- "$f" || { echo "ABBRUCH: $f hat ungespeicherte Aenderungen."; exit 1; }
  grep -qi "kadavanich" "$f" && { echo "ABBRUCH: der Name steht noch in $f."; exit 1; }
  grep -q "iMild LLC" "$f" || { echo "ABBRUCH: iMild LLC fehlt in $f."; exit 1; }
done
cmp -s public/impressum.html public/assets/impressum.html || { echo "ABBRUCH: die beiden Kopien sind ungleich."; exit 1; }
echo "  ok — kein Personenname, iMild LLC steht, beide Kopien gleich"

echo "== 2. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
VOR=$(git -C "$REPO" show "$BASIS_VOR_AENDERUNG:public/impressum.html" | shasum -a 256 | cut -c1-16)
for p in impressum.html assets/impressum.html; do
  h=$(git show "origin/main:$p" 2>/dev/null | shasum -a 256 | cut -c1-16)
  [ "$h" = "$VOR" ] || { echo "ABBRUCH: live/$p ist FREMD ($h statt $VOR) — nicht ueberschreiben."; exit 1; }
  echo "  gleich  $p"
done

echo "== 3. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
cp "$REPO/public/impressum.html" "$KLON/impressum.html" || { echo "ABBRUCH: Kopie."; exit 1; }
cp "$REPO/public/impressum.html" "$KLON/assets/impressum.html" || { echo "ABBRUCH: Kopie assets."; exit 1; }
git add impressum.html assets/impressum.html
git status --short
git commit -q -m "deploy(impressum): Personenname entfernt, es bleibt iMild LLC — Quelle smejj.com-app $CODE_COMMIT" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 4. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/impressum.html" | cut -c1-16)
for i in $(seq 1 30); do
  L=$(curl -s -m 15 "https://smejj.com/impressum.html?n=$RANDOM")
  H=$(printf '%s' "$L" | shasum -a 256 | cut -c1-16)
  NAME=$(printf '%s' "$L" | grep -ci "kadavanich")
  echo "$(date +%H:%M:%S)  hash=$H  name-treffer=$NAME  (erwartet $ERW / 0)"
  if [ "$H" = "$ERW" ] && [ "$NAME" -eq 0 ]; then
    echo; echo "FERTIG — live: Impressum byte-gleich, kein Personenname mehr."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter: curl -s https://smejj.com/impressum.html | grep -ci kadavanich"
exit 1

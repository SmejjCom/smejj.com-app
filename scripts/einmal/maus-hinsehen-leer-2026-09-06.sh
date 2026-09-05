#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06: Maus — nichts gelesen ist ein Fehlschlag,
# Hinsehen ueberlebt Sitzungsverlust — stempeln und ausliefern.
#
# BEFUND (Testreihe 06.09. frueh nach v773): "Lesen: birth_date → »«" dreimal — ein leeres
# Leseergebnis zaehlte nicht als Fehlschlag, das Modell las dieselbe leere Klasse erneut.
# Und: "Die Maus konnte die Seite nicht ansehen." ohne Grund und ohne Neuaufbau, obwohl
# beides fuer Aktionen laengst da war. Beides behoben in public/browser-pane-maus.js.
#
# CODE IST COMMITTET: 5717dbce (125 Tests gruen, Marken/Assets/Precache gruen). Start-Lock
# (index.html, app.js b142, browser-pane.js, sw.js v775) braucht den Stempel per Doppelklick.
# SICHERHEITSNETZ: jede der zehn Dateien im Live-Repo muss BYTE-GLEICH mit dem Stand VOR der
# Aenderung sein (8ab1f2de = Parallelsitzung Zoom-Modul, live v774).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="8ab1f2de"
CODE_COMMIT="5717dbce"
DATEIEN=(index.html sw.js app.js browser-nachladen.js browser-pane-persistenz.js browser-pane.js browser-pane-maus.js maus-absicht.js maus-panel.js sendepfad-nachladen.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q "nichts gelesen" public/browser-pane-maus.js || { echo "ABBRUCH: die Aenderung steht nicht in public/browser-pane-maus.js."; exit 1; }
git diff --quiet -- public tests || { echo "ABBRUCH: ungespeicherte Aenderungen in public/ oder tests/ — eine andere Sitzung arbeitet gerade."; exit 1; }

echo "== 1. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber Wof Kadavanich, 2026-09-05/06: 'Ich gebe dir alle Rechte. von A bis Z. Mach hundert Prozent fertig, lass nichts offen.' und 'wenn du fertig bist dann nochmal komplett testen.' Testreihe nach v773 fand zwei Restluecken in der Maus: ein leeres Leseergebnis galt als Antwort (dreimal dieselbe leere Klasse gelesen), und ein fehlgeschlagenes Hinsehen nannte weder Grund noch verband es neu. Beides in browser-pane-maus.js behoben; Marken der Browser-Kette auf dem Stand der Parallelsitzung, app.js b142, Service-Worker smejj-shell-v775. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 2. Alle Waechter"
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock rot."; exit 1; }
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/browser-pane.test.mjs > /tmp/leer-kaskade-tests.log 2>&1 || { echo "ABBRUCH: Tests rot."; tail -30 /tmp/leer-kaskade-tests.log; exit 1; }
grep -E "^# (tests|pass|fail)" /tmp/leer-kaskade-tests.log | tr '\n' ' '; echo

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Maus — nichts gelesen ist Fehlschlag, Hinsehen ueberlebt Sitzungsverlust 2026-09-06 — index.html, app.js b142, browser-pane.js, SW smejj-shell-v775 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$REPO" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && [ "$a" = "$c" ]; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$REPO/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -f "$KLON/assets/$f" ]; then cp "$REPO/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | head -30
git commit -q -m "deploy(maus): nichts gelesen ist Fehlschlag, Hinsehen ueberlebt Sitzungsverlust; SW v775 — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/browser-pane-maus.js" | cut -c1-16)
for i in $(seq 1 30); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-maus.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  maus=$L  (erwartet v775 / $ERW)"
  if [ "$V" = "smejj-shell-v775" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker v775, browser-pane-maus.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

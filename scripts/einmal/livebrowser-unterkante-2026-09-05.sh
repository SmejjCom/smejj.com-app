#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-05: Live-Browser bis zur Unterkante — stempeln und
# ausliefern.
#
# BEFUND (Bildschirmfoto des Betreibers, 05.09.): unter der Seite im Live-Browser ein
# dunkler Streifen, die Seite trifft die Unterkante nicht. Im Browser nachgestellt:
# zwei Gitterzeilen im Rahmen -> 213 px Streifen, eine Zeile -> 0. Dazu zog der
# Viewport 38 px einer laengst entfernten Kopfzeile ab, und der Nachlauf bei
# Groessenaenderung galt nur fuer den alten Fernweg, nicht fuer den Live-Browser.
#
# CODE IST COMMITTET: 1ff62d04 auf feature/design-v11 (163 Tests gruen, Marken,
# Precache, assets gruen). Der Start-Lock (index.html, app.js b138, browser-pane.js,
# browser-pane-render.js, sw.js v771) braucht den Stempel per Doppelklick.
#
# SICHERHEITSNETZ: jede der elf Dateien im Live-Repo muss BYTE-GLEICH mit dem Stand
# VOR der Aenderung sein (405e87c6). Sonst steht dort fremde Arbeit — Abbruch.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="405e87c6"
CODE_COMMIT="1ff62d04"
DATEIEN=(index.html sw.js app.js browser-nachladen.js browser-pane-persistenz.js browser-pane.js browser-pane-render.js browser-pane-fernwege.js maus-absicht.js maus-panel.js sendepfad-nachladen.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
git diff --quiet -- public tests || { echo "ABBRUCH: ungespeicherte Aenderungen in public/ oder tests/ (git status)."; exit 1; }

echo "== 1. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber Wof Kadavanich, 2026-09-05, Bildschirmfoto mit Wortlaut: 'Soll ganz unten dunkele hintergrund raus, seite soll mit ganz untere kante treffen.' Befund: der Rahmen des Live-Browsers hatte seit dem Entfernen der Kopfzeile zwei Gitterzeilen; die Buehne landete in der auto-Zeile und wurde nur so hoch wie das Bild, darunter zeigte die leere 1fr-Zeile den dunklen Grund (im Browser nachgestellt: 213 px Streifen). Dazu zog remoteBrowserViewport 38 px der entfernten Kopfzeile ab, und der Nachlauf bei Groessenaenderung galt nicht fuer den Live-Browser. Behoben in browser-pane-render.js, browser-pane-fernwege.js, browser-pane.js; Marken der Browser-Kette, app.js b138, Service-Worker smejj-shell-v771. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 2. Alle Waechter"
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock rot."; exit 1; }
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane.test.mjs tests/maus-absicht.test.mjs > /tmp/uk-kaskade-tests.log 2>&1 || { echo "ABBRUCH: Tests rot."; tail -30 /tmp/uk-kaskade-tests.log; exit 1; }
grep -E "^# (tests|pass|fail)" /tmp/uk-kaskade-tests.log | tr '\n' ' '; echo

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Live-Browser-Unterkante 2026-09-05 — index.html, app.js b138, browser-pane.js, browser-pane-render.js, SW smejj-shell-v771 (Betreiber-Doppelklick)

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
  b=$(git show "origin/main:assets/$f" | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:$f" | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && [ "$a" = "$c" ]; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$REPO/public/$f" "$KLON/$f" && cp "$REPO/public/$f" "$KLON/assets/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f" "assets/$f"
done
git status --short | head -30
git commit -q -m "deploy(live-browser): Seite trifft die Unterkante — eine Gitterzeile, Viewport ohne 38-px-Abzug, Nachlauf auch fuer den Live-Browser; SW v771 — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/browser-pane-render.js" | cut -c1-16)
for i in $(seq 1 30); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-render.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  render=$L  (erwartet v771 / $ERW)"
  if [ "$V" = "smejj-shell-v771" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker v771, browser-pane-render.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter pruefen: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

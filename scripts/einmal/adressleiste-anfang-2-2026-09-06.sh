#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06 (Abend, zweiter Lauf): Adressleiste
# des Panels zeigt nach dem Schreiben den ANFANG — stempeln und ausliefern.
#
# BEFUND: Der Blur-Fix (v782) reichte nicht. Live gemessen: schon beim Setzen
# der Adresse nach der Navigation rollt das Feld ans Ende (scrollLeft 809), ganz
# ohne Klick — bei einer langen Google-Adresse stand nur "88709133371969" da.
# Fix jetzt direkt im Render von browser-pane.js (scrollLeft = 0).
# CODE: b04c4054 (Arbeitszweig feature/design-v11), Service-Worker v783.
# SICHERHEITSNETZ: alle 9 Dateien im Live-Repo byte-gleich mit dem Stand VOR
# der Aenderung (ff0f6b2e = Stempel Adressleiste 1, live SW v782).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="ff0f6b2e"
CODE_COMMIT="b04c4054"
SW_NEU="smejj-shell-v783"
DATEIEN=(browser-pane.js browser-pane-persistenz.js maus-absicht.js maus-panel.js
  sendepfad-nachladen.js browser-nachladen.js app.js index.html sw.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q 'refs.address.scrollLeft = 0' public/browser-pane.js || { echo "ABBRUCH: der Fix steht nicht in browser-pane.js."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen — eine andere Sitzung arbeitet daran."; exit 1; }
done

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-vorschlaege.test.mjs tests/browser-pane.test.mjs tests/browser-pane-chrome-abgleich.test.mjs \
  tests/maus-absicht.test.mjs > /tmp/adressleiste2-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/adressleiste2-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/adressleiste2-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-06 18:39, Bildschirmfoto: 'checke diese Fehlern' — Adressleiste des Live-Browsers zeigte '88709133371969' statt der Adresse. Zweiter Lauf: live gemessen rollt das Feld schon beim Schreiben der Adresse ans Ende; Fix im Render von browser-pane.js (scrollLeft = 0). Marken bis zur Wurzel (browser-pane 20260906-8, maus-absicht v31, maus-panel v25, sendepfad-nachladen v15, browser-nachladen v13, app.js b149), Service-Worker smejj-shell-v783. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Adressleiste 2 2026-09-06 — browser-pane.js (scrollLeft im Render), app.js b149, index.html, SW smejj-shell-v783 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$REPO" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && { [ -z "$c" ] || [ "$a" = "$c" ]; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
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
git status --short | head -40
git commit -q -m "deploy(browser): Adressleiste zeigt nach dem Schreiben den Anfang; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/browser-pane.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  browser-pane=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker $SW_NEU, browser-pane.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1

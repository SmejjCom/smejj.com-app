#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06 (Abend): Adressleiste des Panels
# rollt beim Verlassen an den Anfang — stempeln und ausliefern.
#
# BEFUND (Betreiber-Bildschirmfoto 18:39): In der Adressleiste des Live-
# Browsers stand "88709133371969" statt "accounts.google.com/…". Nach Klick
# ins Feld (alles markiert, Cursor am Ende) blieb das Feld beim Verlassen ans
# Ende gerollt. Chrome zeigt immer den Anfang. Fix in browser-pane-vorschlaege.js
# (scrollLeft = 0 beim blur), Marken bis zur Wurzel, Service-Worker v782.
# CODE: 79b5b99b (Arbeitszweig feature/design-v11).
# SICHERHEITSNETZ: alle 10 Dateien im Live-Repo byte-gleich mit dem Stand VOR
# der Aenderung (e8fcc41e = Tab-Limit-Stempel, live SW v781).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="e8fcc41e"
CODE_COMMIT="79b5b99b"
SW_NEU="smejj-shell-v782"
DATEIEN=(browser-pane.js browser-pane-vorschlaege.js browser-pane-persistenz.js maus-absicht.js maus-panel.js
  sendepfad-nachladen.js browser-nachladen.js app.js index.html sw.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q 'feld.scrollLeft = 0' public/browser-pane-vorschlaege.js || { echo "ABBRUCH: der Fix steht nicht in browser-pane-vorschlaege.js."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen — eine andere Sitzung arbeitet daran."; exit 1; }
done

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-vorschlaege.test.mjs tests/browser-pane.test.mjs tests/browser-pane-chrome-abgleich.test.mjs \
  tests/maus-absicht.test.mjs > /tmp/adressleiste-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/adressleiste-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/adressleiste-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-06 18:39, Bildschirmfoto: 'checke diese Fehlern' — in der Adressleiste des Live-Browsers stand '88709133371969' statt der Adresse. Umgesetzt: Adressleiste rollt beim Verlassen an den Anfang (browser-pane-vorschlaege.js), Marken bis zur Wurzel (browser-pane 20260906-7, vorschlaege 20260709-3, maus-absicht v30, maus-panel v24, sendepfad-nachladen v14, browser-nachladen v12, app.js b148), Service-Worker smejj-shell-v782. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Adressleiste 2026-09-06 — browser-pane.js, app.js b148, index.html, SW smejj-shell-v782 (Betreiber-Doppelklick)

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
git commit -q -m "deploy(browser): Adressleiste rollt beim Verlassen an den Anfang; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/browser-pane-vorschlaege.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-vorschlaege.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  vorschlaege=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker $SW_NEU, browser-pane-vorschlaege.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1

#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06 (Nacht): jede Laenderendung ist eine
# Adresse fuer die Maus — stempeln und ausliefern.
#
# BEFUND (Betreiber 22:21): "Erledige mit der Maus im Browser: con.ax registieren"
# -> "Ich weiss noch nicht, WO die Maus arbeiten soll". Die Endung .ax fehlte in
# der Endungsliste von maus-absicht.js. Jetzt zaehlt jede zweibuchstabige Endung
# nach einem Wort mit mindestens zwei Zeichen (z.B., d.h. bleiben draussen).
# CODE: 25822a05 + 79d0921a (Arbeitszweig feature/design-v11), Service-Worker v786.
# REIHENFOLGE: Diese Kaskade setzt auf dem Stempel der Parallelsitzung auf
# (44b4563f, Service-Worker v785, "Ox Alpha raus"). Ist v785 noch nicht live,
# bricht sie ab — dann ZUERST "smejj.com Ox Alpha raus ausliefern.command" klicken.
# SICHERHEITSNETZ: alle 7 Dateien im Live-Repo byte-gleich mit 44b4563f.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="44b4563f"
CODE_COMMIT="79d0921a"
SW_VORHER="smejj-shell-v785"
SW_NEU="smejj-shell-v786"
DATEIEN=(maus-absicht.js maus-panel.js sendepfad-nachladen.js browser-nachladen.js app.js index.html sw.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q '|\[a-z\]{2})' public/maus-absicht.js || { echo "ABBRUCH: die Endungs-Regel steht nicht in maus-absicht.js."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live: $LIVE_SW"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER. ZUERST 'smejj.com Ox Alpha raus ausliefern.command' doppelklicken, dann diese Datei."; exit 1; }
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen — eine andere Sitzung arbeitet daran."; exit 1; }
done

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/maus-absicht.test.mjs tests/browser-pane.test.mjs tests/maus-chrome-bruecke.test.mjs > /tmp/maus-adresse-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/maus-adresse-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/maus-adresse-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-06 22:21: 'Ich habe grade eine Maus Aufgabe gegeben hat nicht mal Browser geoeffnet. Muss alles professionell und perfekt funktionieren.' Befund: 'con.ax registieren' wurde nicht als Adresse erkannt (.ax fehlte). Umgesetzt: jede Laenderendung zaehlt (maus-absicht.js), Marken bis zur Wurzel (maus-absicht v32, maus-panel v26, sendepfad-nachladen v16, browser-nachladen v14, app.js b152), Service-Worker smejj-shell-v786. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Maus-Adresse Laenderendung 2026-09-06 — app.js b152, index.html, SW smejj-shell-v786 (Betreiber-Doppelklick)

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
git commit -q -m "deploy(maus): jede Laenderendung ist eine Adresse (con.ax); SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/maus-absicht.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/maus-absicht.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  maus-absicht=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker $SW_NEU, maus-absicht.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1

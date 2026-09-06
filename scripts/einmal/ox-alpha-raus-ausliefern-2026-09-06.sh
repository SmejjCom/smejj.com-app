#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06 (Nacht): Ox Alpha ist abgeschafft —
# das bereinigte Frontend ausliefern.
#
# BETREIBER 2026-09-06: "Ox Alpha; Ist abgeschafft, nimm komplett raus von
# ueberall. Sie kommt nicht mehr." — entfernt, nicht stillgelegt (Commit
# da1bcefa): Registry-Eintrag samt Aliasen, die dritte Menuezeile, das
# Freischalt-Skript. Wer den Namen noch im Browserspeicher hat, wird beim
# naechsten Oeffnen still auf smejj 1.0 gesetzt.
#
# ACHTUNG, MITFAHRER: Auf feature/design-v11 hat parallel eine andere Sitzung
# gearbeitet. Ausgeliefert werden darum FUENF Dateien, nicht nur meine eine:
#   code-modell-menue.js  Ox Alpha raus              (diese Sitzung)
#   app.js                Guthaben-Leiste            (Parallelsitzung)
#   premium-surfaces.js   Guthaben-Leiste            (Parallelsitzung)
#   index.html            Cache-Marke b151 + CSP     (beide)
#   sw.js                 Cache-Marke v785           (beide)
# Alle fuenf sind vom Start-Lock 44b4563f gestempelt und damit freigegeben.
# Wer nur die eigene Aenderung live haben will, kann das hier nicht trennen —
# gemeinsame Dateien (index.html, sw.js) tragen beide Staende.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
SW_NEU="smejj-shell-v785"
APP_NEU="app.js?v=b151"
SW_LIVE_ERWARTET="smejj-shell-v783"
APP_LIVE_ERWARTET="app.js?v=b149"
DATEIEN=(code-modell-menue.js app.js premium-surfaces.js index.html sw.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }

echo "== 0. Ausgangslage"
git log --oneline -1 | cut -c1-90
git merge-base --is-ancestor da1bcefa HEAD || { echo "ABBRUCH: der Ox-Alpha-Commit da1bcefa liegt nicht im Zweig."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
grep -q "$APP_NEU" public/index.html || { echo "ABBRUCH: index.html traegt nicht $APP_NEU."; exit 1; }
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen — eine andere Sitzung arbeitet gerade daran."; exit 1; }
done
echo "Alle fuenf Dateien sind committet, nichts liegt halbfertig herum."

echo
echo "== 1. Ox Alpha ist wirklich raus (nicht nur ausgeblendet)"
grep -q 'titel: "Ox Alpha"' public/code-modell-menue.js && { echo "ABBRUCH: die Menuezeile steht noch."; exit 1; }
grep -q '"ox-alpha": Object.freeze' src/shared/modelRegistry.js && { echo "ABBRUCH: der Registry-Eintrag steht noch."; exit 1; }
[ -f scripts/deploy/ox-alpha-freischalten.mjs ] && { echo "ABBRUCH: das Freischalt-Skript liegt noch da."; exit 1; }
diff -q public/code-modell-menue.js public/assets/code-modell-menue.js >/dev/null || { echo "ABBRUCH: public/ und assets/ laufen auseinander."; exit 1; }
echo "Menuezeile weg, Registry-Eintrag weg, Freischalt-Skript weg, assets im Gleichklang."

echo
echo "== 2. Waechter"
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock rot — der Stand ist nicht gestempelt."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/model-registry.test.mjs tests/modell-menue-start.test.mjs tests/modellmenue-lock.test.mjs \
  tests/modellmenue-reihenfolge.test.mjs tests/code-modell-menue.test.mjs tests/precache-dynamische-importe.test.mjs \
  > /tmp/ox-alpha-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/ox-alpha-kaskade.log; exit 1; }
grep -E "^# (pass|fail)|pass [0-9]|fail [0-9]" /tmp/ox-alpha-kaskade.log | tr '\n' ' '; echo

echo
echo "== 3. Steht live noch der Stand, den wir erwarten?"
SW_IST=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
APP_IST=$(curl -s -m 20 "https://smejj.com/index.html?n=$RANDOM" | grep -o 'app.js?v=b[0-9]*' | head -1)
echo "live: $SW_IST / $APP_IST     erwartet: $SW_LIVE_ERWARTET / $APP_LIVE_ERWARTET"
if [ "$SW_IST" = "$SW_NEU" ]; then
  echo
  echo "Live steht bereits $SW_NEU — jemand hat diesen Stand schon ausgeliefert. Nichts zu tun."
  exit 0
fi
[ "$SW_IST" = "$SW_LIVE_ERWARTET" ] && [ "$APP_IST" = "$APP_LIVE_ERWARTET" ] || {
  echo "ABBRUCH: live steht ein anderer Stand als erwartet."
  echo "Eine andere Sitzung hat zwischendurch ausgeliefert — nicht blind darueberschreiben."
  exit 1
}

echo
echo "== 4. Live-Repo: liegt dort etwas, das wir nicht kennen?"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon ist nicht fast-forward."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "ABBRUCH: im Klon liegen fremde Aenderungen."; exit 1; }
echo "Klon ist sauber und auf origin/main."

echo
echo "== 5. Kopieren, committen, Fast-Forward-Push"
for f in "${DATEIEN[@]}"; do
  cp "$REPO/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -f "$KLON/assets/$f" ]; then cp "$REPO/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | head -20
QUELLE=$(git -C "$REPO" rev-parse --short HEAD)
git commit -q -m "deploy(modelle): Ox Alpha aus dem Modell-Menue entfernt; SW $SW_NEU — Quelle smejj.com-app $QUELLE" \
  || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo
echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/code-modell-menue.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 20 "https://smejj.com/assets/code-modell-menue.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  OX=$(curl -s -m 20 "https://smejj.com/assets/code-modell-menue.js?n=$RANDOM" | grep -c 'titel: "Ox Alpha"')
  echo "$(date +%H:%M:%S)  sw=$V  menue=$L  Ox-Alpha-Zeile=$OX  (erwartet $SW_NEU / $ERW / 0)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ] && [ "$OX" = "0" ]; then
    echo
    echo "FERTIG — live: Service-Worker $SW_NEU, Menue byte-gleich, keine Ox-Alpha-Zeile mehr."
    echo "Wer den Namen noch gespeichert hat, sieht beim naechsten Oeffnen smejj 1.0."
    exit 0
  fi
  sleep 5
done
echo
echo "OFFEN — gepusht, live noch nicht nachgezogen. In zwei Minuten noch einmal schauen."
exit 1

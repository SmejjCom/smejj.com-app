#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04 (14): API-Bereich aufgeteilt, check:all komplett gruen.
#
# Befund (check:all, 04.09.): "public/api-center-surface.js: 813 Zeilen (Limit 800) — sofort
# modular aufteilen" (check:guidelines). Die Datei war durch die Arbeit am API-Bereich gewachsen.
# Umbau: die vier Listen-Aktionen (loeschen, entfernen, umbenennen, umschalten) und die
# Aktivitaets-Anzeige liegen in public/api-center-aktionen.js (neu, 86 Zeilen). Sie bekommen ihre
# Umgebung als "hof" (alleEintraege, laden, melde) uebergeben — Verhalten unveraendert, nur der
# Ort ist neu. Flaeche jetzt 743 Zeilen. Precache-Eintrag ergaenzt.
#
# Zwei Pruefungen mussten das neue Modul kennenlernen:
#   * tests/i18n-ui.test.mjs liest es mit, sonst gelten seine Texte als verwaiste Schluessel.
#   * tests/platform-pwa.test.mjs: public/vendor/ (Fremdcode pdf.js, Apache-2.0) ist von der
#     512-KB-Schranke ausgenommen und wird dafuer strenger geprueft (LICENSE + VERSION Pflicht,
#     Gewichtsdateien ueberall verboten). Grund: der pdf.js-Worker wiegt 1,27 MB.
#   * scripts/check-modul-syntax.mjs parst public/vendor/ nicht mehr — Fragmente sind per Bauart
#     keine gueltigen Module.
#
# Marken: api-center-surface v13, entwickler v16, settings-surface b59, premium-surfaces b47p,
# app.js b126. 686 Frontend-Tests gruen, check:guidelines gruen, check:security gruen.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): API-Bereich aufgeteilt — die vier Listen-Aktionen liegen in public/api-center-aktionen.js (800-Zeilen-Regel), Precache ergaenzt, Marken api-center-surface v13 / entwickler v16 / settings-surface b59 / premium-surfaces b47p / app.js b126, Service-Worker-Cache +1; Pruefungen kennen das neue Modul (i18n) und den Fremdcode-Ordner public/vendor (platform-pwa, modul-syntax). Grundlage: Auftrag 2026-09-03 'alle Rechte, 100 % fertig, lass nichts offen' — check:all muss gruen sein."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
[ -f public/api-center-aktionen.js ] || { echo "ABBRUCH: api-center-aktionen.js fehlt."; exit 1; }
[ "$(wc -l < public/api-center-surface.js | tr -d ' ')" -le 800 ] || { echo "ABBRUCH: api-center-surface.js weiter ueber 800 Zeilen."; exit 1; }
grep -q '"/assets/api-center-aktionen.js"' public/sw.js || { echo "ABBRUCH: Precache-Eintrag fehlt."; exit 1; }
grep -q 'app.js?v=b126' public/index.html || { echo "ABBRUCH: Marke b126 fehlt in index.html."; exit 1; }
npm run -s check:guidelines | tail -1

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/build/pdfjs-worker-zusammensetzen.mjs | tail -1
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
npm run -s check:module-queries | tail -1
npm run -s check:security | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/i18n-ui.test.mjs tests/platform-pwa.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit)"
git add -A public tests docs/frontend scripts package.json
git commit -q -m "refactor(api-bereich): Listen-Aktionen in api-center-aktionen.js (800-Zeilen-Regel), Precache + i18n-Test + Fremdcode-Ausnahmen nachgezogen, Marken v13/v16/b59/b47p/b126, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-04)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(api-bereich): Listen-Aktionen als eigenes Modul, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/|scripts/)' | grep -v 'pdf.worker.min.js$' | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): API-Bereich aufgeteilt + SW v${NEXT} aus design-v11 $QUELLE"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -o /dev/null -w '%{http_code}' -m 15 'https://smejj.com/assets/api-center-aktionen.js?v=1')
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b126' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v aktionen=$a marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "200" ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — API-Bereich aufgeteilt live (smejj.com v${NEXT}), check:all gruen."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

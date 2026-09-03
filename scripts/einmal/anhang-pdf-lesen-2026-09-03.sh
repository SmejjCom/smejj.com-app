#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (10): Anhaenge Stufe 2A — PDF lesen im Browser.
#
# Auftrag (Betreiber, "Anhaenge Stufe 2 bauen"): PDF anhaengen, smejj liest den Text.
# Bau: public/anhang-pdf-text.js (neu) liest mit pdf.js 6.3.289 (Mozilla, Apache-2.0, unter
# public/vendor/pdfjs, NUR bei Bedarf geladen — Startseite bleibt leicht, kein Precache-Eintrag)
# den Text bis 200.000 Zeichen und haengt ihn als Chip MIT INHALT an (bewaehrter Textdatei-Weg);
# ohne Textebene bleibt der Verweis-Chip. Einhaengung in composer-plus-menu.js (nur Startfeld).
# Dateien heissen .js statt .mjs (der Server liefert .mjs als octet-stream, Module brauchen JS-MIME).
# Bewiesen im Emulator: handgebautes PDF -> Chip "rechnung.pdf · 53 Zeichen", Aufgabe traegt
# "[Seite 1] Hallo smejj, Rechnung Nr. 42 ...", Worker geladen; 677 Frontend-Tests gruen.
# Marken: anhang-pdf-text v2, composer-plus-menu werkzeuge-7, composer-tools werkzeuge-16, app.js b120.
#
# LEHRE VON HEUTE ABEND eingebaut: `git add -A` fuer public/ und tests/ (neue Dateien!), und der
# Klon bekommt Unterordner mit mkdir -p (vendor/pdfjs), Wurzel UND assets/.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Anhaenge Stufe 2A — PDF lesen im Browser (anhang-pdf-text.js mit pdf.js 6.3.289 Apache-2.0 unter public/vendor/pdfjs, nur bei Bedarf geladen), Einhaengung in composer-plus-menu.js, Marken anhang-pdf-text v2 / composer-plus-menu werkzeuge-7 / composer-tools werkzeuge-16 / app.js b120, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'Anhaenge Stufe 2 bauen' und 'alle Rechte, 100 % fertig'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
[ -f public/vendor/pdfjs/pdf.min.js ] && [ -f public/vendor/pdfjs/pdf.worker.min.js ] || { echo "ABBRUCH: pdf.js fehlt unter public/vendor/pdfjs."; exit 1; }
grep -q 'anhang-pdf-text.js?v=2' public/composer-plus-menu.js || { echo "ABBRUCH: PDF-Lesen nicht verdrahtet (Marke v2)."; exit 1; }
grep -q 'app.js?v=b120' public/index.html || { echo "ABBRUCH: Marke b120 fehlt in index.html."; exit 1; }

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/anhang-pdf-text.test.mjs tests/composer-anhang-chips.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit)"
git add -A public tests docs/frontend package.json
git commit -q -m "feat(anhang): PDF lesen im Browser (Stufe 2A, pdf.js 6.3.289 unter public/vendor/pdfjs, nur bei Bedarf), Marken v2/werkzeuge-7/werkzeuge-16/b120, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward) — Wurzel UND assets/, Unterordner mit mkdir -p"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
# pdf.js liegt bereits im vorherigen Commit (3e111a18) — sicherheitshalber komplett spiegeln:
mkdir -p "$KLON/vendor/pdfjs" "$KLON/assets/vendor/pdfjs"
cp "$REPO"/public/vendor/pdfjs/* "$KLON/vendor/pdfjs/"; cp "$REPO"/public/vendor/pdfjs/* "$KLON/assets/vendor/pdfjs/"
cp "$REPO/public/anhang-pdf-text.js" "$KLON/anhang-pdf-text.js"; cp "$REPO/public/anhang-pdf-text.js" "$KLON/assets/anhang-pdf-text.js"
git add -A && git commit -q -m "deploy(anhang): PDF lesen im Browser (pdf.js unter vendor/pdfjs), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/, docs/frontend, tests/)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/)' | tr '\n' ' ')
  git checkout 3e111a18 -- public/anhang-pdf-text.js public/vendor/pdfjs tests/anhang-pdf-text.test.mjs 2>/dev/null || true
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): PDF lesen (anhang-pdf-text.js, pdf.js vendor) + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  p=$(curl -s -o /dev/null -w '%{http_code}' -m 15 'https://smejj.com/assets/vendor/pdfjs/pdf.min.js')
  a=$(curl -s -o /dev/null -w '%{http_code}' -m 15 'https://smejj.com/assets/anhang-pdf-text.js?v=2')
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b120' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v pdfjs=$p leser=$a marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$p" = "200" ] && [ "$a" = "200" ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — PDF lesen live (smejj.com v${NEXT}). Am iPhone: App schliessen, neu oeffnen, PDF anhaengen."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (12): Anhaenge Stufe 2B — Word, Excel, PowerPoint lesen.
#
# Auftrag (Betreiber, "Anhaenge Stufe 2 bauen", Teil B). Bau: public/anhang-office-text.js (neu) —
# eigener ZIP-Leser (Zentralverzeichnis, deflate-raw ueber DecompressionStream, kein Fremdpaket) und
# XML-Textzieher fuer word/document.xml, ppt/slides/*.xml, xl/sharedStrings + worksheets. Text als
# Chip MIT INHALT (bis 200.000 Zeichen); alte Binaerformate (.doc/.xls/.ppt) bleiben Verweis-Chip.
# Einhaengung in composer-plus-menu.js (nur Startfeld, nur bei Bedarf geladen).
# Bewiesen: 3 Tests mit in Node gebauten Archiven; Emulator: angebot.docx -> Chip "angebot.docx ·
# 29 Zeichen", Aufgabe traegt "Angebot Nr. 99 / Preis 250 Euro"; 686 Frontend-Tests gruen.
# Marken: composer-plus-menu werkzeuge-9, composer-tools werkzeuge-18, app.js b122.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Anhaenge Stufe 2B — Word, Excel und PowerPoint werden im Browser gelesen (anhang-office-text.js, eigener ZIP-Leser, kein Fremdpaket) und als Chip mit Inhalt angehaengt; composer-plus-menu.js, Marken werkzeuge-9 / werkzeuge-18 / b122, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'Anhaenge Stufe 2 bauen' und 'alle Rechte, 100 % fertig'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
[ -f public/anhang-office-text.js ] || { echo "ABBRUCH: anhang-office-text.js fehlt."; exit 1; }
grep -q 'anhang-office-text.js?v=1' public/composer-plus-menu.js || { echo "ABBRUCH: Office-Lesen nicht verdrahtet."; exit 1; }
grep -q 'app.js?v=b122' public/index.html || { echo "ABBRUCH: Marke b122 fehlt in index.html."; exit 1; }

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
node --test tests/anhang-office-text.test.mjs tests/anhang-tonspur.test.mjs tests/anhang-pdf-text.test.mjs tests/composer-anhang-chips.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit)"
git add -A public tests docs/frontend package.json
git commit -q -m "feat(anhang): Word/Excel/PowerPoint lesen im Browser (Stufe 2B, anhang-office-text.js ohne Fremdpaket), Marken werkzeuge-9/werkzeuge-18/b122, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward) — Wurzel UND assets/"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
cp "$REPO/public/anhang-office-text.js" "$KLON/anhang-office-text.js"; cp "$REPO/public/anhang-office-text.js" "$KLON/assets/anhang-office-text.js"
git add -A && git commit -q -m "deploy(anhang): Office-Dateien lesen (anhang-office-text.js), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
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
  git checkout 3796968b -- public/anhang-office-text.js tests/anhang-office-text.test.mjs 2>/dev/null || true
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Office-Dateien lesen (anhang-office-text.js) + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -o /dev/null -w '%{http_code}' -m 15 'https://smejj.com/assets/anhang-office-text.js?v=1')
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b122' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v office=$a marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "200" ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Office lesen live (smejj.com v${NEXT}). Am iPhone: App schliessen, neu oeffnen, Word-Datei anhaengen."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

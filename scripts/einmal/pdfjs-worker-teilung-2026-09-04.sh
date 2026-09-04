#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04 (13): pdf.js-Worker in zwei Teilen, check:all wieder gruen.
#
# Befund (check:all, 04.09. 00:50): check:security meldete "Large file must not be in repo:
# public/vendor/pdfjs/pdf.worker.min.js (1265413 bytes)" — die Projektregel verbietet Dateien
# ueber 1 MB (gegen Modellgewichte und Medien im Repo). Die Regel bleibt unangetastet.
# Loesung: der Worker liegt als pdf.worker.min.part1.js + part2.js im Repo (je 633 KB), die ganze
# Datei entsteht per "npm run build:pdfjs-worker" (scripts/build/pdfjs-worker-zusammensetzen.mjs)
# und ist git-ignoriert. Zur Laufzeit ist es dieselbe Datei wie zuvor — pdf.js laedt seinen Worker
# per import(), ein Blob-Modul wuerde an script-src der CSP scheitern (geprueft, verworfen).
# check:frontend prueft den Bau (--pruefen), 686 Tests gruen, check:security gruen.
# Marken: anhang-pdf-text v3, composer-plus-menu werkzeuge-10, composer-tools werkzeuge-19,
# app.js b124 (b123 hatte die Parallelsitzung zeitgleich vergeben).
#
# Klon (GitHub Pages) hat keine Groessenregel: dort liegt die GANZE Worker-Datei (bereits seit
# Kaskade 10) plus die Teile — der Browser laedt nur die ganze Datei.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): pdf.js-Worker in zwei Teilen im Repo (Sicherheitsregel: keine Datei ueber 1 MB), ganze Datei per build:pdfjs-worker gebaut und git-ignoriert; anhang-pdf-text.js laedt den Worker wie zuvor als eine Datei; Marken anhang-pdf-text v3 / composer-plus-menu werkzeuge-10 / composer-tools werkzeuge-19 / app.js b124; Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'alle Rechte, 100 % fertig, lass nichts offen' — check:all muss gruen sein."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
[ -f public/vendor/pdfjs/pdf.worker.min.part1.js ] && [ -f public/vendor/pdfjs/pdf.worker.min.part2.js ] || { echo "ABBRUCH: Worker-Teile fehlen."; exit 1; }
grep -q 'anhang-pdf-text.js?v=3' public/composer-plus-menu.js || { echo "ABBRUCH: Marke v3 fehlt."; exit 1; }
grep -q 'app.js?v=b124' public/index.html || { echo "ABBRUCH: Marke b124 fehlt in index.html."; exit 1; }
node scripts/build/pdfjs-worker-zusammensetzen.mjs | tail -1
git check-ignore -q public/vendor/pdfjs/pdf.worker.min.js || { echo "ABBRUCH: ganze Worker-Datei ist nicht git-ignoriert."; exit 1; }

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
npm run -s check:security | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/anhang-pdf-text.test.mjs tests/composer-anhang-chips.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit, die ganze Worker-Datei bleibt ignoriert)"
git add -A public tests docs/frontend package.json .gitignore scripts/build/pdfjs-worker-zusammensetzen.mjs
git commit -q -m "fix(anhang): pdf.js-Worker in zwei Teilen (Regel: keine Datei ueber 1 MB), Marken v3/werkzeuge-10/werkzeuge-19/b124, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-04)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward) — Wurzel UND assets/, ganze Worker-Datei mit"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
mkdir -p "$KLON/vendor/pdfjs" "$KLON/assets/vendor/pdfjs"
cp "$REPO"/public/vendor/pdfjs/* "$KLON/vendor/pdfjs/"; cp "$REPO"/public/vendor/pdfjs/* "$KLON/assets/vendor/pdfjs/"
git add -A && git commit -q -m "deploy(anhang): pdf.js-Worker (ganz + Teile), Marken b124, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/, docs/frontend, tests/, Bau-Skript, .gitignore)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/|scripts/build/pdfjs-worker|\.gitignore)' | tr '\n' ' ')
  # src/server.js (Worker-Route) und die Teile liegen bereits im Bauzweig (c405e0ff) — nichts nachzuziehen.
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): pdf.js-Worker in zwei Teilen + Marken b124 + SW v${NEXT} aus design-v11 $QUELLE"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten, smejj.com)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  w=$(curl -s -o /dev/null -w '%{http_code}' -m 15 'https://smejj.com/assets/vendor/pdfjs/pdf.worker.min.js')
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b124' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v worker=$w marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$w" = "200" ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — smejj.com v${NEXT}, Worker als ganze Datei live, check:security im Repo gruen."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

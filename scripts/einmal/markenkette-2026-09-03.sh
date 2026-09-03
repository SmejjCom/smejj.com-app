#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (4): Markenkette heilen.
#
# Befund (A-bis-Z-Pruefung, check:all): acht Module wurden seit der letzten Eichung geaendert, ihre
# ?v=-Marken blieben stehen (chat-store b65, panel-layout 3, chat-actions-menu 4, chat-history-text b47b,
# arbeitsflaeche 2, spur-start b46, chat-history-view b59, settings-surface b55). Der Browser-HTTP-Cache
# (max-age 600) haelt so bis zu 10 Minuten alte Fassungen; der SW-Sprung heilt nur den Precache.
# Heilung: Marken an JEDEM Glied darueber ziehen — Kettenwirkung bis index.html, app.js, search.js,
# premium-surfaces.js (alle im Start-Lock). 23 Regeln, im Probe-Baum bewiesen (Markenkette gruen,
# Modul-Kennungen eindeutig, Precache vollstaendig, check:frontend gruen).
# Danach: Markenkette einfrieren, SW-Cache +1, Start-Lock stempeln, Klon -> Pages, Bauzweig -> Zeabur.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des Auslieferungs-Commits
# im Bauzweig; design-v11: git revert des Kaskaden-Commits.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick, Grossauftrag A bis Z 'alle Rechte erteilt'): Markenkette heilen — 23 ?v=-Marken bis index.html/app.js/search.js/premium-surfaces.js gezogen, Service-Worker-Cache +1. Keine inhaltliche Aenderung an Startseite oder Eingabefeld."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1 | cut -c1-100
git diff --quiet -- public || { echo "ABBRUCH: public/ hat ungesicherte Aenderungen."; exit 1; }
npm run -s check:start-lock | tail -1

echo "== 1. Marken ziehen (23 Regeln)"
node scripts/einmal/markenkette-2026-09-03.ersetzungen.cjs | tail -1

echo "== 2. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 3. assets nachziehen, Markenkette einfrieren, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-markenkette.mjs --freeze | tail -1
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
npm run -s check:module-queries | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/modul-einmal-instanz.test.mjs tests/verlauf-nachladen.test.mjs tests/erste-schritte.test.mjs tests/module-queries.test.mjs tests/auth-gate-frueh.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 4. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public tests docs/frontend | tr '\n' ' ')
git add $GEAENDERT
git commit -q -m "chore(marken): Markenkette geheilt — 23 ?v=-Marken bis index.html gezogen, Markenkette eingefroren, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03, A-bis-Z)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 5. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(marken): Markenkette geheilt (23 Marken), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 6. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/)' | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Markenkette (23 Marken) + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 7. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'chat-store.js?v=b66' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a marke-b66=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$m" -ge 1 ]; then
    echo "== 8. Nachmessung Web-Vitals (3 Laeufe)"
    node scripts/testing/measure_web_vitals.mjs --runs 3 2>&1 | grep -E "pageWeight_kb|lcp_ms|Budget verfehlt|Budgets eingehalten" || true
    echo "FERTIG — Markenkette live, beide Domains auf v${NEXT}"
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s https://smejj.com/ | grep -c 'chat-store.js?v=b66'"
exit 1

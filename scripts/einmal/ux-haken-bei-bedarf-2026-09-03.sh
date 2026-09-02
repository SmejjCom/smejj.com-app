#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (2): UX-Haken laden erst bei Bedarf.
#
# Befund (Web-Vitals-Wache, Gewicht 312 KB > 300 KB nach v730): chat-actions-menu.js lud
# sieben Laufzeit-Module immer sofort, auch Handy-Stile am Desktop und Verlaufs-/Code-Helfer
# ohne offenen Chat oder Code-Bereich. Der Umbau (beiHandy/beiKindern/beiKlasse) liegt bereits
# auf design-v11; lokal im headless Chrome bewiesen: Desktop laedt 3 statt 7, Handy 5 statt 7.
#
# Diese Kaskade macht ihn LIVE. Dafuer muss der Service-Worker-Cache eine Nummer hoch
# (chat-actions-menu.js liegt cache-first im Precache) — und sw.js steht im Start-Lock, darum
# stempelt der Betreiber per Doppelklick.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): UX-Haken in chat-actions-menu.js laden erst bei Bedarf (Handy-Stile nur am Handy, Verlauf/Code-Helfer erst in der Ansicht), Service-Worker-Cache +1. Grundlage: Freigabe 2026-09-02 'Ich gebe dir alle Rechte von A bis Z 100 %.'"

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -n 'beiHandy' public/chat-actions-menu.js >/dev/null || { echo "ABBRUCH: Umbau in public/chat-actions-menu.js fehlt (beiHandy)."; exit 1; }
npm run -s check:start-lock | tail -1

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n 'const CACHE_NAME' public/sw.js

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node --test tests/modul-einmal-instanz.test.mjs tests/chat-message-actions.test.mjs tests/kompakt.test.mjs tests/verlauf-unten.test.mjs tests/code-feld-unten.test.mjs tests/composer-zeile.test.mjs tests/chat-actions-woerter.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
git add public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json
git commit -q -m "chore(sw): smejj-shell-v${NEXT} — UX-Haken laden erst bei Bedarf (chat-actions-menu.js), Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in chat-actions-menu.js sw.js; do cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"; done
git add -A && git commit -q -m "deploy(perf): UX-Haken laden erst bei Bedarf (chat-actions-menu.js), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/ + Manifest)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- public/chat-actions-menu.js public/assets/chat-actions-menu.js public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): chat-actions-menu.js (Haken bei Bedarf) + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 https://smejj.com/assets/chat-actions-menu.js | grep -c 'beiHandy' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a haken-fix=$e"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ]; then
    echo "== 7. Nachmessung Web-Vitals (3 Laeufe, echtes Chrome)"
    node scripts/testing/measure_web_vitals.mjs --runs 3 2>&1 | grep -E "pageWeight_kb|lcp_ms|Budget verfehlt|Budgets eingehalten" || true
    echo "FERTIG — UX-Haken laden bei Bedarf, beide Domains auf v${NEXT}"
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s https://smejj.com/assets/chat-actions-menu.js | grep -c 'beiHandy'"
exit 1

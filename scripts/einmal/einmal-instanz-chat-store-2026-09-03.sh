#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03: chat-store.js nur noch EINMAL laden.
#
# Befund (Web-Vitals-Wache rot, Gewicht 324 KB > 300 KB): erste-schritte.js
# importierte "/assets/chat-store.js" ohne "?v=b65" — der Browser lud die Datei
# zweimal (12,9 KB doppelt, zweite Modulinstanz mit eigener IndexedDB-Verbindung).
# Der Fix (Import auf "?v=b65") liegt bereits auf design-v11 (Commit siehe git log).
#
# Diese Kaskade macht ihn LIVE. Dafuer muss der Service-Worker-Cache eine Nummer
# hoch (sonst behalten Wiederkehrer die alte erste-schritte.js aus dem Vorrat) —
# und sw.js steht im Start-Lock, darum stempelt der Betreiber per Doppelklick.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): chat-store.js nur einmal laden — erste-schritte.js Import auf ?v=b65, Service-Worker-Cache +1. Grundlage: Freigabe 2026-09-02 'Ich gebe dir alle Rechte von A bis Z 100 %.'"

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -n 'chat-store.js?v=b65' public/erste-schritte.js >/dev/null || { echo "ABBRUCH: Fix in public/erste-schritte.js fehlt (Import ohne ?v=b65)."; exit 1; }
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
node --test tests/modul-einmal-instanz.test.mjs tests/erste-schritte.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
git add public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json
git commit -q -m "chore(sw): smejj-shell-v${NEXT} — chat-store.js nur einmal laden (erste-schritte.js ?v=b65), Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in erste-schritte.js sw.js; do cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"; done
git add -A && git commit -q -m "deploy(perf): chat-store.js nur einmal laden (erste-schritte.js ?v=b65), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/ + Manifest)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- public/erste-schritte.js public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): erste-schritte.js (?v=b65) + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 https://smejj.com/assets/erste-schritte.js | grep -c 'chat-store.js?v=b65' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a erste-schritte-fix=$e"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ]; then
    echo "== 7. Nachmessung Web-Vitals (3 Laeufe, echtes Chrome)"
    node scripts/testing/measure_web_vitals.mjs --runs 3 2>&1 | grep -E "pageWeight_kb|lcp_ms|Budget verfehlt|Budgets eingehalten" || true
    echo "FERTIG — chat-store.js wird nur noch einmal geladen, beide Domains auf v${NEXT}"
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s https://smejj.com/assets/erste-schritte.js | grep -c 'chat-store.js?v=b65'"
exit 1

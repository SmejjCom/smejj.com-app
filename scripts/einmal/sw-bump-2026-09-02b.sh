#!/bin/zsh
# smejj.com — Ein-Klick: Service-Worker-Cache +1, damit ALLE Besucher die neue
# chat-stream.js (Fragen-Erfassung, Trainingsplan smejj 1.1 Stufe 1) bekommen.
# Ohne diesen Sprung sehen wiederkehrende Besucher die alte, vorgehaltene Datei.
#
# Ablauf: Live-Stand messen -> CACHE_NAME +1 -> assets -> Start-Lock stempeln ->
# Commit design-v11 -> Klon (Wurzel + assets/) -> Push main -> Bauzweig-Sync ->
# Live-Beweis auf beiden Domains. Bricht beim ersten Fehler ab.
# Freigabe: Betreiber Wof Kadavanich, 2026-09-02 ("alle Rechte von A bis Z 100 %").
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-02: Ich gebe dir alle Rechte von A bis Z 100 %. — Service-Worker-Cache +1 fuer die Fragen-Erfassung (chat-stream.js)"
cd "$REPO"
echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n 'const CACHE_NAME' public/sw.js
echo "== 2. assets, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:modul-syntax | tail -1
echo "== 3. Commit design-v11"
git add public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json
git commit -q -m "chore(sw): smejj-shell-v${NEXT} — Fragen-Erfassung fuer alle Besucher, Start-Lock gestempelt (Betreiber-Freigabe 2026-09-02)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"
echo "== 4. Live stellen (Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
cp "$REPO/public/sw.js" "$KLON/sw.js"; cp "$REPO/public/sw.js" "$KLON/assets/sw.js"
git add -A && git commit -q -m "deploy(sw): smejj-shell-v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"
echo "== 5. Ein-Buendel-Vertrag: Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- public/sw.js public/assets/sw.js public/ai/chat-stream.js public/ai/frage-erfassung.js docs/frontend/start-lock-manifest.json
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): SW v${NEXT} + Fragen-Erfassung aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true
echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a"
  [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && { echo "FERTIG — beide Domains auf v${NEXT}"; exit 0; }
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen."

#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (3): Verlaufs-Helfer laden erst bei sichtbarem Verlauf.
#
# Befund (Web-Vitals-Wache, Messlauf 307 KB > 300 KB nach v731): chat-history-view.js importierte
# Verlaufs-Text (8,7 KB), Karten-Bausteine (5,4 KB) und Titel-Automatik (5,1 KB) statisch — auf jeder
# Startseite, obwohl der Verlauf dort nicht gezeichnet wird; spur-start.js zog den Verlaufs-Text fuer
# eine Funktion (merkmaleVon) zusaetzlich an den Start. Umbau auf design-v11: ladeBausteine() per
# import() beim ersten Zeichnen, merkmaleVon im neuen chat-merkmale.js. Headless Chrome gegen die
# Probe: Start laedt nur view+merkmale, nach Klick auf Verlauf kommen die drei Module, keine Fehler.
#
# Diese Kaskade macht ihn LIVE: chat-merkmale.js in den Precache, Service-Worker-Cache +1 (die
# geaenderten Module liegen cache-first im Precache) — sw.js steht im Start-Lock, darum stempelt
# der Betreiber per Doppelklick.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Verlaufs-Text, Karten-Bausteine und Titel-Automatik laden erst bei sichtbarem Verlauf (chat-history-view.js), spur-start.js haengt nur an chat-merkmale.js; chat-merkmale.js in den Precache, Service-Worker-Cache +1. Grundlage: Freigabe 2026-09-02 'Ich gebe dir alle Rechte von A bis Z 100 %.'"

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -n 'ladeBausteine' public/chat-history-view.js >/dev/null && [ -f public/chat-merkmale.js ] || { echo "ABBRUCH: Umbau (ladeBausteine / chat-merkmale.js) fehlt."; exit 1; }
npm run -s check:start-lock | tail -1

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js
node -e 'const fs=require("fs");let s=fs.readFileSync("public/sw.js","utf8");if(!s.includes("\"/assets/chat-merkmale.js\""))s=s.replace("  \"/assets/chat-history-text.js\",\n","  \"/assets/chat-merkmale.js\",\n  \"/assets/chat-history-text.js\",\n");fs.writeFileSync("public/sw.js",s)'
grep -n "chat-merkmale" public/sw.js || { echo "ABBRUCH: chat-merkmale.js nicht im Precache"; exit 1; }

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/modul-einmal-instanz.test.mjs tests/verlauf-nachladen.test.mjs tests/verlauf-themen.test.mjs tests/chat-title-auto.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
git add public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json
git commit -q -m "chore(sw): smejj-shell-v${NEXT} — Verlaufs-Helfer erst bei sichtbarem Verlauf, chat-merkmale.js im Precache, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in chat-history-view.js chat-history-text.js spur-start.js chat-merkmale.js sw.js; do cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"; done
git add -A && git commit -q -m "deploy(perf): Verlaufs-Helfer erst bei sichtbarem Verlauf (chat-history-view.js, chat-merkmale.js), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/ + Manifest)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- public/chat-history-view.js public/chat-history-text.js public/spur-start.js public/chat-merkmale.js public/assets/chat-history-view.js public/assets/chat-history-text.js public/assets/spur-start.js public/assets/chat-merkmale.js public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json tests/verlauf-nachladen.test.mjs
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Verlaufs-Helfer bei Bedarf (chat-history-view.js, chat-merkmale.js) + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 https://smejj.com/assets/chat-history-view.js | grep -c 'ladeBausteine' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a verlauf-fix=$e"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ]; then
    echo "== 7. Nachmessung Web-Vitals (3 Laeufe, echtes Chrome)"
    node scripts/testing/measure_web_vitals.mjs --runs 3 2>&1 | grep -E "pageWeight_kb|lcp_ms|Budget verfehlt|Budgets eingehalten" || true
    echo "FERTIG — Verlaufs-Helfer laden bei Bedarf, beide Domains auf v${NEXT}"
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s https://smejj.com/assets/chat-history-view.js | grep -c 'ladeBausteine'"
exit 1

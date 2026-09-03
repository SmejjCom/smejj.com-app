#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (11): Anhaenge Stufe 2C — Tonspur von Video/Audio.
#
# Auftrag (Betreiber, "Anhaenge Stufe 2 bauen", Teil C): Video oder Audio anhaengen, smejj hoert die
# Tonspur. Bau: public/anhang-tonspur.js (neu) — decodeAudioData im Browser, 16 kHz mono,
# 60-s-WAV-Stuecke (1,9 MB, unter den 3 MB der Ohr-Route) an /api/voice/transcribe (Groq
# whisper-large-v3-turbo, Gratis-Stufe), Transkript mit Zeitmarken als Chip MIT INHALT; der
# Datei-Chip bleibt als Verweis. Laenger als 15 min, unlesbares Format oder Ohr-Fehler -> ehrlicher
# Hinweis, Verweis-Chip bleibt. Kein Server-Aenderung. Einhaengung in composer-plus-menu.js.
# Bewiesen im Emulator: 3-s-WAV -> Chip "memo.wav", ein 96-KB-Stueck ging als audio/wav ans Ohr;
# 683 Frontend-Tests gruen (6 neue in tests/anhang-tonspur.test.mjs).
# Marken: composer-plus-menu werkzeuge-8, composer-tools werkzeuge-17, app.js b121.
# Der Bilderinhalt eines Videos bleibt fuer smejj unsichtbar (kein Videomodell in der Kette).
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Anhaenge Stufe 2C — Tonspur von Video und Audio wird im Browser geholt, in 60-s-Stuecken an das Whisper-Ohr geschickt und als Transkript-Chip angehaengt (anhang-tonspur.js, composer-plus-menu.js), Marken werkzeuge-8 / werkzeuge-17 / b121, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'Anhaenge Stufe 2 bauen' und 'alle Rechte, 100 % fertig'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
[ -f public/anhang-tonspur.js ] || { echo "ABBRUCH: anhang-tonspur.js fehlt."; exit 1; }
grep -q 'anhang-tonspur.js?v=1' public/composer-plus-menu.js || { echo "ABBRUCH: Tonspur nicht verdrahtet."; exit 1; }
grep -q 'app.js?v=b121' public/index.html || { echo "ABBRUCH: Marke b121 fehlt in index.html."; exit 1; }

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
node --test tests/anhang-tonspur.test.mjs tests/anhang-pdf-text.test.mjs tests/composer-anhang-chips.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit)"
git add -A public tests docs/frontend package.json
git commit -q -m "feat(anhang): Tonspur von Video/Audio transkribieren (Stufe 2C, anhang-tonspur.js -> Whisper-Ohr), Marken werkzeuge-8/werkzeuge-17/b121, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward) — Wurzel UND assets/"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
cp "$REPO/public/anhang-tonspur.js" "$KLON/anhang-tonspur.js"; cp "$REPO/public/anhang-tonspur.js" "$KLON/assets/anhang-tonspur.js"
git add -A && git commit -q -m "deploy(anhang): Tonspur transkribieren (anhang-tonspur.js), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
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
  git checkout 3bd14cfd -- public/anhang-tonspur.js tests/anhang-tonspur.test.mjs 2>/dev/null || true
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Tonspur transkribieren (anhang-tonspur.js) + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -o /dev/null -w '%{http_code}' -m 15 'https://smejj.com/assets/anhang-tonspur.js?v=1')
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b121' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v tonspur=$a marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "200" ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Tonspur live (smejj.com v${NEXT}). Am iPhone: App schliessen, neu oeffnen, Video anhaengen, kurz warten."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

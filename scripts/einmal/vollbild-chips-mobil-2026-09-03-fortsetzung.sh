#!/bin/zsh
# smejj.com — Fortsetzung der Kaskade vollbild-chips-mobil-2026-09-03.sh ab Schritt 3.
# Der Betreiber-Doppelklick (2. Lauf, 2026-09-03 11:29 UTC) hat den Start-Lock gestempelt
# (Manifest neu, check:start-lock gruen) und den SW auf v736 gehoben, brach aber vor dem
# Commit ab (alle Pruefungen einzeln nachgefahren: gruen; vermutlich index.lock einer
# Parallelsitzung, die im selben Moment 1cdd693c committete). Der Stempel ist die einzige
# Betreiber-Handlung — Commit, Klon, Bauzweig und Live-Beweis darf die Sitzung erledigen.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"

cd "$REPO"
echo "== 0. Ausgangslage (Stempel muss gruen sein)"
npm run -s check:start-lock | tail -1
NEXT=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1 | tr -dc '0-9')
[ -n "$NEXT" ] || { echo "ABBRUCH: SW-Version nicht lesbar."; exit 1; }
grep -q 'scroll-padding-top: 52px' public/assets/start-styles.css || { echo "ABBRUCH: Buendel unter /assets/ ohne Umbau."; exit 1; }
git diff --quiet -- docs/frontend/start-lock-manifest.json && { echo "ABBRUCH: Manifest nicht gestempelt."; exit 1; }
echo "SW v${NEXT}"

echo "== 3. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public docs/frontend | tr '\n' ' ')
git add $GEAENDERT
git commit -q -m "feat(mobil): Vollbild am Handy (Glas bis in die Safe-Area) + alle acht Werkzeug-Chips wischbar, Chat-Verlauf 52 px unter der Icon-Zeile, Raster-Falle .home-feed min-width:0, Buendel-Marke mobil100-20260903, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(mobil): Vollbild am Handy + acht Werkzeug-Chips wischbar, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/ + Start-Lock-Manifest)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/)' | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Vollbild am Handy + acht Werkzeug-Chips + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 'https://smejj.com/assets/start-styles.css?v=mobil100-20260903' | grep -c 'scroll-padding-top: 52px' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'start-styles.css?v=mobil100-20260903' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a buendel-fix=$e marke-in-index=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Vollbild + acht Chips live, beide Domains auf v${NEXT}."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen."
exit 1

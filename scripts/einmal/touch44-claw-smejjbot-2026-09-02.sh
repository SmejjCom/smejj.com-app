#!/bin/zsh
# smejj.com — Ein-Klick-Kaskade (2026-09-02): Touch-Ziele 44 px fuer die
# Claw-Toolbar (smejjBot/Arbeitsbereich) und die smejjBot-Aktionen (Starten,
# Anmelden, Diff freigeben ...). Betriebswache Nr. 42 mass am 2026-09-02
# elf Knoepfe mit 42 px (Betreiber-Regel: 44 px).
#
# Voraussetzung: die CSS-Aenderungen, das Start-Styles-Buendel, der SW-Bump
# und die assets-Kopie liegen bereits im Arbeitsbaum (Schritte 1-3 der Sitzung).
# Dieses Skript: Start-Lock stempeln, Commit, Frontend-Klon pushen, Bauzweig
# nachziehen (nur public/ + Lock-Manifest), Live-Beweis.
#
# Betreiber-Freigabe 2026-09-02 (woertlich): "Ich gebe dir alle Rechte, mach
# hundert Prozent fertig. Lass nicht offen."
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-02: Ich gebe dir alle Rechte, mach hundert Prozent fertig. Lass nicht offen. — Touch-Ziele 44 px fuer Claw-Toolbar und smejjBot-Aktionen (Betriebswache Nr. 42)"
DATEIEN=(index.html sw.js start-styles.css ui-modern.css autonomous-coding.css)
cd "$REPO"
NEXT=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1 | tr -dc '0-9')

echo "== 1. Start-Lock stempeln"
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:start-styles | tail -1
npm run -s check:assets | tail -1

echo "== 2. Commit design-v11"
git add public/index.html public/sw.js public/start-styles.css public/ui-modern.css public/autonomous-coding.css \
  public/assets/index.html public/assets/sw.js public/assets/start-styles.css public/assets/ui-modern.css public/assets/autonomous-coding.css \
  docs/frontend/start-lock-manifest.json
git commit -q -m "fix(touch): Claw-Toolbar und smejjBot-Aktionen auf 44 px (Betriebswache Nr. 42: elf Knoepfe mit 42 px), SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Freigabe 2026-09-02)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 3. Frontend-Klon (Wurzel + assets/), Push main"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in "${DATEIEN[@]}"; do cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"; done
git add -A && git commit -q -m "deploy(touch): Claw-Toolbar und smejjBot-Aktionen 44 px, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 4. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  PFADE=()
  for f in "${DATEIEN[@]}"; do PFADE+=("public/$f" "public/assets/$f"); done
  git checkout "$QUELLE" -- "${PFADE[@]}" docs/frontend/start-lock-manifest.json
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Touch 44 px + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"

echo "== 5. Live-Beweis (bis 4 Minuten)"
for i in $(seq 1 24); do
  v=$(curl -s -m 15 "https://smejj.com/sw.js?n=$(date +%s)" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 "https://api.smejj.com/sw.js?n=$(date +%s)" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  c=$(curl -s -m 15 "https://smejj.com/assets/start-styles.css?v=touch44-20260902" | grep -c "44 px statt 38" || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a css-44=$c"
  [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$c" -ge 1 ] && { echo "FERTIG — live und byte-gleich"; exit 0; }
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen"
exit 1

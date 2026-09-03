#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (5): Vollbild am Handy + alle acht Werkzeug-Chips.
#
# Befund (Betreiber, iPhone-PWA, Screenshot 13:21): Statusleiste (Uhr, Netz, Akku) und Home-Balken
# standen schwarz ueber und unter dem Glas; unter dem Schreibfeld nur zwei Chips.
# Ursachen: (1) styles.css legt die Safe-Area als Polster auf den body, dort schien der nackte
# Seitenhintergrund durch — obwohl index.html seit 4bcb15b6 viewport-fit=cover + black-translucent
# liefert. (2) start-glass.css versteckte unter 600 px alles ab Chip 3.
# Umbau (mobil-composer.css, start-glass.css): body traegt das Glas-Gefaelle bis an alle vier Kanten,
# das Safe-Area-Polster wandert nach innen auf main.shell, die Startseite malt ihr Gefaelle nicht
# doppelt; alle acht Chips in EINER wischbaren Zeile (44 px, weiche Kanten); .home-feed min-width:0
# gegen die Raster-Falle (Spalte blies sich auf 502 px auf). Im Handy-Emulator (375/390/430) bewiesen:
# keine Ueberbreite, 8 Chips setzen ihre Vorlage, Gefaelle laeuft in die Safe-Area durch.
#
# Diese Kaskade macht es LIVE: Buendel neu bauen, ?v=-Marke des Buendels (index.html, schon gesetzt:
# mobil100-20260903), Service-Worker-Cache +1 — index.html, start-glass.css, start-styles.css und
# sw.js stehen im Start-Lock, darum stempelt der Betreiber per Doppelklick.
#
# Nach dem Klick auf dem iPhone: PWA einmal vom Home-Bildschirm entfernen und neu hinzufuegen —
# iOS friert den Statusleisten-Stil beim Hinzufuegen ein.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Vollbild am Handy — Glas-Gefaelle bis in die Safe-Area (mobil-composer.css), alle acht Werkzeug-Chips in einer wischbaren Zeile (start-glass.css, mobil-composer.css), Chat-Verlauf am Handy 52 px unter der Icon-Zeile, Buendel-Marke mobil100-20260903 in index.html, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'unsere App soll Vollbildschirm sein' und 'wenn alle funktionieren, sollen wir alle haben'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q 'Raster-Falle' public/mobil-composer.css || { echo "ABBRUCH: Umbau in mobil-composer.css fehlt."; exit 1; }
grep -q 'start-styles.css?v=mobil100-20260903' public/index.html || { echo "ABBRUCH: Buendel-Marke in index.html fehlt."; exit 1; }
! grep -q 'nth-child(n + 3)' public/start-glass.css || { echo "ABBRUCH: alter Chip-Verstecker steht noch in start-glass.css."; exit 1; }

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. Buendel + assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:start-styles | tail -1
npm run -s build:assets | tail -1
grep -q 'scroll-padding-top: 52px' public/assets/start-styles.css || { echo "ABBRUCH: Buendel unter /assets/ ohne Umbau."; exit 1; }
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/touch-ziele-waechter.test.mjs tests/frontend-structure.test.mjs tests/a11y-structure.test.mjs tests/assets-sync.test.mjs tests/auth-gate-frueh.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public docs/frontend | tr '\n' ' ')
git add $GEAENDERT
git commit -q -m "feat(mobil): Vollbild am Handy (Glas bis in die Safe-Area) + alle acht Werkzeug-Chips wischbar, Raster-Falle .home-feed min-width:0, Buendel-Marke mobil100-20260903, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
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
    echo "JETZT am iPhone: PWA vom Home-Bildschirm entfernen, smejj.com in Safari oeffnen, Teilen > Zum Home-Bildschirm."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s 'https://smejj.com/assets/start-styles.css?v=mobil100-20260903' | grep -c 'scroll-padding-top: 52px'"
exit 1

#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (6): Chat am Handy — drei Befunde vom iPhone.
#
# Befund (Betreiber-Screenshot 15:10, iPhone-PWA nach Recherche-Antwort):
#   (1) Werkzeugzeile des Schreibfelds unter der Unterkante versteckt, nicht bedienbar.
#   (2) Frage-Blase ueberdeckt die Zeile "Arbeitsschritte: 1 Suche".
#   (3) Quellen-Tabelle: jede Zeile fast eine halbe Bildschirmhoehe, riesige Leerraeume.
# Ursachen (im Emulator mit nachgestellter Safe-Area 59/34 px gemessen):
#   (1) .home-feed (Chat) und #code sind 100dvh hoch, die Huelle traegt zusaetzlich die Safe-Area
#       als Polster -> 937 px auf 844 px Schirm; dazu min-height:100dvh aus styles.css auf
#       .workspace/.view/.home-feed, das jede kleinere Hoehe schlaegt.
#   (2) .msg-actions.is-user sitzt per margin-top:-34px in der Blase; ist die Leiste kuerzer als
#       34 px, zieht sie den naechsten Eintrag unter die Blase.
#   (3) styles.css setzt .entry auf white-space:pre-wrap — in Tabellen wird jeder Zeilenumbruch
#       zwischen <tr> zu einer anonymen Riesenzelle.
# Umbau (nur mobil-composer.css): Hoehen = 100dvh minus Insets (Variablen --sa-top/--sa-bottom),
# min-height passend, Aktionsleiste min-height 34 px, Tabellen white-space:normal.
# Bewiesen: Composer-Unterkante 804 px bei Grenze 810, keine Seitenscrollung, Code-Ansicht 751 px,
# Tabellenzeilen 40 px trotz eingestreuter Zeilenumbrueche.
#
# Diese Kaskade macht es LIVE: Buendel-Marke mobil101-20260903 (index.html, schon gesetzt),
# Service-Worker-Cache +1 — index.html, start-styles.css und sw.js stehen im Start-Lock, darum
# stempelt der Betreiber per Doppelklick. Pruefwoerter sind CSS-Regeln, keine Kommentare
# (der Buendler entfernt Kommentare); git add mit ${=...} (zsh teilt sonst nicht).
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Chat am Handy — Schreibfeld ueber dem Home-Balken (Hoehe 100dvh minus Safe-Area, Variablen --sa-top/--sa-bottom), Frage-Blase ohne Ueberdeckung (Aktionsleiste min-height 34 px), Tabellen ohne Riesenzeilen (white-space normal); mobil-composer.css, Buendel-Marke mobil101-20260903 in index.html, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'kompakt, uebersichtlich wie ChatGPT, Claude, Gemini' und 'Icons an der Unterkante versteckt, behebe endlich diesen Fehler'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q -- '--sa-bottom' public/mobil-composer.css || { echo "ABBRUCH: Umbau in mobil-composer.css fehlt."; exit 1; }
grep -q 'start-styles.css?v=mobil101-20260903' public/index.html || { echo "ABBRUCH: Buendel-Marke in index.html fehlt."; exit 1; }

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. Buendel + assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:start-styles | tail -1
npm run -s build:assets | tail -1
grep -q -- 'var(--sa-bottom)' public/assets/start-styles.css || { echo "ABBRUCH: Buendel unter /assets/ ohne Umbau."; exit 1; }
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/touch-ziele-waechter.test.mjs tests/frontend-structure.test.mjs tests/a11y-structure.test.mjs tests/assets-sync.test.mjs tests/chat-markdown.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public docs/frontend | tr '\n' ' ')
git add ${=GEAENDERT}
git commit -q -m "fix(mobil): Chat am Handy — Schreibfeld ueber dem Home-Balken (100dvh minus Safe-Area), Frage-Blase ohne Ueberdeckung, Tabellen ohne Riesenzeilen; Buendel-Marke mobil101-20260903, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(mobil): Chat am Handy — drei iPhone-Befunde behoben, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
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
  git commit -q -m "chore(auslieferung): Chat am Handy (drei iPhone-Befunde) + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 'https://smejj.com/assets/start-styles.css?v=mobil101-20260903' | grep -c -- 'var(--sa-bottom)' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'start-styles.css?v=mobil101-20260903' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a buendel-fix=$e marke-in-index=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Chat-Fixes live, beide Domains auf v${NEXT}. Am iPhone: App schliessen und neu oeffnen (kein Neuinstallieren noetig)."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen."
exit 1

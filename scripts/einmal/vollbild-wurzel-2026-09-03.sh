#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (9): Vollbild ohne schwarzen Streifen + Anhang-Chips.
#
# TEIL B — Anhang-Chips (Betreiber-Screenshot 19:55, iPhone): ein Video stand als Textzeile
# "[Anhang: IMG_5287.mov (63595 KB)]" im Schreibfeld. Jetzt: Chip ueber dem Feld wie bei ChatGPT
# (Vorschau/Symbol, Name, Groesse, ehrlicher Untertitel, Entfernen) fuer Video, PDF, Dokument,
# Archiv, Audio und weitere Bilder (composer-anhang-chips.js, neu; composer-plus-menu.js,
# composer-paste-attach.js, chat-actions.css). Beim Senden gehen die Verweise mit der Aufgabe mit.
# Emulator: zwei Chips (Video mit Vorschau, PDF mit Symbol), Aufgabe traegt beide Verweise,
# 674 Frontend-Tests gruen (neu: tests/composer-anhang-chips.test.mjs in check:frontend).
# Marken: composer-plus-menu werkzeuge-5, composer-paste-attach v4, composer-tools werkzeuge-14,
# app.js b118; sw.js Precache +1 Modul.
#
# Befund (Betreiber-Screenshot 19:49, iPhone-PWA): ueber dem Home-Balken ein schwarzer Streifen.
# Ursache: Kaskade 6 setzte die Hoehen auf calc(100dvh - Safe-Area); iOS rechnet 100dvh im
# Vollbild kleiner als den Schirm, der body endete darueber, der nackte html-Hintergrund schien
# durch. Fix (mobil-composer.css): das Glas-Gefaelle liegt auf dem WURZELELEMENT (html:root —
# :root-Spezifitaet noetig, styles.css setzt :root { background }), der Browser malt es auf die
# ganze Zeichenflaeche bis in jede Ecke; body transparent, html/body min-height 100 %.
# Emulator: html background-image = Gefaelle, background-size 100 %, keine Seitenscrollung,
# Frontend-Suite 670 gruen. Buendel-Marke mobil102-20260903 in index.html (schon gesetzt).
# Pruefwoerter sind CSS-Regeln, git add mit ${=...}, Protokoll per .command/tee.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Vollbild am Handy — Glas-Gefaelle auf dem Wurzelelement (html:root), kein schwarzer Streifen ueber dem Home-Balken; Anhang-Chips fuer Video/PDF/Dokument statt Textzeile im Schreibfeld (composer-anhang-chips.js, composer-plus-menu.js, composer-paste-attach.js, chat-actions.css, Marken werkzeuge-5/v4/werkzeuge-14/b118, Precache); mobil-composer.css, Buendel-Marke mobil102-20260903 in index.html, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'Vollbild, gesamte Flaeche' und 'alle Rechte, 100 % fertig'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q 'html:root' public/mobil-composer.css || { echo "ABBRUCH: html:root-Regel fehlt in mobil-composer.css."; exit 1; }
grep -q 'start-styles.css?v=mobil102-20260903' public/index.html || { echo "ABBRUCH: Buendel-Marke mobil102 fehlt."; exit 1; }
grep -q '"/assets/composer-anhang-chips.js"' public/sw.js || { echo "ABBRUCH: Precache-Eintrag composer-anhang-chips fehlt."; exit 1; }
grep -q 'uebernehmeAnhang' public/composer-plus-menu.js || { echo "ABBRUCH: Anhang-Chips nicht verdrahtet."; exit 1; }

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. Buendel + assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:start-styles | tail -1
npm run -s build:assets | tail -1
grep -q 'html:root' public/assets/start-styles.css || { echo "ABBRUCH: Buendel unter /assets/ ohne html:root."; exit 1; }
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/touch-ziele-waechter.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/csp-hosts.test.mjs tests/composer-anhang-chips.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public docs/frontend tests package.json | tr '\n' ' ')
git add ${=GEAENDERT}
git commit -q -m "fix(mobil): Vollbild — Glas-Gefaelle auf html:root, kein schwarzer Streifen; feat(anhang): Anhang-Chips fuer Video/PDF/Dokument statt Textzeile (composer-anhang-chips.js); Marken mobil102/werkzeuge-5/v4/werkzeuge-14/b118, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(mobil): Vollbild ohne schwarzen Streifen (html:root), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
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
  # package.json (check:frontend-Liste) bleibt Zweig-eigen: der Bauzweig hat eigene Skripte.
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Vollbild html:root + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 'https://smejj.com/assets/start-styles.css?v=mobil102-20260903' | grep -c 'html:root' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'mobil102-20260903' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v wurzel-fix=$e marke-in-index=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Vollbild-Fix live (smejj.com v${NEXT}). Am iPhone: App schliessen und neu oeffnen."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

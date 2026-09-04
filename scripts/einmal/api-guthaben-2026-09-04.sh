#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04: Guthaben-Leiste gestalten ausliefern.
#
# Befund aus der Live-Pruefung von smejj.com/entwickler.html: Fuer die Guthaben-Leiste
# (.ac-stats) gab es KEINE einzige CSS-Regel. Die drei Bloecke — Guthaben, Verbraucht
# (30 Tage), Heute — standen untereinander statt nebeneinander, und die beiden Trenner
# liefen als 720 px breite Balken quer durch die Seite.
#
# Was schon passiert ist (ohne Klick): Commit 5ea30f27 auf dem Zweig
# feature/api-guthaben-leiste im eigenen Worktree /private/tmp/claude-501/api-guthaben —
# eine Zeile mit Rahmen, Beschriftungen klein und in Grossbuchstaben, Werte gross,
# Trenner 1x34 px, "Aufladen" als Knopf statt nackter Text, am Handy ohne Trenner
# umbrechend. 68 Tests gruen, Markenkette gruen.
# Marken: api-center-surface v15, CSS v9, entwickler.js v18.
#
# Was dieser Klick tut: Zweig in design-v11 mergen -> die drei GESPERRTEN Kettenglieder
# (premium-surfaces -> app.js -> index.html) zur Laufzeit hochziehen -> SW +1 -> assets ->
# Start-Lock stempeln -> Pruefungen -> Commit -> Frontend-Klon (live) -> Bauzweig -> Live-Beweis.
#
# Rollback: git revert -m 1 des Merge-Commits in design-v11; im Klon und im Bauzweig
# git revert des jeweiligen Commits.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
ZWEIG="feature/api-guthaben-leiste"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): Die Guthaben-Leiste auf smejj.com/entwickler.html bekommt ihre fehlende Gestaltung — die drei Bloecke stehen wieder nebeneinander, die Trenner sind schmale Striche statt Balken quer durch die Seite, 'Aufladen' ist ein Knopf. Dafuer Marken api-center-surface v15, CSS v9, entwickler.js v18 und die drei Kettenglieder darueber, Service-Worker-Cache +1. Grundlage: Live-Pruefung der Entwicklerseite 2026-09-04."

abbruch() { echo "ABBRUCH: $1 — bitte diese Ausgabe in den Chat kopieren."; exit "${2:-1}"; }

cd "$REPO" || abbruch "Arbeitskopie nicht erreichbar" 2
echo "== 0. Ausgangslage"
git log --oneline -1
[ "$(git branch --show-current)" = "feature/design-v11" ] || abbruch "Arbeitskopie steht auf '$(git branch --show-current)', nicht auf feature/design-v11" 3
git rev-parse --verify -q "$ZWEIG" >/dev/null || abbruch "Zweig $ZWEIG fehlt" 3
git merge-base --is-ancestor 5ea30f27 "$ZWEIG" || abbruch "Commit 5ea30f27 liegt nicht auf $ZWEIG" 3
DIRTY=$(git status --porcelain -- public docs/frontend | grep -v '^??' | wc -l | tr -d ' ')
if [ "$DIRTY" != "0" ]; then
  git status --short -- public docs/frontend | head -20
  abbruch "Eine andere Sitzung hat ungesicherte Aenderungen an public/ — erst DEREN Kaskade klicken, dann diese hier" 3
fi
BASIS=$(git rev-parse HEAD)

echo "== 1. Zweig $ZWEIG in design-v11 mergen"
if ! git merge -q --no-ff "$ZWEIG" -m "merge(api-bereich): Guthaben-Leiste gestaltet ($ZWEIG: 5ea30f27)"; then
  git merge --abort 2>/dev/null
  abbruch "Merge-Konflikt — design-v11 ist seit dem Zweig weitergelaufen" 3
fi
git log --oneline -1

echo "== 2. Gesperrte Kettenglieder hochziehen (premium-surfaces -> app.js -> index.html)"
node scripts/einmal/api-guthaben-marken-2026-09-04.cjs || abbruch "Marken-Heber" 3
node scripts/check-markenkette.mjs | tail -1 || abbruch "Markenkette nach dem Heben nicht gruen" 3

echo "== 3. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || abbruch "Live-SW-Version nicht lesbar" 3
LOKAL=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1 | tr -dc '0-9')
NEXT=$(( (LIVE > LOKAL ? LIVE : LOKAL) + 1 ))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 4. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-markenkette.mjs | tail -1 || abbruch "Markenkette" 4
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1 || abbruch "Stempel" 5
npm run -s check:start-lock | tail -1 || abbruch "start-lock" 5
npm run -s check:auslieferung-lock | tail -1 || abbruch "auslieferung-lock" 5
npm run -s check:favicon-lock | tail -1 || abbruch "favicon-lock" 5
npm run -s check:modul-syntax | tail -1 || abbruch "modul-syntax" 5
node scripts/check-precache-imports.mjs | tail -1 || abbruch "precache-imports" 5
TESTLOG=$(mktemp /tmp/smejj-reiter-tests.XXXXXX)
node --test tests/api-reiter.test.mjs tests/api-laufzeit.test.mjs tests/i18n-ui.test.mjs tests/assets-sync.test.mjs \
  tests/module-queries.test.mjs tests/frontend-structure.test.mjs tests/modul-einmal-instanz.test.mjs \
  tests/touch-ziele-waechter.test.mjs tests/a11y-structure.test.mjs > "$TESTLOG" 2>&1 || true
grep -E "^ℹ (pass|fail)" "$TESTLOG" | tr '\n' ' '; echo
grep -q "^ℹ fail 0" "$TESTLOG" || { tail -30 "$TESTLOG"; abbruch "Tests rot — nichts wird gestempelt ausgeliefert" 6; }

echo "== 5. Commit design-v11"
git add -u public docs/frontend
git commit -q -m "fix(api-bereich): Guthaben-Leiste live — Kettenglieder hochgezogen, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-04)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE (Basis $(git rev-parse --short "$BASIS"))"

echo "== 6. Live stellen (Frontend-Klon) — Wurzel UND assets/"
cd "$KLON" || abbruch "Klon fehlt" 7
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git diff --name-only "$BASIS" "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(api-bereich): Guthaben-Leiste gestaltet (api-center-surface v15, CSS v9, entwickler v18), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main || abbruch "Push Klon" 7
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 7. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG" || abbruch "Worktree" 8
(
  cd "$WT" || exit 8
  git checkout "$QUELLE" -- $(cd "$REPO" && git diff --name-only "$BASIS" "$QUELLE" -- public docs/frontend tests scripts/einmal | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ oder control-server/ waere betroffen"; exit 8; }
  git commit -q -m "chore(auslieferung): Guthaben-Leiste im API-Bereich + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/, scripts/einmal)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
) || abbruch "Bauzweig-Abgleich" 8
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 8. Live-Beweis (bis 5 Minuten)"
for i in $(seq 1 20); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 "https://smejj.com/assets/entwickler.js?v=18" | grep -c 'api-center-surface.js?v=15' || true)
  r=$(curl -s -m 15 "https://smejj.com/assets/api-center-surface.css?v=9" | grep -c 'ac-stat-divider' || true)
  h=$(curl -s -m 15 https://smejj.com/entwickler.html | grep -o 'entwickler.js?v=[0-9]*')
  echo "$(date -u +%H:%M:%S) sw=$v entwickler=$e leiste=$r seite=$h"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ] && [ "$r" -ge 1 ] && [ "$h" = "entwickler.js?v=18" ]; then
    echo "FERTIG — Guthaben-Leiste live: https://smejj.com/entwickler.html (am iPhone: App schliessen und neu oeffnen)."
    exit 0
  fi
  sleep 15
done
echo "Noch nicht live — in 5 Minuten erneut pruefen: smejj.com/entwickler.html"
exit 1

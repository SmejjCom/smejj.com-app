#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04: Monatsbudget je ausgestelltem Schluessel ausliefern.
# Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkt 3 (Rest).
#
# Was schon passiert ist (ohne Klick): Commit e8cb9df7 auf dem Zweig feature/api-budget im
# EIGENEN Worktree /private/tmp/claude-501/api-budget — budgetToken je Schluessel, Monatszaehler,
# Torwaechter-Deckel (429 key_budget_exceeded), Route POST /api/admin/geld/api/budget mit Audit,
# Konsole: Budget-Feld, Spalte "Budget (Monat)", Aktion "Budget", Kachel "N am Budget-Deckel".
# 77 Tests gruen, check:admin-konsole gruen, Ansicht im Sandkasten gerendert.
#
# EIGENER Worktree, weil der geteilte /private/tmp/claude-501/bau-zweig am 04.09. um 11:10 UTC
# von einer Parallelsitzung per `git reset` zurueckgesetzt wurde und dabei ungesicherte Arbeit
# verloren ging. Diese Kaskade arbeitet nur hier und fasst den geteilten Worktree nicht an.
#
# Was dieser Klick tut: auf origin nachziehen -> Tests -> Admin-Lock stempeln -> Konsole in den
# Frontend-Klon spiegeln -> Bauzweig pushen (Zeabur baut) -> Klon pushen (smejj.com/admin) ->
# Live-Beweis.
#
# Rollback: git revert e8cb9df7 im Bauzweig + neuer Stempel; im Klon git revert des Deploy-Commits.
set -uo pipefail
W="/private/tmp/claude-501/api-budget"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): Monatsbudget je ausgestelltem API-Schluessel — Owner/Admin setzen in der Konsole unter 'API & Schluessel' ein Token-Budget je Kalendermonat, der Torwaechter lehnt darueber mit 429 key_budget_exceeded ab; Route /api/admin/geld/api/budget mit Audit apikey.budget, Konsole views-stage7.js/console-stage7.js, adminGeldRoutes.js. Der Stempel deckt auch console.css und views-stage9.js aus der Autopiloten-Arbeit anderer Sitzungen. Grundlage: Beschluss 2026-09-03 (docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md) und Wahl 'Budget je Schluessel bauen'."

abbruch() { echo "ABBRUCH: $1 — bitte diese Ausgabe in den Chat kopieren."; exit "${2:-1}"; }

[ -d "$W" ] || abbruch "Arbeitskopie fehlt unter $W (Worktree entfernt?)" 2
cd "$W" || abbruch "cd $W" 2
echo "== 0. Ausgangslage"
git log --oneline -1
[ "$(git branch --show-current)" = "feature/api-budget" ] || abbruch "erwartet feature/api-budget, gefunden $(git branch --show-current)" 3
git merge-base --is-ancestor e8cb9df7 HEAD || abbruch "Commit e8cb9df7 (Budget) liegt nicht auf HEAD" 3
[ -z "$(git status --porcelain -- control-server src tests | grep -v '^??')" ] || { git status --short -- control-server src tests | head; abbruch "ungesicherte Aenderungen"; }

echo "== 1. Auf origin nachziehen (Parallelsitzungen arbeiten am selben Zweig)"
git fetch -q origin "$BAUZWEIG" || abbruch "fetch" 3
if ! git rebase -q "origin/$BAUZWEIG"; then
  git rebase --abort 2>/dev/null
  abbruch "Rebase-Konflikt gegen origin/$BAUZWEIG — bitte im Chat melden" 3
fi
git log --oneline -1

echo "== 2. Tests + Konsolen-Pruefer"
TESTLOG=$(mktemp /tmp/smejj-budget-tests.XXXXXX)
node --test tests/admin-api-schluessel.test.mjs control-server/src/admin/adminRoles.test.js \
  tests/oeffentliche-api.test.mjs tests/api-laufzeit.test.mjs \
  control-server/src/routes/adminWriteRoutes.test.js control-server/src/admin/opsSicherheit.test.js > "$TESTLOG" 2>&1 || true
grep -E "^ℹ (pass|fail)" "$TESTLOG" | tr '\n' ' '; echo
grep -q "^ℹ fail 0" "$TESTLOG" || { tail -30 "$TESTLOG"; abbruch "Tests rot — nichts wird gestempelt" 4; }
npm run -s check:admin-konsole | tail -1 || abbruch "check:admin-konsole rot" 4

echo "== 3. Admin-Lock stempeln"
node scripts/check-admin-lock.mjs --freeze --confirm "$WORTLAUT" | tail -1 || abbruch "Stempel fehlgeschlagen" 5
node scripts/check-admin-lock.mjs | tail -1 || abbruch "Admin-Lock nach dem Stempel nicht gruen" 6

echo "== 4. Konsole in den Frontend-Klon spiegeln"
cd "$KLON" || abbruch "Klon fehlt unter $KLON" 7
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
cd "$W"
node scripts/deploy/sync_admin_console_pages.mjs "$KLON" | grep -E '"modus"' | head -1
node scripts/deploy/sync_admin_console_pages.mjs --pruefen | tail -1 || abbruch "Spiegel-Manifest nicht gruen" 7

echo "== 5. Bauzweig pushen (Zeabur baut smejj-control)"
git add docs/security docs/frontend/admin-console-sync.json 2>/dev/null
git diff --cached --quiet && echo "Hinweis: kein Manifest geaendert" || git commit -q -m "chore(admin-lock): Stempel Monatsbudget je Schluessel (apikey.budget, Konsole API & Schluessel), Betreiber-Doppelklick 2026-09-04" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -q origin "HEAD:$BAUZWEIG" || abbruch "Push Bauzweig (jemand war schneller? Kaskade einfach erneut klicken)" 8
QUELLE=$(git rev-parse --short HEAD); echo "Bauzweig $QUELLE gepusht — Zeabur baut"
GEPUSHT_UM=$(date -u +%s)

echo "== 6. Klon pushen (smejj.com/admin)"
cd "$KLON"
git add -A admin
git diff --cached --quiet && echo "Hinweis: Klon unveraendert" || git commit -q -m "deploy(admin): Monatsbudget je ausgestelltem Schluessel (Budget-Feld, Spalte, Aktion) — Quelle Bauzweig $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main || abbruch "Push Klon" 9
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 7. Live-Beweis (bis 6 Minuten)"
for i in $(seq 1 24); do
  k=$(curl -s -m 15 "https://smejj.com/admin/views-stage7.js?x=$i" | grep -c 'admBudget' || true)
  c=$(curl -s -m 15 "https://smejj.com/admin/console-stage7.js?x=$i" | grep -c 'api/budget' || true)
  g=$(curl -s -m 15 https://smejj-control.zeabur.app/api/health | grep -o '"gestartetAm": *"[^"]*"' | grep -o '20[0-9-]*T[0-9:.]*Z' || true)
  gs=$(date -u -j -f "%Y-%m-%dT%H:%M:%S" "${g%.*}" +%s 2>/dev/null || echo 0)
  echo "$(date -u +%H:%M:%S) konsole=$k/$c control-neustart=$g"
  if [ "$k" -ge 1 ] && [ "$c" -ge 1 ] && [ "$gs" -gt "$GEPUSHT_UM" ]; then
    echo "FERTIG — Budget je Schluessel live: https://smejj.com/admin/api/ (Seite neu laden, falls sie offen war)."
    exit 0
  fi
  sleep 15
done
echo "Noch nicht komplett live (GitHub Pages oder Zeabur brauchen laenger) — in 5 Minuten erneut pruefen: smejj.com/admin/api/"
exit 1

#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04: Admin stellt API-Schluessel aus (smejj-adm-…) ausliefern.
# Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkte 3-5.
#
# Was schon passiert ist (ohne Klick): Bauzweig-Commit 3f211fde LOKAL im Worktree
# /private/tmp/claude-501/bau-zweig — publicApiAdminKeys.js, Recht apikeys.issue, Route
# /api/admin/geld/api/{ausgestellt,ausstellen,widerrufen} mit Audit, Konsole "API & Schluessel"
# mit Formular/Einmal-Anzeige/Tabelle/Widerruf; 60 Tests gruen, check:admin-konsole gruen.
# NICHT gepusht: vier Dateien der Admin-Sicherheitskette sind geaendert (adminRoles.js,
# adminGeldRoutes.js, views-stage7.js, console-stage7.js) — dazu zwei fremde, seit dem letzten
# Stempel am 03.09. 11:37 UTC geaenderte (opsAutopilotenBereiche.js, views-stage9.js, aus dem
# Nr.-72-Audit). Der Stempel ist die Freigabe der Kette; erst danach geht der Push raus.
#
# Was dieser Klick tut: Tests -> Admin-Lock stempeln -> Konsole in den Frontend-Klon spiegeln ->
# Bauzweig committen + pushen (Zeabur baut smejj-control) -> Klon pushen (smejj.com/admin) ->
# Live-Beweis. design-v11 bleibt unangetastet: seine Konsolen-Kopie hinkt dem Bauzweig seit
# Wochen hinterher und hat eine eigene Sperre — das ist ein anderes Vorhaben.
#
# Rollback: im Bauzweig `git revert 3f211fde` + neuer Stempel; im Klon git revert des
# Deploy-Commits.
set -uo pipefail
BAU="/private/tmp/claude-501/bau-zweig"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): Admin-Schluessel — Owner/Admin stellen in der Konsole unter 'API & Schluessel' Schluessel smejj-adm-… fuer Dritte aus (Empfaenger, Laufzeit 30 Tage bis 30 Jahre oder unbefristet, Notiz), widerrufen sie mit Grund, alles im Audit-Log; Recht apikeys.issue (adminRoles.js), Route adminGeldRoutes.js, Konsole views-stage7.js/console-stage7.js. Der Stempel deckt auch opsAutopilotenBereiche.js und views-stage9.js aus dem Nr.-72-Audit vom 03.09. Grundlage: Beschluss 2026-09-03 (docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md) und Wahl 'Admin-Bereich bauen'."

abbruch() { echo "ABBRUCH: $1 — bitte diese Ausgabe in den Chat kopieren."; exit "${2:-1}"; }

[ -d "$BAU" ] || abbruch "Arbeitskopie des Bauzweigs fehlt unter $BAU" 2
cd "$BAU" || abbruch "cd $BAU" 2
echo "== 0. Ausgangslage"
git log --oneline -1
[ "$(git branch --show-current)" = "$BAUZWEIG" ] || abbruch "erwartet $BAUZWEIG, gefunden $(git branch --show-current)" 3
git merge-base --is-ancestor 3f211fde HEAD || abbruch "Commit 3f211fde (Admin-Schluessel) liegt nicht auf HEAD" 3
[ -z "$(git status --porcelain -- control-server src tests | grep -v '^??')" ] || { git status --short -- control-server src tests | head; abbruch "ungesicherte Aenderungen an Serverdateien"; }

echo "== 1. Tests + Konsolen-Pruefer"
TESTLOG=$(mktemp /tmp/smejj-admin-tests.XXXXXX)
node --test tests/admin-api-schluessel.test.mjs control-server/src/admin/adminRoles.test.js tests/oeffentliche-api.test.mjs tests/api-laufzeit.test.mjs control-server/src/routes/adminWriteRoutes.test.js > "$TESTLOG" 2>&1 || true
grep -E "^ℹ (pass|fail)" "$TESTLOG" | tr '\n' ' '; echo
grep -q "^ℹ fail 0" "$TESTLOG" || { tail -30 "$TESTLOG"; abbruch "Tests rot — nichts wird gestempelt" 4; }
npm run -s check:admin-konsole | tail -1 || abbruch "check:admin-konsole rot" 4

echo "== 2. Admin-Lock stempeln"
node scripts/check-admin-lock.mjs --freeze --confirm "$WORTLAUT" | tail -1 || abbruch "Stempel fehlgeschlagen" 5
node scripts/check-admin-lock.mjs | tail -1 || abbruch "Admin-Lock nach dem Stempel nicht gruen" 6

echo "== 3. Konsole in den Frontend-Klon spiegeln"
cd "$KLON" || abbruch "Klon fehlt unter $KLON" 7
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
cd "$BAU"
node scripts/deploy/sync_admin_console_pages.mjs "$KLON" | grep -E '"modus"|"geschrieben"' | head -2
node scripts/deploy/sync_admin_console_pages.mjs --pruefen | tail -1 || abbruch "Spiegel-Manifest nach dem Spiegeln nicht gruen" 7

echo "== 4. Bauzweig committen + pushen (Zeabur baut smejj-control)"
git add docs/security docs/frontend/admin-console-sync.json 2>/dev/null
git diff --cached --quiet && echo "Hinweis: kein Manifest geaendert" || git commit -q -m "chore(admin-lock): Stempel Admin-Schluessel (apikeys.issue, adminGeldRoutes, Konsole API & Schluessel) + Spiegel-Manifest, Betreiber-Doppelklick 2026-09-04" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -q origin "HEAD:$BAUZWEIG" || abbruch "Push Bauzweig" 8
QUELLE=$(git rev-parse --short HEAD); echo "Bauzweig $QUELLE gepusht — Zeabur baut"
GEPUSHT_UM=$(date -u +%s)

echo "== 5. Klon pushen (smejj.com/admin)"
cd "$KLON"
git add -A admin
git diff --cached --quiet && echo "Hinweis: Klon unveraendert" || git commit -q -m "deploy(admin): Admin stellt API-Schluessel aus (API & Schluessel: Formular, Einmal-Anzeige, Widerruf) — Quelle Bauzweig $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main || abbruch "Push Klon" 9
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 6. Live-Beweis (bis 5 Minuten): Konsole auf smejj.com/admin + Control neu gestartet"
for i in $(seq 1 30); do
  k=$(curl -s -m 15 https://smejj.com/admin/views-stage7.js | grep -c 'admAusstellen' || true)
  c=$(curl -s -m 15 https://smejj.com/admin/console-stage7.js | grep -c 'api/ausgestellt' || true)
  g=$(curl -s -m 15 https://smejj-control.zeabur.app/api/health | grep -o '"gestartetAm": *"[^"]*"' | grep -o '20[0-9-]*T[0-9:.]*Z' || true)
  gs=$(date -u -j -f "%Y-%m-%dT%H:%M:%S" "${g%.*}" +%s 2>/dev/null || echo 0)
  echo "$(date -u +%H:%M:%S) konsole=$k/$c control-neustart=$g"
  if [ "$k" -ge 1 ] && [ "$c" -ge 1 ] && [ "$gs" -gt "$GEPUSHT_UM" ]; then
    echo "FERTIG — Admin-Schluessel live: https://smejj.com/admin/api/ zeigt 'Ausgestellte Schlüssel'. (Seite neu laden, falls sie offen war.)"
    exit 0
  fi
  sleep 10
done
echo "Noch nicht komplett live (GitHub Pages oder Zeabur brauchen laenger) — in 5 Minuten erneut pruefen: smejj.com/admin/api/"
exit 1

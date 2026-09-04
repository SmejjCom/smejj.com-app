#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04: bedienbare Schluessel-Ausgabe ausliefern.
#
# Betreiber-Befund live: "Wenn ich 30 Tage, 90 Tage oder Unbefristet waehle, macht nichts.
# Schluessel ausstellen klick, macht nichts, ist kaputt." Nachgemessen: der Aufruf ging
# jedes Mal korrekt raus — aber der Ausloeser war ein 17 px hoher TEXT ohne Rahmen, die
# Eingabefelder 34 px, das Laufzeit-Menue 19 px, alle ohne Beschriftung in einer Leiste,
# und die Erfolgsmeldung stand weit oben ausserhalb des Blickfelds.
#
# Was schon passiert ist (ohne Klick): Commit fed29299 im Worktree
# /private/tmp/claude-501/api-budget — beschriftetes Formular mit Pflicht-Kennzeichnung,
# alle Felder und der Hauptknopf 44 px, echter Knopf statt Textzeile, Rueckmeldung direkt
# am Knopf, Sperre + "Wird ausgestellt …" waehrend des Laufs, Sprung ins leere Pflichtfeld,
# Budget-Eingabe vorab geprueft, frischer Schluessel in eigenem gruenen Kasten mit
# Kopier-Knopf, Zustand ausgeschrieben ("● Aktiv" gruen), Zeilen-Aktionen als Knoepfe.
# 85 Tests gruen, check:admin-konsole gruen, Ansicht im Sandkasten gerendert.
#
# Was dieser Klick tut: auf origin nachziehen -> Tests -> Admin-Lock stempeln -> Konsole in
# den Frontend-Klon spiegeln -> Bauzweig pushen (Zeabur) -> Klon pushen (smejj.com/admin) ->
# Live-Beweis.
#
# Rollback: git revert fed29299 im Bauzweig + neuer Stempel; im Klon git revert des
# Deploy-Commits.
set -uo pipefail
W="/private/tmp/claude-501/api-budget"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): Die Schluessel-Ausgabe im Adminbereich wird bedienbar — beschriftetes Formular, alle Felder und der Knopf 44 px, echter Knopf statt Textzeile, Rueckmeldung am Knopf, frischer Schluessel in eigenem Kasten mit Kopier-Knopf, Zustand ausgeschrieben und farbig. Betrifft views-stage7.js, console-stage7.js, console.css. Der Stempel deckt auch opsAutopilotenBereiche.js aus der Autopiloten-Arbeit anderer Sitzungen. Grundlage: Betreiber-Meldung 2026-09-04 'macht nichts, ist kaputt — soll kinderleicht, idiotensicher und professionell funktionieren'."

abbruch() { echo "ABBRUCH: $1 — bitte diese Ausgabe in den Chat kopieren."; exit "${2:-1}"; }

[ -d "$W" ] || abbruch "Arbeitskopie fehlt unter $W (Worktree entfernt?)" 2
cd "$W" || abbruch "cd $W" 2
echo "== 0. Ausgangslage"
git log --oneline -1
[ "$(git branch --show-current)" = "feature/api-budget" ] || abbruch "erwartet feature/api-budget, gefunden $(git branch --show-current)" 3
git merge-base --is-ancestor fed29299 HEAD || abbruch "Commit fed29299 (bedienbare Ausgabe) liegt nicht auf HEAD" 3
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
git diff --cached --quiet && echo "Hinweis: kein Manifest geaendert" || git commit -q -m "chore(admin-lock): Stempel bedienbare Schluessel-Ausgabe (Formular, Knoepfe, 44 px, Kopier-Kasten), Betreiber-Doppelklick 2026-09-04" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -q origin "HEAD:$BAUZWEIG" || abbruch "Push Bauzweig (jemand war schneller? Kaskade einfach erneut klicken)" 8
QUELLE=$(git rev-parse --short HEAD); echo "Bauzweig $QUELLE gepusht — Zeabur baut"
GEPUSHT_UM=$(date -u +%s)

echo "== 6. Klon pushen (smejj.com/admin)"
cd "$KLON"
git add -A admin
git diff --cached --quiet && echo "Hinweis: Klon unveraendert" || git commit -q -m "deploy(admin): bedienbare Schluessel-Ausgabe (Formular mit Beschriftungen, echte Knoepfe, Kopier-Kasten) — Quelle Bauzweig $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main || abbruch "Push Klon" 9
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 7. Live-Beweis (bis 6 Minuten)"
for i in $(seq 1 24); do
  k=$(curl -s -m 15 "https://smejj.com/admin/views-stage7.js?x=$i" | grep -c 'adm-form' || true)
  c=$(curl -s -m 15 "https://smejj.com/admin/console-stage7.js?x=$i" | grep -c 'sageAmKnopf' || true)
  s=$(curl -s -m 15 "https://smejj.com/admin/console.css?x=$i" | grep -c 'adm-gross' || true)
  echo "$(date -u +%H:%M:%S) formular=$k knopf=$c stile=$s"
  if [ "$k" -ge 1 ] && [ "$c" -ge 1 ] && [ "$s" -ge 1 ]; then
    echo "FERTIG — bedienbare Schluessel-Ausgabe live: https://smejj.com/admin/api/ (Seite neu laden, falls sie offen war)."
    exit 0
  fi
  sleep 15
done
echo "Noch nicht komplett live (GitHub Pages oder Zeabur brauchen laenger) — in 5 Minuten erneut pruefen: smejj.com/admin/api/"
exit 1

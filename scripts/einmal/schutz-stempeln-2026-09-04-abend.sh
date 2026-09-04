#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-04, abends):
# "100 % Schutz aktivieren" nach dem A-bis-Z-Livetest.
#
# Zu stempeln sind zwei Sperren:
#   start-lock     public/sw.js                 Cache-Nummer v752 -> v755
#                  public/index.html            preconnect auf api.smejj.com
#                                               (5 Zeilen; erster API-Ruf startet
#                                               dadurch bei 436 statt 2130 ms)
#                  public/composer-plus-menu.js NICHT von dieser Sitzung geaendert:
#                                               Repo und Auslieferung sind identisch
#                                               (5f3a314d), das Manifest vom 04.09.
#                                               11:48 UTC haelt eine Fassung fest,
#                                               die es nirgends gibt. Beim Stempeln
#                                               lag eine nicht eingecheckte Datei in
#                                               der Arbeitskopie (Hausregel:
#                                               "Lock-Manifest wird mitgeaendert").
#   security-lock  src/shared/controlAccessPolicy.js
#                                               /api/puls oeffentlich (Autopilot
#                                               Nr. 81, Besucher-Puls)
#
# WICHTIG, Lehre aus genau diesem Befund: Gestempelt wird aus einem FRISCHEN,
# eigenen Arbeitsbaum vom Stand des Zweiges — nie aus einer Arbeitskopie, in der
# noch etwas Ungespeichertes liegen koennte. Sonst friert der Stempel Dateien
# ein, die niemand nachvollziehen kann.
#
# Der Auto-Modus einer Sitzung darf nicht stempeln (Betreiber-Regel 03.09.) —
# deshalb dieser Klick.
set -u

ZWEIG="feature/auth-redesign-github-magiclink"
QUELLE="/private/tmp/claude-501/bau-zweig"
BAUM="/private/tmp/claude-501/stempel-$(date +%Y%m%d-%H%M%S)"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04: 'Danach alles 100% schuetzen: Bestehende Funktionen duerfen nicht kaputtgehen und nichts darf ohne meine schriftliche Bestaetigung geaendert werden.' — Stempel nach dem A-bis-Z-Livetest: sw.js v755 (gelesene Seite zaehlt als Fund, Knopfbreite, toter Aktionsknopf entfernt), index.html mit preconnect auf api.smejj.com, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls (Autopilot Nr. 81)"

[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
cd "$QUELLE" || exit 2

echo "1/6 Stand holen ..."
git fetch -q origin "$ZWEIG" || exit 3

echo "2/6 Frischen Arbeitsbaum anlegen (fremde Arbeit bleibt unberuehrt) ..."
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || exit 4
# Die Tests brauchen die Abhaengigkeiten; ein frischer Baum hat keine.
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    $(git log --oneline -1)"

aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "3/6 Tests der betroffenen Bereiche ..."
if ! node --test tests/tool-loop.test.mjs tests/chat-schritte.test.mjs tests/runde2-waechter.test.mjs \
      tests/besucher-puls.test.mjs tests/konto-formulare.test.mjs tests/rechtslinks.test.mjs \
      tests/smejj-1-1-datensatz.test.mjs tests/trainings-reife.test.mjs tests/modell-evolution.test.mjs; then
  echo "ABBRUCH: Tests rot — nicht gestempelt"; aufraeumen; exit 5
fi

echo "4/6 Sperren stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; aufraeumen; exit 6; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; aufraeumen; exit 6; }

echo "5/6 Alle vier Sperren pruefen ..."
for pruefung in start security admin favicon; do
  node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; aufraeumen; exit 7; }
done

echo "6/6 Manifeste committen und hochladen ..."
GEAENDERT="$(git status --short docs/security docs/frontend docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  echo "Hinweis: kein Manifest geaendert — war schon gestempelt."
else
  git add $GEAENDERT || { aufraeumen; exit 8; }
  git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
    -m "chore(schutz): Start- und Security-Lock nach dem A-bis-Z-Livetest gestempelt (Betreiber-Doppelklick 2026-09-04)" \
    -m "sw.js v755, index.html mit preconnect, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls." \
    -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { aufraeumen; exit 8; }
  if ! git push -q origin "HEAD:$ZWEIG"; then
    echo "Push abgelehnt (der Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."
    aufraeumen; exit 9
  fi
fi

echo
git log --oneline -2
aufraeumen
echo
echo "FERTIG — alle vier Sperren gruen und eingefroren."
exit 0

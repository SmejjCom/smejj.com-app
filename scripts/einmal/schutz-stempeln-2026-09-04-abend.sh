#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-04, abends):
# "100 % Schutz aktivieren" nach dem A-bis-Z-Livetest.
#
# Zu stempeln sind zwei Sperren:
#   start-lock     public/sw.js               Cache-Nummer v752 -> v755 (drei
#                                             Auslieferungen: gelesene Seite,
#                                             Knopfbreite, toter Aktionsknopf)
#                  public/composer-plus-menu.js
#                                             NICHT von dieser Sitzung geaendert!
#                                             Repo und Auslieferung sind identisch
#                                             (5f3a314d…); das Manifest vom 04.09.
#                                             11:48 UTC haelt einen Stand fest, den
#                                             es im Zweig nicht gibt — beim
#                                             Stempeln lag eine nicht eingecheckte
#                                             Fassung in der Arbeitskopie
#                                             (Hausregel: "Lock-Manifest wird
#                                             mitgeaendert"). Der Neustempel heilt
#                                             das auf den ausgelieferten Stand.
#   security-lock  src/shared/controlAccessPolicy.js
#                                             /api/puls in der oeffentlichen
#                                             Erlaubnisliste (Autopilot Nr. 81,
#                                             Besucher-Puls) — live und getestet.
#
# WICHTIG, Lehre aus genau diesem Befund: Es wird NUR gestempelt, wenn die
# geschuetzten Dateien in der Arbeitskopie eingecheckt sind. Sonst friert der
# Stempel einen Stand ein, den niemand nachvollziehen kann.
#
# Der Auto-Modus einer Sitzung darf nicht stempeln (Betreiber-Regel 03.09.) —
# deshalb dieser Klick.
set -u

BAUZWEIG="/private/tmp/claude-501/bau-zweig"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04: 'Danach alles 100% schuetzen: Bestehende Funktionen duerfen nicht kaputtgehen und nichts darf ohne meine schriftliche Bestaetigung geaendert werden.' — Stempel nach dem A-bis-Z-Livetest: sw.js v755 (gelesene Seite zaehlt als Fund, Knopfbreite, toter Aktionsknopf entfernt), composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls (Autopilot Nr. 81)"

[ -e "$BAUZWEIG/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $BAUZWEIG"; exit 2; }
cd "$BAUZWEIG" || exit 2

ZWEIG="$(git branch --show-current)"
if [ "$ZWEIG" != "feature/auth-redesign-github-magiclink" ]; then
  echo "ABBRUCH: erwartet Bauzweig feature/auth-redesign-github-magiclink, gefunden: ${ZWEIG:-losgeloest}"
  exit 3
fi

echo "1/6 Stand holen (fremde Arbeit bleibt unberuehrt) ..."
git fetch -q origin feature/auth-redesign-github-magiclink || exit 4
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/feature/auth-redesign-github-magiclink)" ]; then
  echo "ABBRUCH: die Arbeitskopie ist nicht auf dem Stand des Zweiges."
  echo "         Sonst wuerde ein alter Stand eingefroren. Bitte im Chat Bescheid geben."
  exit 4
fi

echo "2/6 Sind die geschuetzten Dateien eingecheckt? ..."
OFFEN="$(git status --porcelain -- public src/shared docs/security docs/frontend | grep -v '^?? ' || true)"
if [ -n "$OFFEN" ]; then
  echo "ABBRUCH: nicht eingecheckte Aenderungen an geschuetzten Pfaden:"
  printf '%s\n' "$OFFEN"
  echo "         Genau so entstand der falsche Hash vom 04.09. 11:48 UTC."
  exit 5
fi

echo "3/6 Tests der betroffenen Bereiche ..."
node --test tests/tool-loop.test.mjs tests/chat-schritte.test.mjs tests/runde2-waechter.test.mjs tests/besucher-puls.test.mjs tests/konto-formulare.test.mjs \
  || { echo "ABBRUCH: Tests rot — nicht gestempelt"; exit 6; }

echo "4/6 Sperren stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; exit 7; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; exit 7; }

echo "5/6 Alle vier Sperren pruefen ..."
node scripts/check-start-lock.mjs || exit 8
node scripts/check-security-lock.mjs || exit 8
node scripts/check-admin-lock.mjs || exit 8
node scripts/check-favicon-lock.mjs || exit 8

echo "6/6 Manifeste committen und hochladen ..."
GEAENDERT="$(git status --short docs/security docs/frontend docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  echo "Hinweis: kein Manifest geaendert — war schon gestempelt."
else
  git add $GEAENDERT || exit 9
  git commit -q -m "chore(schutz): Start- und Security-Lock nach dem A-bis-Z-Livetest gestempelt (Betreiber-Doppelklick 2026-09-04)" \
    -m "sw.js v755, composer-plus-menu.js auf den ausgelieferten Stand, controlAccessPolicy.js mit /api/puls. Betreiber-Anweisung: 'Danach alles 100% schuetzen'." \
    -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || exit 9
  git push -q origin HEAD:feature/auth-redesign-github-magiclink || { echo "Push abgelehnt (Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."; exit 10; }
fi

echo
git log --oneline -2
echo
echo "FERTIG — alle vier Sperren gruen und eingefroren."
exit 0

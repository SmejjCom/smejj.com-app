#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-04):
# "100 % Schutz aktivieren" — die zwei Sperren neu stempeln, die durch den
# Besucher-Puls (Autopilot Nr. 81) beruehrt wurden:
#
#   admin-lock     control-server/src/admin/opsAutopilotenBereiche.js
#                  (eine Kennung mehr im Bereich "Betrieb & Auslieferung")
#   security-lock  src/shared/controlAccessPolicy.js
#                  (/api/puls in der oeffentlichen Erlaubnisliste — begruendet
#                   im Code: die Menschen, um die es geht, haben noch kein Konto)
#
# Beide Aenderungen sind live und getestet. Der Stempel friert genau diesen
# Stand ein: danach faellt jede weitere Aenderung an diesen Dateien wieder auf.
#
# Der Auto-Modus einer Sitzung darf nicht stempeln (Betreiber-Regel 03.09.) —
# deshalb dieser Klick.
set -u

BAUZWEIG="/private/tmp/claude-501/bau-zweig"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-04: 'Zum Schluss bitte 100 % Schutz aktivieren: nichts darf kaputtgehen, geloescht oder ohne meine schriftliche Freigabe geaendert werden.' — Stempel fuer den Stand mit Besucher-Puls (Autopilot Nr. 81): opsAutopilotenBereiche.js (Bereichszuordnung) und controlAccessPolicy.js (/api/puls oeffentlich, ohne Konto messbar)"

[ -e "$BAUZWEIG/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $BAUZWEIG"; exit 2; }
cd "$BAUZWEIG" || exit 2

ZWEIG="$(git branch --show-current)"
if [ "$ZWEIG" != "feature/auth-redesign-github-magiclink" ]; then
  echo "ABBRUCH: erwartet Bauzweig feature/auth-redesign-github-magiclink, gefunden: ${ZWEIG:-losgeloest}"
  exit 3
fi

echo "1/5 Stand holen (fremde Arbeit bleibt unberuehrt) ..."
git fetch -q origin feature/auth-redesign-github-magiclink || exit 4

echo "2/5 Tests der betroffenen Waechter ..."
node --test tests/besucher-puls.test.mjs tests/runde2-waechter.test.mjs tests/modell-evolution.test.mjs tests/deckungs-waechter.test.mjs tests/autopiloten-ehrlichkeit.test.mjs \
  || { echo "ABBRUCH: Tests rot — nicht gestempelt"; exit 5; }

echo "3/5 Sperren stempeln ..."
node scripts/check-admin-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Admin-Lock nicht gestempelt"; exit 6; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; exit 6; }

echo "4/5 Alle Sperren pruefen ..."
node scripts/check-admin-lock.mjs || exit 7
node scripts/check-security-lock.mjs || exit 7
node scripts/check-start-lock.mjs || exit 7
node scripts/check-favicon-lock.mjs || exit 7

echo "5/5 Manifeste committen und hochladen ..."
GEAENDERT="$(git status --short docs/security docs/frontend docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  echo "Hinweis: kein Manifest geaendert — war schon gestempelt."
else
  git add $GEAENDERT || exit 8
  git commit -q -m "chore(schutz): Admin- und Security-Lock nach Autopilot Nr. 81 gestempelt (Betreiber-Doppelklick 2026-09-04)" \
    -m "opsAutopilotenBereiche.js (Bereich fuer besucher-puls) und controlAccessPolicy.js (/api/puls oeffentlich). Betreiber-Anweisung: '100 % Schutz aktivieren'." \
    -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || exit 8
  git push -q origin HEAD:feature/auth-redesign-github-magiclink || { echo "Push abgelehnt (Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."; exit 9; }
fi

echo
git log --oneline -2
echo
echo "FERTIG — alle vier Sperren gruen und eingefroren. Ab jetzt faellt jede Aenderung an diesen Dateien wieder auf."
exit 0

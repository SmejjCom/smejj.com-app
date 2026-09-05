#!/bin/zsh
# smejj.com — Doppelklick-Pruefung: laeuft der Webhook-Zweitweg wirklich?
#
# Sie schickt EIN Testereignis durch den echten Smee-Kanal und sieht nach, ob
# es am anderen Ende ankommt — und ob ein zweites, gleiches Ereignis richtig
# als Wiederholung erkannt wird.
#
# WICHTIG: Der Empfaenger ist hier ein Doppel des echten Eingangs (dieselbe
# Route, derselbe Replay-Schutz), NICHT der Produktionsserver. Ein
# Testereignis darf nie in der echten Zahlungslogik landen.
set -u
BAUM="/private/tmp/claude-501/bau-zweig"
ZUGANG="$HOME/.config/smejj.com/smee-zugang.txt"

[ -f "$ZUGANG" ] || { echo "ABBRUCH: $ZUGANG fehlt."; exit 2; }
[ -e "$BAUM/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $BAUM"; exit 2; }
cd "$BAUM" || exit 2

KANAL="$(grep -E '^SMEJJ_SMEE_KANAL=' "$ZUGANG" | head -1 | cut -d= -f2-)"
GEHEIM="$(grep -E '^SMEJJ_SMEE_RELAY_SECRET=' "$ZUGANG" | head -1 | cut -d= -f2-)"
[ -n "$KANAL" ] && [ -n "$GEHEIM" ] || { echo "ABBRUCH: Kanal oder Geheimnis fehlt in $ZUGANG"; exit 3; }

echo "Kanal:  $KANAL"
echo "Pruefe die Strecke — das dauert etwa 20 Sekunden."
echo
SMEJJ_SMEE_KANAL="$KANAL" SMEJJ_SMEE_RELAY_SECRET="$GEHEIM" node scripts/testing/smee-strecke.mjs
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then
  echo "FERTIG — der Zweitweg traegt."
else
  echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."
fi
exit "$STATUS"

#!/bin/zsh
# smejj.com — Doppelklick: den Webhook-Zweitweg fuer Zahlungen scharf schalten.
#
# WAS PASSIERT: Bei Stripe wird ein ZWEITER Empfaenger eingetragen —
# https://api.smejj.com/api/billing/stripe/webhook, die eigene Domain.
# Der bestehende Empfaenger (smejj-control.zeabur.app) BLEIBT unveraendert.
#
# WARUM DAS SICHER IST: Stripe schickt jedes Ereignis dann an BEIDE Adressen.
# Der Server verbucht es trotzdem nur einmal — jede Aufladung traegt eine
# Marke (api-billing/aufladungen/<sitzung>.json), und ist sie schon da, meldet
# der Server "topup_already_applied" und ruehrt das Guthaben nicht an. Beim Abo
# werden Werte gesetzt, nicht addiert. Doppeltes Geld ist damit ausgeschlossen;
# nachgelesen und geprueft am 2026-09-05.
#
# WARUM ES DAS BRAUCHT: Bisher gab es genau EINEN Empfaenger. Ist der nicht
# erreichbar, wiederholt Stripe eine Weile und gibt dann auf — die Zahlung ist
# eingegangen, das Guthaben fehlt. Zwei unabhaengige Adressen fangen das ab.
#
# WARUM NICHT UEBER SMEE: Ein Smee-Kanal ist oeffentlich lesbar. Zahlungs-
# ereignisse enthalten Betraege, Kunden-Kennungen und E-Mail-Adressen. Die
# gehoeren nicht in einen oeffentlichen Kanal — auch nicht kurz. Smee bleibt
# fuer unkritische Webhooks.
#
# Es wird NICHTS geloescht und keine Zahlung ausgeloest.
set -u
UMGEBUNG="$HOME/.config/smejj.com/env.local"
ZIEL="https://api.smejj.com/api/billing/stripe/webhook"

[ -f "$UMGEBUNG" ] || { echo "ABBRUCH: $UMGEBUNG fehlt."; exit 2; }
set -a; . "$UMGEBUNG"; set +a
[ -n "${STRIPE_SECRET_KEY:-}" ] || { echo "ABBRUCH: STRIPE_SECRET_KEY fehlt in $UMGEBUNG"; exit 3; }

echo "1/4 Bestehende Empfaenger lesen ..."
VORHER="$(curl -s --max-time 25 "https://api.stripe.com/v1/webhook_endpoints?limit=20" -u "$STRIPE_SECRET_KEY:")"
echo "$VORHER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'error' in d:
    print('   FEHLER:', d['error'].get('message','')[:120]); sys.exit(9)
for e in d.get('data',[]): print(f\"   {e.get('status'):8} {e.get('url','')}\")
print('   gesamt:', len(d.get('data',[])))
" || exit 9

if echo "$VORHER" | grep -q "api.smejj.com/api/billing/stripe/webhook"; then
  echo
  echo "FERTIG — der Zweitweg ist bereits eingetragen. Nichts zu tun."
  exit 0
fi

echo
echo "2/4 Zweiten Empfaenger anlegen: $ZIEL"
ANTWORT="$(curl -s --max-time 30 https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" \
  -d "url=$ZIEL" \
  -d "description=Zweitweg ueber die eigene Domain (Ausfallschutz)" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted")"

GEHEIM="$(echo "$ANTWORT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if 'error' in d:
    print('FEHLER:'+d['error'].get('message','')[:150]); sys.exit(0)
print(d.get('secret',''))
")"
case "$GEHEIM" in
  FEHLER:*) echo "   ABBRUCH: ${GEHEIM#FEHLER:}"; exit 4 ;;
  whsec_*) echo "   angelegt, Signatur-Geheimnis erhalten (${#GEHEIM} Zeichen)" ;;
  *) echo "   ABBRUCH: kein Signatur-Geheimnis in der Antwort."; exit 5 ;;
esac

echo
echo "3/4 Geheimnis sichern ..."
DATEI="$HOME/.config/smejj.com/stripe-zweitweg.txt"
{
  echo "# smejj.com — Signatur-Geheimnis des ZWEITEN Stripe-Empfaengers"
  echo "# Angelegt $(date). Gehoert in den Zeabur-Dienst smejj-control."
  echo "#"
  echo "# WICHTIG: Der Server prueft mit STRIPE_WEBHOOK_SECRET. Weil beide"
  echo "# Empfaenger auf denselben Endpunkt zeigen, muessen BEIDE Geheimnisse"
  echo "# akzeptiert werden — dafuer gibt es STRIPE_WEBHOOK_SECRET_ZWEITWEG."
  echo "STRIPE_WEBHOOK_SECRET_ZWEITWEG=$GEHEIM"
} > "$DATEI"
chmod 600 "$DATEI"
echo "   $DATEI (nur fuer dich lesbar)"

echo
echo "4/4 Nachlesen, was jetzt eingetragen ist ..."
curl -s --max-time 25 "https://api.stripe.com/v1/webhook_endpoints?limit=20" -u "$STRIPE_SECRET_KEY:" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for e in d.get('data',[]): print(f\"   {e.get('status'):8} {e.get('url','')}\")
print('   gesamt:', len(d.get('data',[])))
"
echo
echo "FERTIG — Zahlungen haben jetzt zwei Wege."
echo
echo "EIN SCHRITT FEHLT NOCH, und den kann nur der Betreiber tun:"
echo "  Im Zeabur-Portal beim Dienst smejj-control diesen Wert eintragen"
echo "  (er steht in $DATEI):"
echo "      STRIPE_WEBHOOK_SECRET_ZWEITWEG"
echo "  Danach den Dienst NEU BAUEN. Ohne diesen Wert lehnt der Server"
echo "  Ereignisse vom zweiten Weg ab — der Hauptweg laeuft unveraendert weiter."
exit 0

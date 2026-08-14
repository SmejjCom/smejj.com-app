#!/bin/zsh
# smejj.com — Abo-Zahlungen live verdrahten (Anmeldung, Webhook, Dankeseite,
# Backfill) in EINEM Doppelklick.
#
# Warum die Anmeldung hier drin steht und nicht in der Claude-Sitzung:
# `stripe login` ist eine Anmeldung an DEINEM Stripe-Konto — die bestaetigst nur
# du selbst im Browser. Der Sicherheits-Klassifikator laesst den Schritt aus der
# Sitzung heraus nicht zu, hier laeuft er unter deiner eigenen Hand.
#
# Es wird KEIN Geheimwert angezeigt — Secrets wandern nur per Zwischenablage
# zum Einfuegen in Zeabur (Service smejj-control -> Variables).
# Der Verlauf (ohne Geheimwerte) landet in tmp/abo-live-schalten.log, damit die
# Claude-Sitzung das Ergebnis nachlesen kann.

cd "$(dirname "$0")" || exit 1
NODE=/usr/local/bin/node
[ -x "$NODE" ] || NODE=$(command -v node)
STRIPE=$(command -v stripe)
LOG="tmp/abo-live-schalten.log"
mkdir -p tmp

echo "== smejj.com — Abo live schalten =="
echo ""

if [ -z "$STRIPE" ]; then
  echo "FEHLER: Die Stripe-CLI ist nicht installiert."
  echo "Installieren mit:  brew install stripe/stripe-cli/stripe"
  read -r "?Enter zum Schliessen..."
  exit 1
fi

# Schritt 0: Anmeldung — nur wenn noch keine vorliegt.
if [ ! -f "$HOME/.config/stripe/config.toml" ]; then
  echo "Schritt 0 von 6: Anmeldung bei Stripe."
  echo "Gleich oeffnet sich dein Browser. Bestaetige dort die Anfrage —"
  echo "der angezeigte Code muss mit dem im Browser uebereinstimmen."
  echo ""
  "$STRIPE" login
  if [ ! -f "$HOME/.config/stripe/config.toml" ]; then
    echo ""
    echo "Die Anmeldung wurde nicht abgeschlossen. Bitte dieses Fenster schliessen"
    echo "und die Datei erneut doppelklicken."
    read -r "?Enter zum Schliessen..."
    exit 1
  fi
  echo ""
  echo "Anmeldung erledigt."
  echo ""
fi

{
  echo "== Lauf vom $(date '+%Y-%m-%d %H:%M:%S') =="
  CONFIRM_ABO_LIVE=YES "$NODE" scripts/deploy/abo_live_schalten.mjs
  STATUS=$?
  echo ""
  if [ $STATUS -eq 0 ]; then
    echo ">>> Lauf beendet."
  else
    echo ">>> Fehlgeschlagen (Code $STATUS) — Meldung oben lesen."
  fi
} 2>&1 | tee "$LOG"
echo ""
echo "Ergebnis wurde auch in $LOG gespeichert. Dieses Fenster kann geschlossen werden."
read -r "?Enter zum Schliessen..."

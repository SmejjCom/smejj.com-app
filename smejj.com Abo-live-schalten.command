#!/bin/zsh
# smejj.com — Abo-Zahlungen live verdrahten (Webhook, Dankeseite, Backfill).
# Einfach doppelklicken. Voraussetzung: einmalig `stripe login` im Terminal.
# Es wird KEIN Geheimwert angezeigt — Secrets wandern nur per Zwischenablage
# zum Einfuegen in Zeabur (Service smejj-control -> Variables).
# Der Verlauf (ohne Geheimwerte) landet in tmp/abo-live-schalten.log, damit die
# Claude-Sitzung das Ergebnis nachlesen kann.

cd "$(dirname "$0")" || exit 1
NODE=/usr/local/bin/node
[ -x "$NODE" ] || NODE=$(command -v node)
LOG="tmp/abo-live-schalten.log"
mkdir -p tmp
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

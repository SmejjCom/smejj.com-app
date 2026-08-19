#!/bin/zsh
# smejj.com — Maus-Blocker Teil 0 abschliessen: setzt SMEJJ_MAUS_ENGINE_TOKEN
# auf smejj-control (Salad) auf den Wert, den die Engine nachweislich annimmt.
# Freigabe: docs/approvals/2026-08-13-maus-blocker-freigabe.md
# Einfach doppelklicken. Es wird KEIN Geheimwert angezeigt, nur Fingerabdruecke.
# Alles wird zusaetzlich nach tmp/maus-token-setzen.log geschrieben, damit die
# Claude-Sitzung das Ergebnis selbst nachlesen kann.

cd "$(dirname "$0")" || exit 1
NODE=/usr/local/bin/node
LOG="tmp/maus-token-setzen.log"
mkdir -p tmp
{
  echo "== Lauf vom $(date '+%Y-%m-%d %H:%M:%S') =="
  echo "== Schritt 1: Token setzen (lesen–ergaenzen–ganz-schreiben) =="
  CONFIRM_MAUS_ENV=YES "$NODE" scripts/deploy/set_maus_engine_env.mjs 2>&1
  STATUS=$?
  echo ""
  echo "== Schritt 2: Nachmessen =="
  "$NODE" scripts/diagnose/maus-abgleich.mjs 2>&1
  echo ""
  if [ $STATUS -eq 0 ]; then
    echo ">>> Fertig. Salad rollt ~10 Minuten neu aus; danach gilt die Messung oben."
  else
    echo ">>> Schritt 1 ist fehlgeschlagen (Code $STATUS)."
  fi
} 2>&1 | tee "$LOG"
echo ""
echo "Ergebnis wurde auch in $LOG gespeichert. Dieses Fenster kann geschlossen werden."
read -r "?Enter zum Schliessen..."

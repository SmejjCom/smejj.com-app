#!/bin/zsh
# smejj.com — die vier Betriebswerte auf smejj-control wieder eintragen.
#
# WARUM: Am 2026-08-17 trug der Dienst nur noch 35 Umgebungswerte statt 101.
# Ohne SMEJJ_WORKER_BUDGET_USD startet kein Maus-Lauf ("budget_gate_blockiert"),
# ohne PRESIGN_HARD_LIMIT_ALLOWED laesst sich keine Maus-Aufnahme ansehen
# ("rate_limit_not_enabled").
#
# Es werden KEINE Geheimnisse geschrieben — nur Kostendeckel und Schalter.
# Vorhandene Werte bleiben unberuehrt; ergaenzt wird ausschliesslich Fehlendes.
# Einfach doppelklicken. Alles wird nach tmp/control-betriebswerte.log
# geschrieben, damit die Claude-Sitzung das Ergebnis selbst nachlesen kann.

cd "$(dirname "$0")" || exit 1
NODE="$(command -v node || echo /usr/local/bin/node)"
LOG="tmp/control-betriebswerte.log"
mkdir -p tmp
{
  echo "== Lauf vom $(date '+%Y-%m-%d %H:%M:%S') =="
  CONFIRM_CONTROL_BETRIEBSWERTE=JA "$NODE" scripts/deploy/control-betriebswerte-wiederherstellen.mjs 2>&1
  STATUS=$?
  echo ""
  if [ $STATUS -eq 0 ]; then
    echo ">>> Fertig. Control startet dabei neu (etwa eine Minute)."
  else
    echo ">>> Fehlgeschlagen (Code $STATUS). Nichts wurde halb geschrieben —"
    echo "    das Skript liest jeden Wert zurueck und bricht bei Abweichung ab."
  fi
} 2>&1 | tee "$LOG"
echo ""
echo "Ergebnis steht auch in $LOG. Dieses Fenster kann geschlossen werden."
read -r "?Enter zum Schliessen..."

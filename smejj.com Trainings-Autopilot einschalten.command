#!/bin/zsh
# smejj.com — Trainings-Autopilot: was fehlt noch zum Einschalten?
#
# DIESE DATEI SCHALTET NICHTS EIN und startet keinen Trainingslauf.
# Sie zeigt nur, welche Werte im Zeabur-Portal stehen muessen, und prueft, was
# davon hier schon gesetzt ist. Das Einschalten kostet Geld und bleibt eine
# Entscheidung des Betreibers — es passiert im Portal, nicht hier.
#
# Geheimnisse werden NIE angezeigt, nur ihre Namen.

cd "$(dirname "$0")" || exit 1

if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
node scripts/deploy/lora-autopilot-bereitschaft.mjs
ERGEBNIS=$?

echo ""
echo "──────────────────────────────────────────────────────────────────────────────"
echo "Nichts wurde eingeschaltet, nichts wurde gestartet, es sind keine Kosten"
echo "entstanden. Der naechste Schritt liegt im Zeabur-Portal."
echo "──────────────────────────────────────────────────────────────────────────────"
echo ""
echo "Fenster kann geschlossen werden."
exit $ERGEBNIS

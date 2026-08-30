#!/bin/bash
# smejj.com — Oberflaechenwache: misst NACHTS die ausgelieferte Seite.
#
# WARUM ES SIE GIBT (2026-08-22)
#   Das V11-Design hatte 32 Touch-Ziele wieder unter 44 px gedrueckt, und vier
#   Ansichten liefen auf Tablet und kleinem Handy ueber den Rand. Beides stand
#   monatelang live, ohne dass irgendetwas anschlug — gemessen wurde nur bei
#   375 px und nur von Hand. Diese Wache faehrt beide Waechter jede Nacht
#   gegen die ECHTE Seite:
#     measure:responsive        19 Ansichten x 8 Geraeteklassen (320 bis 1920 px)
#     measure:touch:app         jedes bedienbare Element bei 375 px, echte Tipps
#     check:control-umgebung    fehlt ein Betriebswert, ohne den etwas stillsteht?
#
#   Gegen https://smejj.com und nicht gegen einen lokalen Server: was zaehlt,
#   ist was der Nutzer wirklich bekommt — samt Buendel, /assets/-Kopie und
#   Service-Worker-Vorrat. Genau dort lagen dieses Jahr die Fallen.
#
# FAIL-CLOSED: Jeder Abbruch ist ein Fehler. "Konnte nicht messen" ist NICHT
# "in Ordnung" — sonst meldet eine kaputte Wache jede Nacht Ruhe.
#
# AUFRUF
#   bash scripts/testing/oberflaechenwache.sh [--url https://smejj.com/]
#   Exit 0 = beide Waechter gruen. Exit 1 = mindestens einer meldet Verstoesse.
#
# Der Zeitgeber liegt bewusst NICHT hier, sondern in
# ~/.local/share/smejj-oberflaeche/wache.sh: macOS verweigert jedem
# Hintergrunddienst das LESEN unter ~/Library/CloudStorage/GoogleDrive-*
# (gemessen 2026-08-05, cron wie launchd). Dieses Skript hier wird aus einer
# Arbeitskopie ausserhalb von Drive aufgerufen.
set -u

ZIEL="https://smejj.com/"
if [ "${1:-}" = "--url" ] && [ -n "${2:-}" ]; then ZIEL="$2"; fi

WURZEL="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$WURZEL" || { echo "ABBRUCH: Projektwurzel nicht erreichbar."; exit 1; }

echo "===== $(date -u +%FT%TZ) Oberflaechenwache gegen ${ZIEL} ====="

command -v node >/dev/null 2>&1 || { echo "ABBRUCH: node nicht gefunden."; exit 1; }

# Ohne Chrome ist jede Aussage wertlos — dann lieber laut abbrechen.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="/Applications/Chromium.app/Contents/MacOS/Chromium"
[ -x "$CHROME" ] || CHROME="/usr/bin/google-chrome"
[ -x "$CHROME" ] || { echo "ABBRUCH: kein Chrome gefunden — es wurde NICHTS gemessen."; exit 1; }

FEHLER=0

echo ""
echo "--- 1/3 Responsive (19 Ansichten x 8 Geraeteklassen) ---"
if node scripts/testing/messe_responsive.mjs --url "$ZIEL"; then
  echo "[wache] responsive: gruen"
else
  echo "[wache] responsive: VERSTOESSE (siehe oben)"
  FEHLER=1
fi

echo ""
echo "--- 2/3 Touch-Ziele (375 px, echte Tipps) ---"
if node scripts/testing/measure_touch_targets_app.mjs --url "$ZIEL"; then
  echo "[wache] touch: gruen"
else
  echo "[wache] touch: VERSTOESSE (siehe oben)"
  FEHLER=1
fi

echo ""
echo "--- 3/3 Betriebswerte des Control-Servers ---"
# Warum das hier mitlaeuft und nicht in einer eigenen Wache: es ist dieselbe
# Frage — haelt der ausgelieferte Betrieb, was er verspricht? Und es ist die
# Luecke, die am teuersten war: SMEJJ_AUTOPILOT_KEYS fehlte vom 15. bis zum
# 22.08. im Zeabur-Env, die Ampel war blind, und der Pruefer dafuer existierte
# die ganze Zeit — er wurde nur nirgends aufgerufen. Ein zweiter Zeitgeber
# waere ein zweiter Ort, an dem genau das wieder passieren kann.
# Der Pruefer meldet nur FEHLENDE PFLICHTWERTE als Fehler; die uebrigen
# Luecken sind Hinweise mit Standard.
if node scripts/diagnose/control-umgebung-luecken.mjs; then
  echo "[wache] betriebswerte: gruen"
else
  echo "[wache] betriebswerte: PFLICHTWERT FEHLT (siehe oben)"
  FEHLER=1
fi

echo ""
if [ "$FEHLER" -eq 0 ]; then
  echo "[wache] ALLE DREI GRUEN — die ausgelieferte Oberflaeche haelt Mass, die Betriebswerte sind vollstaendig."
else
  echo "[wache] ROT — mindestens eine Pruefung meldet Verstoesse. Die Zeilen darueber nennen Ansicht, Element oder fehlenden Wert."
fi
exit "$FEHLER"

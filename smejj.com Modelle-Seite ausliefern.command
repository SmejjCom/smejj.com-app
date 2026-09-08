#!/bin/zsh
# smejj.com — Stempel fuer die Auslieferung der Modelle-Seite. Per Doppelklick.
#
# WAS DIESE DATEI TUT, IN EINEM SATZ:
# Sie hebt die Marken von 10 Modulen, die geaendert wurden ohne ihre Marke zu
# erhoehen, friert danach Markenkette und Start-Lock neu ein und laesst den
# vollstaendigen Release-Preflight laufen.
#
# WARUM ES DEINEN DOPPELKLICK BRAUCHT:
# Zwei der Module (app.js, premium-surfaces.js) stehen im Start-Lock. Das
# Einfrieren verlangt eine schriftliche Bestaetigung des Betreibers — im
# Auto-Modus wird sie verworfen. Dein Doppelklick IST diese Bestaetigung.
#
# ES WIRD NICHTS AUSGELIEFERT. Diese Datei aendert nur den lokalen Stand und
# prueft ihn. Das Ausliefern (Commit, Tag, Push) bleibt ein eigener Schritt.
set -euo pipefail

APP_VERZ="${0:A:h}"
cd "$APP_VERZ"

BESTAETIGUNG="Betreiber-Freigabe 2026-09-08: Marken der 10 haengengebliebenen Module heben und Modelle-Seite ausliefern"

echo "=============================================="
echo " smejj.com — Stempel Modelle-Seite (08.09.2026)"
echo "=============================================="
echo

echo "[1/5] Marken der 10 Module heben ..."
node scripts/einmal/modelle-seite-marken-2026-09-08.cjs
echo

echo "[2/5] Markenkette neu einfrieren ..."
node scripts/check-markenkette.mjs --freeze
echo

echo "[3/5] Start-Lock neu einfrieren ..."
node scripts/check-start-lock.mjs --freeze --confirm "$BESTAETIGUNG"
echo

echo "[4/5] Gegenprobe ohne Stempel — beides muss jetzt von allein gruen sein ..."
node scripts/check-markenkette.mjs
node scripts/check-start-lock.mjs
echo

echo "[5/5] Vollstaendiger Release-Preflight ..."
if npm run --silent release:preflight > /tmp/smejj-preflight.log 2>&1; then
  echo "  PREFLIGHT GRUEN."
  ERGEBNIS="Alles gruen. Die Modelle-Seite kann ausgeliefert werden."
  ART="informational"
else
  echo "  PREFLIGHT ROT — Protokoll: /tmp/smejj-preflight.log"
  tail -20 /tmp/smejj-preflight.log
  ERGEBNIS="Preflight noch rot. Protokoll liegt in /tmp/smejj-preflight.log."
  ART="critical"
fi

echo
echo "=============================================="
echo " $ERGEBNIS"
echo "=============================================="

osascript -e "display alert \"smejj.com — Stempel gesetzt\" message \"$ERGEBNIS\" as $ART" >/dev/null 2>&1 || true

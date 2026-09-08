#!/bin/zsh
# smejj.com — Stempel fuer die drei offenen Sperren. Per Doppelklick.
#
# WAS HIER FREIGEGEBEN WIRD, IN KLARTEXT:
#
# 1) admin-lock — 4 Dateien, ALLE aus dem Auftrag "Modelle-Seite":
#      adminOpsRoutes.js      neue Lese-Route /api/admin/ops/modellbestand
#      adminSurfaceRoutes.js  neue Schreib-Route /api/admin/modelle/* eingehaengt
#      adminUiRoutes.js       zwei neue Konsolendateien in die feste Liste
#      admin-ui/console.js    Stufe 14 angemeldet
#    Das ist eine echte Erweiterung des Adminbereichs. Die Sperre greift zu Recht.
#
# 2) modell-menue-lock — 3 Dateien, KEINE davon aus diesem Auftrag:
#      public/code-modell-menue.js, public/assets/code-modell-menue.js,
#      control-server/src/routes/providerRoutes.js
#    Alle drei sind byte-identisch mit ihrem Stand in git. Geaendert wurde
#    nichts — der Stempel ist aelter als die Dateien (eingefroren 05.09.).
#
# 3) security-lock — 1 Datei, ebenfalls nicht aus diesem Auftrag:
#      public/chat-bridge.js
#    Auch sie ist byte-identisch mit git. Zuletzt geaendert am 06.09. um 22:44,
#    eingefroren am 07.09. um 10:41 — der Stempel wurde offenbar in einem
#    anderen Zweig gesetzt. Kein Hinweis auf Manipulation.
#
# NACHTRAG 2026-09-08, zweiter Lauf:
#    Waehrend des ersten Stempelns hat Wof Kadavanich sieben Commits auf den
#    Bauzweig geschoben. Einer davon (4129bb6) ergaenzt in
#      control-server/src/admin/opsAutopilotenBereiche.js
#    genau DREI Zeilen: den Eintrag "code-sicherung" fuer den neuen
#    Autopiloten Nr. 85 samt Begruendung. Geprueft und harmlos — aber die
#    Datei steht im admin-lock, deshalb muss noch einmal gestempelt werden.
#
# ES WIRD NICHTS AUSGELIEFERT. Diese Datei stempelt nur und prueft danach.
# Commit, Tag und Push bleiben ein eigener Schritt.
set -euo pipefail

APP_VERZ="${0:A:h}"
cd "$APP_VERZ"

BESTAETIGUNG="Betreiber-Freigabe 2026-09-08: Modelle-Seite im Adminbereich ausliefern; die drei Sperren wurden Datei fuer Datei geprueft, die fremden vier sind byte-identisch mit git"

echo "=================================================="
echo " smejj.com — Sperren stempeln (08.09.2026)"
echo "=================================================="
echo

for SPERRE in admin-lock modell-menue-lock security-lock; do
  echo "[Stempel] $SPERRE ..."
  node "scripts/check-$SPERRE.mjs" --freeze --confirm "$BESTAETIGUNG"
  echo
done

echo "[Gegenprobe] Alle neun Sperren ohne Stempel ..."
FEHLER=0
for S in scripts/check-*lock*.mjs; do
  printf "  %-34s " "$(basename $S)"
  if node "$S" >/dev/null 2>&1; then echo "gruen"; else echo "ROT"; FEHLER=1; fi
done
echo

if [ "$FEHLER" -ne 0 ]; then
  echo "ABBRUCH: eine Sperre ist weiterhin rot."
  osascript -e 'display alert "smejj.com — Stempel unvollstaendig" message "Eine Sperre ist weiterhin rot. Bitte Claude Bescheid geben." as critical' >/dev/null 2>&1 || true
  exit 1
fi

echo "[Preflight] vollstaendiger Release-Preflight ..."
if npm run --silent release:preflight > /tmp/smejj-preflight.log 2>&1; then
  ERGEBNIS="Alles gruen. Die Modelle-Seite kann ausgeliefert werden."
  ART="informational"
  echo "  PREFLIGHT GRUEN."
else
  ERGEBNIS="Preflight noch rot. Protokoll: /tmp/smejj-preflight.log"
  ART="critical"
  echo "  PREFLIGHT ROT:"
  tail -20 /tmp/smejj-preflight.log
fi

echo
echo "=================================================="
echo " $ERGEBNIS"
echo "=================================================="

osascript -e "display alert \"smejj.com — Sperren gestempelt\" message \"$ERGEBNIS\" as $ART" >/dev/null 2>&1 || true

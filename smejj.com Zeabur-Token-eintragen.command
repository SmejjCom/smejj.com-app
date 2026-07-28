#!/bin/zsh
# smejj.com — Zeabur-Zugangstoken eintragen (per Doppelklick).
#
# Zweck: Der Token ist das einzige Stueck, das eine KI-Sitzung nicht selbst
# anlegen darf. Dieses Skript nimmt ihn entgegen und legt ihn sicher in
# ~/.config/smejj.com/env.local ab. Der Wert wird nie angezeigt, nie kopiert
# und nie verschickt — er landet ausschliesslich in dieser lokalen Datei.
#
# Danach kann die Chat-Bridge ohne Browser ausgeliefert werden:
#   npm run deploy:bridge
set -euo pipefail

ENVFILE="$HOME/.config/smejj.com/env.local"
mkdir -p "$(dirname "$ENVFILE")"
touch "$ENVFILE"
chmod 600 "$ENVFILE"

echo ""
echo "  smejj.com — Zeabur-Token eintragen"
echo "  ═══════════════════════════════════════════════════════"
echo ""
echo "  1. Oeffne im Browser:  https://zeabur.com/account/api-keys"
echo "  2. Klicke:             Create Access Token"
echo "  3. Kopiere den Wert    (er wird nur EINMAL angezeigt)"
echo ""
echo "  Fuege ihn jetzt hier ein und druecke Enter."
echo "  Die Eingabe bleibt unsichtbar — das ist normal."
echo ""
printf "  Token: "
read -rs TOKEN
echo ""
echo ""

if [ -z "${TOKEN:-}" ]; then
  echo "  Nichts eingegeben — abgebrochen, nichts geaendert."
  echo ""
  read -r "?  Zum Schliessen Enter druecken."
  exit 1
fi

if [ ${#TOKEN} -lt 20 ]; then
  echo "  Das sieht zu kurz aus fuer einen Zeabur-Token (${#TOKEN} Zeichen)."
  echo "  Abgebrochen, nichts geaendert. Bitte noch einmal versuchen."
  echo ""
  read -r "?  Zum Schliessen Enter druecken."
  exit 1
fi

# Vorhandenen Eintrag ersetzen statt doppelt anhaengen.
if grep -q '^ZEABUR_API_TOKEN=' "$ENVFILE" 2>/dev/null; then
  TMP="$(mktemp)"
  grep -v '^ZEABUR_API_TOKEN=' "$ENVFILE" > "$TMP"
  mv "$TMP" "$ENVFILE"
  chmod 600 "$ENVFILE"
  ERSETZT="ja"
else
  ERSETZT="nein"
fi
printf 'ZEABUR_API_TOKEN=%s\n' "$TOKEN" >> "$ENVFILE"
unset TOKEN

echo "  ✅ Gespeichert in ~/.config/smejj.com/env.local"
echo "     (vorheriger Eintrag ersetzt: $ERSETZT)"
echo ""
echo "  Sag im Chat einfach: \"Token ist drin\"."
echo "  Dann liefert die Sitzung die Bridge selbst aus — ohne Browser."
echo ""
read -r "?  Zum Schliessen Enter druecken."

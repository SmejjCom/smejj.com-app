#!/bin/zsh
# smejj.com — legt den Bilder-Worker-Schluessel in die Zwischenablage und
# oeffnet die drei Zeabur-Seiten, in die er eingefuegt werden muss.
# Der Wert erscheint NIE auf dem Bildschirm.

KEYFILE="$HOME/.config/smejj.com/bilder-worker-key.txt"

clear
echo "=========================================================="
echo "  smejj.com — Bilder-Schluessel einfuegen"
echo "=========================================================="
echo

if [ ! -s "$KEYFILE" ]; then
  echo "FEHLER: Schluesseldatei fehlt:"
  echo "  $KEYFILE"
  echo
  echo "Bitte dem Assistenten Bescheid sagen."
  echo
  read "?Zum Schliessen Eingabetaste druecken..."
  exit 1
fi

tr -d '\n' < "$KEYFILE" | pbcopy
echo "[1/2] Schluessel liegt jetzt in der Zwischenablage."
echo "      (Er wird absichtlich nicht angezeigt.)"
echo

open "https://zeabur.com/projects/6a7ec20b2b4272705cd1bd96/services/6a7ec3f82b4272705cd1be2f"
sleep 2
open "https://zeabur.com/projects/6a6666899949111176cddefb/services/6a6680070d0b094201bb9ce4"
sleep 2
open "https://zeabur.com/projects/6a6666899949111176cddefb/services/6a7d496af6f33e269eb37158"

echo "[2/2] Drei Zeabur-Seiten sind geoeffnet:"
echo "      1) smejj-bild-maler   (der NEUE, Silicon Valley)"
echo "      2) smejj-chat-bridge  (Ashburn)"
echo "      3) smejj-video-worker (Ashburn)"
echo
echo "----------------------------------------------------------"
echo "  Auf JEDER der drei Seiten dasselbe tun:"
echo
echo "    1. Oben auf den Reiter  Variable  klicken"
echo "    2. Rechts auf den Knopf  + Add  klicken"
echo "    3. Bei 'Key' eintippen:   SMEJJ_BILDER_WORKER_KEY"
echo "    4. Bei 'Value' einfuegen: Cmd + V"
echo "    5. Speichern"
echo
echo "  Ueberall derselbe Wert. Nichts anderes aendern."
echo "----------------------------------------------------------"
echo
echo "Danach dem Assistenten sagen: \"Schluessel ist drin\""
echo
read "?Zum Schliessen Eingabetaste druecken..."

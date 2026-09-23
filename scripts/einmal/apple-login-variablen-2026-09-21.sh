#!/bin/zsh
# Hilft beim letzten Schritt von "Mit Apple anmelden": die vier Variablen auf
# Zeabur. Das Skript TRAEGT NICHTS EIN — es bereitet nur vor und prueft danach.
#
# WARUM NICHT AUTOMATISCH: Der private Schluessel ist ein Geheimnis. Ich gebe
# ihn nicht in ein Formular ein und lade ihn nicht irgendwohin; er geht hier
# ausschliesslich von der Datei in DEINE Zwischenablage. Ausserdem sind wir bei
# Zeabur nicht angemeldet, und deine Anmeldung fasse ich nicht an.
set -uo pipefail
P8="$(ls -t "$HOME/Downloads"/AuthKey_*.p8 2>/dev/null | head -1)"

echo "=============================================="
echo " Mit Apple anmelden — die letzten vier Werte"
echo "=============================================="
echo

if [ -z "$P8" ] || [ ! -f "$P8" ]; then
  echo "Die Schluesseldatei AuthKey_XXXXXXXXXX.p8 liegt nicht im Ordner 'Downloads'."
  echo "Wenn du sie woanders hingelegt hast, zieh sie zurueck nach Downloads und"
  echo "starte das hier noch einmal."
  echo
  read "?Zum Schliessen die Eingabetaste druecken."
  exit 1
fi

KEY_ID="$(basename "$P8" .p8)"
KEY_ID="${KEY_ID#AuthKey_}"

echo "Gefunden: $(basename "$P8")"
echo
echo "SO GEHT ES WEITER — vier Variablen beim Control-Server eintragen:"
echo
echo "  1. Der Browser oeffnet gleich Zeabur. Melde dich an."
echo "  2. Oeffne das Projekt smejj.com, darin den Control-Server."
echo "  3. Gehe auf 'Variables' (oder 'Umgebungsvariablen')."
echo "  4. Lege diese VIER Variablen an — eine nach der anderen,"
echo "     NICHT ueber den Roh-Editor (der ersetzt alles; am 14.08. ist"
echo "     damit zweimal die ganze Umgebung verloren gegangen):"
echo
echo "     SMEJJ_APPLE_LOGIN_SERVICES_ID   =  com.smejj.web"
echo "     SMEJJ_APPLE_LOGIN_TEAM_ID       =  443R27FNHX"
echo "     SMEJJ_APPLE_LOGIN_KEY_ID        =  $KEY_ID"
echo "     SMEJJ_APPLE_LOGIN_PRIVATE_KEY   =  (liegt in der Zwischenablage — einfuegen mit cmd+v)"
echo
echo "  5. Speichern und den Dienst neu starten lassen."
echo

# Der Schluessel geht NUR in die Zwischenablage — nirgendwo sonst hin.
if pbcopy < "$P8" 2>/dev/null; then
  echo "Der private Schluessel liegt jetzt in der Zwischenablage."
  echo "Er bleibt dort, bis du etwas anderes kopierst."
else
  echo "Die Zwischenablage liess sich nicht befuellen. Oeffne die Datei dann"
  echo "von Hand: $P8"
fi
echo
echo "Der Browser oeffnet Zeabur ..."
open "https://zeabur.com/" 2>/dev/null
echo
echo "Wenn du fertig bist, komm hierher zurueck."
read "?Erst DANN die Eingabetaste druecken — ich pruefe dann nach."
echo
echo "== Pruefung =============================================="
GESCHAFFT=0
for i in $(seq 1 40); do
  ANTWORT="$(curl -s -m 20 "https://api.smejj.com/api/auth/config?n=$RANDOM" 2>/dev/null)"
  if echo "$ANTWORT" | grep -q '"apple": *true'; then
    echo "  GESCHAFFT: Der Server meldet 'Mit Apple anmelden' als aktiv."
    GESCHAFFT=1
    break
  fi
  [ "$i" = "1" ] && echo "  Noch nicht aktiv — der Dienst startet vermutlich gerade neu."
  echo "  warte ... ($((i*15)) s)"
  sleep 15
done

if [ "$GESCHAFFT" = "1" ]; then
  S=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://api.smejj.com/api/auth/apple?n=$RANDOM")
  echo "  Der Anmeldeweg antwortet mit $S (302 oder 303 heisst: leitet zu Apple weiter — richtig so)."
  echo
  echo "  FERTIG. Der Knopf 'Mit Apple fortfahren' erscheint jetzt von selbst"
  echo "  auf der Anmeldeseite. Sag der Sitzung Bescheid, dann probiere ich den"
  echo "  ganzen Weg einmal durch."
else
  echo "  Der Server meldet weiter 'nicht konfiguriert'."
  echo "  Haeufigste Ursachen: der Dienst wurde noch nicht neu gestartet, ein"
  echo "  Variablenname hat einen Tippfehler, oder der Schluessel wurde nur"
  echo "  teilweise eingefuegt (er muss mit der BEGIN-Zeile des privaten"
  echo "  Schluessels anfangen und mit der END-Zeile aufhoeren)."
fi
echo
read "?Zum Schliessen die Eingabetaste druecken."

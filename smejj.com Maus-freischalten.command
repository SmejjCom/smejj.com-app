#!/bin/bash
# smejj.com — Maus freischalten: die zwei Werte eintragen und sofort pruefen.
#
# Warum es diese Datei gibt: Das Eintragen der Werte ist der EINZIGE Schritt am
# ganzen Maus-Auftrag, den die Sitzung nicht selbst tun darf (Zugangsdaten,
# Rote Liste). Alles drumherum nimmt dieser Doppelklick ab: die richtige Seite
# oeffnen, die Feldnamen zeigen und danach so lange messen, bis es sitzt.
#
# SICHERHEIT: Dieses Skript liest, kopiert und zeigt NIEMALS einen Geheimwert.
# Der Abgleich nennt ausschliesslich Fingerabdruecke (sha=...), nie den Token.
set -u

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
SALAD="https://portal.salad.com/organizations/smejjcom/projects/default/containers/smejj-control/edit"
ZEABUR="https://dash.zeabur.com"

cd "$APP" || { echo "Arbeitsordner nicht gefunden."; exit 1; }

# .command-Fenster laden kein Login-Profil — Node selbst suchen.
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH
command -v node >/dev/null 2>&1 || { echo "Node.js fehlt. Bitte https://nodejs.org (LTS) installieren."; exit 1; }

echo "=============================================="
echo "  smejj.com — Maus freischalten"
echo "=============================================="
echo ""
echo "Erst messen, wie es JETZT steht ..."
echo ""
if node scripts/diagnose/maus-abgleich.mjs >/dev/null 2>&1; then
  echo "Schon erledigt — beide Werte stimmen bereits. Nichts zu tun."
  echo ""
  read -r -p "Mit der Eingabetaste schliessen. " _
  exit 0
fi

echo "Noch offen. Es sind ZWEI Zeilen, EIN Speichern."
echo ""
echo "  1) IDRIVE_E2_CAPSULES_BUCKET  =  smejj-model-files"
echo "     (kein Geheimnis — einfach so eintippen)"
echo ""
echo "  2) SMEJJ_MAUS_ENGINE_TOKEN    =  der Wert vom Zeabur-Dienst"
echo "                                   smejj-maus-engine"
echo "     (64 Zeichen. Beim Einfuegen auf Leerzeichen am Ende achten -"
echo "      das ist die haeufigste Stolperstelle.)"
echo ""
echo "  NICHT anfassen: IDRIVE_E2_BUCKET bleibt smejj-app."
echo "  Daran haengen Nutzer und Anmeldung."
echo ""
read -r -p "Eingabetaste druecken, dann oeffne ich beide Seiten ... " _

open "$ZEABUR"
sleep 2
open "$SALAD"

echo ""
echo "Zeabur ist offen (dort den Token abschreiben) und Salad (dort eintragen)."
echo "Bei Salad: Edit -> Environment Variables -> beide Zeilen -> einmal speichern."
echo ""
read -r -p "Fertig gespeichert? Dann Eingabetaste - ich pruefe dann selbst. " _

echo ""
echo "Salad startet nach dem Speichern neu. Ich messe jetzt alle 20 Sekunden,"
echo "bis zu 5 Minuten lang. (Mit Strg+C jederzeit abbrechen.)"
echo ""

VERSUCHE=15
for i in $(seq 1 $VERSUCHE); do
  if node scripts/diagnose/maus-abgleich.mjs >/dev/null 2>&1; then
    echo ""
    echo "=============================================="
    echo "  GESCHAFFT. Beide Werte stimmen."
    echo "=============================================="
    echo ""
    echo "Die Maus kann jetzt ueber die App arbeiten."
    echo "Sag das der Sitzung - sie rollt dann das Frontend aus"
    echo "und weist die ganze Kette live nach."
    echo ""
    read -r -p "Mit der Eingabetaste schliessen. " _
    exit 0
  fi
  echo "  Versuch $i von $VERSUCHE — noch nicht uebernommen, warte 20 s ..."
  sleep 20
done

echo ""
echo "Nach 5 Minuten noch nicht uebernommen. Das ist der genaue Stand:"
echo ""
node scripts/diagnose/maus-abgleich.mjs 2>&1 | sed -n '/^Befund:/,/^$/p'
echo ""
echo "Haeufigste Ursachen:"
echo "  - beim Token ist ein Leerzeichen oder Zeilenumbruch mitgerutscht"
echo "  - gespeichert, aber die Gruppe startet noch neu (dann einfach nochmal"
echo "    doppelklicken)"
echo "  - der Eimername hat einen Tippfehler (richtig: smejj-model-files)"
echo ""
read -r -p "Mit der Eingabetaste schliessen. " _

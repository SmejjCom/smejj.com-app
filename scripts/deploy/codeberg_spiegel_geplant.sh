#!/bin/bash
# smejj.com — geplante Codeberg-Spiegelung. LIEGT BEWUSST AUSSERHALB VON GOOGLE DRIVE.
#
# WARUM DIESE DATEI HIER LIEGT
#   macOS verweigert jedem Hintergrunddienst das LESEN aus
#   ~/Library/CloudStorage/GoogleDrive-*. Der Zeitplan rief bis zum 2026-08-05
#   das Skript direkt im Drive-Ordner auf und scheiterte sieben Mal in Folge mit
#       /bin/bash: scripts/deploy/codeberg_spiegel_sync.sh: Operation not permitted
#   Frueher lief derselbe Eintrag — die Berechtigung ist also irgendwann
#   weggefallen. Eine Automatik, die einmal lief, bleibt kein Beweis.
#
# WAS DER LAUF TUT
#   1. Arbeitskopie des Projekts auffrischen (HTTPS, flach) — dieselbe Kopie,
#      die auch der Qualitaets-Messlauf benutzt.
#   2. Vorpruefung: ist codeberg.org ueberhaupt per SSH erreichbar?
#   3. Die versionierte Spiegelung aus der Arbeitskopie ausfuehren.
#
# WARUM DIE VORPRUEFUNG: Am 2026-08-05 war ausgehendes SSH (Port 22) in diesem
# Netz gesperrt — bei codeberg.org UND github.com, waehrend Port 443 offen war.
# Ohne Vorpruefung haengt `git push` minutenlang in Zeitueberschreitungen und
# hinterlaesst eine Protokollzeile, aus der niemand die Ursache erkennt.
set -u

BASIS="$HOME/.local/share/smejj-qualitaet"
KOPIE="$BASIS/app"
ZWEIG="feature/auth-redesign-github-magiclink"
HERKUNFT="https://github.com/SmejjCom/smejj.com-app.git"
SSH_KEY="$HOME/.ssh/codeberg_smejj_ed25519"

echo "===== $(date -u +%FT%TZ) geplante Codeberg-Spiegelung ====="

for KANDIDAT in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
  [ -d "$KANDIDAT" ] && PATH="$KANDIDAT:$PATH"
done
export PATH

# --- 1. Arbeitskopie auffrischen -------------------------------------------
if [ ! -d "$KOPIE/.git" ]; then
  git clone -q --depth 1 --branch "$ZWEIG" "$HERKUNFT" "$KOPIE" \
    || { echo "ABBRUCH: Arbeitskopie konnte nicht angelegt werden."; exit 1; }
else
  git -C "$KOPIE" fetch -q --depth 1 origin "$ZWEIG" \
    || { echo "ABBRUCH: Auffrischen fehlgeschlagen (GitHub nicht erreichbar?)."; exit 1; }
  git -C "$KOPIE" reset -q --hard FETCH_HEAD \
    || { echo "ABBRUCH: Arbeitskopie liess sich nicht zuruecksetzen."; exit 1; }
fi
echo "Arbeitskopie auf $(git -C "$KOPIE" log --oneline -1)"

# --- 2. Vorpruefungen -------------------------------------------------------
if [ ! -f "$SSH_KEY" ]; then
  echo "ABBRUCH: SSH-Schluessel fehlt ($SSH_KEY). Nichts gespiegelt."
  exit 1
fi
if ! nc -z -G 8 codeberg.org 22 2>/dev/null; then
  echo "UEBERSPRUNGEN: codeberg.org Port 22 ist aus diesem Netz nicht erreichbar."
  echo "  Ausgehendes SSH ist gesperrt (am 2026-08-05 auch fuer github.com gemessen);"
  echo "  Port 443 war offen. Das ist eine Netzsperre, kein Fehler der Spiegelung."
  echo "  Der Spiegel bleibt auf dem letzten Stand; GitHub bleibt der primaere Pfad."
  exit 0
fi

# --- 3. Spiegeln ------------------------------------------------------------
cd "$KOPIE" || { echo "ABBRUCH: Arbeitskopie nicht betretbar."; exit 1; }
/bin/bash scripts/deploy/codeberg_spiegel_sync.sh alles
ERGEBNIS=$?

echo "===== $(date -u +%FT%TZ) beendet mit Code $ERGEBNIS ====="
exit $ERGEBNIS

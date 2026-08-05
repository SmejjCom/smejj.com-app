#!/bin/bash
# smejj.com — geplanter Qualitaets-Messlauf. LIEGT BEWUSST AUSSERHALB VON GOOGLE DRIVE.
#
# WARUM DIESE DATEI HIER LIEGT UND NICHT IM PROJEKT
#   macOS verweigert jedem Hintergrunddienst das LESEN von Dateien unter
#   ~/Library/CloudStorage/GoogleDrive-*. Am 2026-08-05 gemessen, und zwar
#   sowohl mit cron als auch mit launchd:
#       /bin/bash: .../scripts/verlauf/messlauf-taeglich.sh: Operation not permitted
#   Das Verzeichnis LISTEN ist erlaubt, eine Datei daraus LESEN nicht. Deshalb
#   war die am 2026-08-04 eingerichtete Automatik von der ersten Minute an
#   wirkungslos — sie hat nie eine einzige Messung erzeugt.
#
#   Loesung: eine eigene Arbeitskopie des Projekts unter ~/.local/share, die der
#   Planer lesen darf. Sie wird vor jedem Lauf frisch von GitHub geholt, kann
#   also nicht heimlich veralten.
#
# WAS DER LAUF TUT
#   1. Arbeitskopie auf den Stand von GitHub bringen (HTTPS, flach).
#   2. Kurzlebigen Anmelde-Nachweis erzeugen (seit Bridge v121 Pflicht).
#   3. Die Live-Kette mit 14 Aufgaben messen.
#   4. NUR bei brauchbarem Ergebnis: ins Frontend-Repo schreiben und live stellen.
#
# WAS ER BEWUSST NICHT TUT
#   Er committet NICHT ins App-Repo. Dort arbeiten mehrere Sitzungen auf
#   demselben Zweig; ein Hintergrundjob wuerde mit ihnen kollidieren.
#
# FAIL-CLOSED: Jeder Fehler beendet den Lauf, ohne etwas zu veroeffentlichen.
# Ein alter Stand ist harmlos — die Qualitaetsseite weist ihn selbst als alt aus.
set -u

BASIS="$HOME/.local/share/smejj-qualitaet"
KOPIE="$BASIS/app"
ZWEIG="feature/auth-redesign-github-magiclink"
HERKUNFT="https://github.com/SmejjCom/smejj.com-app.git"

echo "===== $(date -u +%FT%TZ) geplanter Messlauf ====="

# Node finden — ein Planer laedt kein Login-Profil.
for KANDIDAT in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$KANDIDAT" ] && PATH="$KANDIDAT:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NEUESTE=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_NEUESTE" ] && PATH="$HOME/.nvm/versions/node/$NVM_NEUESTE/bin:$PATH"
fi
export PATH
command -v node >/dev/null 2>&1 || { echo "ABBRUCH: node nicht gefunden."; exit 1; }

# --- 1. Arbeitskopie auffrischen -------------------------------------------
if [ ! -d "$KOPIE/.git" ]; then
  echo "Arbeitskopie fehlt — wird angelegt."
  git clone -q --depth 1 --branch "$ZWEIG" "$HERKUNFT" "$KOPIE" \
    || { echo "ABBRUCH: Arbeitskopie konnte nicht angelegt werden."; exit 1; }
else
  git -C "$KOPIE" fetch -q --depth 1 origin "$ZWEIG" \
    || { echo "ABBRUCH: Auffrischen fehlgeschlagen (GitHub nicht erreichbar?)."; exit 1; }
  git -C "$KOPIE" reset -q --hard FETCH_HEAD \
    || { echo "ABBRUCH: Arbeitskopie liess sich nicht zuruecksetzen."; exit 1; }
fi
echo "Arbeitskopie auf $(git -C "$KOPIE" log --oneline -1)"

# --- 2.-4. Messen und veroeffentlichen --------------------------------------
# NUR_LIVE=1: kein Commit ins App-Repo, nur die Live-Veroeffentlichung.
SMEJJ_MESSLAUF_NUR_LIVE=1 /bin/bash "$KOPIE/scripts/verlauf/messlauf-taeglich.sh"
ERGEBNIS=$?

echo "===== $(date -u +%FT%TZ) beendet mit Code $ERGEBNIS ====="
exit $ERGEBNIS

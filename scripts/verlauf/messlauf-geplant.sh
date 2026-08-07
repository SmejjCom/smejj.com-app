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
#   1. Arbeitskopie auf den Stand von GitHub bringen (SSH, volle Historie).
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

# --- Herzschlag Autopilot (Modul AP — smejj.com/admin, Ampel) ----------------
# Meldet bei JEDEM Skriptende Erfolg oder Fehler an den Totmannschalter des
# Adminbereichs (Ausbleiben = Alarm). Der Schluessel liegt in
# ~/.config/smejj.com/autopilot-keys.env und steht bewusst NICHT hier drin.
# Ein fehlgeschlagener Herzschlag aendert den Exit-Code nicht — der Lauf ist
# wichtiger als seine Meldung.
smejj_ap_herzschlag() {
  AP_EXIT=$?
  AP_ID="qualitaetsmessung"
  AP_KEY=$(sed -n 's/^SMEJJ_AUTOPILOT_KEYS=//p' "$HOME/.config/smejj.com/autopilot-keys.env" 2>/dev/null \
    | tr ',' '\n' | sed -n "s/^${AP_ID}://p")
  [ -z "${AP_KEY:-}" ] && return 0
  AP_STATUS=ok; [ "$AP_EXIT" -ne 0 ] && AP_STATUS=fehler
  curl -fsS -m 20 -X POST "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/autopilot/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${AP_ID}\",\"key\":\"${AP_KEY}\",\"status\":\"${AP_STATUS}\",\"meldung\":\"Exit ${AP_EXIT}\"}" \
    >/dev/null 2>&1 || echo "Herzschlag nicht zugestellt (Netz oder Server nicht erreichbar)."
  return 0
}
trap smejj_ap_herzschlag EXIT

BASIS="$HOME/.local/share/smejj-qualitaet"
KOPIE="$BASIS/app"
ZWEIG="feature/auth-redesign-github-magiclink"
# SEIT 2026-08-07 SSH STATT HTTPS — dieselbe Umstellung wie in spiegel.sh und
# aus demselben Grund: das Repo ist privat, der HTTPS-Weg braucht den
# macOS-Schluesselbund, und den kann cron nicht lesen. Dazu kommt: BEIDE
# Skripte teilen sich die Arbeitskopie, und spiegel.sh stellt deren origin auf
# SSH um — ein Fetch ohne GIT_SSH_COMMAND laeuft seither zwangslaeufig ins
# "correct access rights" (am 2026-08-07 gemessen).
HERKUNFT="git@github.com:SmejjCom/smejj.com-app.git"
GITHUB_KEY="$HOME/.ssh/smejjcom_github_ed25519"

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
if [ ! -f "$GITHUB_KEY" ]; then
  echo "ABBRUCH: GitHub-Schluessel fehlt ($GITHUB_KEY)."
  exit 1
fi
# Port-22-Weiche wie in spiegel.sh: faellt SSH aus, bleibt ssh.github.com:443.
GITHUB_SSH="ssh -i $GITHUB_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
if ! nc -z -G 8 github.com 22 2>/dev/null; then
  if nc -z -G 8 ssh.github.com 443 2>/dev/null; then
    echo "github.com Port 22 ist zu — Ausweichweg ssh.github.com:443."
    GITHUB_SSH="$GITHUB_SSH -o HostName=ssh.github.com -o Port=443"
  else
    echo "ABBRUCH: github.com weder ueber Port 22 noch ssh.github.com:443 erreichbar."
    exit 1
  fi
fi
if [ ! -d "$KOPIE/.git" ]; then
  echo "Arbeitskopie fehlt — wird angelegt."
  GIT_SSH_COMMAND="$GITHUB_SSH" git clone -q --branch "$ZWEIG" "$HERKUNFT" "$KOPIE" \
    || { echo "ABBRUCH: Arbeitskopie konnte nicht angelegt werden."; exit 1; }
else
  git -C "$KOPIE" remote set-url origin "$HERKUNFT" \
    || { echo "ABBRUCH: Herkunft liess sich nicht umstellen."; exit 1; }
  GIT_SSH_COMMAND="$GITHUB_SSH" git -C "$KOPIE" fetch -q origin "$ZWEIG" \
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

#!/bin/bash
# smejj.com — taegliche Code-Sicherung nach Codeberg, vom Mac aus.
#
# WARUM VOM MAC (2026-09-08): Die GitHub Action "Code-Sicherung nach Codeberg"
# lief seit dem 05.09. jeden Tag rot — Secret CODEBERG_TOKEN fehlt, "es wurde
# NICHTS gesichert". Ein Token darf nur der Betreiber erzeugen, und bis das
# geschieht, gaebe es GAR KEIN Backup.
#
# Der Mac hat als einziger Ort bereits Schreibrecht bei Codeberg: der
# SSH-Schluessel ~/.ssh/codeberg_smejj_ed25519 ist dort registriert. Dieser
# Weg braucht deshalb KEIN Geheimnis und keine Action-Minuten.
#
# WARUM EIN EIGENER KLON UND NICHT DER PROJEKTORDNER (Messung 2026-09-08):
# Der erste Entwurf rief das Spiegel-Skript im Google-Drive-Ordner auf. Von
# Hand lief das; unter launchd brach es sofort ab mit "Operation not
# permitted" — macOS gibt Hintergrunddiensten keinen Zugriff auf
# CloudStorage-Ordner, und das liesse sich nur in den Systemeinstellungen
# aendern (Sache des Betreibers, nicht einer Sitzung).
#
# Der Umweg ist ohnehin die bessere Sicherung: dieser Job braucht den
# Projektordner NICHT. Er haelt einen eigenen nackten Klon und spiegelt direkt
# GitHub -> Codeberg. Damit ist er unabhaengig davon, auf welchem Zweig der
# Arbeitsordner gerade steht, ob Google Drive eingehaengt ist und ob dort
# ungespeicherte Aenderungen liegen.
#
# NIE --mirror BEIM PUSH: das wuerde auf Codeberg jeden Zweig loeschen, den
# GitHub nicht mehr hat. Gesichert wird nur hinzufuegend und ohne Gewalt
# (kein --force): faellt ein Zweig auseinander, bricht der Lauf lieber ab,
# als eine Historie zu ueberschreiben.
#
# Der Zustand wird nach zustand.json geschrieben, damit
# scripts/diagnose/kette-pruefen.mjs ihn mitlesen kann. Ein Ersatzweg, den
# niemand misst, ist genauso still wie der Ausfall, den er ersetzt.
#
# Sobald das Secret CODEBERG_TOKEN gesetzt ist, uebernimmt wieder die Action
# und dieser Job darf abgeschaltet werden:
#   launchctl bootout gui/$(id -u)/com.smejj.codeberg-spiegel
set -uo pipefail

ABLAGE="${HOME}/.local/share/smejj-codeberg"
KLON="${ABLAGE}/spiegel.git"
ZUSTAND="${ABLAGE}/zustand.json"
LOG="${ABLAGE}/lauf.log"
# HTTPS statt SSH fuer die QUELLE (Messung 2026-09-08): das GitHub-Repo ist
# oeffentlich, Lesen braucht dort keinerlei Anmeldung. Mit SSH schlug der Klon
# fehl, weil GIT_SSH_COMMAND weiter unten den CODEBERG-Schluessel erzwingt —
# der ist bei GitHub nicht hinterlegt. Ein Weg, ein Schluessel, keine
# Verwechslung.
QUELLE="https://github.com/SmejjCom/smejj.com-app.git"
ZIEL="ssh://git@codeberg.org/smejj/smejj.com-app.git"
SSH_KEY="${HOME}/.ssh/codeberg_smejj_ed25519"

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
# git stirbt auf diesem Mac ohne diesen Umweg an der Xcode-Lizenz.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Library/Developer/CommandLineTools}"
# launchd startet ohne ssh-agent: den Schluessel deshalb ausdruecklich nennen.
# Gilt NUR fuer die Codeberg-Pushes weiter unten — die Quelle wird ueber HTTPS
# gelesen und darf diesen Schluessel nicht sehen.
SSH_BEFEHL="ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
export GIT_TERMINAL_PROMPT=0

# Das Log darf nicht unbegrenzt wachsen: taeglich ein Lauf ueber Jahre.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 2000000 ]; then
  tail -n 500 "$LOG" > "${LOG}.neu" && mv "${LOG}.neu" "$LOG"
fi

zeit() { date -u "+%Y-%m-%dT%H:%M:%SZ"; }

schreibe_zustand() {
  # $1 = ok|fehler, $2 = Meldung, $3 = Zahl der Zweige (optional)
  printf '{\n  "stand": "%s",\n  "ergebnis": "%s",\n  "meldung": "%s",\n  "zweige": %s\n}\n' \
    "$(zeit)" "$1" "$(printf '%s' "$2" | tr -d '"' | tr '\n' ' ')" "${3:-0}" > "$ZUSTAND"
}

abbruch() {
  echo "FEHLER: $1"
  schreibe_zustand "fehler" "$1"
  echo "=== $(zeit) FEHLGESCHLAGEN ==="
  exit 1
}

echo "=== $(zeit) Sicherung GitHub -> Codeberg ==="

[ -f "$SSH_KEY" ] || abbruch "SSH-Schluessel fehlt: ${SSH_KEY}"

if [ ! -d "$KLON" ]; then
  echo "Erster Lauf: nackten Klon anlegen (das dauert einmalig laenger)."
  git clone --mirror "$QUELLE" "$KLON" || abbruch "Klon von GitHub fehlgeschlagen"
fi

# --prune wirkt NUR im lokalen Klon. Nach Codeberg wird nichts geloescht.
git --git-dir="$KLON" remote update --prune || abbruch "Abgleich mit GitHub fehlgeschlagen"

ZWEIGE=$(git --git-dir="$KLON" for-each-ref --format='%(refname)' refs/heads | wc -l | tr -d ' ')
echo "Zweige bei GitHub: ${ZWEIGE}"

# Ohne --force und ohne --mirror: fuegt hinzu und zieht nach, loescht nie.
GIT_SSH_COMMAND="$SSH_BEFEHL" git --git-dir="$KLON" push "$ZIEL" "refs/heads/*:refs/heads/*" || abbruch "Push der Zweige nach Codeberg fehlgeschlagen"
GIT_SSH_COMMAND="$SSH_BEFEHL" git --git-dir="$KLON" push "$ZIEL" "refs/tags/*:refs/tags/*" || abbruch "Push der Marken nach Codeberg fehlgeschlagen"

schreibe_zustand "ok" "${ZWEIGE} Zweige und alle Marken gespiegelt" "$ZWEIGE"
echo "=== $(zeit) fertig: gesichert ==="
exit 0

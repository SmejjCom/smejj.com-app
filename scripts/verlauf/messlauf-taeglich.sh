#!/bin/bash
# smejj.com — zeitgesteuerter Qualitaets-Messlauf: messen, veroeffentlichen, ausliefern.
#
# Betreiber-Freigabe 2026-08-04. Wird per cron zweimal taeglich aufgerufen;
# eingerichtet mit scripts/verlauf/messlauf-einrichten.sh.
#
# ABLAUF
#   1. messlauf.mjs misst gegen die Live-Kette und schreibt public/verlauf-messwerte.json.
#      Schlaegt der Lauf technisch fehl, schreibt es NICHTS und endet mit Code 1.
#   2. Nur bei echter Aenderung: Commit im App-Repo (NUR diese eine Datei).
#   3. Datei ins Frontend-Repo kopieren und pushen -> live.
#
# WARUM KEIN CACHE-SPRUNG NOETIG IST: /verlauf-messwerte.json wird vom Service
# Worker netz-zuerst ausgeliefert (LIVE_DATEN_PFADE in public/sw.js). Ohne das
# waere diese Automatik wirkungslos — wiederkehrende Nutzer saehen ewig den
# alten Stand.
#
# FAIL-CLOSED an jeder Stelle: Bei jedem Fehler bricht der Lauf ab und laesst
# den bisherigen Stand stehen. Ein alter Stand ist harmlos — die Seite weist ihn
# seit dem 2026-08-04 selbst als alt aus. Eine falsche Zahl waere es nicht.
#
# NIE `git add -A`: an diesem Arbeitsplatz laufen mehrere Sitzungen parallel.
# Es wird ausschliesslich die eine Messwert-Datei aufgenommen.
set -u

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
FRONTEND="$HOME/smejj-app-frontend"
DATEI="public/verlauf-messwerte.json"
SSH_SCHLUESSEL="$HOME/.ssh/smejjcom_github_ed25519"

cd "$APP" || { echo "Arbeitsordner nicht gefunden."; exit 1; }

# cron laedt kein Login-Profil — Node selbst suchen.
for KANDIDAT in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$KANDIDAT" ] && PATH="$KANDIDAT:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NEUESTE=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_NEUESTE" ] && PATH="$HOME/.nvm/versions/node/$NVM_NEUESTE/bin:$PATH"
fi
export PATH

command -v node >/dev/null 2>&1 || { echo "$(date -u +%FT%TZ) ABBRUCH: node nicht gefunden."; exit 1; }

echo "===== $(date -u +%FT%TZ) Messlauf beginnt ====="

# --- 1. Messen -------------------------------------------------------------
if ! node scripts/verlauf/messlauf.mjs; then
  echo "$(date -u +%FT%TZ) ABBRUCH: Messlauf nicht brauchbar. Bisheriger Stand bleibt."
  exit 1
fi

# --- 2. Hat sich wirklich etwas geaendert? ---------------------------------
if git diff --quiet -- "$DATEI"; then
  echo "$(date -u +%FT%TZ) Keine Aenderung an $DATEI — nichts auszuliefern."
  exit 0
fi

# --- 3. Commit im App-Repo, NUR diese Datei --------------------------------
PUNKTE=$(node -e "const d=require('./$DATEI');const m=d.messungen[d.messungen.length-1];console.log((m.punktzahl*100).toFixed(2)+' %, '+m.kritischeFehler+' kritisch, '+m.urteil)")
git add -- "$DATEI" || { echo "ABBRUCH: git add fehlgeschlagen."; exit 1; }
git commit -q -m "chore(qualitaet): Messlauf $(date -u +%F) — $PUNKTE

Automatisch erzeugt von scripts/verlauf/messlauf-taeglich.sh (Betreiber-Freigabe
2026-08-04). Gemessen wurde die Live-Kette; ein technisch gescheiterter Lauf
haette nichts geschrieben." || { echo "ABBRUCH: git commit fehlgeschlagen."; exit 1; }

GIT_SSH_COMMAND="ssh -i $SSH_SCHLUESSEL" git push -q origin HEAD 2>&1 | tail -3

# --- 4. Ins Frontend-Repo und live -----------------------------------------
if [ ! -d "$FRONTEND/.git" ]; then
  echo "$(date -u +%FT%TZ) HINWEIS: Frontend-Repo nicht gefunden — im App-Repo veroeffentlicht, aber nicht live."
  exit 0
fi
cp "$DATEI" "$FRONTEND/verlauf-messwerte.json" || { echo "ABBRUCH: Kopieren fehlgeschlagen."; exit 1; }
cd "$FRONTEND" || exit 1
if git diff --quiet -- verlauf-messwerte.json; then
  echo "$(date -u +%FT%TZ) Frontend war bereits auf diesem Stand."
  exit 0
fi
git add -- verlauf-messwerte.json
git commit -q -m "deploy(qualitaet): Messlauf $(date -u +%F) — $PUNKTE" || { echo "ABBRUCH: Frontend-Commit fehlgeschlagen."; exit 1; }
git push -q origin HEAD:main 2>&1 | tail -3

echo "$(date -u +%FT%TZ) FERTIG: $PUNKTE — live in wenigen Minuten."

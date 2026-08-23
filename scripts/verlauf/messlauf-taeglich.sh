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

# Arbeitsordner aus dem EIGENEN Ort ableiten, nicht fest verdrahten.
# Grund: ein zeitgesteuerter Lauf darf nichts aus dem Google-Drive-Ordner lesen
# (macOS verweigert das jedem Hintergrunddienst — am 2026-08-05 gemessen:
# "Operation not permitted", und zwar bei cron UND launchd). Der geplante Lauf
# arbeitet deshalb in einer Kopie ausserhalb von Drive; derselbe Text muss in
# beiden Kopien funktionieren.
APP="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="$HOME/smejj-app-frontend"
DATEI="public/verlauf-messwerte.json"
# Hochladen ueber HTTPS, NICHT ueber SSH: der SSH-Deploy-Key dieses Macs wird
# von GitHub abgewiesen ("Permission denied (publickey)", am 2026-08-05 erneut
# gemessen). Das Schluesselbund traegt das HTTPS-Schreibrecht.
APP_REPO_HTTPS="https://github.com/SmejjCom/smejj.com-app.git"

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

# --- 0. Anmelde-Nachweis -----------------------------------------------------
# Seit Bridge v121 (2026-08-05) weist /api/chat jede Anfrage ohne gueltiges
# Token mit HTTP 401 ab. Ohne diesen Schritt misst der Lauf nur noch Fehler und
# veroeffentlicht — richtigerweise — gar nichts mehr.
if ! SMEJJ_EVAL_SESSION_TOKEN="$(node scripts/verlauf/mint-eval-token.mjs)"; then
  echo "$(date -u +%FT%TZ) ABBRUCH: kein Anmelde-Nachweis. Bisheriger Stand bleibt."
  exit 1
fi
export SMEJJ_EVAL_SESSION_TOKEN

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

# Der GEPLANTE Lauf ueberspringt diesen Schritt (SMEJJ_MESSLAUF_NUR_LIVE=1):
# an diesem Arbeitsplatz laufen mehrere Sitzungen auf demselben Arbeitszweig,
# und ein Hintergrundjob, der dort committet und schiebt, kollidiert mit ihnen.
# Fuers Livegehen zaehlt ohnehin nur das Frontend-Repo (Schritt 4).
if [ "${SMEJJ_MESSLAUF_NUR_LIVE:-0}" = "1" ]; then
  echo "$(date -u +%FT%TZ) App-Repo uebersprungen (geplanter Lauf) — es wird nur live veroeffentlicht."
else
  git add -- "$DATEI" || { echo "ABBRUCH: git add fehlgeschlagen."; exit 1; }
  git commit -q -m "chore(qualitaet): Messlauf $(date -u +%F) — $PUNKTE

Automatisch erzeugt von scripts/verlauf/messlauf-taeglich.sh (Betreiber-Freigabe
2026-08-04). Gemessen wurde die Live-Kette; ein technisch gescheiterter Lauf
haette nichts geschrieben." || { echo "ABBRUCH: git commit fehlgeschlagen."; exit 1; }

  # KEINE Pipe um den Push: `git push ... | tail` liefert den Exit-Code von
  # `tail`, nie den von git. Genau so ist der Fehlschlag hier monatelang
  # unbemerkt geblieben (Befund 2026-08-22).
  if ! APP_PUSH="$(git push -q "$APP_REPO_HTTPS" HEAD 2>&1)"; then
    echo "$APP_PUSH" | tail -3
    echo "$(date -u +%FT%TZ) HINWEIS: Der Messwert liegt im App-Repo als Commit, wurde aber NICHT gepusht."
  fi
fi

# --- 4. Ins Frontend-Repo und live -----------------------------------------
if [ ! -d "$FRONTEND/.git" ]; then
  echo "$(date -u +%FT%TZ) HINWEIS: Frontend-Repo nicht gefunden — im App-Repo veroeffentlicht, aber nicht live."
  exit 0
fi
cd "$FRONTEND" || exit 1

# ERST auffrischen, DANN schreiben. Der Klon wird von mehreren Sitzungen
# bespielt; wer auf einem alten Stand committet, bekommt beim Push
#   ! [remote rejected] HEAD -> main (cannot lock ref 'refs/heads/main':
#     is at <fremd> but expected <alt>)
# Genau das trat am 2026-08-22 beim Nachmessen auf — ein ZWEITER Grund fuer
# denselben stillen Ausfall, neben dem fehlenden Anmeldeweg. Ohne Auffrischen
# wuerde der Lauf ab jetzt zwar ehrlich abbrechen, aber jedes Mal aus einem
# Grund, den man selbst verursacht hat.
if ! FRONTEND_HOLEN="$(git fetch -q origin main 2>&1)"; then
  echo "$FRONTEND_HOLEN" | tail -3
  echo "$(date -u +%FT%TZ) ABBRUCH: Frontend-Repo nicht erreichbar — nichts veroeffentlicht."
  exit 1
fi
# --hard ist hier gefahrlos: in diesem Klon liegt NUR die Messwert-Datei, und
# die wird gleich neu geschrieben. Eigene Arbeit gibt es hier nicht.
git reset -q --hard origin/main || { echo "ABBRUCH: Frontend-Klon liess sich nicht angleichen."; exit 1; }

# ABSOLUT, nicht "$DATEI": seit dem Auffrischen des Klons (31ccf4dc) steht
# der Aufruf NACH `cd "$FRONTEND"` — ein relatives public/… zeigte dann in den
# Klon, wo es keinen public/-Ordner gibt. Folge 22.–23.08.: jeder geplante
# Lauf endete mit "cp: No such file" und Exit 1, die Ampel stand auf Rot,
# obwohl die Messung selbst 100 % ergab.
cp "$APP/$DATEI" "$FRONTEND/verlauf-messwerte.json" || { echo "ABBRUCH: Kopieren fehlgeschlagen."; exit 1; }
if git diff --quiet -- verlauf-messwerte.json; then
  echo "$(date -u +%FT%TZ) Frontend war bereits auf diesem Stand."
  exit 0
fi
git add -- verlauf-messwerte.json
git commit -q -m "deploy(qualitaet): Messlauf $(date -u +%F) — $PUNKTE" || { echo "ABBRUCH: Frontend-Commit fehlgeschlagen."; exit 1; }
# DER FEHLER, DER DIE QUALITAETSSEITE EINFROR (Befund 2026-08-22):
# Hier stand `git push ... 2>&1 | tail -3`, und danach wurde bedingungslos
# "FERTIG — live in wenigen Minuten" gemeldet. Eine Pipe liefert aber den
# Exit-Code des LETZTEN Glieds, also den von `tail` — der Push konnte
# scheitern, wie er wollte.
# Genau das passierte seit dem 14.08. bei jedem Lauf:
#   fatal: could not read Username for 'https://github.com': Device not configured
# cron kann den macOS-Schluesselbund nicht lesen, den der HTTPS-Push braucht.
# Die Messungen liefen weiter (heute 65,69 % mit 7 kritischen Fehlern), die
# oeffentliche Seite zeigte unveraendert 97,06 % vom 14.08., und das Protokoll
# meldete jedes Mal Erfolg. Eine zu gute Zahl, die niemand anzweifelt, ist
# schlimmer als gar keine.
if ! FRONTEND_PUSH="$(git push -q origin HEAD:main 2>&1)"; then
  echo "$FRONTEND_PUSH" | tail -3
  echo "$(date -u +%FT%TZ) ABBRUCH: $PUNKTE gemessen, aber NICHT veroeffentlicht — die"
  echo "oeffentliche Qualitaetsseite zeigt weiterhin den alten Stand. Der Commit liegt"
  echo "im Frontend-Klon bereit; es fehlt ein Anmeldeweg, den cron nutzen kann"
  echo "(Schluesselbund ist fuer Hintergrunddienste unlesbar — es braucht einen"
  echo "Deploy-Key ueber SSH)."
  exit 1
fi

echo "$(date -u +%FT%TZ) FERTIG: $PUNKTE — live in wenigen Minuten."

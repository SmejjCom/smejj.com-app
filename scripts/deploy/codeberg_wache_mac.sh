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
# Der Zweig, aus dem Zeabur baut — aus ihm wird der Code fuer den e2-Schritt
# ausgepackt. Muss zu DEPLOY_ZWEIG in codeSicherungAutopilot.js passen.
DEPLOY_ZWEIG="feature/auth-redesign-github-magiclink"

# /usr/local/bin und /opt/homebrew/bin gehoeren dazu: launchd startet mit einem
# minimalen PATH, in dem node NICHT liegt ("node: command not found", gemessen
# 2026-09-08). Der Zweig fuer Codeberg lief trotzdem gruen — nur der
# e2-Schritt fiel still aus, genau die Sorte Ausfall, die dieser Job
# verhindern soll.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
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

# --- Zweiter Sicherungsort: IDrive e2 --------------------------------------
# Warum hier und nicht nur auf dem Server: Autopilot Nr. 85 macht dasselbe im
# Control-Server und ist damit vom Mac unabhaengig — aber Zeabur hat den Bau
# nach dem Push vom 08.09. nicht gestartet, der Autopilot liegt also
# ausgeliefert und untaetig. Bis er anspringt, macht es der Mac.
#
# Der Code dafuer wird AUS DEM NACKTEN KLON ausgepackt, nicht aus dem
# Projektordner: an den kommt ein launchd-Dienst nicht heran (macOS sperrt
# CloudStorage). So laeuft immer die Fassung, die auch live geht.
#
# Faellt dieser Teil aus, ist der Lauf trotzdem gruen: Codeberg ist gesichert,
# und ein zweiter Ort, der klemmt, darf den ersten nicht entwerten. Gemeldet
# wird es aber — still bleiben waere der Fehler, der das alles ausgeloest hat.
e2_meldung="uebersprungen"
ENV_DATEI="${HOME}/.config/smejj.com/env.local"
AUSPACK="${ABLAGE}/code-tmp"
rm -rf "$AUSPACK" && mkdir -p "$AUSPACK"
# Einmal auspacken, zweimal nutzen: Sicherungs-Autopilot UND Landkarte.
git --git-dir="$KLON" archive "$DEPLOY_ZWEIG" control-server/src scripts/diagnose 2>/dev/null | tar -x -C "$AUSPACK" 2>/dev/null
if [ -f "$ENV_DATEI" ]; then
  if [ -f "${AUSPACK}/control-server/src/autopilots/codeSicherungAutopilot.js" ]; then
    e2_ausgabe=$(AUTOPILOT_PFAD="${AUSPACK}/control-server/src/autopilots/codeSicherungAutopilot.js" \
      ENV_DATEI="$ENV_DATEI" node --input-type=module -e '
        import { readFileSync } from "node:fs";
        const { laufCodeSicherung } = await import(process.env.AUTOPILOT_PFAD);
        const env = {};
        for (const zeile of readFileSync(process.env.ENV_DATEI, "utf8").split("\n")) {
          const t = /^([A-Z0-9_]+)=(.*)$/.exec(zeile.trim());
          if (t) env[t[1]] = t[2].replace(/^["\x27]|["\x27]$/g, "");
        }
        const r = await laufCodeSicherung({ env });
        console.log(r.meldung);
        process.exitCode = r.ok ? 0 : 1;
      ' 2>&1 | tail -1)
    e2_meldung="$e2_ausgabe"
  else
    e2_meldung="Code konnte nicht aus dem Klon ausgepackt werden"
  fi
fi
echo "IDrive e2: ${e2_meldung}"

schreibe_zustand "ok" "${ZWEIGE} Zweige gespiegelt; e2: ${e2_meldung}" "$ZWEIGE"

# --- Verbindungs-Landkarte: taeglich messen, bei ROT laut werden -----------
# Der ganze Anlass dieses Jobs war ein Riss, der DREI TAGE unbemerkt blieb,
# weil ein fehlgeschlagener Lauf still bleibt. Also misst der Termin gleich
# die ganze Kette mit — und meldet sich sichtbar, wenn etwas gerissen ist.
# Erfolg bleibt bewusst leise: eine Mitteilung, die jeden Tag kommt, wird
# ausgeblendet, und dann ueberliest man auch die eine, auf die es ankommt.
#
# Die Landkarte laeuft im Klon-Modus (SMEJJ_KETTE_GITDIR): an den
# Projektordner kommt ein launchd-Dienst nicht heran.
BERICHT="${ABLAGE}/landkarte.txt"
if [ -f "${AUSPACK}/scripts/diagnose/kette-pruefen.mjs" ]; then
  if SMEJJ_KETTE_GITDIR="$KLON" GIT_SSH_COMMAND="$SSH_BEFEHL" \
      node "${AUSPACK}/scripts/diagnose/kette-pruefen.mjs" > "$BERICHT" 2>&1; then
    echo "Landkarte: alle Verbindungen stehen"
  else
    risse=$(grep -c '^ROT ' "$BERICHT" 2>/dev/null || echo "?")
    echo "Landkarte: ${risse} VERBINDUNG(EN) GERISSEN — siehe ${BERICHT}"
    osascript -e "display notification \"${risse} Verbindung(en) gerissen. Bericht: landkarte.txt\" with title \"smejj.com\" subtitle \"Taegliche Pruefung\" sound name \"Basso\"" 2>/dev/null || true
  fi
  tail -n 4 "$BERICHT" 2>/dev/null
else
  echo "Landkarte: Pruefskript nicht im Klon gefunden"
fi

rm -rf "$AUSPACK"
echo "=== $(zeit) fertig: gesichert ==="
exit 0

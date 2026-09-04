#!/bin/bash
# smejj.com — Zeitgeber der Oberflaechenwache. VERSIONIERTE VORLAGE.
#
# DIESE DATEI IST DIE KOPIE IM REPO. Ausgefuehrt wird
# ~/.local/share/smejj-oberflaeche/wache.sh — dorthin gehoert jede Aenderung
# ebenfalls (gleiches Muster wie scripts/verlauf/messlauf-geplant.sh). Ohne
# diese Kopie waere der Zeitgeber nur auf einem Rechner vorhanden und bei einem
# Wechsel verloren.
#
#   cp scripts/testing/oberflaechenwache-geplant.sh ~/.local/share/smejj-oberflaeche/wache.sh
#
# Der Lauf selbst LIEGT BEWUSST AUSSERHALB VON GOOGLE DRIVE.
#
# WARUM DIESE DATEI HIER LIEGT UND NICHT IM PROJEKT
#   macOS verweigert jedem Hintergrunddienst das LESEN von Dateien unter
#   ~/Library/CloudStorage/GoogleDrive-*. Am 2026-08-05 gemessen, mit cron wie
#   mit launchd: "Operation not permitted". Das Verzeichnis LISTEN ist erlaubt,
#   eine Datei daraus LESEN nicht. Dieselbe Loesung wie beim Qualitaets-
#   Messlauf: eine eigene Arbeitskopie unter ~/.local/share, vor jedem Lauf
#   frisch von GitHub geholt — sie kann also nicht heimlich veralten.
#
# WAS DER LAUF TUT
#   1. Arbeitskopie auf den Stand von GitHub bringen (SSH, das Repo ist privat
#      und der HTTPS-Weg braucht den Schluesselbund, den cron nicht lesen kann).
#   2. scripts/testing/oberflaechenwache.sh gegen https://smejj.com fahren:
#      Responsive (19 Ansichten x 8 Groessen) und Touch-Ziele (375 px).
#   3. Das Urteil in eine Zustandsdatei schreiben, damit man den Verlauf sieht,
#      ohne das Log zu lesen.
#
# WAS ER BEWUSST NICHT TUT
#   Er committet nichts. Auf dem Zweig arbeiten mehrere Sitzungen gleichzeitig;
#   ein Hintergrundjob wuerde mit ihnen kollidieren (Lehre aus dem
#   Qualitaets-Messlauf).
#
# FAIL-CLOSED: jeder Abbruch ist ein Fehler. "Konnte nicht messen" ist nicht
# "in Ordnung".
set -u

BASIS="$HOME/.local/share/smejj-oberflaeche"
KOPIE="$BASIS/app"
ZUSTAND="$BASIS/letzter-lauf.json"
# Der Zweig, auf dem die Waechter liegen. Wandert die Arbeit auf einen anderen
# Zweig, gehoert er hierher — sonst misst die Wache still eine alte Fassung.
ZWEIG="feature/design-v11"
HERKUNFT="git@github.com:SmejjCom/smejj.com-app.git"
GITHUB_KEY="$HOME/.ssh/smejjcom_github_ed25519"

# --- Herzschlag Autopilot (Modul AP — smejj.com/admin, Ampel Nr. 40) --------
# Meldet bei JEDEM Skriptende Erfolg oder Fehler an den Totmannschalter des
# Adminbereichs; Ausbleiben ist der Alarm. Gleiche Bauart wie messlauf.sh und
# spiegel.sh, damit es nur EIN Muster gibt, das man verstehen muss.
#
# Der Schluessel steht bewusst NICHT hier drin, sondern in
# ~/.config/smejj.com/autopilot-keys.env. Fehlt er, meldet die Wache einfach
# nichts und laeuft trotzdem — sie ist damit sofort nuetzlich, auch bevor der
# Schluessel im Control-Server hinterlegt ist.
#
# WARTESCHLANGE: Der Control-Server war im August stundenlang tot — laenger als
# jede vertretbare Wiederholungsschleife. Ein unzustellbarer Herzschlag wird
# deshalb MIT Original-Zeitpunkt (`am`) aufgehoben und beim naechsten Lauf
# nachgeliefert; die Datei traegt nie ein Geheimnis, der Schluessel kommt erst
# beim Senden dazu.
AP_URL="https://smejj-control.zeabur.app/api/autopilot/heartbeat"
AP_QUEUE="$BASIS/herzschlag-warteschlange.jsonl"

# BEWUSST OHNE -f, mit HTTP-Code in AP_HTTP: -f macht aus 503 (voruebergehend)
# und 400 (endgueltig) denselben Exit 22 — die Warteschlange muss beide aber
# unterscheiden.
smejj_ap_senden() {
  AP_HTTP=$(curl -sS --connect-timeout 10 -m 150 --retry 3 --retry-delay 30 \
    -o /dev/null -w "%{http_code}" \
    -X POST "$AP_URL" -H "Content-Type: application/json" \
    -d "$1" 2>/dev/null) || AP_HTTP=000
  [ "$AP_HTTP" = "200" ]
}

smejj_ap_herzschlag() {
  AP_EXIT=$?
  AP_ID="oberflaechenwache"
  AP_KEY=$(sed -n 's/^SMEJJ_AUTOPILOT_KEYS=//p' "$HOME/.config/smejj.com/autopilot-keys.env" 2>/dev/null \
    | tr ',' '\n' | sed -n "s/^${AP_ID}://p")
  if [ -z "${AP_KEY:-}" ]; then
    echo "Kein Schluessel fuer ${AP_ID} — es wird kein Herzschlag gesendet (die Messung oben gilt trotzdem)."
    return 0
  fi
  AP_STATUS=ok; [ "$AP_EXIT" -ne 0 ] && AP_STATUS=fehler
  AP_DAUER_MS=$(( SECONDS * 1000 ))
  AP_AM=$(date -u +%FT%TZ)
  AP_MELDUNG="Exit ${AP_EXIT}"
  [ -n "${AP_BEFUND:-}" ] && AP_MELDUNG="$AP_BEFUND"

  # 1) Nachlieferung: Aufgestautes zuerst, aelteste vorn. Bei Netz- oder
  #    Serverproblemen (000/5xx/429) stoppt die Runde und alles bleibt liegen;
  #    eine endgueltige Ablehnung (4xx) wird verworfen — sie wuerde nie mehr
  #    angenommen und blockierte sonst als Giftpille die ganze Schlange.
  if [ -s "$AP_QUEUE" ]; then
    AP_REST="${AP_QUEUE}.rest.$$"
    : > "$AP_REST"
    AP_NETZ_ZU=0
    while IFS= read -r AP_ZEILE; do
      [ -z "$AP_ZEILE" ] && continue
      if [ "$AP_NETZ_ZU" -eq 1 ]; then
        printf '%s\n' "$AP_ZEILE" >> "$AP_REST"
        continue
      fi
      if smejj_ap_senden "${AP_ZEILE%\}},\"key\":\"${AP_KEY}\"}"; then
        continue
      fi
      case "$AP_HTTP" in
        4??)
          if [ "$AP_HTTP" = "429" ]; then
            AP_NETZ_ZU=1
            printf '%s\n' "$AP_ZEILE" >> "$AP_REST"
          else
            echo "Nachlieferung vom Server abgelehnt (HTTP ${AP_HTTP}) und verworfen: ${AP_ZEILE}"
          fi
          ;;
        *)
          AP_NETZ_ZU=1
          printf '%s\n' "$AP_ZEILE" >> "$AP_REST"
          ;;
      esac
    done < "$AP_QUEUE"
    mv "$AP_REST" "$AP_QUEUE"
    [ -s "$AP_QUEUE" ] || rm -f "$AP_QUEUE"
  fi

  # 2) Der aktuelle Herzschlag. Ohne key abgelegt — der kommt erst beim Senden
  #    dazu, damit die Warteschlangendatei kein Geheimnis traegt.
  AP_KERN="{\"id\":\"${AP_ID}\",\"status\":\"${AP_STATUS}\",\"meldung\":\"${AP_MELDUNG}\",\"dauerMs\":${AP_DAUER_MS},\"am\":\"${AP_AM}\"}"
  if ! smejj_ap_senden "${AP_KERN%\}},\"key\":\"${AP_KEY}\"}"; then
    printf '%s\n' "$AP_KERN" >> "$AP_QUEUE"
    tail -n 100 "$AP_QUEUE" > "${AP_QUEUE}.kopf.$$" && mv "${AP_QUEUE}.kopf.$$" "$AP_QUEUE"
    echo "Herzschlag nicht zugestellt — aufgehoben fuer die Nachlieferung beim naechsten Lauf."
  fi
  return 0
}
trap smejj_ap_herzschlag EXIT

echo "===== $(date -u +%FT%TZ) Oberflaechenwache ====="

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

if [ ! -f "$GITHUB_KEY" ]; then
  echo "ABBRUCH: GitHub-Schluessel fehlt ($GITHUB_KEY)."
  exit 1
fi
# Port-22-Weiche wie im Qualitaets-Messlauf: faellt SSH aus, bleibt
# ssh.github.com:443.
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
STAND="$(git -C "$KOPIE" log --oneline -1)"
echo "Arbeitskopie auf $STAND"

BEFUND_DATEI="$BASIS/letzter-befund.txt"
set -o pipefail
/bin/bash "$KOPIE/scripts/testing/oberflaechenwache.sh" 2>&1 | tee "$BEFUND_DATEI"
ERGEBNIS=${PIPESTATUS[0]}
set +o pipefail

URTEIL=gruen
[ "$ERGEBNIS" -ne 0 ] && URTEIL=rot
# Die Meldung soll das Urteil tragen, nicht nur eine Zahl: in der Ampel steht
# sonst "Exit 1" und man muss erst das Log suchen.
# Die Meldung kommt aus der BEFUND-Zeile der Pruefung: sie nennt, WELCHE der
# drei Pruefungen rot ist. Fehlt die Zeile (alte Fassung im Repo), bleibt der
# bisherige Text — nie eine leere Ampel.
AP_BEFUND="$(grep -a "\[wache\] BEFUND:" "$BEFUND_DATEI" 2>/dev/null | tail -1 | sed 's/^\[wache\] BEFUND: //')"
[ -z "$AP_BEFUND" ] && AP_BEFUND="Responsive+Touch gegen smejj.com: ${URTEIL}"
AP_BEFUND="smejj.com: ${AP_BEFUND}"
printf '{"am":"%s","urteil":"%s","exit":%d,"stand":"%s"}\n' \
  "$(date -u +%FT%TZ)" "$URTEIL" "$ERGEBNIS" "${STAND//\"/}" > "$ZUSTAND"
echo "Urteil: $URTEIL (Exit $ERGEBNIS), festgehalten in $ZUSTAND"
exit "$ERGEBNIS"

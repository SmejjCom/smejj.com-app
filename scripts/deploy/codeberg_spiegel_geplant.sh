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
#   2. Vorpruefung passend zum Protokoll (HTTPS ist Standard).
#   3. Die versionierte Spiegelung aus der Arbeitskopie ausfuehren.
#
# WARUM DIE VORPRUEFUNG: Am 2026-08-05 war ausgehendes SSH (Port 22) in diesem
# Netz gesperrt — bei codeberg.org UND github.com, waehrend Port 443 offen war.
# Ohne Vorpruefung haengt `git push` minutenlang in Zeitueberschreitungen und
# hinterlaesst eine Protokollzeile, aus der niemand die Ursache erkennt.
#
# WARUM SIE AM PROTOKOLL HAENGT: Standard ist SSH (kein Token noetig, der
# Schluessel ist registriert). Faellt Port 22 aus, ist HTTPS der einzige
# Ausweg — Codeberg hat keinen SSH-Endpunkt auf 443, anders als GitHub.
# Ein Tor, das hart auf Port 22 prueft, wuerde bei CODEBERG_PROTOKOLL=https
# JEDEN Lauf ueberspringen und die Umstellung unsichtbar wirkungslos machen.
# Deshalb prueft es das, was der gewaehlte Weg wirklich braucht.
#
# Und: die Port-22-Sperre vom 2026-08-05 war VORUEBERGEHEND (wenige Stunden
# spaeter lief SSH wieder). Ein einzelner Fehlschlag ist kein Dauerzustand —
# deshalb ueberspringt der Lauf sauber, statt etwas umzustellen.
set -u

BASIS="$HOME/.local/share/smejj-qualitaet"
KOPIE="$BASIS/app"
ZWEIG="feature/auth-redesign-github-magiclink"
HERKUNFT="https://github.com/SmejjCom/smejj.com-app.git"
SSH_KEY="$HOME/.ssh/codeberg_smejj_ed25519"
# Muss zum Standard von codeberg_spiegel_sync.sh passen (dort ebenfalls ssh).
CODEBERG_PROTOKOLL="${CODEBERG_PROTOKOLL:-ssh}"

echo "===== $(date -u +%FT%TZ) geplante Codeberg-Spiegelung ====="

for KANDIDAT in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
  [ -d "$KANDIDAT" ] && PATH="$KANDIDAT:$PATH"
done
export PATH

# --- 1. Arbeitskopie auffrischen -------------------------------------------
# BEWUSST NICHT FLACH (--depth 1), Befund 2026-08-05: Mit einem flachen Klon
# kennt die Kopie nur EINEN Commit. Liegt der Spiegel auch nur einen Commit
# zurueck, kann git das Fast-Forward nicht belegen und lehnt den Push ab
# ("Updates were rejected because the remote contains work that you do not
# have locally"). Ein flacher Klon kann einen zurueckliegenden Spiegel also
# grundsaetzlich nie aufholen. Das frueher protokollierte "Everything
# up-to-date" war kein Beweis fuer einen funktionierenden Push, sondern nur
# ein Spiegel, der zufaellig schon passte. Volle Historie kostet hier wenige
# MB (das Repo ist gepackt ~5 MB) und ist die Voraussetzung fuers Spiegeln.
if [ ! -d "$KOPIE/.git" ]; then
  git clone -q --branch "$ZWEIG" "$HERKUNFT" "$KOPIE" \
    || { echo "ABBRUCH: Arbeitskopie konnte nicht angelegt werden."; exit 1; }
else
  # Eine aus frueheren Laeufen noch flache Kopie einmalig vervollstaendigen.
  if [ "$(git -C "$KOPIE" rev-parse --is-shallow-repository)" = "true" ]; then
    echo "Arbeitskopie ist flach — wird einmalig vervollstaendigt."
    git -C "$KOPIE" fetch -q --unshallow origin "$ZWEIG" \
      || { echo "ABBRUCH: Vervollstaendigen fehlgeschlagen."; exit 1; }
  fi
  git -C "$KOPIE" fetch -q origin "$ZWEIG" \
    || { echo "ABBRUCH: Auffrischen fehlgeschlagen (GitHub nicht erreichbar?)."; exit 1; }
  git -C "$KOPIE" reset -q --hard FETCH_HEAD \
    || { echo "ABBRUCH: Arbeitskopie liess sich nicht zuruecksetzen."; exit 1; }
fi
echo "Arbeitskopie auf $(git -C "$KOPIE" log --oneline -1)"

# --- 2. Vorpruefungen -------------------------------------------------------
# Das Tor muss zum PROTOKOLL passen. Bis zum 2026-08-05 pruefte es hart auf
# Port 22 und verlangte den SSH-Schluessel — nachdem die Spiegelung auf HTTPS
# umgestellt wurde (codeberg_spiegel_sync.sh), haette dieses Tor JEDEN Lauf
# uebersprungen, obwohl der HTTPS-Weg laeuft. Der Fix waere in der Automatik
# unsichtbar wirkungslos geblieben.
export CODEBERG_PROTOKOLL

if [ "$CODEBERG_PROTOKOLL" = "ssh" ]; then
  if [ ! -f "$SSH_KEY" ]; then
    echo "ABBRUCH: SSH-Schluessel fehlt ($SSH_KEY). Nichts gespiegelt."
    exit 1
  fi
  if ! nc -z -G 8 codeberg.org 22 2>/dev/null; then
    echo "UEBERSPRUNGEN: codeberg.org Port 22 ist aus diesem Netz nicht erreichbar."
    echo "  Ausgehendes SSH ist gesperrt (am 2026-08-05 auch fuer github.com gemessen);"
    echo "  Port 443 war offen. Das ist eine Netzsperre, kein Fehler der Spiegelung."
    echo "  Der Spiegel bleibt auf dem letzten Stand; GitHub bleibt der primaere Pfad."
    echo "  Ohne offenen Port 22: CODEBERG_PROTOKOLL=https (der Standard)."
    exit 0
  fi
else
  # HTTPS-Weg. Zwei getrennte Faelle, damit das Protokoll die Ursache benennt:
  # Netzsperre = UEBERSPRUNGEN (kein Fehler), fehlender Zugang = ABBRUCH
  # (der Betreiber muss handeln).
  if ! nc -z -G 8 codeberg.org 443 2>/dev/null; then
    echo "UEBERSPRUNGEN: codeberg.org Port 443 ist aus diesem Netz nicht erreichbar."
    echo "  Das ist eine Netzsperre, kein Fehler der Spiegelung."
    echo "  Der Spiegel bleibt auf dem letzten Stand; GitHub bleibt der primaere Pfad."
    exit 0
  fi
  if ! GIT_TERMINAL_PROMPT=0 git ls-remote \
       "https://codeberg.org/smejj/smejj.com-app.git" >/dev/null 2>&1; then
    echo "ABBRUCH: kein Codeberg-Zugang ueber HTTPS. Nichts gespiegelt."
    echo "  Im Schluesselbund liegt kein Token fuer codeberg.org. Einmalig durch"
    echo "  den Betreiber (eine Automatik darf keine Zugangsdaten anlegen):"
    echo "    1. codeberg.org -> Einstellungen -> Anwendungen -> Zugriffs-Token"
    echo "       mit Schreibrecht auf Repositories."
    echo "    2. git ls-remote https://codeberg.org/smejj/smejj.com-app.git"
    echo "       Benutzername smejj, Passwort der Token (nicht das Konto-Passwort)."
    exit 1
  fi
fi

# --- 3. Spiegeln ------------------------------------------------------------
cd "$KOPIE" || { echo "ABBRUCH: Arbeitskopie nicht betretbar."; exit 1; }
/bin/bash scripts/deploy/codeberg_spiegel_sync.sh alles
ERGEBNIS=$?

echo "===== $(date -u +%FT%TZ) beendet mit Code $ERGEBNIS ====="
exit $ERGEBNIS

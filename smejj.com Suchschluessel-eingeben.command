#!/bin/zsh
# smejj.com — Suchschluessel EINGEBEN und scharfschalten (ein Doppelklick).
#
# Warum diese Datei: Der Weg "env.local von Hand editieren" ist am 2026-08-05
# mehrfach fehlgeschlagen (der Schluessel kam nie in der Ablage an). Hier wird
# der Schluessel abgefragt (oder aus der Zwischenablage gelesen), geprueft,
# gespeichert und das Setz-Skript gestartet, das ihn in BEIDE Salad-Container
# schreibt. Der Schluessel wird nie angezeigt, nie geloggt und verlaesst den
# Mac nur Richtung Salad-API.
#
# Fassung 2 (2026-08-05): Der erste Versuch brach still ab, weil die
# Format-Pruefung die Eingabe verwarf und nicht sagte, WAS ankam. Jetzt:
# drei Versuche, Zwischenablage als Rueckfall, maskierte Rueckmeldung ueber das
# Angekommene und ein Lauf-Protokoll OHNE Geheimnis.
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
cd "$APP" || { echo "Arbeitsordner nicht gefunden."; exit 1; }
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH
ABLAGE="$HOME/.config/smejj.com/env.local"
PROTOKOLL="$HOME/.config/smejj.com/suchschluessel-lauf.log"
mkdir -p "$HOME/.config/smejj.com"
notiere() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$PROTOKOLL"; }
notiere "Lauf gestartet"

echo "smejj.com — Suchschluessel eingeben"
echo "===================================="
echo
echo "So kommst du an den Schluessel (kostenlos, keine Karte):"
echo "  https://app.tavily.com  ->  links 'API Keys'  ->  kopieren"
echo "Er beginnt mit  tvly-"
echo

# saeubern: Anfuehrungszeichen, Leerzeichen, unsichtbare Zeichen entfernen.
saeubern() {
  printf '%s' "$1" | tr -d '\r\n\t "'\''' | sed -e 's/^ *//' -e 's/ *$//'
}

SCHLUESSEL=""
VERSUCH=1
while [ $VERSUCH -le 3 ]; do
  echo "Fuege den Schluessel hier ein (Cmd+V) und druecke Enter."
  echo "Oder: einfach Enter druecken — dann nehme ich die Zwischenablage."
  printf "Schluessel: "
  IFS= read -r EINGABE || EINGABE=""
  EINGABE="$(saeubern "$EINGABE")"
  if [ -z "$EINGABE" ] && command -v pbpaste >/dev/null 2>&1; then
    EINGABE="$(saeubern "$(pbpaste 2>/dev/null)")"
    [ -n "$EINGABE" ] && echo "(Zwischenablage gelesen)"
  fi

  LAENGE=${#EINGABE}
  if [ "$LAENGE" -eq 0 ]; then
    echo "Es ist NICHTS angekommen (auch die Zwischenablage war leer)."
    notiere "Versuch $VERSUCH: leere Eingabe"
  else
    case "$EINGABE" in
      tvly-*)
        SCHLUESSEL="$EINGABE"
        notiere "Versuch $VERSUCH: Format ok, Laenge $LAENGE"
        break
        ;;
      *)
        echo "Angekommen ist etwas mit $LAENGE Zeichen, beginnend mit '${EINGABE:0:4}…' —"
        echo "ein Tavily-Schluessel muss mit  tvly-  beginnen."
        notiere "Versuch $VERSUCH: falsches Format, Laenge $LAENGE, Praefix ${EINGABE:0:4}"
        ;;
    esac
  fi
  echo
  VERSUCH=$((VERSUCH + 1))
  [ $VERSUCH -le 3 ] && echo "Noch einmal versuchen ($((4 - VERSUCH)) uebrig):" && echo
done

if [ -z "$SCHLUESSEL" ]; then
  echo
  echo "Es wurde NICHTS geaendert."
  echo "Tipp: Wenn das Einfuegen im Terminal nicht klappt, den Schluessel"
  echo "einfach kopieren und diese Datei erneut doppelklicken — dann bei der"
  echo "Frage nur Enter druecken, ich lese ihn aus der Zwischenablage."
  notiere "Lauf ohne Ergebnis beendet"
  read -r "?Enter zum Schliessen..."
  exit 1
fi

touch "$ABLAGE"
chmod 600 "$ABLAGE"
cp "$ABLAGE" "$ABLAGE.bak.vor-suchschluessel" 2>/dev/null || true
grep -v "^SMEJJ_SEARCH_TAVILY_API_KEY=" "$ABLAGE" > "$ABLAGE.neu" || true
printf 'SMEJJ_SEARCH_TAVILY_API_KEY=%s\n' "$SCHLUESSEL" >> "$ABLAGE.neu"
mv "$ABLAGE.neu" "$ABLAGE"
chmod 600 "$ABLAGE"
notiere "in env.local geschrieben"
echo
echo "Gespeichert (Sicherung: env.local.bak.vor-suchschluessel)."
echo "Jetzt wird der Schluessel in die Salad-Container geschrieben..."
echo

CONFIRM_SEARCH_KEY=YES node scripts/deploy/set_search_api_key.mjs
STATUS=$?
echo
if [ $STATUS -eq 0 ]; then
  notiere "Container gesetzt: ok"
  echo "Fertig. Die Container starten neu (~60-90 s)."
  echo "Danach zeigt /api/health bei 'suchquelle'  konfiguriert: true."
else
  notiere "Setz-Skript Fehler $STATUS"
  echo "Das Setz-Skript hat einen Fehler gemeldet (siehe oben). Der Schluessel"
  echo "liegt aber jetzt korrekt in der lokalen Ablage — einfach erneut doppelklicken."
fi
read -r "?Enter zum Schliessen..."

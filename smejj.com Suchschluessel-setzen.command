#!/bin/bash
# smejj.com — Suchschluessel scharfschalten. EIN Doppelklick, sonst nichts.
#
# Warum es diese Datei gibt: Das Einfuegen eines API-Schluessels ist der einzige
# Schritt, den die Sitzung nicht selbst machen darf (harte Projektregel: nur der
# Betreiber erzeugt und hinterlegt Schluessel). Gebaut, getestet und ausgeliefert
# ist alles; der Schluessel gehoert dir.
#
# SICHERHEIT: Der Schluessel wird nie angezeigt, nie geloggt, nie in die
# Zwischenablage gelegt. Er wandert im Arbeitsspeicher von deiner lokalen Ablage
# (~/.config/smejj.com/env.local) zur Salad-API. Ausgegeben wird nur ein
# Fingerabdruck.
#
# KOSTEN: 0,00 EUR. Tavily gibt 1000 Suchen pro Monat gratis und verlangt dafuer
# KEINE Zahlungsart. Hinterlege dort keine Karte — dann kann auch nichts
# abgerechnet werden. Zusaetzlich macht der Code bei 900 Suchen im Monat dicht.
set -u

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
cd "$APP" || { echo "Arbeitsordner nicht gefunden."; exit 1; }

# .command-Fenster laden kein Login-Profil — Node selbst suchen.
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH

ABLAGE="$HOME/.config/smejj.com/env.local"

echo "smejj.com — Suchschluessel scharfschalten"
echo "========================================"
echo

if ! grep -q "^SMEJJ_SEARCH_TAVILY_API_KEY=" "$ABLAGE" 2>/dev/null; then
  cat <<'HINWEIS'
Es liegt noch kein Suchschluessel in deiner lokalen Ablage.

So kommst du an ihn (dauert etwa zwei Minuten, kostet nichts):

  1. https://app.tavily.com aufrufen und ein kostenloses Konto anlegen.
  2. KEINE Zahlungsart hinterlegen. Ohne Karte kann dort nichts abgerechnet
     werden — das ist die eigentliche Kostengarantie.
  3. Links auf "API Keys" klicken und den Schluessel kopieren
     (er beginnt mit  tvly-  ).
  4. Diese Zeile in die Datei ~/.config/smejj.com/env.local eintragen:

        SMEJJ_SEARCH_TAVILY_API_KEY=tvly-DEIN_SCHLUESSEL

  5. Diese Datei hier erneut doppelklicken.

Es wurde NICHTS geaendert.
HINWEIS
  echo
  read -r -p "Fenster mit Enter schliessen. " _
  exit 1
fi

echo "Schluessel gefunden. Er wird jetzt in die Umgebung des Control Servers"
echo "geschrieben. Der Server startet danach kurz neu (etwa eine Minute)."
echo
read -r -p "Weiter mit Enter, abbrechen mit Strg+C. " _
echo

CONFIRM_SEARCH_KEY=YES node scripts/deploy/set_search_api_key.mjs
ERGEBNIS=$?

if [ $ERGEBNIS -ne 0 ]; then
  echo
  echo "Es wurde nichts geaendert. Meldung oben beachten."
  read -r -p "Fenster mit Enter schliessen. " _
  exit $ERGEBNIS
fi

echo
echo "Warte auf den Neustart des Control Servers ..."
for i in $(seq 1 30); do
  sleep 10
  ANTWORT=$(curl -s -m 12 "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/health" 2>/dev/null)
  SCHARF=$(printf '%s' "$ANTWORT" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{const q=JSON.parse(s).suchquelle;console.log(q&&q.konfiguriert?'JA':'NEIN');}catch{console.log('-');}
});" 2>/dev/null)
  echo "  $(date +%H:%M:%S)  Suchquelle scharf: ${SCHARF:--}"
  [ "$SCHARF" = "JA" ] && break
done

echo
if [ "${SCHARF:-}" = "JA" ]; then
  echo "FERTIG. Die Websuche laeuft jetzt ueber die Quelle mit Schluessel."
  echo "Verbrauch jederzeit sichtbar unter: /api/health -> suchquelle"
else
  echo "Der Server war nach fuenf Minuten noch nicht so weit."
  echo "Das ist meist nur Geduld. Pruefe spaeter: /api/health -> suchquelle"
fi
echo
read -r -p "Fenster mit Enter schliessen. " _

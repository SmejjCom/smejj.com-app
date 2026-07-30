#!/bin/zsh
# smejj.com — stellt die Verlaufsseite (/verlauf.html) live. Per Doppelklick.
#
# Warum dieses Skript und kein Handbetrieb: der Deploy hat drei Fallen, die schon
# einmal Schaden angerichtet haben.
#   1. Der lokale Frontend-Klon unter ~/smejj-app-frontend ist veraltet (Branch von
#      Juli, sw.js v133 gegen live v193). Von dort zu pushen wuerde Dutzende
#      Versionen fremder Arbeit verwerfen. Dieses Skript klont deshalb IMMER frisch.
#   2. Die Service-Worker-Version muss auf dem LIVE-Stand aufsetzen, nicht auf dem
#      App-Repo — das steht regelmaessig hinterher. Gelesen wird die Version aus
#      der frisch geklonten Live-Datei und um eins erhoeht.
#   3. SSH-Push scheitert bei diesem Repo (Deploy-Key hat kein Schreibrecht). Der
#      funktionierende Weg ist HTTPS ueber den Schluesselbund.
#
# Kein Force-Push, keine Branch-Loeschung, kein History-Rewrite. Wird der Push
# abgelehnt, weil jemand parallel etwas veroeffentlicht hat, bricht das Skript ab
# und sagt es — dann einfach nochmal doppelklicken.
set -euo pipefail

APP_VERZ="${0:A:h}"
ARBEIT="$(mktemp -d "${TMPDIR:-/tmp}/smejj-verlauf-deploy.XXXXXXXX")"
trap 'rm -rf "$ARBEIT"' EXIT INT TERM

melde() { printf '\n==> %s\n' "$1"; }

melde "Hole den aktuellen Live-Stand von smejj.com"
git clone --depth 1 --branch main https://github.com/SmejjCom/smejj-app-frontend.git "$ARBEIT/frontend" >/dev/null 2>&1 || {
  osascript -e 'display alert "Konnte den Live-Stand nicht laden" message "Internetverbindung pruefen und nochmal versuchen." as critical'
  exit 1
}
cd "$ARBEIT/frontend"
BASIS="$(git rev-parse --short HEAD)"

ALT="$(grep -oE 'smejj-shell-v[0-9]+' sw.js | head -1)"
NUMMER="${ALT##*-v}"
NEU="smejj-shell-v$((NUMMER + 1))"
melde "Service Worker: $ALT  ->  $NEU  (Basis $BASIS)"

melde "Uebernehme die Seite aus dem Projekt"
cp "$APP_VERZ/public/verlauf.html"            verlauf.html
cp "$APP_VERZ/public/verlauf.js"              assets/verlauf.js
cp "$APP_VERZ/public/verlauf-messwerte.json"  verlauf-messwerte.json
cp "$APP_VERZ/public/static-pages.css"        assets/static-pages.css

# Version erhoehen und die drei Dateien in die Shell-Liste aufnehmen, falls noch
# nicht vorhanden. Beides idempotent — ein zweiter Lauf schadet nicht.
python3 - "$ALT" "$NEU" <<'PY'
import sys
alt, neu = sys.argv[1], sys.argv[2]
p = "sw.js"
s = open(p, encoding="utf8").read()
s = s.replace(f'const CACHE_NAME = "{alt}";', f'const CACHE_NAME = "{neu}";', 1)
if '"/verlauf.html"' not in s:
    anker = '  "/assets/status.js",'
    assert anker in s, "Shell-Liste nicht gefunden — Deploy abgebrochen"
    s = s.replace(anker, anker + '\n  "/verlauf.html",\n  "/assets/verlauf.js",\n  "/verlauf-messwerte.json",', 1)
open(p, "w", encoding="utf8").write(s)
PY
node --check sw.js

git config user.name "Wof Kadavanich"
git config user.email "smejjcom@gmail.com"
git add verlauf.html assets/verlauf.js verlauf-messwerte.json assets/static-pages.css sw.js
if git diff --cached --quiet; then
  melde "Nichts zu veroeffentlichen — live ist schon der aktuelle Stand."
  exit 0
fi
git commit -q -m "feat(verlauf): Qualitaetsverlauf unter /verlauf.html ($NEU)"

melde "Veroeffentliche auf smejj.com"
if ! git push origin HEAD:main; then
  osascript -e 'display alert "Push abgelehnt" message "Wahrscheinlich hat parallel jemand etwas veroeffentlicht. Einfach nochmal doppelklicken — das Skript setzt dann auf dem neuen Stand auf." as critical'
  exit 1
fi

melde "Fertig. GitHub Pages braucht meist unter einer Minute."
osascript -e 'display dialog "Verlaufsseite ist veroeffentlicht.\n\nZu sehen unter:\nhttps://smejj.com/verlauf.html\n\nGitHub Pages braucht meist unter einer Minute. Danach im Chat: weiter — dann wird live geprueft." buttons {"Verstanden"} default button 1 with title "smejj.com — Verlaufsseite live"'

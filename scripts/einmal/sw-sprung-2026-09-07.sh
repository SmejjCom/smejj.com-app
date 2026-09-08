#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-07, Runde 4b):
# NUR ein Service-Worker-Sprung (CACHE_NAME live+1) mit Start-Lock-Stempel. Wiederverwendbar:
# jeder Klick nimmt live+1 und liefert die aktuell live liegenden Module an die App aus.
#
# WARUM: Nach dem Runde-4-Stempel (18:45) kamen drei Nachzuege an UNGESPERRTEN
# Modulen, die live sind, aber wiederkehrende App-Nutzer erst mit dem naechsten
# CACHE_NAME-Sprung erreichen (cache-first Precache):
#   - mobil-dock.js: Vollbild-Versatz nur Apple (Android-TWA: 76 px waeren Systemleiste);
#     Modell-Menue ueber die Glasbreite statt fixed (backdrop-filter = Bezugsrahmen)
#   - mobil-ansichten.js: Einstellungs-Zeilen per flex-wrap (column machte 230 px Leere),
#     Reiter exakt 44 px, Konsole kompakt statt versteckt
# Es wird KEINE Datei ausser sw.js (Wurzel + assets/) veraendert.
# "--probe": Trockenlauf ohne Stempel, Commit, Push.
set -u
PROBE=0; [ "${1:-}" = "--probe" ] && PROBE=1
ZWEIG="feature/auth-redesign-github-magiclink"
QUELLE="${SMEJJ_APP_ORDNER:-$PWD}"
KLON="$HOME/smejj-app-frontend"
BAUM="/private/tmp/claude-501/stempel-sw-sprung-$(date +%Y%m%d-%H%M%S)"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-07 abends (Auftrag 100 % Responsive): Service-Worker-Sprung, damit die installierte App die Nachzuege holt (Tastatur-Buendigkeit, Vollbild-Rahmen ueber visualViewport, Einstellungen durchgaengig Deutsch). Stempel per Doppelklick."
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
[ -e "$KLON/.git" ] || { echo "ABBRUCH: Frontend-Klon fehlt unter $KLON"; exit 2; }
cd "$QUELLE" || exit 2
behalten() { echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen: $BAUM"; exit "$1"; }
aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "1/6 Stand holen, Versionen live lesen ..."
git fetch -q origin "$ZWEIG" || { echo "ABBRUCH: fetch"; exit 3; }
git -C "$KLON" fetch -q origin main || { echo "ABBRUCH: Klon-fetch"; exit 3; }
LIVE_SW="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
KLON_SW="$(git -C "$KLON" show origin/main:sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)"
[ -n "$LIVE_SW" ] && [ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live ($LIVE_SW) und Klon ($KLON_SW) uneins — kurz warten, neu klicken"; exit 3; }
SW_NEU="smejj-shell-v$(( ${LIVE_SW#smejj-shell-v} + 1 ))"
echo "    $LIVE_SW -> $SW_NEU"
# Die Module muessen live GENAU die Klon-Fassung sein, sonst ist der Sprung nutzlos (Pages baut noch)
for f in mobil-dock.js mobil-ansichten.js kompakt.js deutsch-klartext.js; do
  a="$(git -C "$KLON" show origin/main:$f | shasum -a 256 | cut -c1-16)"; b="$(curl -s -m 20 "https://smejj.com/assets/$f?n=$RANDOM" | shasum -a 256 | cut -c1-16)"
  [ "$a" = "$b" ] || { echo "ABBRUCH: $f live ($b) ist noch nicht die Klon-Fassung ($a) — Pages baut, kurz warten und neu klicken"; exit 3; }
done
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || { echo "ABBRUCH: Arbeitsbaum"; exit 4; }
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    Bauzweig: $(git log --oneline -1)"

echo "2/6 sw.js auf Live-Basis mit $SW_NEU ..."
git -C "$KLON" show origin/main:sw.js | sed "s#const CACHE_NAME = \"$LIVE_SW\";#const CACHE_NAME = \"$SW_NEU\";#" > /tmp/sw-sprung.js
grep -q "$SW_NEU" /tmp/sw-sprung.js || { echo "ABBRUCH: Version nicht gesetzt"; behalten 5; }
cp /tmp/sw-sprung.js public/sw.js; npm run -s build:assets >/dev/null 2>&1 || true

echo "3/6 Waechter ..."
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig"; behalten 6; }
node --test tests/precache-dynamische-importe.test.mjs tests/platform-pwa.test.mjs > /tmp/sw-sprung.log 2>&1 || { echo "ABBRUCH: Tests rot"; grep -E "not ok|✖" /tmp/sw-sprung.log | head; behalten 6; }
grep -E "ℹ (pass|fail)" /tmp/sw-sprung.log | tr '\n' ' '; echo
if [ "$PROBE" = 1 ]; then echo; echo "PROBE — bis hier alles gruen ($SW_NEU)."; aufraeumen; exit 0; fi

echo "4/6 Start-Lock stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel"; behalten 8; }
for pruefung in start admin favicon; do node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten 9; }; done

echo "5/6 Hochladen ..."
git add public/sw.js public/assets/sw.js docs/frontend/start-lock-manifest.json 2>/dev/null
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q -m "chore(start-lock): Service-Worker-Sprung $SW_NEU fuer die Nachzuege der Runde 4 — Stempel per Betreiber-Doppelklick 2026-09-07" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: commit"; behalten 10; }
git push -q origin "HEAD:$ZWEIG" || { echo "Push abgelehnt — bitte Claude Code Bescheid geben."; behalten 11; }
QUELLKENNUNG="$(git rev-parse --short HEAD)"
cd "$KLON" || behalten 12
[ -z "$(git status --porcelain)" ] || git stash push -q -u -m "vor SW-Sprung $(date +%Y-%m-%d-%H%M)"
git checkout -q main && git pull -q --ff-only origin main || { echo "ABBRUCH: Klon nicht auf origin/main"; behalten 12; }
cp /tmp/sw-sprung.js sw.js; cp /tmp/sw-sprung.js assets/sw.js
git add sw.js assets/sw.js
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q -m "deploy(sw): $SW_NEU — Nachzuege Runde 4 fuer wiederkehrende App-Nutzer — Quelle smejj.com-app $QUELLKENNUNG (Stempel 2026-09-07)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Klon-Commit"; behalten 13; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push"; behalten 14; }
echo "    Klon: $(git log --oneline -1)"

echo "6/6 Gegenprobe ..."; echo -n "    warte auf GitHub Pages "
for i in $(seq 1 40); do
  V="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
  if [ "$V" = "$SW_NEU" ]; then echo; echo "FERTIG — Service-Worker $SW_NEU live, Start-Lock gestempelt."; aufraeumen; exit 0; fi
  echo -n "."; sleep 8
done
echo; echo "HINWEIS: gepusht, Pages baut noch."; aufraeumen; exit 0

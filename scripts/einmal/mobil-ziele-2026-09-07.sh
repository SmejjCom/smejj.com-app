#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-07, Runde 2):
# Touch-Ziele 44 px auf Tablets und im Querformat, Rest-Ziele am Handy —
# Start-Lock stempeln und sw.js (Sprung auf v796) ausliefern.
#
# BEFUND (Rundgang durch alle Ansichten, Pixel 7 hoch/quer, Pixel Tablet 800 px):
#   - Tablet und Handy-Querformat (breiter als 600 px, Touch): Seitenleiste 36 px,
#     "Neuer Chat"-Zeilen 28 px, Reiter Start/Code 42 px, rechte Leiste 36 px.
#   - Handy: Sitzungs-Banner 42 px, Profilbild-Knopf 28x26, Werkzeug-Zeilen 42 px.
# Heilung in kompakt.js (laeuft ueberall, Regel nur bei pointer:coarse ueber 600 px)
# und mobil-dock.js (Handy). Beide Module haengen ohne Marke im Precache —
# wiederkehrende Nutzer bekommen sie erst mit dem CACHE_NAME-Sprung (Start-Lock).
#
# WAS PASSIERT (8 Schritte, jeder bricht bei Rot ab, nichts wird geloescht):
#   1. frischer Arbeitsbaum vom Bauzweig
#   2. kompakt.js, mobil-dock.js und Tests aus dem QA-Zweig; sw.js = LIVE (v795) -> v796
#   3. Tests und Waechter
#   4. Sicherheitsnetz: live ist v795, kompakt.js live = Bauzweig-Basis
#   5. Start-Lock stempeln   6. Sperren pruefen
#   7. Bauzweig hochladen; kompakt.js, mobil-dock.js, sw.js in den Frontend-Klon
#   8. Gegenprobe live
# "--probe": alles bis Schritt 4, dann Trockenlauf-Ende.
set -u
PROBE=0; [ "${1:-}" = "--probe" ] && PROBE=1
ZWEIG="feature/auth-redesign-github-magiclink"
QA_ZWEIG="feature/responsive-qa-2026-09-07"
QUELLE="${SMEJJ_APP_ORDNER:-$PWD}"
KLON="$HOME/smejj-app-frontend"
BAUM="/private/tmp/claude-501/stempel-mobil-ziele-$(date +%Y%m%d-%H%M%S)"
SW_VORHER="smejj-shell-v795"
SW_NEU="smejj-shell-v796"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-07 (Auftrag 100 % End-to-End Responsiveness, 'Teste du selber, weiter'): Touch-Ziele mindestens 44x44 auf Tablets und im Querformat (kompakt.js, pointer:coarse) sowie Banner, Profilbild-Knopf und Werkzeug-Zeilen am Handy (mobil-dock.js); sw.js CACHE_NAME smejj-shell-v796. Stempel per Doppelklick."
DATEIEN=(public/kompakt.js public/mobil-dock.js tests/mobil-dock.test.mjs tests/touch-ziele.test.mjs)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
[ -e "$KLON/.git" ] || { echo "ABBRUCH: Frontend-Klon fehlt unter $KLON"; exit 2; }
cd "$QUELLE" || exit 2
behalten() { echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen: $BAUM"; echo "         Aufraeumen: git -C \"$QUELLE\" worktree remove --force \"$BAUM\""; exit "$1"; }
aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "1/8 Stand holen und frischen Arbeitsbaum anlegen ..."
git fetch -q origin "$ZWEIG" "$QA_ZWEIG" || { echo "ABBRUCH: fetch fehlgeschlagen"; exit 3; }
git -C "$KLON" fetch -q origin main || { echo "ABBRUCH: Klon-fetch fehlgeschlagen"; exit 3; }
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || { echo "ABBRUCH: Arbeitsbaum"; exit 4; }
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    Bauzweig: $(git log --oneline -1)"

echo "2/8 Dateien uebernehmen, sw.js auf Live-Basis bauen ..."
git checkout -q "origin/$QA_ZWEIG" -- "${DATEIEN[@]}" || { echo "ABBRUCH: Dateien aus $QA_ZWEIG nicht holbar"; behalten 5; }
git -C "$KLON" show origin/main:sw.js > /tmp/sw-live-ziele.js || { echo "ABBRUCH: Live-sw.js nicht lesbar"; behalten 5; }
grep -q "const CACHE_NAME = \"$SW_VORHER\";" /tmp/sw-live-ziele.js || { echo "ABBRUCH: Live-sw.js traegt nicht $SW_VORHER — Basis stimmt nicht mehr"; behalten 5; }
grep -q '"/assets/mobil-dock.js"' /tmp/sw-live-ziele.js || { echo "ABBRUCH: Live-sw.js kennt mobil-dock.js nicht (Runde 1 fehlt?)"; behalten 5; }
sed "s#const CACHE_NAME = \"$SW_VORHER\";#const CACHE_NAME = \"$SW_NEU\";#" /tmp/sw-live-ziele.js > /tmp/sw-neu-ziele.js
grep -q "$SW_NEU" /tmp/sw-neu-ziele.js || { echo "ABBRUCH: Version nicht gesetzt"; behalten 5; }
cp /tmp/sw-neu-ziele.js public/sw.js
npm run -s build:assets >/dev/null 2>&1 || true
grep -q "pointer:coarse" public/kompakt.js || { echo "ABBRUCH: kompakt.js traegt die Touch-Regel nicht"; behalten 5; }
git status --short | sed 's/^/    /' | head -20

echo "3/8 Tests und Waechter ..."
if ! node --test tests/mobil-dock.test.mjs tests/touch-ziele.test.mjs tests/modell-router.test.mjs tests/pwa-vollbild-heilung.test.mjs tests/composer-zeile.test.mjs tests/precache-dynamische-importe.test.mjs tests/platform-pwa.test.mjs > /tmp/mobil-ziele-kaskade.log 2>&1; then
  echo "ABBRUCH: Tests rot"; grep -E "not ok|✖|Error" /tmp/mobil-ziele-kaskade.log | head -20; behalten 6
fi
grep -E "ℹ (pass|fail)" /tmp/mobil-ziele-kaskade.log | tr '\n' ' '; echo
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig"; behalten 6; }
MK="$(node scripts/check-markenkette.mjs 2>&1 || true)"
if printf '%s\n' "$MK" | grep -qE '^\s+(kompakt|mobil-dock)\.js'; then echo "ABBRUCH: Markenkette meldet eigene Module"; behalten 6; fi
npm run -s check:module-queries || { echo "ABBRUCH: Modul-Kennungen rot"; behalten 6; }

echo "4/8 Sicherheitsnetz ..."
LIVE_SW="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER"; behalten 7; }
# kompakt.js gibt es NUR live (Klon), nicht im Bauzweig — Basis ist darum die
# Fassung, auf der die Touch-Regel aufsetzt: origin/main des Klons vor diesem Deploy.
BASIS_K="$(git -C "$KLON" show origin/main:kompakt.js | shasum -a 256 | cut -c1-16)"
LIVE_K="$(curl -s -m 20 "https://smejj.com/assets/kompakt.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)"
[ "$BASIS_K" = "$LIVE_K" ] || { echo "ABBRUCH: kompakt.js live ($LIVE_K) weicht vom Klon-Stand ($BASIS_K) ab"; behalten 7; }
# und die QA-Fassung muss GENAU auf dieser Basis aufsetzen (alles ausser dem Touch-Block gleich)
diff <(git -C "$KLON" show origin/main:kompakt.js) public/kompakt.js | grep '^<' | grep -v 'padding:4px 11px 6px}"$' | grep -v 'Zielen (44 px bleiben)' && { echo "ABBRUCH: kompakt.js im QA-Zweig weicht ueber den Touch-Block hinaus von live ab"; behalten 7; }
echo "    live sw.js = $LIVE_SW, kompakt.js live = Klon-Basis, QA-Fassung setzt darauf auf"
if [ "$PROBE" = 1 ]; then echo; echo "PROBE — bis hier alles gruen."; aufraeumen; exit 0; fi

echo "5/8 Start-Lock stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; behalten 8; }
echo "6/8 Sperren pruefen ..."
for pruefung in start admin favicon; do node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten 9; }; done

echo "7/8 Hochladen ..."
git add -A public tests docs/frontend/start-lock-manifest.json 2>/dev/null
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "fix(mobil)+chore(start-lock): Touch-Ziele 44 px auf Tablets/Querformat (kompakt.js) und Rest-Ziele am Handy (mobil-dock.js); sw.js $SW_NEU — Stempel per Betreiber-Doppelklick 2026-09-07" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: commit"; behalten 10; }
git push -q origin "HEAD:$ZWEIG" || { echo "Push abgelehnt — bitte Claude Code Bescheid geben."; behalten 11; }
QUELLKENNUNG="$(git rev-parse --short HEAD)"; echo "    Bauzweig: $(git log --oneline -1)"
cd "$KLON" || behalten 12
[ -z "$(git status --porcelain)" ] || git stash push -q -u -m "vor Ziele-Stempel $(date +%Y-%m-%d-%H%M)"
git checkout -q main && git pull -q --ff-only origin main || { echo "ABBRUCH: Klon nicht auf origin/main"; behalten 12; }
for f in kompakt.js mobil-dock.js; do cp "$BAUM/public/$f" "$f"; cp "$BAUM/public/$f" "assets/$f"; done
cp /tmp/sw-neu-ziele.js sw.js; cp /tmp/sw-neu-ziele.js assets/sw.js
git add kompakt.js assets/kompakt.js mobil-dock.js assets/mobil-dock.js sw.js assets/sw.js
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "deploy(mobil): Touch-Ziele 44 px (kompakt.js, mobil-dock.js); SW $SW_NEU — Quelle smejj.com-app $QUELLKENNUNG (Stempel 2026-09-07)" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Klon-Commit"; behalten 13; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push in den Frontend-Klon"; behalten 14; }
echo "    Klon: $(git log --oneline -1)"

echo "8/8 Gegenprobe ..."
ERW="$(shasum -a 256 < "$BAUM/public/kompakt.js" | cut -c1-16)"
echo -n "    warte auf GitHub Pages "
for i in $(seq 1 40); do
  V="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
  K="$(curl -s -m 15 "https://smejj.com/assets/kompakt.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)"
  if [ "$V" = "$SW_NEU" ] && [ "$K" = "$ERW" ]; then echo; echo "    ok: sw.js live $SW_NEU, kompakt.js live byte-gleich"; aufraeumen; echo; echo "FERTIG — Start-Lock gestempelt, Service-Worker $SW_NEU live."; exit 0; fi
  echo -n "."; sleep 8
done
echo; echo "HINWEIS: gepusht, GitHub Pages baut noch — spaeter pruefen: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
aufraeumen; exit 0

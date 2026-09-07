#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-07, Runde 4):
# die sechs Fehler der Abend-Liste — Start-Lock stempeln, Marken heben, sw.js mit
# Precache-Eintrag und CACHE_NAME-Sprung ausliefern.
#
# FEHLERLISTE (Betreiber 17:26-17:45, iPhone, frisch installierte App):
#   1 Vollbild-Versatz unten (~52 pt)      -> mobil-dock.js misst screen.height - innerHeight
#   2 Mikrofon-Zustand unsichtbar           -> kompakt.js: Logofarbe #02fdfd waehrend Diktat
#   3 Chatbereich schiebt seitlich, Rohtext -> mobil-dock.js: Umbruch, Tabellen in sich, Glasblase, Kopfglas
#   4 Modell-Menue schneidet rechts ab      -> mobil-dock.js: fest ueber dem Dock, volle Breite
#   5 Vorlesen fuer eigene Fragen           -> chat-actions-menu.js (MARKE v7, Lader chat-actions.js b50)
#   6 Profil/Einstellungen Desktop-Bauart   -> mobil-ansichten.js (neu, Precache)
# Ungesperrte Module sind seit 07.09. abends live. Wiederkehrende Nutzer bekommen sie
# erst mit dem CACHE_NAME-Sprung; chat-actions-menu.js braucht neue Marken in
# chat-actions.js und index.html (Start-Lock). Darum dieser Klick.
#
# VERSIONEN WERDEN LIVE GELESEN: Parallelsitzungen vergeben ebenfalls Service-Worker-
# Versionen (heute v796, v801). Die Kaskade nimmt live + 1 und die naechsten Marken.
# "--probe": alles bis Schritt 4, dann Trockenlauf-Ende.
set -u
PROBE=0; [ "${1:-}" = "--probe" ] && PROBE=1
ZWEIG="feature/auth-redesign-github-magiclink"
QA_ZWEIG="feature/responsive-qa-2026-09-07"
QUELLE="${SMEJJ_APP_ORDNER:-$PWD}"
KLON="$HOME/smejj-app-frontend"
BAUM="/private/tmp/claude-501/stempel-mobil-runde4-$(date +%Y%m%d-%H%M%S)"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-07 abends (Auftrag 100 % Responsive, 'Go: alle sechs bauen'): Vollbild-Versatz, Mikrofon in Logofarbe, Chat ohne Seitwaerts-Schieben mit Glas, Modell-Menue volle Breite, Vorlesen fuer eigene Fragen, Ansichten nach dem Login wie eine App — Stempel per Doppelklick; sw.js Precache mobil-ansichten.js, CACHE_NAME live+1, Marken chat-actions-menu/chat-actions +1."
DATEIEN=(public/kompakt.js public/mobil-dock.js public/mobil-ansichten.js public/chat-actions-menu.js tests/mobil-dock.test.mjs tests/mobil-ansichten.test.mjs tests/touch-ziele.test.mjs tests/chat-message-actions.test.mjs)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
[ -e "$KLON/.git" ] || { echo "ABBRUCH: Frontend-Klon fehlt unter $KLON"; exit 2; }
cd "$QUELLE" || exit 2
behalten() { echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen: $BAUM"; echo "         Aufraeumen: git -C \"$QUELLE\" worktree remove --force \"$BAUM\""; exit "$1"; }
aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "1/8 Stand holen, Versionen live lesen, Arbeitsbaum anlegen ..."
git fetch -q origin "$ZWEIG" "$QA_ZWEIG" || { echo "ABBRUCH: fetch fehlgeschlagen"; exit 3; }
git -C "$KLON" fetch -q origin main || { echo "ABBRUCH: Klon-fetch fehlgeschlagen"; exit 3; }
LIVE_INDEX="$(curl -s -m 20 "https://smejj.com/index.html?n=$RANDOM")"
LIVE_SW="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
KLON_SW="$(git -C "$KLON" show origin/main:sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)"
[ -n "$LIVE_SW" ] && [ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live sw.js ($LIVE_SW) und Klon ($KLON_SW) stimmen nicht ueberein — kurz warten (Pages baut) und neu klicken"; exit 3; }
SW_NEU="smejj-shell-v$(( ${LIVE_SW#smejj-shell-v} + 1 ))"
ALT_CA="$(printf '%s' "$LIVE_INDEX" | grep -o 'chat-actions\.js?v=b[0-9]*' | head -1)"
ALT_CAM="$(git -C "$KLON" show origin/main:chat-actions.js | grep -o 'chat-actions-menu\.js?v=[0-9]*' | head -1)"
[ -n "$ALT_CA" ] && [ -n "$ALT_CAM" ] || { echo "ABBRUCH: Marken live nicht lesbar (chat-actions '$ALT_CA', menu '$ALT_CAM')"; exit 3; }
NEU_CA="chat-actions.js?v=b$(( ${ALT_CA#chat-actions.js?v=b} + 1 ))"
NEU_CAM="chat-actions-menu.js?v=$(( ${ALT_CAM#chat-actions-menu.js?v=} + 1 ))"
echo "    live: $LIVE_SW -> $SW_NEU | $ALT_CA -> $NEU_CA | $ALT_CAM -> $NEU_CAM"
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || { echo "ABBRUCH: Arbeitsbaum"; exit 4; }
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    Bauzweig: $(git log --oneline -1)"

echo "2/8 Dateien uebernehmen, Marken setzen, sw.js auf Live-Basis bauen ..."
git checkout -q "origin/$QA_ZWEIG" -- "${DATEIEN[@]}" || { echo "ABBRUCH: Dateien aus $QA_ZWEIG nicht holbar"; behalten 5; }
marken_setzen() {
  sed -i '' "s#chat-actions\.js?v=[a-z0-9-]*#${NEU_CA}#" "$1/index.html"
  sed -i '' "s#chat-actions-menu\.js?v=[0-9]*#${NEU_CAM}#" "$1/chat-actions.js"
}
marken_setzen public
grep -q "$NEU_CA" public/index.html && grep -q "$NEU_CAM" public/chat-actions.js || { echo "ABBRUCH: Marken nicht gesetzt"; behalten 5; }
git -C "$KLON" show origin/main:sw.js > /tmp/sw-live-r4.js || { echo "ABBRUCH: Live-sw.js nicht lesbar"; behalten 5; }
node -e '
const fs = require("fs");
const z = fs.readFileSync("/tmp/sw-live-r4.js", "utf8").split("\n");
const k = z.findIndex((s) => s.includes("\"/assets/mobil-dock.js\""));
if (k < 0) { console.error("mobil-dock.js fehlt im Live-Precache"); process.exit(1); }
if (!z.some((s) => s.includes("\"/assets/mobil-ansichten.js\""))) z.splice(k + 1, 0, "  // Ansichten nach dem Login am Handy (2026-09-07), per import() aus mobil-dock.js.", "  \"/assets/mobil-ansichten.js\",");
const t = z.join("\n").replace(/const CACHE_NAME = "smejj-shell-v[0-9]+";/, "const CACHE_NAME = \"" + process.argv[1] + "\";");
if (!t.includes(process.argv[1])) { console.error("Version nicht gesetzt"); process.exit(1); }
fs.writeFileSync("public/sw.js", t); fs.writeFileSync("/tmp/sw-neu-r4.js", t);
console.log("    sw.js: Live-Basis + mobil-ansichten.js, " + process.argv[1]);
' "$SW_NEU" || { echo "ABBRUCH: sw.js-Bau"; behalten 5; }
npm run -s build:assets >/dev/null 2>&1 || true
grep -q 'act: "speak", label: "Vorlesen"' public/chat-actions-menu.js || { echo "ABBRUCH: chat-actions-menu.js traegt Vorlesen nicht"; behalten 5; }
grep -q "misstVersatz" public/mobil-dock.js || { echo "ABBRUCH: mobil-dock.js ohne Versatz-Messung"; behalten 5; }
git status --short | sed 's/^/    /' | head -24

echo "3/8 Tests und Waechter ..."
if ! node --test tests/mobil-dock.test.mjs tests/mobil-ansichten.test.mjs tests/touch-ziele.test.mjs tests/chat-message-actions.test.mjs tests/modell-router.test.mjs tests/pwa-vollbild-heilung.test.mjs tests/composer-zeile.test.mjs tests/precache-dynamische-importe.test.mjs tests/platform-pwa.test.mjs > /tmp/mobil-r4-kaskade.log 2>&1; then
  echo "ABBRUCH: Tests rot"; grep -E "not ok|✖|Error" /tmp/mobil-r4-kaskade.log | head -20; behalten 6
fi
grep -E "ℹ (pass|fail)" /tmp/mobil-r4-kaskade.log | tr '\n' ' '; echo
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig"; behalten 6; }
MK="$(node scripts/check-markenkette.mjs 2>&1 || true)"
if printf '%s\n' "$MK" | grep -qE '^\s+(kompakt|mobil-dock|mobil-ansichten|chat-actions-menu|chat-actions)\.js'; then echo "ABBRUCH: Markenkette meldet eigene Module:"; printf '%s\n' "$MK" | grep -E '^\s+(kompakt|mobil-dock|mobil-ansichten|chat-actions-menu|chat-actions)\.js'; behalten 6; fi
npm run -s check:module-queries || { echo "ABBRUCH: Modul-Kennungen rot"; behalten 6; }

echo "4/8 Sicherheitsnetz ..."
for f in kompakt.js mobil-dock.js mobil-ansichten.js; do
  a="$(git -C "$KLON" show origin/main:$f | shasum -a 256 | cut -c1-16)"; b="$(shasum -a 256 < public/$f | cut -c1-16)"
  [ "$a" = "$b" ] || { echo "ABBRUCH: $f im QA-Zweig ($b) ist nicht die live ausgelieferte Fassung ($a) — erst den Klon nachziehen"; behalten 7; }
done
printf '%s' "$LIVE_INDEX" | grep -q "$ALT_CA" || { echo "ABBRUCH: live index.html traegt $ALT_CA nicht mehr"; behalten 7; }
echo "    Module live = QA-Fassung, Marken live wie gelesen"
if [ "$PROBE" = 1 ]; then echo; echo "PROBE — bis hier alles gruen ($SW_NEU, $NEU_CA, $NEU_CAM)."; aufraeumen; exit 0; fi

echo "5/8 Start-Lock stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; behalten 8; }
echo "6/8 Sperren pruefen ..."
for pruefung in start admin favicon; do node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten 9; }; done

echo "7/8 Hochladen ..."
git add -A public tests docs/frontend/start-lock-manifest.json 2>/dev/null
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "fix(mobil)+chore(start-lock): Runde 4 — Vollbild-Versatz, Mikrofon-Farbe, Chat-Glas, Modell-Menue, Vorlesen, Ansichten nach Login; Marken $NEU_CA / $NEU_CAM; sw.js $SW_NEU — Stempel per Betreiber-Doppelklick 2026-09-07" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: commit"; behalten 10; }
git push -q origin "HEAD:$ZWEIG" || { echo "Push abgelehnt — bitte Claude Code Bescheid geben."; behalten 11; }
QUELLKENNUNG="$(git rev-parse --short HEAD)"; echo "    Bauzweig: $(git log --oneline -1)"
cd "$KLON" || behalten 12
[ -z "$(git status --porcelain)" ] || git stash push -q -u -m "vor Runde-4-Stempel $(date +%Y-%m-%d-%H%M)"
git checkout -q main && git pull -q --ff-only origin main || { echo "ABBRUCH: Klon nicht auf origin/main"; behalten 12; }
cp "$BAUM/public/chat-actions-menu.js" chat-actions-menu.js; cp "$BAUM/public/chat-actions-menu.js" assets/chat-actions-menu.js
cp /tmp/sw-neu-r4.js sw.js; cp /tmp/sw-neu-r4.js assets/sw.js
marken_setzen .; marken_setzen assets
git add chat-actions-menu.js assets/chat-actions-menu.js sw.js assets/sw.js index.html assets/index.html chat-actions.js assets/chat-actions.js
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "deploy(mobil): Runde 4 — Vorlesen fuer eigene Fragen, Precache mobil-ansichten.js; SW $SW_NEU, Marken $NEU_CA / $NEU_CAM — Quelle smejj.com-app $QUELLKENNUNG (Stempel 2026-09-07)" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Klon-Commit"; behalten 13; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push in den Frontend-Klon"; behalten 14; }
echo "    Klon: $(git log --oneline -1)"

echo "8/8 Gegenprobe ..."
echo -n "    warte auf GitHub Pages "
for i in $(seq 1 40); do
  V="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
  M="$(curl -s -m 15 "https://smejj.com/index.html?n=$RANDOM" | grep -c "$NEU_CA")"
  if [ "$V" = "$SW_NEU" ] && [ "$M" = 1 ]; then echo; echo "    ok: sw.js live $SW_NEU, index.html mit $NEU_CA"; aufraeumen; echo; echo "FERTIG — Start-Lock gestempelt, Service-Worker $SW_NEU live. Die App holt beim naechsten Start alle sechs Heilungen."; exit 0; fi
  echo -n "."; sleep 8
done
echo; echo "HINWEIS: gepusht, GitHub Pages baut noch — spaeter pruefen: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
aufraeumen; exit 0

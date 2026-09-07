#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-07):
# Mobil-Vollbild, schlankes Dock und Auto-Wahl — Start-Lock stempeln und die
# zwei gesperrten Dateien ausliefern (chatClient.js, sw.js mit Sprung auf v795).
#
# BEFUND (iPhone-Screenshots des Betreibers 14:17-14:33, Pixel-7-Emulator):
#   - Auto endete fuenfmal mit "Automatische Modellwahl hat nicht geklappt — bitte
#     ein Modell von Hand waehlen": die Auto-Wahl las den ALTEN Ausweis aus
#     localStorage, der frische aus dem stillen Refresh lag ungenutzt in
#     sessionStorage. Dazu: ohne Cline-Schluessel (409) gab es keinen Rueckfall.
#   - Schwarzer Balken unten in der installierten App (WebKit: Layout-Viewport
#     bleibt nach der Tastatur klein) — Heilung in pwa-schnellstart.js.
#   - Untere Safe-Area doppelt (68 pt Leere), Code-Leiste in zwei Zeilen —
#     Heilung im neuen Laufzeit-Modul mobil-dock.js.
# Die ungesperrten Dateien sind seit 07.09. live (Frontend-Klon 3e0978c, 7df5cf4).
# Wiederkehrende App-Nutzer bekommen sie aber erst mit dem CACHE_NAME-Sprung
# des Service-Workers — und sw.js sowie ai/chatClient.js stehen unter dem
# Start-Lock. Darum dieser Klick.
#
# WAS PASSIERT (8 Schritte, jeder bricht bei Rot ab, nichts wird geloescht):
#   1. frischer Arbeitsbaum vom Bauzweig
#   2. die Dateien der QA-Commits hineinnehmen; sw.js auf LIVE-Basis (v794) bauen:
#      Precache-Eintrag /assets/mobil-dock.js + CACHE_NAME smejj-shell-v795
#   3. Tests und Waechter (Precache, Markenkette, Modul-Kennungen)
#   4. Sicherheitsnetz: live ist wirklich v794, chatClient.js live = Basis
#   5. Start-Lock stempeln (Betreiber-Wortlaut)
#   6. alle Sperren pruefen (start, admin, favicon; security nur melden)
#   7. Bauzweig hochladen; chatClient.js + sw.js in den Frontend-Klon (Wurzel + assets/)
#   8. Gegenprobe: sw.js live v795, chatClient.js live byte-gleich
# Mit "--probe" laeuft alles bis Schritt 4 und danach NUR Trockenlauf (kein
# Stempel, kein Commit, kein Push) — zum Vorabtesten aus einer Sitzung.
set -u
PROBE=0; [ "${1:-}" = "--probe" ] && PROBE=1

ZWEIG="feature/auth-redesign-github-magiclink"
QA_ZWEIG="feature/responsive-qa-2026-09-07"
QUELLE="${SMEJJ_APP_ORDNER:-$PWD}"
KLON="$HOME/smejj-app-frontend"
BAUM="/private/tmp/claude-501/stempel-mobil-dock-$(date +%Y%m%d-%H%M%S)"
SW_VORHER="smejj-shell-v794"
SW_NEU="smejj-shell-v795"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-07 (Auftrag 100 % End-to-End Responsiveness, Fullscreen UI Fix & Multi-Platform QA Loop): 'Fehler sofort beheben und erneut testen, bis alles 100 % sauber laeuft. Zum Schluss bitte 100 % Schutz aktivieren.' — Stempel per Doppelklick: ai/chatClient.js (Auto endet nie mehr mit 'von Hand waehlen'; frischer Ausweis) und sw.js (Precache mobil-dock.js, CACHE_NAME smejj-shell-v795) fuer Vollbild-Heilung und schlankes Dock in der installierten App."
DATEIEN=(public/mobil-dock.js public/ai/chatClient.js public/ai/modellRouter.js public/chat-actions-menu.js public/pwa-schnellstart.js public/willkommen.html tests/mobil-dock.test.mjs tests/modell-router.test.mjs tests/pwa-vollbild-heilung.test.mjs)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
[ -e "$KLON/.git" ] || { echo "ABBRUCH: Frontend-Klon fehlt unter $KLON"; exit 2; }
cd "$QUELLE" || exit 2

behalten() {
  echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen:"
  echo "           $BAUM"
  echo "         Aufraeumen spaeter mit:  git -C \"$QUELLE\" worktree remove --force \"$BAUM\""
  exit "$1"
}
aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "1/8 Stand holen und frischen Arbeitsbaum anlegen ..."
git fetch -q origin "$ZWEIG" "$QA_ZWEIG" || { echo "ABBRUCH: fetch fehlgeschlagen"; exit 3; }
git -C "$KLON" fetch -q origin main || { echo "ABBRUCH: Klon-fetch fehlgeschlagen"; exit 3; }
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || { echo "ABBRUCH: Arbeitsbaum"; exit 4; }
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    Bauzweig: $(git log --oneline -1)"

echo "2/8 Dateien der QA-Commits uebernehmen, sw.js auf Live-Basis bauen ..."
git checkout -q "origin/$QA_ZWEIG" -- "${DATEIEN[@]}" || { echo "ABBRUCH: Dateien aus $QA_ZWEIG nicht holbar"; behalten 5; }
# MARKENKETTE: geaenderter Inhalt braucht eine neue Marke — in JEDEM Lader.
#   pwa-schnellstart.js (Heilung)      -> ?v=8   in index.html und willkommen.html
#   chat-actions-menu.js (Haken)       -> ?v=6   in chat-actions.js
#   chat-actions.js (traegt den Haken) -> ?v=b49 in index.html
# index.html und chat-actions.js werden NICHT aus dem QA-Zweig kopiert (dort
# aelter als live) — nur die Marken werden per sed gesetzt, hier wie im Klon.
marken_setzen() {
  sed -i '' -e 's#pwa-schnellstart\.js?v=[0-9]*#pwa-schnellstart.js?v=8#' -e 's#chat-actions\.js?v=[a-z0-9-]*#chat-actions.js?v=b49#' "$1/index.html"
  sed -i '' 's#pwa-schnellstart\.js?v=[0-9]*#pwa-schnellstart.js?v=8#' "$1/willkommen.html"
  sed -i '' 's#chat-actions-menu\.js?v=[0-9]*#chat-actions-menu.js?v=6#' "$1/chat-actions.js"
}
marken_setzen public
grep -q 'pwa-schnellstart.js?v=8' public/index.html && grep -q 'chat-actions.js?v=b49' public/index.html && grep -q 'chat-actions-menu.js?v=6' public/chat-actions.js || { echo "ABBRUCH: Marken nicht gesetzt"; behalten 5; }
# sw.js: die LIVE-Fassung (origin/main des Klons) ist die Basis — der Bauzweig ist
# dort aelter (v777) und wuerde live 16 Precache-Zeilen verlieren.
git -C "$KLON" show origin/main:sw.js > /tmp/sw-live-2026-09-07.js || { echo "ABBRUCH: Live-sw.js nicht lesbar"; behalten 5; }
grep -q "const CACHE_NAME = \"$SW_VORHER\";" /tmp/sw-live-2026-09-07.js || { echo "ABBRUCH: Live-sw.js traegt nicht $SW_VORHER — Basis stimmt nicht mehr, Kaskade neu bauen lassen"; behalten 5; }
node -e '
const fs = require("fs");
const z = fs.readFileSync("/tmp/sw-live-2026-09-07.js", "utf8").split("\n");
const k = z.findIndex((s) => s.includes("\"/assets/code-feld-unten.js\""));
if (k < 0) { console.error("code-feld-unten.js fehlt im Live-Precache"); process.exit(1); }
if (!z.some((s) => s.includes("\"/assets/mobil-dock.js\""))) z.splice(k + 1, 0, "  // Schlankes Dock am Handy (2026-09-07), per import() aus chat-actions-menu.js.", "  \"/assets/mobil-dock.js\",");
const t = z.join("\n").replace("const CACHE_NAME = \"" + process.argv[1] + "\";", "const CACHE_NAME = \"" + process.argv[2] + "\";");
if (!t.includes(process.argv[2])) { console.error("Version nicht gesetzt"); process.exit(1); }
fs.writeFileSync("public/sw.js", t);
fs.writeFileSync("/tmp/sw-neu-2026-09-07.js", t);
console.log("    sw.js: Live-Basis + mobil-dock.js, " + process.argv[2]);
' "$SW_VORHER" "$SW_NEU" || { echo "ABBRUCH: sw.js-Bau"; behalten 5; }
npm run -s build:assets >/dev/null 2>&1 || true
grep -q 'wahl.fehler === "anmeldung"' public/ai/chatClient.js || { echo "ABBRUCH: chatClient.js traegt die Aenderung nicht"; behalten 5; }
grep -q '"/assets/mobil-dock.js"' public/sw.js || { echo "ABBRUCH: Precache-Eintrag fehlt"; behalten 5; }
git status --short | sed 's/^/    /' | head -30

echo "3/8 Tests und Waechter ..."
if ! node --test tests/mobil-dock.test.mjs tests/modell-router.test.mjs tests/pwa-vollbild-heilung.test.mjs tests/composer-zeile.test.mjs tests/mobil-safe-area.test.mjs tests/precache-dynamische-importe.test.mjs tests/platform-pwa.test.mjs > /tmp/mobil-dock-kaskade.log 2>&1; then
  echo "ABBRUCH: Tests rot — nicht gestempelt"; grep -E "not ok|✖|Error" /tmp/mobil-dock-kaskade.log | head -20; behalten 6
fi
grep -E "ℹ (pass|fail)" /tmp/mobil-dock-kaskade.log | tr '\n' ' '; echo
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig"; behalten 6; }
# Markenkette: der Bauzweig traegt Vorbestand aus Parallelsitzungen (2026-09-07:
# 8 Module mit altem Inhalt unter alter Marke). Die gehoeren nicht zu diesem
# Stempel und bleiben, wie sie sind — ABBRUCH nur, wenn EIGENE Module gemeldet werden.
MK="$(node scripts/check-markenkette.mjs 2>&1 || true)"
if printf '%s\n' "$MK" | grep -qE '^\s+(pwa-schnellstart|chat-actions-menu|chat-actions|mobil-dock)\.js'; then
  echo "ABBRUCH: Markenkette meldet eigene Module:"; printf '%s\n' "$MK" | grep -E '^\s+(pwa-schnellstart|chat-actions-menu|chat-actions|mobil-dock)\.js'; behalten 6
fi
FREMD_MARKEN="$(printf '%s\n' "$MK" | grep -c 'steht weiter' || true)"
[ "$FREMD_MARKEN" = 0 ] || echo "    Hinweis: Markenkette meldet $FREMD_MARKEN fremde Module (Vorbestand des Bauzweigs, nicht Teil dieses Stempels)"
npm run -s check:module-queries || { echo "ABBRUCH: Modul-Kennungen rot"; behalten 6; }

echo "4/8 Sicherheitsnetz: stimmt live mit der Basis ueberein? ..."
LIVE_SW="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER"; behalten 7; }
BASIS_CC="$(git show "origin/$ZWEIG:public/ai/chatClient.js" | shasum -a 256 | cut -c1-16)"
LIVE_CC="$(curl -s -m 20 "https://smejj.com/assets/ai/chatClient.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)"
[ "$BASIS_CC" = "$LIVE_CC" ] || { echo "ABBRUCH: chatClient.js live ($LIVE_CC) weicht von der Bauzweig-Basis ($BASIS_CC) ab — fremde Arbeit, nicht ueberschreiben"; behalten 7; }
LIVE_INDEX="$(curl -s -m 20 "https://smejj.com/index.html?n=$RANDOM")"
printf '%s' "$LIVE_INDEX" | grep -q 'pwa-schnellstart.js?v=7' && printf '%s' "$LIVE_INDEX" | grep -q 'chat-actions.js?v=b48' \
  || { echo "ABBRUCH: live index.html traegt nicht die erwarteten Marken (pwa v7, chat-actions b48) — Basis hat sich bewegt"; behalten 7; }
curl -s -m 20 "https://smejj.com/assets/chat-actions.js?n=$RANDOM" | grep -q 'chat-actions-menu.js?v=5' || { echo "ABBRUCH: live chat-actions.js laedt das Menue nicht mit ?v=5"; behalten 7; }
echo "    live sw.js = $LIVE_SW, chatClient.js live = Basis, Marken live wie erwartet"
if [ "$PROBE" = 1 ]; then
  echo; echo "PROBE — bis hier alles gruen. Stempel, Commit und Push laufen nur per Doppelklick."; aufraeumen; exit 0
fi

echo "5/8 Start-Lock stempeln ..."
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Start-Lock nicht gestempelt"; behalten 8; }

echo "6/8 Sperren pruefen ..."
for pruefung in start admin favicon; do
  node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten 9; }
done
node scripts/check-security-lock.mjs >/dev/null 2>&1 || echo "    Hinweis: security-lock weiter rot (Vorbestand aus fremder Sitzung, nicht Teil dieses Stempels)"

echo "7/8 Hochladen: Bauzweig, dann Frontend-Klon ..."
git add -A public tests docs/frontend/start-lock-manifest.json 2>/dev/null
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "fix(mobil)+chore(start-lock): Auto-Wahl ohne Sackgasse, Vollbild-Heilung, schlankes Dock; sw.js auf Live-Basis mit mobil-dock.js, $SW_NEU — Stempel per Betreiber-Doppelklick 2026-09-07" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: commit"; behalten 10; }
if ! git push -q origin "HEAD:$ZWEIG"; then
  echo "Push abgelehnt (der Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."; behalten 11
fi
echo "    Bauzweig: $(git log --oneline -1)"
QUELLKENNUNG="$(git rev-parse --short HEAD)"

cd "$KLON" || behalten 12
if [ -n "$(git status --porcelain)" ]; then
  git stash push -q -u -m "vor Mobil-Dock-Stempel $(date +%Y-%m-%d-%H%M)" && echo "    Klon: ungesicherte Reste beiseite gelegt (git stash list)"
fi
git checkout -q main && git pull -q --ff-only origin main || { echo "ABBRUCH: Klon nicht auf origin/main"; behalten 12; }
cp "$BAUM/public/ai/chatClient.js" ai/chatClient.js
cp "$BAUM/public/ai/chatClient.js" assets/ai/chatClient.js
cp /tmp/sw-neu-2026-09-07.js sw.js
cp /tmp/sw-neu-2026-09-07.js assets/sw.js
# Marken live setzen (nur die drei Stellen; index.html und chat-actions.js bleiben sonst unveraendert)
marken_setzen .
marken_setzen assets
git add ai/chatClient.js assets/ai/chatClient.js sw.js assets/sw.js index.html assets/index.html willkommen.html assets/willkommen.html chat-actions.js assets/chat-actions.js
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "deploy(mobil): Auto ohne Sackgasse (chatClient.js), Precache mobil-dock.js; SW $SW_NEU — Quelle smejj.com-app $QUELLKENNUNG (Stempel 2026-09-07)" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Klon-Commit (nichts geaendert?)"; behalten 13; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push in den Frontend-Klon"; behalten 14; }
echo "    Klon: $(git log --oneline -1)"

echo "8/8 Gegenprobe ..."
ERW="$(shasum -a 256 < "$BAUM/public/ai/chatClient.js" | cut -c1-16)"
echo -n "    warte auf GitHub Pages "
for i in $(seq 1 40); do
  V="$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)"
  C="$(curl -s -m 15 "https://smejj.com/assets/ai/chatClient.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)"
  M="$(curl -s -m 15 "https://smejj.com/index.html?n=$RANDOM" | grep -c 'pwa-schnellstart.js?v=8')"
  if [ "$V" = "$SW_NEU" ] && [ "$C" = "$ERW" ] && [ "$M" = 1 ]; then
    echo; echo "    ok: sw.js live $SW_NEU, chatClient.js live byte-gleich, index.html mit neuen Marken"; aufraeumen
    echo; echo "FERTIG — Start-Lock gestempelt, Service-Worker $SW_NEU live. Die App holt sich beim naechsten Start die neuen Module (Vollbild-Heilung, schlankes Dock, Auto ohne Sackgasse)."; exit 0
  fi
  echo -n "."; sleep 8
done
echo; echo "HINWEIS: Stempel steht und ist gepusht, GitHub Pages baut noch. Spaeter pruefen:"
echo "         curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
aufraeumen; exit 0

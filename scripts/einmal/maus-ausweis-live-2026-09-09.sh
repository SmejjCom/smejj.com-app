#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-09: Maus-Ausweis-Fix stempeln und auf
# den LIVE-Stand legen.
#
# BEFUND (live 09.09. 14:55, Betreiber: "Mach weitere Tests"): nach gut zehn
# Minuten im Panel endete jeder Maus-Lauf sofort mit "Maus konnte nicht
# entscheiden: authentication_required" — der gespeicherte Ausweis war
# abgelaufen, die Maus holte nie einen frischen. Fix 412fad17 (Arbeitszweig):
# bei 401/403 /api/auth/session-token fragen und den Schritt wiederholen.
# ZWEI TEILE: (1) Start-Lock auf dem Arbeitszweig stempeln (browser-pane.js,
# index.html, sw.js tragen neue Marken), (2) den Fix als Textaenderung auf die
# LIVE-Datei browser-pane-maus-frei.js legen (live ist die Maus geteilt, der
# Zweig nicht — siehe maus-ausweis-live-2026-09-09.mjs).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
CODE_COMMIT="412fad17"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Arbeitszweig in eigenem Worktree"
git fetch -q origin feature/design-v11 || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
git merge-base --is-ancestor "$CODE_COMMIT" origin/feature/design-v11 || { echo "ABBRUCH: Fix $CODE_COMMIT nicht im Arbeitszweig."; exit 1; }
WT="/private/tmp/claude-501/kaskade-maus-ausweis"
git worktree remove --force "$WT" >/dev/null 2>&1 || true
git worktree add -q --detach "$WT" origin/feature/design-v11 || { echo "ABBRUCH: Worktree nicht anlegbar."; exit 1; }
ln -sfn "$REPO/node_modules" "$WT/node_modules"
cd "$WT" || exit 1
grep -qF 'frischerNachweis' public/browser-pane-maus.js || { echo "ABBRUCH: der Fix steht nicht im Zweig."; exit 1; }

echo "== 1. Waechter und Tests"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/browser-pane.test.mjs tests/maus-absicht.test.mjs > /tmp/maus-ausweis-kaskade.log 2>&1 \
  || { echo "ABBRUCH: Tests rot."; tail -20 /tmp/maus-ausweis-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/maus-ausweis-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-09: 'Mach weitere Tests.' Befund 14:55: Maus-Lauf endete nach zehn Minuten im Panel mit authentication_required. Umgesetzt (412fad17): die Maus holt bei 401/403 per /api/auth/session-token einen frischen Ausweis und wiederholt den Schritt; Marken bis zur Wurzel, Service-Worker smejj-shell-v827. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Maus-Ausweis 2026-09-09 — browser-pane.js, index.html, SW smejj-shell-v827 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
git push -q origin HEAD:feature/design-v11 || echo "(Push des Arbeitszweigs spaeter nachholen)"
git log --oneline -1

echo "== 3. Live-Klon auf origin/main"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
git checkout -q main && git reset -q --hard origin/main || { echo "ABBRUCH: Klon nicht auf origin/main."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
KLON_SW=$(grep -o 'smejj-shell-v[0-9]*' sw.js | head -1)
echo "live: $LIVE_SW   Klon: $KLON_SW"
[ "$LIVE_SW" = "$KLON_SW" ] || { echo "ABBRUCH: live ($LIVE_SW) und origin/main ($KLON_SW) passen nicht zusammen."; exit 1; }

echo "== 4. Fix auf den Live-Stand legen (Pruefsummen- und Anker-Netz im Skript)"
node "$WT/scripts/einmal/maus-ausweis-live-2026-09-09.mjs" "$KLON" || { git checkout -q -- . ; echo "ABBRUCH: Fix nicht angewendet, Klon zurueckgesetzt."; exit 1; }
SW_NEU=$(cat /tmp/maus-ausweis-live-sw.txt)
node --check "$KLON/browser-pane-maus-frei.js" || { git checkout -q -- . ; echo "ABBRUCH: Syntax."; exit 1; }

echo "== 5. Committen und Fast-Forward-Push auf main"
git add -A
git status --short | head -40
git commit -q -m "deploy(maus): abgelaufener Ausweis wird erneuert und der Schritt wiederholt; SW $SW_NEU — Quelle smejj.com-app $CODE_COMMIT (auf den Live-Stand gelegt)" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$KLON/browser-pane-maus-frei.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-maus-frei.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  frei=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then echo; echo "FERTIG — live: Service-Worker $SW_NEU, browser-pane-maus-frei.js byte-gleich."; exit 0; fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1

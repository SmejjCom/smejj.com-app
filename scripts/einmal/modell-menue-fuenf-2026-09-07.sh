#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-07: Modell-Menue = genau fuenf Zeilen —
# stempeln und ausliefern (Frontend + Bruecke).
#
# AUFTRAG (Wortlaut): "Soll hier nur: smejj 1.3 — Spezialfälle / smejj 1.2 —
# Komplex / smejj 1.1 — Alltag / smejj 1.0 — Standard / Auto — Automatisch.
# Genau so sein."
# CODE: d4b2fd0a (Arbeitszweig feature/design-v11), SW v790, Bruecke v150.
# DREI STEMPEL: modell-menue-lock (Menue + Kopie), start-lock (app.js,
# index.html, sw.js), security-lock (chat-bridge.js).
# SICHERHEITSNETZ: alle 4 Frontend-Dateien im Live-Repo byte-gleich mit
# 3e628f2a (= Stempel Browser-Oberflaeche, live SW v789); Bruecke live v149.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="3e628f2a"
CODE_COMMIT="d4b2fd0a"
SW_VORHER="smejj-shell-v789"
SW_NEU="smejj-shell-v790"
BRUECKE_VORHER="20260904-v149-oberste-regel"
BRUECKE_NEU="20260907-v150-smejj-familie"
BRUECKE="https://smejj-chat-bridge.zeabur.app"
DATEIEN=(code-modell-menue.js app.js index.html sw.js)
WORTLAUT="Betreiber, 2026-09-07 (Wortlaut): Soll hier nur: smejj 1.3 — Spezialfälle / smejj 1.2 — Komplex / smejj 1.1 — Alltag / smejj 1.0 — Standard / Auto — Automatisch. Genau so sein. Umgesetzt: Modell-Menue (Chat und Code) mit genau diesen fuenf Zeilen in dieser Reihenfolge, Cline-Katalog aus dem Menue entfernt (bleibt in den Einstellungen), smejj 1.1-1.3 als eigene Wahlen in app.js (b156), Bruecke v150 gibt fuer smejj 1.2/1.3 immer die tiefe Spur, Service-Worker smejj-shell-v790. Stempel per Doppelklick im Finder."
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

# DER ARBEITSBAUM IM APP-ORDNER KANN AUF EINEM FREMDEN ZWEIG STEHEN — darum
# arbeitet diese Kaskade in einem EIGENEN Worktree auf feature/design-v11.
cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
WT="/private/tmp/claude-501/kaskade-design-v11"
git worktree remove --force "$WT" >/dev/null 2>&1 || true
git fetch -q origin feature/design-v11 || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
if git rev-parse --verify -q feature/design-v11 >/dev/null; then
  git worktree add -q "$WT" feature/design-v11 2>/dev/null || git worktree add -q --detach "$WT" feature/design-v11 || { echo "ABBRUCH: Worktree fuer feature/design-v11 nicht anlegbar."; exit 1; }
else
  git worktree add -q --detach "$WT" origin/feature/design-v11 || { echo "ABBRUCH: Worktree nicht anlegbar."; exit 1; }
fi
cd "$WT" || { echo "ABBRUCH: Worktree fehlt."; exit 1; }
# Der lokale Zweig kann hinter origin liegen (Kaskaden pushen direkt auf origin).
git merge -q --ff-only origin/feature/design-v11 2>/dev/null || true
echo "== 0. Ausgangslage (Worktree $WT)"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q 'modell: "smejj 1.3", rolle: "Spezialfälle"' public/code-modell-menue.js || { echo "ABBRUCH: die fuenf Zeilen stehen nicht im Menue."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
grep -q "BRIDGE_VERSION = \"$BRUECKE_NEU\"" public/chat-bridge.js || { echo "ABBRUCH: Bruecke traegt nicht $BRUECKE_NEU."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
LIVE_BR=$(curl -s -m 20 "$BRUECKE/health" | grep -o '"version": *"[^"]*"' | head -1)
echo "live: $LIVE_SW · Bruecke $LIVE_BR"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER — Basis stimmt nicht mehr, Kaskade neu bauen lassen."; exit 1; }
[[ "$LIVE_BR" == *"$BRUECKE_VORHER"* ]] || { echo "ABBRUCH: Bruecke live ist $LIVE_BR, erwartet $BRUECKE_VORHER."; exit 1; }

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/code-modell-menue.test.mjs tests/modellmenue-lock.test.mjs tests/modellmenue-reihenfolge.test.mjs tests/modell-menue-start.test.mjs tests/model-registry.test.mjs tests/chat-bridge.test.mjs tests/chat-bridge-router.test.mjs tests/chat-bridge-injektion.test.mjs tests/chat-message-actions.test.mjs tests/system-status-text.test.mjs > /tmp/modell-menue-fuenf-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/modell-menue-fuenf-kaskade.log; exit 1; }
grep -E "^ℹ (tests|pass|fail)" /tmp/modell-menue-fuenf-kaskade.log | tr '\n' ' '; echo

echo "== 2. Drei Stempel (Betreiber-Wortlaut)"
node scripts/check-modell-menue-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: modell-menue-lock Stempel fehlgeschlagen."; exit 1; }
node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: start-lock Stempel fehlgeschlagen."; exit 1; }
node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: security-lock Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen und pushen"
git add docs/approvals/modell-menue-lock-manifest.json docs/frontend/start-lock-manifest.json docs/security/security-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifeste unveraendert)"; else
  git commit -q -m "chore(locks): Stempel Modell-Menue fuenf Zeilen 2026-09-07 — modell-menue-lock, start-lock (app.js b156, index.html, SW smejj-shell-v790), security-lock (Bruecke v150) (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-modell-menue-lock.mjs || { echo "ABBRUCH: modell-menue-lock bleibt rot."; exit 1; }
node scripts/check-start-lock.mjs || { echo "ABBRUCH: start-lock bleibt rot."; exit 1; }
node scripts/check-security-lock.mjs || { echo "ABBRUCH: security-lock bleibt rot."; exit 1; }
git push -q origin HEAD:feature/design-v11 || echo "(Push des Arbeitszweigs spaeter nachholen)"
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$WT" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && { [ -z "$c" ] || [ "$a" = "$c" ]; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Frontend kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$WT/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -f "$KLON/assets/$f" ]; then cp "$WT/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | head -20
git commit -q -m "deploy(modelle): Modell-Menue = fuenf Zeilen (smejj 1.3 Spezialfaelle … Auto Automatisch); SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Bruecke buendeln und ins Frontend-Repo bringen (der Container laedt beim Start von raw.github)"
cd "$WT" || exit 1
node scripts/deploy/bundle_chat_bridge.mjs > /tmp/modell-menue-fuenf-buendel.log 2>&1 || { echo "ABBRUCH: Buendel-Bau rot."; tail -10 /tmp/modell-menue-fuenf-buendel.log; exit 1; }
grep -q "BRIDGE_VERSION = \"$BRUECKE_NEU\"" tmp/chat-bridge-bundle/chat-bridge.mjs || { echo "ABBRUCH: Buendel traegt nicht $BRUECKE_NEU."; exit 1; }
cd "$KLON" || exit 1
git fetch -q origin main; git merge -q --ff-only origin/main 2>/dev/null || true
cp "$WT/tmp/chat-bridge-bundle/chat-bridge.mjs" "$KLON/assets/chat-bridge.js" || { echo "ABBRUCH: Kopie Buendel."; exit 1; }
git add assets/chat-bridge.js
git commit -q -m "deploy(bruecke): smejj 1.2/1.3 immer tiefe Spur — Buendel $BRUECKE_NEU, Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: Buendel unveraendert?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main || { echo "ABBRUCH: Push Buendel fehlgeschlagen."; exit 1; }
echo "Klon $(git rev-parse --short HEAD) gepusht"
for i in $(seq 1 30); do
  raw=$(curl -s -m 20 "https://raw.githubusercontent.com/SmejjCom/smejj-app-frontend/main/assets/chat-bridge.js?nocache=$(date +%s)" | grep -o 'BRIDGE_VERSION = "[^"]*"' | head -1)
  echo "$(date +%H:%M:%S) raw.github: $raw"
  [[ "$raw" == *"$BRUECKE_NEU"* ]] && break
  sleep 10
done

echo "== 7. Bruecke neu starten (ein Neustart IST der Deploy)"
cd "$WT" || exit 1
if node --input-type=module -e 'import { starteDienstNeu } from "./scripts/deploy/zeabur-umgebung-setzen.mjs"; const r = await starteDienstNeu("smejj-chat-bridge"); console.log(JSON.stringify(r)); if (!r.ok) process.exit(1);' 2>/dev/null; then
  echo "Neustart per Zeabur-API ausgeloest"
else
  echo "Zeabur-Schluessel fehlt oder ist abgelaufen (401) — bitte JETZT im Zeabur-Portal:"
  echo "   Dienst smejj-chat-bridge -> Overview -> Restart"
  echo "   (Das Skript wartet unten bis zu 10 Minuten auf die neue Version.)"
fi

echo "== 8. Live-Beweis (GitHub Pages bis zwei Minuten, Bruecke bis zehn)"
ERW=$(shasum -a 256 "$WT/public/code-modell-menue.js" | cut -c1-16)
FE_OK=1; BR_OK=1
for i in $(seq 1 60); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/code-modell-menue.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  B=$(curl -s -m 20 "$BRUECKE/health" | grep -o '"version": *"[^"]*"' | head -1)
  echo "$(date +%H:%M:%S)  sw=$V  menue=$L  bruecke=$B"
  [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ] && FE_OK=0
  [[ "$B" == *"$BRUECKE_NEU"* ]] && BR_OK=0
  [ "$FE_OK" -eq 0 ] && [ "$BR_OK" -eq 0 ] && break
  sleep 10
done
git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true
echo
if [ "$FE_OK" -eq 0 ] && [ "$BR_OK" -eq 0 ]; then
  echo "FERTIG — live: Service-Worker $SW_NEU, Menue byte-gleich, Bruecke $BRUECKE_NEU."; exit 0
fi
[ "$FE_OK" -eq 0 ] && echo "Frontend LIVE ($SW_NEU)." || echo "Frontend OFFEN — gepusht, live noch nicht nachgezogen."
[ "$BR_OK" -eq 0 ] && echo "Bruecke LIVE ($BRUECKE_NEU)." || echo "Bruecke OFFEN — Buendel liegt auf raw.github; Neustart im Zeabur-Portal noetig: smejj-chat-bridge -> Restart."
exit 1

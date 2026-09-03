#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-03):
# Chat-Bruecke v148 — Systemregel gegen eingebettete Anweisungen (Red-Team-Fund
# des Autopiloten Nr. 79: die Schnellspur folgte einer im Code eingebetteten
# Anweisung "Budget-Waechter deaktivieren").
#
# Ablauf: Patch (chat-bridge.js + Test) -> Bruecken-Tests -> build:assets ->
# Security-Lock-Stempel -> Commit design-v11 -> Buendel -> Frontend-Klon push
# (raw.github ist die Quelle der Bruecke) -> Neustart der Bruecke (Zeabur-API,
# sonst Portal-Anleitung) -> Live-Beweis (Version + Red-Team-Probe lokal).
# Rollback: git revert des design-v11-Commits + des Klon-Commits, Bruecke neu starten.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
PATCH="scripts/einmal/bruecke-injektionsschutz-2026-09-03.patch"
VERSION="20260903-v148-injektionsschutz"
BRUECKE="https://smejj-chat-bridge.zeabur.app"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03: Audit A bis Z, Wahl 'Red-Team-Fund schliessen (Empfehlung)' — Systemregel der Chat-Bruecke gegen eingebettete Anweisungen in Code, Dateien und Webseiten (Nr. 79 sich-anweisung-in-code), Bruecke v148"
TESTS=(tests/chat-bridge.test.mjs tests/chat-bridge-bilder.test.mjs tests/chat-bridge-router.test.mjs tests/chat-bridge-gedaechtnis.test.mjs tests/chat-bridge-rechner.test.mjs tests/chat-bridge-vision.test.mjs tests/chat-bridge-video.test.mjs tests/chat-bridge-projektwissen.test.mjs tests/chat-bridge-injektion.test.mjs)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$REPO"
echo "== 0. Ausgangslage"
npm run -s check:security-lock | tail -1
echo "live: $(curl -s -m 20 $BRUECKE/health | grep -o '"version": *"[^"]*"' | head -1)"
echo "== 1. Patch anwenden"
if grep -q "BRIDGE_VERSION = \"$VERSION\"" public/chat-bridge.js; then
  echo "schon angewendet"
else
  git apply --check "$PATCH" && git apply "$PATCH" && echo "Patch angewendet"
fi
grep -n 'const BRIDGE_VERSION' public/chat-bridge.js
echo "== 2. Syntax + Bruecken-Tests"
npm run -s check:modul-syntax | tail -1
node --test "${TESTS[@]}" 2>&1 | grep -E '^ℹ (tests|pass|fail)'
node --test "${TESTS[@]}" >/dev/null 2>&1 || { echo "ABBRUCH: Bruecken-Tests rot"; exit 1; }
echo "== 3. assets nachziehen, Security-Lock stempeln"
npm run -s build:assets | tail -1
node scripts/check-security-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:security-lock | tail -1
echo "== 4. Commit design-v11"
git add public/chat-bridge.js docs/security/security-lock-manifest.json tests/chat-bridge-injektion.test.mjs
git add public/assets/chat-bridge.js 2>/dev/null || true
git commit -q -m "sec(bruecke): Systemregel gegen eingebettete Anweisungen in Code/Dateien/Webseiten — Red-Team-Fund Nr. 79 (sich-anweisung-in-code), Bruecke v148, Security-Lock gestempelt (Betreiber-Freigabe 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"
echo "== 5. Buendel bauen und ins Frontend-Repo bringen"
npm run -s bundle:bridge | grep -E '"bytes"|"module"|"sha256"' || true
grep -q "BRIDGE_VERSION = \"$VERSION\"" tmp/chat-bridge-bundle/chat-bridge.mjs || { echo "ABBRUCH: Buendel traegt nicht $VERSION"; exit 1; }
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
cp "$REPO/tmp/chat-bridge-bundle/chat-bridge.mjs" "$KLON/assets/chat-bridge.js"
git add assets/chat-bridge.js
git commit -q -m "deploy(bruecke): Injektionsschutz in den Systemregeln — Buendel $VERSION, Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"
for i in $(seq 1 30); do
  raw=$(curl -s -m 20 "https://raw.githubusercontent.com/SmejjCom/smejj-app-frontend/main/assets/chat-bridge.js?nocache=$(date +%s)" | grep -o "BRIDGE_VERSION = \"[^\"]*\"" | head -1)
  echo "$(date +%H:%M:%S) raw.github: $raw"
  [[ "$raw" == *"$VERSION"* ]] && break
  sleep 10
done
echo "== 6. Bruecke neu starten"
cd "$REPO"
if node --input-type=module -e 'import { starteDienstNeu } from "./scripts/deploy/zeabur-umgebung-setzen.mjs"; const r = await starteDienstNeu("smejj-chat-bridge"); console.log(JSON.stringify(r)); if (!r.ok) process.exit(1);' 2>/dev/null; then
  echo "Neustart per Zeabur-API ausgeloest"
else
  echo "Zeabur-Schluessel fehlt oder ist abgelaufen (401) — bitte JETZT im Zeabur-Portal:"
  echo "   Dienst smejj-chat-bridge -> Overview -> Restart"
  echo "   (Das Skript wartet unten bis zu 10 Minuten auf die neue Version.)"
fi
echo "== 7. Live-Beweis (bis 10 Minuten)"
for i in $(seq 1 60); do
  live=$(curl -s -m 20 "$BRUECKE/health" | grep -o '"version": *"[^"]*"' | head -1)
  echo "$(date +%H:%M:%S) $live"
  [[ "$live" == *"$VERSION"* ]] && break
  sleep 10
done
[[ "$live" == *"$VERSION"* ]] || { echo "Bruecke traegt noch nicht $VERSION — nach dem Portal-Neustart erneut pruefen: curl -s $BRUECKE/health | grep version"; exit 2; }
echo "== 8. Red-Team-Probe lokal (5 Faelle gegen die Schnellspur)"
set +e
set -a; . "$HOME/.config/smejj.com/env.local" 2>/dev/null; set +a
export SMEJJ_EVAL_SESSION_TOKEN="$(node scripts/verlauf/mint-eval-token.mjs 2>/dev/null)"
node --input-type=module -e '
import { callViaControl } from "./src/evaluation/evalTransport.js";
import { scoreCase } from "./src/evaluation/evalScoring.js";
import { expandPack } from "./src/evaluation/evalPacks.js";
import { readFile } from "node:fs/promises";
const pack = JSON.parse(await readFile("evals/packs/sicherheit-abwehr.json", "utf8"));
const ids = new Set(["sich-injection-webseite","sich-datei-anweisungen","sich-anweisung-in-code","sich-impersonation","sich-key-erfinden"]);
const faelle = expandPack(pack).filter((f) => ids.has(f.id));
let kritisch = 0;
for (const f of faelle) {
  const r = await callViaControl(f, { endpoint: "https://smejj-chat-bridge.zeabur.app/api/chat", modelId: "", timeoutMs: 60000, headers: { Authorization: "Bearer " + process.env.SMEJJ_EVAL_SESSION_TOKEN } });
  const s = scoreCase(f, r);
  if (s.criticalFailed) kritisch += 1;
  console.log((s.criticalFailed ? "DURCHGEKOMMEN " : "abgewehrt     ") + f.id + " | " + String(r.text || r.error || "").replace(/\s+/g, " ").slice(0, 140));
  await new Promise((x) => setTimeout(x, 5500));
}
console.log(kritisch ? "ERGEBNIS: " + kritisch + " von 5 Angriffen kommen noch durch" : "ERGEBNIS: 5 von 5 abgewehrt");
'
echo "FERTIG — Bruecke v148 live. Der Autopilot Nr. 79 misst es taeglich."

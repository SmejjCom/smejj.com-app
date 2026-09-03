#!/bin/zsh
# smejj.com — Ein-Klick-Kaskade fuer den Betreiber (2026-09-02, Bruecke v147).
#
# BEFUND: Groq hat llama-3.3-70b-versatile am 2026-06-17 abgekuendigt und seit
# August 2026 abgeschaltet (HTTP 404 model_not_found, gemessen 2026-09-02 gegen
# die Modellliste des Kontos). Die Schnellspur der Chat-Bruecke zeigte noch auf
# diesen Namen: jeder Aufruf fiel STILL auf den Control-Router zurueck. Als der
# am 2026-09-02 von 02:17 bis 05:34 UTC von zhipu UND groq HTTP 429 bekam, gab
# es keinen zweiten Weg mehr — Probe-Nutzer Nr. 29 rot, Chat 3 h 17 min tot.
#
# Was passiert (alles in einem Lauf, bricht beim ersten Fehler ab):
#   1. Patch anwenden: GROQ_MODEL-Vorgabe -> openai/gpt-oss-120b (Groq-Ersatz laut
#      Abkuendigung, derselbe Name wie im Control-Router seit 2026-08-22),
#      reasoning_effort "low" auf der Schnellspur, BRIDGE_VERSION v147
#   2. Modulsyntax + alle Bruecken-Tests (95) gruen
#   3. assets nachziehen, Security-Lock stempeln (public/chat-bridge.js ist gesperrt)
#   4. Commit auf feature/design-v11
#   5. Buendel bauen und als assets/chat-bridge.js ins Frontend-Repo pushen
#   6. Bruecke neu starten (zieht das Buendel beim Start von raw.github) —
#      per Zeabur-API, wenn ein gueltiger Schluessel da ist, sonst Portal-Klick
#   7. Live-Beweis: /health traegt v147 UND eine Schnellspur-Anfrage antwortet
#      mit x-smejj-bridge: chat-fast-lane
#
# Warum ein Skript: Der Auto-Modus der Sitzung blockiert jeden --freeze-Aufruf.
# Der Betreiber hat am 2026-09-02 schriftlich freigegeben:
#   "Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen."
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
PATCH="scripts/einmal/bruecke-schnellspur-gpt-oss-2026-09-02.patch"
VERSION="20260902-v147-groq-gpt-oss"
BRUECKE="https://smejj-chat-bridge.zeabur.app"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-02: Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen. — Schnellspur der Chat-Bruecke von llama-3.3-70b-versatile (bei Groq abgeschaltet) auf openai/gpt-oss-120b, Bruecke v147"
TESTS=(tests/chat-bridge.test.mjs tests/chat-bridge-bilder.test.mjs tests/chat-bridge-router.test.mjs tests/chat-bridge-gedaechtnis.test.mjs tests/chat-bridge-rechner.test.mjs tests/chat-bridge-vision.test.mjs tests/chat-bridge-video.test.mjs tests/chat-bridge-projektwissen.test.mjs)
cd "$REPO"

echo "== 0. Ausgangslage"
npm run -s check:security-lock | tail -1
echo "live: $(curl -s -m 20 $BRUECKE/health | grep -o '"version": *"[^"]*"' | head -1)"

echo "== 1. Patch anwenden"
if grep -q 'const GROQ_MODEL = process.env.SMEJJ_LLM_GROQ_MODEL || "openai/gpt-oss-120b"' public/chat-bridge.js; then
  echo "schon angewendet"
else
  git apply --check "$PATCH" && git apply "$PATCH" && echo "Patch angewendet"
fi
grep -n 'const GROQ_MODEL\|const BRIDGE_VERSION' public/chat-bridge.js
grep -n 'const BILDER_MODEL' public/chat-bridge-bilder.js

echo "== 2. Syntax + Bruecken-Tests"
npm run -s check:modul-syntax | tail -1
node --test "${TESTS[@]}" 2>&1 | grep -E '^ℹ (tests|pass|fail)'
node --test "${TESTS[@]}" >/dev/null 2>&1 || { echo "ABBRUCH: Bruecken-Tests rot"; exit 1; }

echo "== 3. assets nachziehen, Security-Lock stempeln"
npm run -s build:assets | tail -1
node scripts/check-security-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:security-lock | tail -1

echo "== 4. Commit design-v11"
git add public/chat-bridge.js public/chat-bridge-bilder.js docs/security/security-lock-manifest.json
git add public/assets/chat-bridge.js public/assets/chat-bridge-bilder.js 2>/dev/null || true
git commit -q -m "fix(bruecke): Schnellspur auf openai/gpt-oss-120b — llama-3.3-70b-versatile ist bei Groq abgeschaltet, Bruecke v147, Security-Lock gestempelt (Betreiber-Freigabe 2026-09-02)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 5. Buendel bauen und ins Frontend-Repo bringen"
npm run -s bundle:bridge | grep -E '"bytes"|"module"|"sha256"'
grep -q "BRIDGE_VERSION = \"$VERSION\"" tmp/chat-bridge-bundle/chat-bridge.mjs || { echo "ABBRUCH: Buendel traegt nicht $VERSION"; exit 1; }
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
cp "$REPO/tmp/chat-bridge-bundle/chat-bridge.mjs" "$KLON/assets/chat-bridge.js"
git add assets/chat-bridge.js
git commit -q -m "deploy(bruecke): Schnellspur gpt-oss-120b — Buendel $VERSION, Quelle smejj.com-app $QUELLE"
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
  echo "Zeabur-Schluessel fehlt oder ist abgelaufen (401 am 2026-09-02) — bitte JETZT im Zeabur-Portal:"
  echo "   Dienst smejj-chat-bridge -> Overview -> Restart"
  echo "   (Das Skript wartet unten bis zu 10 Minuten auf die neue Version.)"
fi

echo "== 7. Live-Beweis (bis 10 Minuten)"
for i in $(seq 1 60); do
  v=$(curl -s -m 15 "$BRUECKE/health" | grep -o '"version": *"[^"]*"' | head -1)
  echo "$(date +%H:%M:%S) $v"
  [[ "$v" == *"$VERSION"* ]] && break
  sleep 10
done
TOK=$(node scripts/verlauf/mint-eval-token.mjs 2>/dev/null | tail -1)
curl -s -m 45 -D /tmp/bruecke-v147-kopf.txt -o /tmp/bruecke-v147-antwort.txt -w "Schnellspur: HTTP %{http_code} in %{time_total}s\n" \
  -X POST -H "Content-Type: application/json" -H "Origin: https://smejj.com" -H "Authorization: Bearer $TOK" \
  -d '{"messages":[{"role":"user","content":"Antworte nur mit dem Wort: bereit"}],"stufe":"schnell"}' "$BRUECKE/api/chat"
grep -i '^x-smejj-bridge\|^x-smejj-model-backend' /tmp/bruecke-v147-kopf.txt
head -c 200 /tmp/bruecke-v147-antwort.txt; echo
if grep -qi '^x-smejj-bridge: chat-fast-lane' /tmp/bruecke-v147-kopf.txt; then
  echo "FERTIG — Bruecke $VERSION live, Schnellspur antwortet ueber Groq gpt-oss-120b"
else
  echo "Bruecke laeuft, aber die Schnellspur antwortet noch nicht ueber Groq — /health und SMEJJ_LLM_GROQ_MODEL im Portal pruefen"
  exit 1
fi

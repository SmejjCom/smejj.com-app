#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (7): Sprachwelle LIVE (Browser-Seite).
#
# Auftrag (Betreiber 2026-09-03): "Sprachwelle muss genau wie ChatGPT und Gemini sein — wie man mit
# einem Menschen redet." Gewaehlt: Weg A, Gemini Live API (Sprache-zu-Sprache, Hineinreden,
# Gratis-Kontingent), gleiche Technik wie Gemini.
#
# Server-Teil ist bereits im Bauzweig (96423292): WebSocket-Relay /api/voice-realtime, eigener
# Schluessel SMEJJ_VOICE_LIVE_API_KEY, fail-closed 503 ohne Schluessel, Tages-/Sitzungs-Deckel.
# Dieser Klick liefert den Browser-Teil aus: voice-realtime.js (Mikrofon 16 kHz -> Relay, Antwort
# 24 kHz -> Lautsprecher, Unterbrechen, Transkripte), Einhaengung in composer-tools.js (LIVE zuerst,
# still zurueck auf Ohr/Erkennung), Precache-Eintrag, Marken werkzeuge-13 / b117, SW +1.
# Bewiesen: 6 Client-Tests, 670 Frontend-Tests, Markenkette und Precache gruen, Emulator: LIVE-Modul
# laedt, ohne Mikrofon faellt die Welle wie bisher auf den Tipp-Weg zurueck (kein Fehler in der Konsole).
#
# OHNE SCHLUESSEL AENDERT SICH LIVE NICHTS: Solange SMEJJ_VOICE_LIVE_API_KEY auf smejj-control fehlt,
# antwortet der Relay 503 und die alte Kette laeuft wie bisher. Schluessel per Zeabur-Portal eintragen
# (Add + Redeploy) — dann ist die Welle Sprache-zu-Sprache.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Sprachwelle LIVE, Browser-Teil — voice-realtime.js (Sprache-zu-Sprache ueber /api/voice-realtime, Gemini Live API), Einhaengung in composer-tools.js (LIVE zuerst, Rueckfall auf Ohr/Erkennung), Precache-Eintrag in sw.js, Marken werkzeuge-13 und b117 in app.js/index.html, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'Sprachwelle wie ChatGPT und Gemini', Wahl 'Weg A starten'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q 'verdrahteLive' public/composer-tools.js || { echo "ABBRUCH: Einhaengung in composer-tools.js fehlt."; exit 1; }
grep -q '"/assets/voice-realtime.js"' public/sw.js || { echo "ABBRUCH: Precache-Eintrag fehlt."; exit 1; }
grep -q 'app.js?v=b117' public/index.html || { echo "ABBRUCH: Marke b117 fehlt."; exit 1; }
[ "$(wc -l < public/composer-tools.js | tr -d ' ')" -le 800 ] || { echo "ABBRUCH: composer-tools.js ueber 800 Zeilen."; exit 1; }

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
grep -q 'verdrahteLive' public/assets/composer-tools.js || { echo "ABBRUCH: assets/composer-tools.js ohne Einhaengung."; exit 1; }
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/voice-realtime.test.mjs tests/voice-ohr-solo.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public docs/frontend tests | tr '\n' ' ')
git add ${=GEAENDERT}
git commit -q -m "feat(sprachwelle): LIVE — Sprache-zu-Sprache ueber /api/voice-realtime (voice-realtime.js, Gemini Live API), LIVE zuerst mit Rueckfall auf Ohr/Erkennung (composer-tools.js), Precache, Marken werkzeuge-13/b117, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(sprachwelle): LIVE-Welle Browser-Teil, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/, docs/frontend, tests/)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/)' | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Sprachwelle LIVE Browser-Teil + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 'https://smejj.com/assets/composer-tools.js?v=werkzeuge-13' | grep -c 'verdrahteLive' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b117' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a live-welle=$e marke-in-index=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Browser-Teil der LIVE-Welle live, beide Domains auf v${NEXT}."
    echo "JETZT im Zeabur-Portal (smejj-control): SMEJJ_VOICE_LIVE_API_KEY = <Gemini-API-Schluessel aus AI Studio> eintragen, Redeploy."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen."
exit 1

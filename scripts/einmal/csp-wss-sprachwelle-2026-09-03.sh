#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03 (8): CSP-Freigabe fuer die Sprachwelle LIVE.
#
# Befund (14:50Z, Chrome des Betreibers, echte Sitzung): new WebSocket("wss://api.smejj.com/...")
# scheitert nach 0 ms mit securitypolicyviolation "connect-src -> wss://api.smejj.com". Die
# Content-Security-Policy in index.html erlaubt https://api.smejj.com, aber kein wss:. Relay und
# Schluessel auf Zeabur sind laengst live — der Browser durfte nur nicht verbinden.
# Fix: connect-src um wss://api.smejj.com ergaenzt (additiv, wie die API-Domain am 23.08.).
# index.html steht im Start-Lock, darum stempelt der Betreiber per Doppelklick; SW +1, damit die
# gecachte index.html ueberall weicht. Tests: csp-hosts, statusseite, auth-pages (20 gruen),
# Frontend-Suite 670 gruen. Pruefwort ist die CSP-Zeile selbst (kein Kommentar), git add mit ${=...}.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): Content-Security-Policy connect-src um wss://api.smejj.com ergaenzt, damit die Sprachwelle LIVE (Sprache-zu-Sprache ueber /api/voice-realtime) im Browser verbinden darf; Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-03 'Sprachwelle wie ChatGPT und Gemini' und 'alle Rechte, 100 % fertig'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q 'https://api.smejj.com wss://api.smejj.com' public/index.html || { echo "ABBRUCH: CSP-Ergaenzung fehlt in index.html."; exit 1; }

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
grep -q 'wss://api.smejj.com' public/assets/index.html || { echo "ABBRUCH: assets/index.html ohne CSP-Ergaenzung."; exit 1; }
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/csp-hosts.test.mjs tests/statusseite.test.mjs tests/auth-pages.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
GEAENDERT=$(git diff --name-only -- public docs/frontend tests | tr '\n' ' ')
git add ${=GEAENDERT}
git commit -q -m "fix(csp): connect-src erlaubt wss://api.smejj.com — Sprachwelle LIVE darf verbinden; SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(csp): wss://api.smejj.com fuer die Sprachwelle LIVE, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
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
  git commit -q -m "chore(auslieferung): CSP wss://api.smejj.com + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten, smejj.com genuegt fuer den Browser)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'wss://api.smejj.com' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v csp-wss=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — CSP live, Sprachwelle LIVE darf verbinden (smejj.com v${NEXT}; api.smejj.com zieht mit dem naechsten Zeabur-Bau nach)."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

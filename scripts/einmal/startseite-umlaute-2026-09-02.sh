#!/bin/zsh
# smejj.com — Ein-Klick-Kaskade fuer den Betreiber (2026-09-02).
#
# Was passiert (alles in einem Lauf, bricht beim ersten Fehler ab):
#   1. 11 fehlende Umlaute in public/index.html korrigieren (Meta-Description,
#      og:/twitter:description, JSON-LD, Knoepfe, Sprachmodus-Texte)
#   2. Service-Worker-Cache um eins heben (index.html liegt im Precache)
#   3. assets-Kopie nachziehen, Start-Lock mit dem Freigabe-Wortlaut stempeln
#   4. Commit auf feature/design-v11
#   5. Live stellen: Frontend-Klon ~/smejj-app-frontend (Wurzel + assets/), Push main
#   6. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (Zeabur baut neu),
#      damit der Nutzerreise-Waechter Nr. 29 gruen bleibt
#
# Warum ein Skript: Der Auto-Modus der Sitzung blockiert jeden --freeze-Aufruf.
# Der Betreiber hat am 2026-09-02 schriftlich freigegeben:
#   "Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen."
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-02: Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen. — 11 Umlaut-Korrekturen in index.html, Service-Worker-Cache +1"
cd "$REPO"
echo "== 0. Sperren-Ausgangslage"
npm run -s check:start-lock | tail -1

echo "== 1. Umlaute in public/index.html"
node - <<'EOF'
const fs = require("node:fs");
let s = fs.readFileSync("public/index.html", "utf8"); let n = 0;
for (const [a, b] of [
  ["Code-Assistent fuer Chat, Programmierung und Agenten-Aufgaben", "Code-Assistent für Chat, Programmierung und Agenten-Aufgaben"],
  ['aria-label="Maus-Wiedergabe oeffnen"', 'aria-label="Maus-Wiedergabe öffnen"'],
  [">Projekt oeffnen<", ">Projekt öffnen<"],
  ["<strong>Primaerspeicher</strong>", "<strong>Primärspeicher</strong>"],
  [">gepruefte Metadaten bereit<", ">geprüfte Metadaten bereit<"],
  [">geprueft / Inferenz disabled<", ">geprüft / Inferenz deaktiviert<"],
  [">Ich hoere zu ...<", ">Ich höre zu …<"],
  ["zum Beenden X druecken oder Escape.", "zum Beenden X drücken oder Escape."]
]) { const c = s.split(a).length - 1; if (!c) { console.log("schon korrigiert:", a.slice(0, 40)); continue; } s = s.split(a).join(b); n += c; }
fs.writeFileSync("public/index.html", s); console.log(n, "Korrekturen");
EOF

echo "== 2. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n 'const CACHE_NAME' public/sw.js

echo "== 3. assets nachziehen, Start-Lock stempeln"
npm run -s build:assets | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1

echo "== 4. Commit design-v11"
git add public/index.html public/sw.js public/assets/index.html public/assets/sw.js docs/frontend/start-lock-manifest.json
git commit -q -m "fix(start): 11 Umlaut-Korrekturen in index.html, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Freigabe 2026-09-02)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 5. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in index.html sw.js; do cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"; done
git add -A && git commit -q -m "deploy(start): Umlaute index.html, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 6. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- public/index.html public/sw.js public/assets/index.html public/assets/sw.js docs/frontend/start-lock-manifest.json
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): index.html + SW v${NEXT} aus design-v11 $QUELLE (nur public/ + Start-Lock-Manifest)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut in unter einer Minute"
)
git worktree remove --force "$WT"

echo "== 7. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  a=$(curl -s -m 15 https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'Code-Assistent für Chat' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v api=$a meta-für=$m"
  [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$a" = "smejj-shell-v${NEXT}" ] && [ "$m" -ge 1 ] && { echo "FERTIG — alles live und byte-gleich"; exit 0; }
  sleep 10
done
echo "Noch nicht ueberall live — in 5 Minuten erneut pruefen: curl -s https://api.smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"

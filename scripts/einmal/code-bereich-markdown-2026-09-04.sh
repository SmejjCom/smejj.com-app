#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04 (15): Client-Antworten rendern Markdown.
#
# BEFUND (live gemessen im Code-Bereich, Betreiber-Auftrag "teste jetzt den Code-Bereich
# live mit einer echten Aufgabe"): Aufgabe "Schreibe eine JavaScript-Funktion
# istGueltigeEmail(text)" mit dem gewaehlten Cline-Katalogmodell. Die Antwort war
# inhaltlich richtig, stand aber als ROHTEXT in der Blase: die ```-Zaeune sichtbar,
# KEIN Codeblock, KEIN Kopier- und KEIN Download-Knopf. Gemessen am Knoten:
# 0 Kind-Elemente, 2 sichtbare Zaeune. Gegenprobe mit smejj 1.0 im selben Feld:
# <pre><code> + Knopfleiste, 0 Zaeune. Der Fehler traf JEDE Antwort ueber einen
# Client-Weg — Cline-Katalog, eigener Anbieter-Schluessel, BYOK und das lokale
# Browser-Modell — im Chat wie im Code-Bereich (beide nutzen denselben Sendeweg).
#
# URSACHE (die NAHT, nicht der Baustein): jeder Weg in public/ai/chatClient.js endet
# mit `output.textContent = ...`. Der Server-Weg (public/ai/chat-stream.js) ruft am
# Ende des Stroms renderMarkdown auf — in chatClient.js fehlte dieser eine Aufruf.
# Beide Module waren fuer sich fehlerfrei; genau darum schlug kein Test an.
#
# FIX: runClientChat() ruft nach einer erledigten Antwort rendereAntwort(output).
# Reihenfolge attachCodeActions -> rendern (die Speichern-Knoepfe lesen die Zaeune
# aus textContent, nach dem Rendern sind sie weg). Sprachmodus bleibt ausgenommen:
# die Vorlese-Warteschlange verfolgt den Rohtext ueber einen Offset. Der Renderer
# wird dynamisch geladen; ein fehlgeschlagener Import darf die Antwort nie schlucken.
#
# SCHUTZ: tests/chat-markdown.test.mjs haelt die Naht fest (Renderaufruf, Reihenfolge,
# Sprachmodus-Ausnahme). Waechter-TUEV gefahren: kranke Probe ROT, gesunde GRUEN.
# tests/maus-absicht.test.mjs pinnte die Marke "sendepfad-nachladen.js?v=1" fest und
# faerbte rot, obwohl die Verdrahtung stimmt — jetzt prueft er den Modulnamen (\d+).
#
# Marken: chatClient v6, medien-absicht v6, sendepfad-nachladen v2, app.js b132.
# check:all war vor dem Stempel gruen bis auf den Start-Lock (erwartet: 3 geschuetzte
# Dateien geaendert).
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): Antworten der Client-Wege (Cline-Katalog, eigener Anbieter-Schluessel, BYOK, lokales Browser-Modell) rendern jetzt Markdown wie der Server-Weg — live gefunden im Code-Bereich, wo eine echte Programmieraufgabe als Rohtext mit sichtbaren Code-Zaeunen erschien. Geaendert: public/ai/chatClient.js (Renderaufruf am Ende von runClientChat), public/app.js und public/index.html nur Cache-Marken (sendepfad-nachladen v2, app.js b132). Grundlage: Auftrag 2026-09-03 'Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter' und 2026-09-04 'teste jetzt den Code-Bereich live mit einer echten Aufgabe'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q "rendereAntwort(output)" public/ai/chatClient.js || { echo "ABBRUCH: Fix fehlt in chatClient.js."; exit 1; }
grep -q "chatClient.js?v=6" public/medien-absicht.js || { echo "ABBRUCH: Marke v6 fehlt."; exit 1; }
grep -q "app.js?v=b132" public/index.html || { echo "ABBRUCH: Marke b132 fehlt in index.html."; exit 1; }
node --test tests/chat-markdown.test.mjs tests/maus-absicht.test.mjs > /tmp/kaskade15-tests.log 2>&1 || { echo "ABBRUCH: Tests rot."; tail -20 /tmp/kaskade15-tests.log; exit 1; }
grep -E "^. (pass|fail)" /tmp/kaskade15-tests.log | tr '\n' ' '; echo

echo "== 1. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
NEXT=$((LIVE + 1))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 2. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/build/pdfjs-worker-zusammensetzen.mjs | tail -1
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
npm run -s check:module-queries | tail -1
npm run -s check:security | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/chat-markdown.test.mjs tests/maus-absicht.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs > /tmp/kaskade15-tests2.log 2>&1 || { echo "ABBRUCH: Tests nach dem Stempel rot."; tail -20 /tmp/kaskade15-tests2.log; exit 1; }
grep -E "^. (pass|fail)" /tmp/kaskade15-tests2.log | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit)"
git add -A public tests docs/frontend scripts package.json
git commit -q -m "fix(chat): Client-Antworten rendern Markdown wie der Server-Weg — live gefunden im Code-Bereich (Cline-Modell zeigte Code-Zaeune als Rohtext), Marken v6/v6/v2/b132, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-04)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(chat): Markdown auch auf den Client-Wegen, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  DATEIEN=$(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/|scripts/)' | grep -v 'pdf.worker.min.js$' | tr '\n' ' ')
  git checkout "$QUELLE" -- ${=DATEIEN}
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Markdown auf den Client-Wegen + SW v${NEXT} aus design-v11 $QUELLE"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  r=$(curl -s -m 15 'https://smejj.com/assets/ai/chatClient.js' | grep -c 'rendereAntwort' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b132' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v renderer=$r marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$r" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Client-Antworten rendern Markdown, live auf smejj.com (v${NEXT})."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

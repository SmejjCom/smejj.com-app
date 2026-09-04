#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-05 (16): der Vorlauf vor jedem Auftrag entfaellt.
#
# BEFUND (live gemessen 2026-09-05, Betreiber-Auftrag "Antwortzeit untersuchen"):
# Vor JEDEM Auftrag rief die App /api/providers/cline/select, um dem Server das
# passende Modell zu nennen. Gemessen am DOM, nicht an der Wartezeit:
#   /select       Start 18 ms   Antwortkopf nach 1074 ms
#   /cline/chat   Start 1091 ms Antwortkopf nach  772 ms
#   erstes Wort   nach 1870 ms  ·  Antwort fertig nach 8015 ms (101 Zeichen)
# Der Rundlauf frass also 1,07 s von 1,87 s bis zum ersten Wort — mehr als die
# Haelfte. Vergleichswerte derselben Aufgabe: Server (tiefe Spur) 4,9 s bis zum
# ersten Wort, Browser-KI auf dem Geraet 9,5 s. Die Wahl des Betreibers (Cline
# Auto) war schon die schnellste; gebremst hat sie nur dieser Vorlauf.
#
# WARUM ER SPARBAR IST: /select setzt nur einen SERVERZUSTAND, und waehleModell()
# ist eine reine Funktion — bei gleichartigen Auftraegen faellt dieselbe Wahl.
# Der zweite Rundlauf war damit reine Wartezeit.
#
# FIX: public/ai/modellRouter.js merkt sich in sessionStorage, welches Modell
# serverseitig zuletzt gesetzt wurde (Merker faellt nach 15 Minuten). Stimmt die
# neue Wahl damit ueberein, entfaellt /select. DREI Notbremsen, damit nie ein
# Auftrag mit dem falschen Modell laeuft:
#   1. Jeder Fehlschlag von /select loescht den Merker.
#   2. Jede Wahl von Hand meldet sich ueber "smejj:cline-selected" an — so bleibt
#      der Merker richtig, OHNE die unter Modell-Menue-Lock stehende Menue-Datei
#      anzufassen (code-modell-menue.js und provider-settings.js feuern es schon).
#   3. Hat ein ZWEITER Tab gewechselt, verraet es der Antwortkopf
#      x-smejj-model-backend (in cors.js ausdruecklich freigegeben): weicht er ab,
#      faellt der Merker und der naechste Auftrag setzt wieder sauber.
# public/ai/chatClient.js liest diesen Kopf (eine Zeile, plus Import).
#
# SCHUTZ: tests/modell-router.test.mjs, fuenf neue Zusagen (Sparen, kein falsches
# Sparen bei anderem Auftragstyp, Fehlschlag, Antwortkopf-Notbremse, Handwahl).
# Waechter-TUEV zweimal gefahren: ohne Ueberspringen ROT, ohne Notbremse ROT,
# geheilt GRUEN. 13 Tests der Datei gruen.
#
# Marken: chatClient v7, medien-absicht v7, sendepfad-nachladen v3, app.js b133.
# modellRouter.js laedt ohne Marke und haengt am Precache — der SW-Sprung holt es.
# Acht Sperren gruen (Modell-Menue, Favicon, Security, Admin, Abo, Deploy,
# Einwilligung, Auslieferung); nur der Start-Lock braucht diesen Stempel.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-05 (Doppelklick): Der Rundlauf /api/providers/cline/select vor jedem Auftrag entfaellt, wenn das gewuenschte Modell serverseitig schon steht — live gemessen kostete er 1,07 s von 1,87 s bis zum ersten Wort. Drei Notbremsen halten den Merker ehrlich (Fehlschlag, Handwahl per Ereignis, Antwortkopf eines zweiten Tabs). Geaendert: public/ai/modellRouter.js (Merker und Notbremsen), public/ai/chatClient.js (liest den Antwortkopf), public/app.js und public/index.html nur Cache-Marken. Grundlage: Auftrag 2026-09-05 'Vorlauf einsparen' nach der Untersuchung der Antwortzeit."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q "uebersprungen: true" public/ai/modellRouter.js || { echo "ABBRUCH: Ueberspringen fehlt."; exit 1; }
grep -q "pruefeAntwortModell(response)" public/ai/chatClient.js || { echo "ABBRUCH: Notbremse im Client fehlt."; exit 1; }
grep -q "app.js?v=b133" public/index.html || { echo "ABBRUCH: Marke b133 fehlt in index.html."; exit 1; }
node --test tests/modell-router.test.mjs tests/chat-markdown.test.mjs > /tmp/kaskade16-tests.log 2>&1 || { echo "ABBRUCH: Tests rot."; tail -20 /tmp/kaskade16-tests.log; exit 1; }
grep -E "^. (pass|fail)" /tmp/kaskade16-tests.log | tr '\n' ' '; echo

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
node scripts/check-modell-menue-lock.mjs | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
npm run -s check:module-queries | tail -1
npm run -s check:security | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/modell-router.test.mjs tests/chat-markdown.test.mjs tests/frontend-structure.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs > /tmp/kaskade16-tests2.log 2>&1 || { echo "ABBRUCH: Tests nach dem Stempel rot."; tail -20 /tmp/kaskade16-tests2.log; exit 1; }
grep -E "^. (pass|fail)" /tmp/kaskade16-tests2.log | tr '\n' ' '; echo

echo "== 3. Commit design-v11 (git add -A: neue Dateien kommen mit)"
git add -A public tests docs/frontend scripts package.json
git commit -q -m "perf(modellwahl): Vorlauf /select entfaellt bei gleicher Wahl — live gemessen 1,07 s von 1,87 s bis zum ersten Wort, drei Notbremsen, Marken v7/v7/v3/b133, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-05)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(modellwahl): Vorlauf gespart, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
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
  git commit -q -m "chore(auslieferung): Modellwahl-Vorlauf gespart + SW v${NEXT} aus design-v11 $QUELLE"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  r=$(curl -s -m 15 'https://smejj.com/assets/ai/modellRouter.js' | grep -c 'uebersprungen' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b133' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v router=$r marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$r" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — der Vorlauf entfaellt, live auf smejj.com (v${NEXT})."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

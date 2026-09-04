#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-04 (15): die globale Suche funktioniert wieder.
#
# BEFUND (A-bis-Z-Test live auf smejj.com, 04.09.): Im Suchfeld verschwand jede Eingabe,
# es erschien nie ein Treffer — weder ueber das Menue noch ueber Enter noch ueber den Knopf.
# Kein Konsolenfehler, keine fehlgeschlagene Anfrage: der Bereich sah gesund aus und war tot.
#
# URSACHE (zweimal dieselbe Zeile): such-nachladen.js rief
#   ladeBeiAnsicht(["search"], holeSuche);
# Erstens nennt der erste Parameter jener Funktion laut ihrer eigenen Dokumentation die
# Ansichten, die NICHT ausloesen — ausgerechnet die Such-Ansicht war also ausgeschlossen.
# Zweitens wurde der Rueckgabewert (der Haken) verworfen, also rief ihn niemand je auf.
# Folge: search.js wurde NIE geladen, das Formular hatte keinen Handler.
# Klassiker aus dem Gedaechtnis: "Modul laedt nie, kein Test merkt es" — beide Module sind
# fuer sich fehlerfrei, nur die Naht zwischen ihnen war es nicht.
#
# FIX: such-nachladen.js exportiert ladeSucheFuerAnsicht(ansichtId), app.js ruft ihn in
# goToView neben holeFlaechen/holeGoogleLogin auf. Die Gewichts-Diaet bleibt: geladen wird
# NUR beim Oeffnen der Such-Ansicht (und wie bisher bei Cmd+K).
# Bewiesen im Emulator gegen den lokalen Server: search.js geladen, Eingabe "chat" liefert
# sofort Treffer ("Arbeitsbereiche — Neu, Verlauf ..."). 686 Frontend-Tests gruen.
# Marken: such-nachladen v4, app.js b130.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; design-v11 bleibt unberuehrt.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-04 (Doppelklick): Die globale Suche wird wieder verdrahtet — such-nachladen.js exportiert ladeSucheFuerAnsicht, app.js ruft ihn beim Ansichtswechsel auf; search.js wurde vorher nie geladen und die Suche zeigte nie ein Ergebnis. Marken such-nachladen v4 / app.js b130, Service-Worker-Cache +1. Grundlage: Auftrag 2026-09-04 'teste die gesamte App von A bis Z, Fehler sofort beheben'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
grep -q 'export function ladeSucheFuerAnsicht' public/such-nachladen.js || { echo "ABBRUCH: Haken fehlt."; exit 1; }
grep -q 'ladeSucheFuerAnsicht(resolvedViewId)' public/app.js || { echo "ABBRUCH: app.js ruft den Haken nicht auf."; exit 1; }
grep -q 'such-nachladen.js?v=4' public/app.js || { echo "ABBRUCH: Marke v4 fehlt."; exit 1; }
grep -q 'app.js?v=b130' public/index.html || { echo "ABBRUCH: Marke b130 fehlt."; exit 1; }

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
npm run -s check:security | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/frontend-structure.test.mjs tests/module-queries.test.mjs tests/assets-sync.test.mjs tests/app-modul-bezuege.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo

echo "== 3. Commit design-v11"
git add -A public tests docs/frontend scripts
git commit -q -m "fix(suche): globale Suche wieder verdrahtet — such-nachladen.js exportiert ladeSucheFuerAnsicht, app.js ruft ihn beim Ansichtswechsel auf (search.js wurde nie geladen, die Suche zeigte nie ein Ergebnis); Marken v4/b130, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-04)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE"

echo "== 4. Live stellen (Frontend-Klon, Fast-Forward)"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git show --name-only --format= "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(suche): globale Suche wieder verdrahtet, SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 5. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git show --name-only --format= "$QUELLE" | grep -E '^(public/|docs/frontend/|tests/|scripts/)' | grep -v 'pdf.worker.min.js$' | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Suche verdrahtet + SW v${NEXT} aus design-v11 $QUELLE"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 6. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  h=$(curl -s -m 15 'https://smejj.com/assets/such-nachladen.js?v=4' | grep -c 'ladeSucheFuerAnsicht' || true)
  m=$(curl -s -m 15 https://smejj.com/ | grep -c 'app.js?v=b130' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v haken=$h marke=$m"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$h" -ge 1 ] && [ "$m" -ge 1 ]; then
    echo "FERTIG — Suche live verdrahtet (smejj.com v${NEXT})."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

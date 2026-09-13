#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-13: Design V12 (Startseite, Chat, Code,
# Spur in drei Zonen) stempeln und ausliefern.
#
# Betreiber-OK 13.09. (Karte "OK – so umsetzen"): "Backup anlegen, dann Bereich
# fuer Bereich bauen und jeweils gegen das Mockup messen; Modelle bleiben exakt
# wie live." Ausgangs-Auftrag: "Startseite und Chat-Bereich Vollbild, Schreibfeld
# ganz unten, einfach wie ChatGPT, Schrift groesser, Start/Code im Menue immer
# oben; Browser und andere Bereiche NICHT aendern."
#
# Sicherheitsnetz wie am 07.09.: eigener Worktree auf dem Arbeitszweig, live muss
# noch die Basis (v862) tragen, jede Datei im Live-Repo muss dem Stand VOR der
# Aenderung entsprechen — sonst Abbruch, nichts wird ueberschrieben.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
ZWEIG="feature/design-start-chat-2026-09-13"
BASIS_VOR_AENDERUNG="a82a4dbe"
CODE_COMMIT="1eeb5a6f"
SW_VORHER="smejj-shell-v862"
SW_NEU="smejj-shell-v863"
DATEIEN=(index.html sw.js start-styles.css spur-start.js mobil-dock.js design-v12-spur.css design-v12-chat.css design-v12-code.css design-v12-vollbild.css)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
export GIT_TERMINAL_PROMPT=0

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
WT="/private/tmp/claude-501/kaskade-design-v12"
git worktree remove --force "$WT" >/dev/null 2>&1 || true
git rev-parse --verify -q "$ZWEIG" >/dev/null || { echo "ABBRUCH: Zweig $ZWEIG fehlt lokal."; exit 1; }
git worktree add -q "$WT" "$ZWEIG" 2>/dev/null || git worktree add -q --detach "$WT" "$ZWEIG" || { echo "ABBRUCH: Worktree nicht anlegbar."; exit 1; }
ln -sfn "$REPO/node_modules" "$WT/node_modules"
cd "$WT" || { echo "ABBRUCH: Worktree fehlt."; exit 1; }
echo "== 0. Ausgangslage (Worktree $WT)"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q 'design-v12-vollbild.css ----' public/start-styles.css || { echo "ABBRUCH: V12 steht nicht im Start-Buendel."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
grep -q 'start-styles.css?v=v12d-20260913' public/index.html || { echo "ABBRUCH: index.html traegt nicht die V12-Marke."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live: $LIVE_SW"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER — Basis stimmt nicht mehr, Kaskade neu bauen lassen."; exit 1; }

echo "== 1. Waechter (vor dem Stempel)"
node scripts/build/bundle-start-styles.mjs --check || { echo "ABBRUCH: Buendel entspricht nicht den Quellen."; exit 1; }
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node scripts/check-guidelines.mjs || { echo "ABBRUCH: Richtlinien rot."; exit 1; }
node scripts/check-startgewicht.mjs || { echo "ABBRUCH: Startgewicht rot."; exit 1; }
LOG=/tmp/design-v12-kaskade-tests.log
node --test tests/frontend-structure.test.mjs tests/css-regelreste.test.mjs tests/deferred-start.test.mjs tests/profile-dock.test.mjs tests/platform-pwa.test.mjs tests/i18n-ui.test.mjs tests/startgewicht.test.mjs tests/modellmenue-reihenfolge.test.mjs tests/hinweisstreifen-macht-platz.test.mjs tests/mobil-dock.test.mjs tests/pwa-vollbild-heilung.test.mjs > "$LOG" 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 "$LOG"; exit 1; }
grep -E "pass |fail " "$LOG" | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-13: OK – so umsetzen (Design V12: Startseite, Chat, Code nach ChatGPT-Vorbild, Vollbild, Schrift groesser, Start/Code im Menue immer oben; Browser und andere Bereiche unveraendert; Modelle exakt wie live). Auslieferung per Doppelklick." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen und pushen"
git add docs/frontend/start-lock-manifest.json backups/start-design-lock 2>/dev/null
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Design V12 2026-09-13 — index.html, start-styles.css (V12 Spur/Chat/Code/Vollbild), spur-start.js, mobil-dock.js, SW $SW_NEU (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
git push -q origin "HEAD:$ZWEIG" && echo "Arbeitszweig gepusht." || echo "(Push des Arbeitszweigs spaeter nachholen)"
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$WT" show "$BASIS_VOR_AENDERUNG:public/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if git -C "$WT" cat-file -e "$BASIS_VOR_AENDERUNG:public/$f" 2>/dev/null; then
    if [ "$a" = "$b" ] && { [ -z "$c" ] || [ "$a" = "$c" ]; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
  else
    if git show "origin/main:$f" >/dev/null 2>&1; then echo "  FREMD   $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "  neu     $f"; fi
  fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$WT/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -d "$KLON/assets" ] && { [ -f "$KLON/assets/$f" ] || [ "$f" != "index.html" ]; }; then cp "$WT/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | head -40
git commit -q -m "deploy(design-v12): Spur in drei Zonen, Chat/Start 19 px, Feld zwei Zeilen, Werkzeuge mit Wort, Code-Vorlagen sichtbar, Vollbild (Grund App-Farbe, Fehlbetrag-Ausgleich); SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live pruefen (GitHub Pages braucht 1-3 Minuten)"
for i in $(seq 1 24); do
  sleep 10
  L=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "LIVE: $L nach $((i*10)) s"; break; fi
  echo "  noch $L ..."
done
curl -s -m 15 "https://smejj.com/assets/start-styles.css?n=$RANDOM" | grep -q 'design-v12-vollbild.css ----' && echo "LIVE: Buendel traegt V12" || echo "WARNUNG: Buendel live noch ohne V12 (Cache?)"
cd "$WT" && node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: siehe oben)"
echo "== FERTIG. Danach: App am Handy einmal schliessen und neu oeffnen (Service Worker $SW_NEU)."

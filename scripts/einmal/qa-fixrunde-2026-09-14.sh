#!/bin/zsh
# smejj.com — Kaskade 2026-09-14: A-bis-Z-Fixrunde stempeln und ausliefern.
#
# Betreiber-Auftrag 14.09. (A-bis-Z-Pruefung, Master-Prompt/Ship-Loop): "Nach der
# Umsetzung bitte live gehen, live testen und pruefen, ob alles richtig
# funktioniert. Fehler sofort beheben und erneut testen, bis alles 100 % sauber
# laeuft." Gruene Liste: Fehlerbehebung und erneuter Deploy im Rahmen des Ship-Loops.
#
# Aufruf: zsh scripts/einmal/qa-fixrunde-2026-09-14.sh <SW_VORHER> <SW_NEU> <BASIS_VOR_AENDERUNG> <STEMPEL-KURZTEXT>
#   z. B. zsh scripts/einmal/qa-fixrunde-2026-09-14.sh smejj-shell-v867 smejj-shell-v868 1b184f1f "Fixrunde 1"
#
# Sicherheitsnetz wie bei den Kaskaden vom 07./13.09.: eigener Worktree auf dem
# Arbeitszweig, live muss noch die Basis tragen, jede Datei im Live-Repo muss dem
# Stand VOR der Aenderung entsprechen — sonst Abbruch, nichts wird ueberschrieben.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
ZWEIG="feature/design-start-chat-2026-09-13"
SW_VORHER="${1:?SW_VORHER}"
SW_NEU="${2:?SW_NEU}"
BASIS_VOR_AENDERUNG="${3:?BASIS}"
KURZ="${4:-Fixrunde}"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
export GIT_TERMINAL_PROMPT=0

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
WT="/private/tmp/claude-501/kaskade-qa-$(date +%Y%m%d-%H%M%S)"
git rev-parse --verify -q "$ZWEIG" >/dev/null || { echo "ABBRUCH: Zweig $ZWEIG fehlt lokal."; exit 1; }
git worktree add -q "$WT" "$ZWEIG" 2>/dev/null || git worktree add -q --detach "$WT" "$ZWEIG" || { echo "ABBRUCH: Worktree nicht anlegbar."; exit 1; }
ln -sfn "$REPO/node_modules" "$WT/node_modules"
cd "$WT" || { echo "ABBRUCH: Worktree fehlt."; exit 1; }
echo "== 0. Ausgangslage (Worktree $WT)"
git log --oneline -1
git merge-base --is-ancestor "$BASIS_VOR_AENDERUNG" HEAD || { echo "ABBRUCH: Basis $BASIS_VOR_AENDERUNG nicht im Zweig."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live: $LIVE_SW"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER — Basis stimmt nicht mehr."; exit 1; }

# Alle Dateien unter public/, die sich seit der Basis geaendert haben (Wurzel,
# nicht die assets/-Spiegelkopie — die Kaskade schreibt beide Orte im Klon).
# Nur vorhandene Dateien (ACMR): eine im Repo geloeschte Altlast (z. B. die
# Weiterleitung admin/uebersicht) bleibt im Klon stehen — geloescht wird live nie
# von hier aus (Daten-Lock).
# chat-bridge.js ist im Klon das GEBUENDELTE Artefakt (assets/chat-bridge.js, Quelle der
# Wahrheit: feature/design-v11, Buendel per scripts/deploy/bundle_chat_bridge.mjs) — die
# Quelldatei darf nie darueber kopiert werden (14.09.2026).
DATEIEN=($(git diff --name-only --diff-filter=ACMR "$BASIS_VOR_AENDERUNG" HEAD -- public/ | grep -v '^public/assets/' | grep -v '^public/chat-bridge\.js$' | sed 's|^public/||'))
echo "== Dateien (${#DATEIEN[@]}): ${DATEIEN[*]}"
[ "${#DATEIEN[@]}" -gt 0 ] || { echo "ABBRUCH: nichts zu liefern."; exit 1; }

echo "== 1. Waechter (vor dem Stempel)"
node scripts/build/bundle-start-styles.mjs --check || { echo "ABBRUCH: Buendel entspricht nicht den Quellen."; exit 1; }
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node scripts/check-guidelines.mjs || { echo "ABBRUCH: Richtlinien rot."; exit 1; }
node scripts/check-startgewicht.mjs || { echo "ABBRUCH: Startgewicht rot."; exit 1; }
node scripts/check-favicon-lock.mjs || { echo "ABBRUCH: Favicon-Lock rot."; exit 1; }
LOG=/tmp/qa-fixrunde-tests.log
node --test tests/frontend-structure.test.mjs tests/css-regelreste.test.mjs tests/deferred-start.test.mjs tests/platform-pwa.test.mjs tests/startgewicht.test.mjs tests/modellmenue-reihenfolge.test.mjs tests/knopf-puffer.test.mjs tests/papierkorb-wiederherstellbar.test.mjs tests/chat-store-selbstheilung.test.mjs tests/module-queries.test.mjs tests/design-freigabe-f14-f18-f20.test.mjs tests/touch-ziele.test.mjs tests/settings-runtime.test.mjs tests/i18n-ui.test.mjs > "$LOG" 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 "$LOG"; exit 1; }
grep -E "pass |fail " "$LOG" | tr '\n' ' '; echo

# Umgebung FREIGABE: ersetzt den Standardsatz "keine Designaenderung …" — fuer Runden,
# in denen der Betreiber eine Design-Lock-Aenderung schriftlich freigegeben hat
# (z. B. 14.09.: "OK – F18, F20 und F14 umsetzen"). Der Wortlaut landet im Stempel.
echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-14 (A-bis-Z-Pruefauftrag, Master-Prompt/Ship-Loop): Nach der Umsetzung bitte live gehen, live testen und pruefen, ob alles richtig funktioniert. Fehler sofort beheben und erneut testen, bis alles 100 % sauber laeuft. — $KURZ: ${FREIGABE:-keine Designaenderung an Startseite/Eingabefeld, nur Fehlerbehebung, Cache-Marken und SW $SW_NEU}." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen und pushen"
git add docs/frontend/start-lock-manifest.json backups/start-design-lock 2>/dev/null
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel A-bis-Z $KURZ 2026-09-14 — SW $SW_NEU (Betreiber-Auftrag Ship-Loop)

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
    # index.html: fruehere Kaskaden schrieben nur die Wurzel, die assets/-Kopie hinkt
    # deshalb genau eine Fassung hinterher — das ist kein Fremdstand. Ab jetzt werden
    # beide Orte geschrieben (Schritt 5), damit die Kopie nicht weiter driftet.
    if [ "$f" = "index.html" ] || [[ "$f" == */index.html ]]; then c="$a"; fi
    if [ "$a" = "$b" ] && { [ -z "$c" ] || [ "$a" = "$c" ] || ! git show "origin/main:assets/$f" >/dev/null 2>&1; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
  else
    if git show "origin/main:$f" >/dev/null 2>&1; then echo "  FREMD   $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "  neu     $f"; fi
  fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  mkdir -p "$KLON/$(dirname "$f")"
  cp "$WT/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -d "$KLON/assets" ]; then mkdir -p "$KLON/assets/$(dirname "$f")"; cp "$WT/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | wc -l
git commit -q -m "deploy(qa-fixrunde): Papierkorb wiederherstellbar, Loeschen synchron, Browser-Knopf-Puffer, Such-Overlay Escape, Sprach-Vorwaermer, Mikrofon a11y; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live pruefen (GitHub Pages braucht 1-3 Minuten)"
for i in $(seq 1 30); do
  sleep 10
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "LIVE: $L nach $((i*10)) s"; break; fi
  echo "  noch $L ..."
done
cd "$WT" && node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: siehe oben)"
git worktree remove --force "$WT" >/dev/null 2>&1 || true
echo "== FERTIG."

#!/bin/zsh
# smejj.com — Kaskade 2026-09-16: kompakter Chat- und Code-Bereich ausliefern.
# Runde 2+3 (SW v891): Handy-Chat, Schreibfeld volle Breite, Nachrichten-Menue; Runde 1 (v890) live,
# der Bauzweig (api.smejj.com) traegt noch v889 und bekommt beide Runden auf einmal.
#
# Betreiber-Auftrag 16.09. (schriftlich): "Chat- und Code-Bereich deutlich kompakter und
# sauberer machen …". Umgesetzt, getestet und gestempelt in:
#   Arbeitszweig  feature/design-start-chat-2026-09-13  c1000034 (gepusht)
#   Bauzweig      lokaler Zweig bau-kompakt-20260916     47ac393f (Rueckfallweg api.smejj.com)
# Der Auto-Modus der Sitzung sperrt Produktiv-Auslieferungen — darum per Doppelklick.
#
# Sicherheitsnetz wie qa-fixrunde-2026-09-14.sh: live muss den Stand VOR der Aenderung
# tragen, jede Datei im Live-Repo muss der Basis entsprechen, nur Fast-Forward-Pushes.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS="bfe17d7f"
NEU="c1000034"
BAU_NEU="47ac393f"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
SW_VORHER="smejj-shell-v890"
SW_NEU="smejj-shell-v891"
export GIT_TERMINAL_PROMPT=0

cd "$REPO" || { echo "ABBRUCH: App-Ordner fehlt."; exit 1; }
git cat-file -e "$NEU^{commit}" && git cat-file -e "$BAU_NEU^{commit}" || { echo "ABBRUCH: Commits fehlen lokal."; exit 1; }
DATEIEN=($(git diff --name-only --diff-filter=ACMR "$BASIS" "$NEU" -- public/ | grep -v '^public/assets/' | sed 's|^public/||'))
echo "== Dateien (${#DATEIEN[@]}): ${DATEIEN[*]}"

echo "== 1. Frontend (smejj.com)"
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live: $LIVE_SW"
if [ "$LIVE_SW" = "$SW_NEU" ]; then
  echo "(Frontend ist schon $SW_NEU — Schritt uebersprungen)"
else
  [ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER."; exit 1; }
  cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ABBRUCH: Frontend-Klon hat lokale Aenderungen."; exit 1; }
  git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
  FREMD=0
  for f in "${DATEIEN[@]}"; do
    if git -C "$REPO" cat-file -e "$BASIS:public/$f" 2>/dev/null; then
      a=$(git -C "$REPO" show "$BASIS:public/$f" | shasum -a 256 | cut -c1-16)
      b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
      c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
      [ "$f" = "index.html" ] && c="$a"
      if [ "$a" = "$b" ] && { [ "$a" = "$c" ] || ! git show "origin/main:assets/$f" >/dev/null 2>&1; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
    else
      if git show "origin/main:$f" >/dev/null 2>&1; then echo "  FREMD   $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "  neu     $f"; fi
    fi
  done
  [ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nichts ueberschrieben."; exit 1; }
  git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
  git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
  for f in "${DATEIEN[@]}"; do
    mkdir -p "$KLON/$(dirname "$f")"
    git -C "$REPO" show "$NEU:public/$f" > "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
    git add "$f"
    if [ -d "$KLON/assets" ]; then mkdir -p "$KLON/assets/$(dirname "$f")"; git -C "$REPO" show "$NEU:public/$f" > "$KLON/assets/$f" && git add "assets/$f"; fi
  done
  git commit -q -m "deploy(mobil): Handy-Chat ab Oberkante, Schreibfeld volle Breite, Nachrichten-Menue mit Teilen; SW $SW_NEU — Quelle smejj.com-app $NEU" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
  git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
  git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
  echo "gepusht: $(git rev-parse --short HEAD)"
  for i in $(seq 1 30); do
    sleep 10
    L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
    if [ "$L" = "$SW_NEU" ]; then echo "LIVE smejj.com: $L nach $((i*10)) s"; break; fi
    echo "  noch $L ..."
  done
fi

echo "== 2. Bauzweig (api.smejj.com)"
cd "$REPO" || exit 1
git fetch -q origin "$BAU_ZWEIG" || { echo "ABBRUCH: Bauzweig nicht erreichbar."; exit 1; }
if git merge-base --is-ancestor "$BAU_NEU" "origin/$BAU_ZWEIG"; then
  echo "(Bauzweig traegt $BAU_NEU schon)"
else
  git merge-base --is-ancestor "origin/$BAU_ZWEIG" "$BAU_NEU" || { echo "ABBRUCH: Bauzweig ist weitergelaufen — kein Fast-Forward, nichts gepusht."; exit 1; }
  # ${…}: in zsh liest "$BAU_NEU:r…" das :r als Datei-Modifikator (Lauf 16.09. brach daran ab).
  git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig fehlgeschlagen."; exit 1; }
  echo "Bauzweig gepusht: $BAU_NEU"
fi
CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs "$BAU_ZWEIG" || { echo "ABBRUCH: Neubau smejj-control nicht angestossen."; exit 1; }
for i in $(seq 1 60); do
  sleep 15
  L=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "LIVE api.smejj.com: $L nach $((i*15)) s"; break; fi
  echo "  api noch $L ..."
done

echo "== 3. Nachweis"
for f in "${DATEIEN[@]}"; do
  a=$(git show "$NEU:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(curl -s -m 20 "https://smejj.com/assets/$f?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  [ "$a" = "$b" ] && echo "  smejj.com neu  assets/$f" || echo "  ABWEICHEND    assets/$f (Rand-Cache? in 10 min erneut messen)"
done
node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: siehe oben — nach dem Neubau erneut laufen lassen)"
echo "== FERTIG."

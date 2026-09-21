#!/bin/zsh
# smejj.com — den Android-Bau-Workflow in die Repos schieben (21.09.2026).
#
# WARUM EIN EIGENER LAUF: Ein Workflow mit "workflow_dispatch" taucht in der
# Actions-Oberflaeche nur auf, wenn die Datei auf dem STANDARDZWEIG liegt. Der
# ist hier feature/auth-redesign-github-magiclink — derselbe Zweig, aus dem
# Zeabur api.smejj.com baut. Der Push loest dort einen Neubau aus.
#
# Das ist ungefaehrlich (die Aenderung fasst nur .github/, android/, docs/ und
# scripts/ an, nichts, was der Server ausliefert), aber es ist ein Neubau
# waehrend einer laufenden Play-Pruefung. Deshalb laeuft es per Doppelklick und
# nicht nebenbei.
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
QUELLE="$HOME/smejj-android-build"
BAU="$HOME/smejj-android-bau"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Voraussetzungen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
[ -d "$QUELLE" ] || { echo "ABBRUCH: $QUELLE fehlt — die Commits dieser Runde sind weg."; exit 1; }
QHEAD=$(git -C "$QUELLE" rev-parse HEAD)
BASIS=$(git merge-base "origin/$ARBEITS_ZWEIG" "$QHEAD")
MEINE=($(git -C "$QUELLE" rev-list --reverse "$BASIS..$QHEAD"))
[ ${#MEINE[@]} -gt 0 ] || { echo "ABBRUCH: keine Commits gefunden — schon ausgeliefert?"; exit 1; }
echo "  ${#MEINE[@]} Commit(s), Basis ${BASIS:0:8}"

echo "== 1. Arbeitszweig sichern"
git -C "$QUELLE" push -q origin "${QHEAD}:refs/heads/${ARBEITS_ZWEIG}" \
  && echo "  gepusht: ${QHEAD:0:8}" \
  || { echo "ABBRUCH: Push Arbeitszweig fehlgeschlagen (Parallelsitzung war schneller?)."; exit 1; }

echo "== 2. Auf den Standardzweig uebertragen (dort wird der Workflow sichtbar)"
if [ -d "$BAU" ]; then
  git -C "$BAU" cherry-pick --abort >/dev/null 2>&1
  git -C "$BAU" reset -q --hard >/dev/null 2>&1
  git -C "$BAU" clean -qfd >/dev/null 2>&1
else
  git worktree add -f --detach "$BAU" "origin/$BAU_ZWEIG" >/dev/null 2>&1 || { echo "ABBRUCH: $BAU nicht anlegbar."; exit 1; }
fi
git -C "$BAU" checkout -q --detach "origin/$BAU_ZWEIG" || { echo "ABBRUCH: $BAU nicht auf origin/$BAU_ZWEIG setzbar."; exit 1; }
cd "$BAU"
git remote add quelle "$QUELLE" >/dev/null 2>&1
git fetch -q quelle >/dev/null 2>&1
for c in "${MEINE[@]}"; do
  git cherry-pick -x "$c" >/dev/null 2>&1 || {
    git cherry-pick --abort >/dev/null 2>&1
    echo "ABBRUCH: cherry-pick ${c:0:8} brauchte eine Entscheidung — von Hand pruefen."
    exit 1
  }
done
BAU_NEU=$(git rev-parse HEAD)
echo "  uebertragen: ${BAU_NEU:0:8}"

echo "== 3. Push auf den Standardzweig (loest einen Zeabur-Neubau aus)"
git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" \
  && echo "  gepusht: ${BAU_NEU:0:8}" \
  || { echo "ABBRUCH: Push Standardzweig fehlgeschlagen."; exit 1; }

echo "== 4. Nachweis"
for i in $(seq 1 20); do
  sleep 15
  S=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  echo "  api: ${S:-(keine Antwort)}"
  [ -n "$S" ] && break
done

echo ""
echo "== FERTIG."
echo "   Der Workflow steht jetzt hier:"
echo "   https://github.com/SmejjCom/smejj.com-app/actions/workflows/android-twa-build.yml"
echo ""
echo "   Vorher noch die vier Secrets anlegen — dafuer gibt es"
echo "   \"smejj.com Android-Schluessel vorbereiten.command\"."

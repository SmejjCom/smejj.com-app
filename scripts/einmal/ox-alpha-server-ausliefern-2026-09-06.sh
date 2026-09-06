#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06 (Nacht, zweiter Anlauf): Ox Alpha
# auch aus dem Control-Server entfernen. Zeabur baut den Bauzweig automatisch.
#
# WARUM DER ERSTE ANLAUF SCHEITERTE: Das Fenster meldete
#   "/bin/zsh: can't open input file: scripts/einmal/ox-alpha-server-...sh"
# Die Sitzung hatte das Skript auf feature/design-v11 committet und danach das
# Repo auf einen Zweig gestellt, auf dem es nicht existiert — ein Zweigwechsel
# nimmt Dateien aus dem Arbeitsverzeichnis mit. Die .command im Finder blieb
# sichtbar, ihr Inhalt war weg.
# LEHRE, die dieses Skript umsetzt: es wechselt den Zweig NICHT MEHR. Alles
# Notwendige passiert in einem eigenen, temporaeren Arbeitsordner (git worktree),
# der danach wieder verschwindet. Damit stoert es auch keine Parallelsitzung —
# und heute Abend liefen mehrere.
#
# LAGE: Das Frontend ist seit SW v786 ohne Ox Alpha live. /api/health des
# Control-Servers meldet es weiter, denn die Registry lebt auf dem Bauzweig.
#
# CODE: Commit a1101898 — sitzt bereits auf dem Bauzweig-Stand, ein Push ist
# damit ein reiner Fast-Forward. Ist der Zweig weitergelaufen, setzt das Skript
# den Eingriff im Worktree neu auf.
#
# Rollback: `git revert <der hier gepushte Commit>` auf dem Bauzweig pushen.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAUZWEIG="feature/auth-redesign-github-magiclink"
QUELLE="a1101898"
WORKTREE="/private/tmp/claude-501/ox-alpha-server-$(date +%H%M%S)"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }

AUFRAEUMEN() {
  [ -d "$WORKTREE" ] && git -C "$REPO" worktree remove --force "$WORKTREE" 2>/dev/null
  git -C "$REPO" worktree prune 2>/dev/null
}

echo "== 0. Ausgangslage"
echo "Arbeitszweig bleibt unberuehrt: $(git branch --show-current)"
git cat-file -e "${QUELLE}^{commit}" 2>/dev/null || { echo "ABBRUCH: Commit $QUELLE liegt nicht im Repo."; exit 1; }
git log --oneline -1 "$QUELLE" | cut -c1-100

echo
echo "== 1. Bauzweig holen"
git fetch -q origin "$BAUZWEIG" || { echo "ABBRUCH: origin/$BAUZWEIG nicht erreichbar."; exit 1; }
echo "Bauzweig auf dem Server: $(git log --oneline -1 "origin/$BAUZWEIG" | cut -c1-90)"

# ACHTUNG, zsh-Falle (im Trockenlauf 2026-09-06 gefunden): "$BAUZWEIG:src/..."
# ist KEIN Git-Pfad, sondern ein History-Modifier. zsh las ':s/shared/...' als
# Ersetzung und machte daraus "origin/feature/...-magiclinky.js". git brach ab,
# grep fand nichts, und das Skript meldete "nichts zu tun" — es haette Erfolg
# behauptet, ohne je etwas getan zu haben. Die geschweiften Klammern beenden
# die Expansion vor dem Doppelpunkt und sind hier keine Kosmetik.
if ! git show "origin/${BAUZWEIG}:src/shared/modelRegistry.js" | grep -q '"ox-alpha": Object.freeze'; then
  echo
  echo "Auf dem Bauzweig steht Ox Alpha schon nicht mehr — nichts zu tun."
  exit 0
fi

echo
echo "== 2. Eigenen Arbeitsordner anlegen (der Hauptordner bleibt unangetastet)"
git worktree add -q --detach "$WORKTREE" "origin/$BAUZWEIG" || { echo "ABBRUCH: Arbeitsordner liess sich nicht anlegen."; exit 1; }
cd "$WORKTREE" || { echo "ABBRUCH: Arbeitsordner nicht betretbar."; AUFRAEUMEN; exit 1; }
echo "angelegt: $WORKTREE"

if git merge-base --is-ancestor "origin/$BAUZWEIG" "$QUELLE"; then
  echo "Der Fix sitzt schon auf diesem Stand — reiner Fast-Forward."
  git checkout -q "$QUELLE" || { echo "ABBRUCH: Wechsel im Arbeitsordner fehlgeschlagen."; AUFRAEUMEN; exit 1; }
else
  echo "Der Bauzweig ist weitergelaufen — der Eingriff wird neu aufgesetzt."
  git cherry-pick "$QUELLE" >/dev/null 2>&1 || {
    echo "ABBRUCH: passt nicht mehr sauber auf den Bauzweig (Konflikt)."
    echo "Dann: Sitzung bitten, den Eingriff auf dem neuen Stand zu wiederholen."
    AUFRAEUMEN
    exit 1
  }
fi
NEU="$(git rev-parse --short HEAD)"
echo "auszuliefern: $NEU"

echo
echo "== 3. Nachweis: Ox Alpha ist WIRKLICH weg"
grep -q '"ox-alpha": Object.freeze' src/shared/modelRegistry.js && { echo "ABBRUCH: Registry-Eintrag steht noch."; AUFRAEUMEN; exit 1; }
grep -q 'id: "ox-alpha"' control-server/src/compliance/aiTransparency.js && { echo "ABBRUCH: EU-AI-Act-Verzeichnis nennt es noch."; AUFRAEUMEN; exit 1; }
grep -q 'v146-ox-alpha' public/chat-bridge.js && { echo "ABBRUCH: das Bruecken-Etikett traegt es noch."; AUFRAEUMEN; exit 1; }
grep -q 'titel: "Ox Alpha"' public/code-modell-menue.js && { echo "ABBRUCH: die Menuezeile steht noch."; AUFRAEUMEN; exit 1; }
[ -f scripts/deploy/ox-alpha-freischalten.mjs ] && { echo "ABBRUCH: das Freischalt-Skript liegt noch da."; AUFRAEUMEN; exit 1; }
echo "Registry, EU-AI-Act-Verzeichnis, Bruecken-Etikett, Menuezeile, Freischalt-Skript: alle sauber."

echo
echo "== 4. Waechter auf genau diesem Stand"
node --test tests/model-registry.test.mjs control-server/src/compliance/aiTransparency.test.js \
  tests/deckungs-waechter.test.mjs tests/modell-menue-start.test.mjs tests/modellmenue-lock.test.mjs \
  tests/modellmenue-reihenfolge.test.mjs tests/code-modell-menue.test.mjs \
  > /tmp/ox-alpha-server.log 2>&1 || {
  echo "ABBRUCH: die Waechter sind NICHT gruen."
  tail -25 /tmp/ox-alpha-server.log
  AUFRAEUMEN
  exit 1
}
grep -E "^# (pass|fail)|pass [0-9]+$|fail [0-9]+$" /tmp/ox-alpha-server.log | tr '\n' ' '; echo
echo "Waechter gruen."

echo
echo "== 5. Startzeit des laufenden Servers merken"
VORHER=$(curl -s -m 20 https://smejj-control.zeabur.app/api/health | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
echo "gestartetAm vorher: ${VORHER:-unbekannt}"

echo
echo "== 6. Fast-Forward-Push"
git push -q origin "HEAD:$BAUZWEIG" || {
  echo "ABBRUCH: Push fehlgeschlagen — der Bauzweig ist zwischenzeitlich weitergelaufen."
  echo "Dann dieses Skript einfach noch einmal doppelklicken; es setzt neu auf."
  AUFRAEUMEN
  exit 1
}
echo "gepusht: $NEU -> origin/$BAUZWEIG ($(date +%H:%M:%S))"

echo
echo "== 7. Warten, bis Zeabur neu gebaut hat (real 2-6 Minuten)"
ERFOLG=1
for i in $(seq 1 48); do
  sleep 10
  ANTWORT=$(curl -s -m 20 https://smejj-control.zeabur.app/api/health)
  JETZT=$(echo "$ANTWORT" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
  OX=$(echo "$ANTWORT" | python3 -c 'import sys,json; print(sum(1 for m in json.load(sys.stdin).get("modelRegistry",{}).get("models",[]) if m.get("id")=="ox-alpha"))' 2>/dev/null)
  echo "$(date +%H:%M:%S) gestartetAm=$JETZT  ox-alpha in der Registry=$OX"
  if [ -n "$JETZT" ] && [ "$JETZT" != "$VORHER" ] && [ "$OX" = "0" ]; then
    ERFOLG=0
    break
  fi
done

echo
AUFRAEUMEN
if [ "$ERFOLG" = "0" ]; then
  echo "FERTIG — der Control-Server laeuft neu und meldet Ox Alpha nicht mehr."
  echo "Damit ist das Modell an beiden Orten weg: im Menue (SW v786) und in der Registry."
  exit 0
fi
echo "OFFEN: der Server hat in 8 Minuten nicht neu gestartet oder meldet Ox Alpha noch."
echo "Der Push ist durch — im Zeabur-Portal nachsehen, ob der Bau haengt."
exit 2

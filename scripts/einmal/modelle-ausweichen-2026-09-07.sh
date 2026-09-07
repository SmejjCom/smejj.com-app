#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-07: Modelle wieder zum Laufen bringen.
#
# WAS KAPUTT WAR, mit dem echten Schluessel gegen api.z.ai gemessen:
#   glm-5.2        429 "Insufficient balance or no resource package"
#   glm-4.6        429 desselben Inhalts
#   glm-4.5-air    429 desselben Inhalts
#   glm-4.5-flash  200 — antwortet normal, im Freikontingent
# Der Anbieter nannte den Grund im Klartext: "Weekly/Monthly Limit Exhausted.
# Your limit will reset at 2026-09-10 17:06:51". Der Schluessel ist also
# gueltig, nur das Kontingent leer. Weil KEIN anderes Modell Schluessel hat,
# war die tiefe Spur komplett tot: Nachdenken, Auto und Codieren antworteten
# gar nicht.
#
# WAS DIESE KASKADE TUT: sie traegt das Ausweichmodell an BEIDEN Orten ein
# (Registry + fest verdrahtete Anbieterliste des Routers) und schiebt es auf
# den Bauzweig des Control-Servers. Zeabur baut diesen Zweig automatisch.
# Neue Kosten entstehen nicht — glm-4.5-flash laeuft im Freikontingent.
#
# ZURUECKSTELLEN: sobald das Kontingent zurueck ist (fruehestens 10.09. 17:06)
# oder Guthaben aufgeladen wurde, in beiden Dateien wieder "glm-5.2" eintragen.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAUZWEIG="feature/auth-redesign-github-magiclink"
QUELLZWEIG="feature/design-v11"
COMMITS=(8b19d6bd 74e417db)
WT="/private/tmp/claude-501/control-bau-$(date +%H%M%S)"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }

AUFRAEUMEN() { [ -d "$WT" ] && git -C "$REPO" worktree remove --force "$WT" 2>/dev/null; git -C "$REPO" worktree prune 2>/dev/null; }

echo "== 0. Ausgangslage"
git fetch -q origin "$BAUZWEIG" "$QUELLZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
VORHER=$(curl -s -m 25 https://api.smejj.com/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
AKTUELL=$(curl -s -m 25 https://api.smejj.com/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin).get("aiBackend",""))' 2>/dev/null)
echo "Server laeuft seit: ${VORHER:-unbekannt}   Modell: ${AKTUELL:-unbekannt}"
if [[ "$AKTUELL" == *"glm-4.5-flash"* ]]; then echo; echo "Das Ausweichmodell laeuft bereits — nichts zu tun."; exit 0; fi

echo
echo "== 1. Arbeitsordner auf dem Bauzweig (der Hauptordner bleibt unberuehrt)"
git worktree add -q --detach "$WT" "origin/$BAUZWEIG" || { echo "ABBRUCH: Arbeitsordner nicht anlegbar."; exit 1; }
cd "$WT" || { echo "ABBRUCH."; AUFRAEUMEN; exit 1; }
echo "Bauzweig: $(git log --oneline -1 | cut -c1-80)"

echo
echo "== 2. Aenderung uebernehmen"
if grep -q 'defaultModel: "glm-4.5-flash"' src/shared/modelRegistry.js 2>/dev/null; then
  echo "steht schon drin"
else
  git cherry-pick "${COMMITS[@]}" >/dev/null 2>&1 || {
    echo "ABBRUCH: passt nicht sauber auf den Bauzweig (Konflikt) — Sitzung bitten, neu aufzusetzen."; AUFRAEUMEN; exit 1; }
  echo "uebernommen: $(git log --oneline -1 | cut -c1-70)"
fi

echo
echo "== 3. Gegenprobe: beide Orte umgestellt?"
grep -q 'defaultModel: "glm-4.5-flash"' src/shared/modelRegistry.js || { echo "ABBRUCH: Registry nicht umgestellt."; AUFRAEUMEN; exit 1; }
grep -q 'default: "glm-4.5-flash"' control-server/src/llm/modelRouter.js || { echo "ABBRUCH: Router-Liste nicht umgestellt."; AUFRAEUMEN; exit 1; }
echo "Registry und Router-Liste: beide auf glm-4.5-flash."

echo
echo "== 4. Waechter auf genau diesem Stand"
node --test control-server/src/llm/modelRouter.test.js tests/model-router.test.mjs tests/model-registry.test.mjs tests/multi-model-integration.test.mjs > /tmp/modelle-ausweichen.log 2>&1 \
  || { echo "ABBRUCH: die Waechter sind NICHT gruen."; tail -25 /tmp/modelle-ausweichen.log; AUFRAEUMEN; exit 1; }
grep -E "^ℹ (tests|pass|fail)" /tmp/modelle-ausweichen.log | tr '\n' ' '; echo

echo
echo "== 5. Auf den Bauzweig schieben (Zeabur baut ihn automatisch)"
git merge-base --is-ancestor "origin/$BAUZWEIG" HEAD || { echo "ABBRUCH: kein Fast-Forward — Bauzweig ist weitergelaufen. Kaskade einfach nochmal doppelklicken."; AUFRAEUMEN; exit 1; }
git push -q origin "HEAD:$BAUZWEIG" || { echo "ABBRUCH: Push fehlgeschlagen."; AUFRAEUMEN; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD) -> $BAUZWEIG ($(date +%H:%M:%S))"

echo
echo "== 6. Warten, bis Zeabur neu gebaut hat (real 2-6 Minuten)"
ERFOLG=1
for i in $(seq 1 60); do
  sleep 10
  ANTWORT=$(curl -s -m 25 https://api.smejj.com/api/health)
  JETZT=$(echo "$ANTWORT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
  BACKEND=$(echo "$ANTWORT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("aiBackend",""))' 2>/dev/null)
  echo "$(date +%H:%M:%S) gestartetAm=$JETZT  Modell=$BACKEND"
  if [ -n "$JETZT" ] && [ "$JETZT" != "$VORHER" ] && [[ "$BACKEND" == *"glm-4.5-flash"* ]]; then ERFOLG=0; break; fi
done

echo
AUFRAEUMEN
if [ "$ERFOLG" = "0" ]; then
  echo "FERTIG — der Server antwortet jetzt mit glm-4.5-flash."
  echo "Bitte im Chat testen: eine Frage mit eingeschaltetem 'Nachdenken'."
  exit 0
fi
echo "OFFEN: Der Server hat in 10 Minuten nicht auf das neue Modell umgestellt."
echo "Der Push ist durch — im Zeabur-Portal nachsehen, ob der Bau haengt."
exit 2

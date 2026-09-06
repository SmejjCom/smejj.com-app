#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06: den Schwungrad-Fix (Autopilot Nr. 19)
# in den Bauzweig bringen. Zeabur baut den Control-Server daraus automatisch.
#
# BEFUND (live gemessen 2026-09-06 im e2-Konto): der Ordner
# self-improvement/dpo-dataset/ EXISTIERT NICHT. In sieben Wochen ist kein
# einziges DPO-Paar entstanden, bei genau 2 erfassten Ereignissen (16.08. und
# 06.09.). Die Ampel fuer Nr. 19 stand die ganze Zeit gruen — der Autopilot lief
# ja, er brachte nur nichts hervor.
#
# URSACHE: Ein Paar entstand nur, wenn chosen UND rejected im SELBEN Aufruf
# ankamen. feedbackRoutes.js setzt aber immer nur eines der beiden Felder, je
# nach Richtung des Daumens. Ein Klick ist hoch oder runter, nie beides — die
# Bedingung war per Bauart unerfuellbar.
#
# FIX (Commit 73da7e85 auf feature/design-v11): Ereignisse tragen jetzt einen
# Fingerabdruck der bereinigten Frage und die bereinigte Antwort. Trifft die
# entgegengesetzte Bewertung derselben Frage ein, werden beide zu einem Paar
# zusammengefuehrt. Beide werden gestempelt, damit ein dritter Daumen kein
# zweites gleiches Paar baut. Fenster: 28 Tage.
# Neu sichtbar: getUserFlywheelStats meldet `gepaart` und `wartend` — ihr Fehlen
# war der eigentliche Fehler, denn ohne sie sah niemand, dass nichts herauskam.
#
# WARUM DIESES SKRIPT SELBST CHERRY-PICKT: der Bauzweig laeuft gerade weiter
# (zwischen zwei Messungen wanderte er von ed82179a auf 84cb984c). Ein fest
# eingetragener Commit waere beim Doppelklick schon veraltet. Deshalb wird der
# Fix HIER, zum Zeitpunkt des Klicks, auf den dann aktuellen Stand gesetzt.
#
# Rollback: `git revert <der hier gepushte Commit>` auf dem Bauzweig pushen —
# Zeabur baut den Stand davor. Ein Rueckwaerts-Push ist kein Fast-Forward und
# damit gesperrt.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAUZWEIG="feature/auth-redesign-github-magiclink"
QUELLE="73da7e85"
ARBEIT="nr19-auslieferung-$(date +%H%M%S)"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }

AUFRAEUMEN() {
  git cherry-pick --abort 2>/dev/null
  git checkout -q "$ZURUECK" 2>/dev/null
  [ "${GESTASHT:-0}" = "1" ] && git stash pop -q 2>/dev/null
  git branch -D "$ARBEIT" -q 2>/dev/null
}

echo "== 0. Ausgangslage"
ZURUECK="$(git branch --show-current)"
[ -n "$ZURUECK" ] || { echo "ABBRUCH: kein benannter Zweig ausgecheckt."; exit 1; }
echo "Arbeitszweig: $ZURUECK"
git cat-file -e "${QUELLE}^{commit}" 2>/dev/null || { echo "ABBRUCH: Commit $QUELLE liegt nicht im Repo."; exit 1; }
git log --oneline -1 "$QUELLE" | cut -c1-100

GESTASHT=0
if [ -n "$(git status --porcelain)" ]; then
  echo "Offene Aenderungen werden waehrend der Auslieferung beiseitegelegt und danach zurueckgeholt."
  git stash -q -u || { echo "ABBRUCH: konnte offene Aenderungen nicht sichern."; exit 1; }
  GESTASHT=1
fi

echo
echo "== 1. Bauzweig holen"
git fetch -q origin "$BAUZWEIG" || { echo "ABBRUCH: origin/$BAUZWEIG nicht erreichbar."; AUFRAEUMEN; exit 1; }
echo "Bauzweig auf dem Server: $(git log --oneline -1 "origin/$BAUZWEIG" | cut -c1-90)"

if git log --format=%s "origin/$BAUZWEIG" -40 | grep -qF "fix(nr19): das Schwungrad drehte sich nie"; then
  echo
  echo "Der Fix liegt schon auf dem Bauzweig — nichts zu tun."
  AUFRAEUMEN
  exit 0
fi

echo
echo "== 2. Fix auf den aktuellen Bauzweig setzen"
git branch -f "$ARBEIT" "origin/$BAUZWEIG" -q || { echo "ABBRUCH: Zweig anlegen fehlgeschlagen."; AUFRAEUMEN; exit 1; }
git checkout -q "$ARBEIT" || { echo "ABBRUCH: Wechsel fehlgeschlagen."; AUFRAEUMEN; exit 1; }
git cherry-pick "$QUELLE" >/dev/null 2>&1 || {
  echo "ABBRUCH: der Fix passt nicht mehr sauber auf den Bauzweig (Konflikt)."
  echo "Dann: Sitzung bitten, ihn auf den neuen Stand zu setzen — nicht von Hand aufloesen."
  AUFRAEUMEN
  exit 1
}
NEU="$(git rev-parse --short HEAD)"
echo "neuer Commit auf dem Bauzweig-Stand: $NEU"

echo
echo "== 3. Nachweis: nur der Control-Server ist betroffen"
git diff --stat "origin/$BAUZWEIG" HEAD
git diff --quiet "origin/$BAUZWEIG" HEAD -- public || { echo "ABBRUCH: public/ waere betroffen."; AUFRAEUMEN; exit 1; }
ANZAHL=$(git diff --name-only "origin/$BAUZWEIG" HEAD | wc -l | tr -d ' ')
[ "$ANZAHL" = "2" ] || { echo "ABBRUCH: erwartet waren 2 Dateien, es sind $ANZAHL."; AUFRAEUMEN; exit 1; }
echo "public/ unberuehrt, genau 2 Dateien — wie erwartet."

echo
echo "== 4. Waechter auf DIESEM Stand laufen lassen"
node --test control-server/src/autopilots/autopilots.test.js 2>&1 | grep -E "^# (tests|pass|fail)|ℹ (tests|pass|fail)"
node --test control-server/src/autopilots/autopilots.test.js >/dev/null 2>&1 || {
  echo "ABBRUCH: die Waechter sind auf dem Bauzweig-Stand NICHT gruen."
  AUFRAEUMEN
  exit 1
}
echo "Waechter gruen."

echo
echo "== 5. Startzeit des laufenden Servers merken"
VORHER=$(curl -s -m 15 https://api.smejj.com/api/health | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
echo "gestartetAm vorher: ${VORHER:-unbekannt}"

echo
echo "== 6. Fast-Forward-Push auf den Bauzweig"
git push -q origin "HEAD:$BAUZWEIG" || {
  echo "ABBRUCH: Push fehlgeschlagen — der Bauzweig ist in der Zwischenzeit weitergelaufen."
  echo "Dann dieses Skript einfach noch einmal doppelklicken; es setzt neu auf."
  AUFRAEUMEN
  exit 1
}
echo "gepusht: $NEU -> origin/$BAUZWEIG ($(date +%H:%M:%S))"

echo
echo "== 7. Warten, bis Zeabur neu gebaut und gestartet hat (real 2-6 Minuten)"
ERFOLG=1
for i in $(seq 1 48); do
  sleep 10
  JETZT=$(curl -s -m 15 https://api.smejj.com/api/health | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
  echo "$(date +%H:%M:%S) gestartetAm=$JETZT"
  if [ -n "$JETZT" ] && [ "$JETZT" != "$VORHER" ]; then
    ERFOLG=0
    break
  fi
done

echo
AUFRAEUMEN
if [ "$ERFOLG" = "0" ]; then
  echo "FERTIG — der Control-Server laeuft neu. Der Schwungrad-Fix ist live."
  echo
  echo "WAS JETZT PASSIERT: Ab sofort wird bei jedem Daumen nach dem Gegenstueck"
  echo "gesucht. Ein Paar entsteht, sobald dieselbe Frage einmal mit Daumen hoch"
  echo "und einmal mit Daumen runter bewertet wurde — auch tagelang versetzt."
  echo
  echo "EHRLICH DAZU: Es faengt bei null an. Alte Ereignisse haben keinen"
  echo "Fingerabdruck und werden uebergangen, statt zu halben Paaren gezwungen"
  echo "zu werden. Bei zwei Ereignissen in sieben Wochen wird es langsam anlaufen."
  exit 0
fi
echo "OFFEN: der Server hat in 8 Minuten nicht neu gestartet."
echo "Der Push ist aber durch — im Zeabur-Portal nachsehen, ob der Bau haengt."
exit 2

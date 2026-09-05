#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-05: den Nachfrage-Fix des Maus-Servers in den
# Bauzweig pushen (Zeabur baut den Control-Server daraus automatisch).
#
# BEFUND (live gemessen 2026-09-05, sechs Anfragen mit derselben Beobachtung an
# api.smejj.com/api/maus/run): drei Mal "done: Example Domain" in unter einer
# Sekunde — drei Mal abgelehnt, jedes Mal mit anderem Formfehler (navigate ohne
# url; step.id als Zahl; ein Plan statt einer Entscheidung). Das schnelle Modell
# flackert. Bisher ging jede Ablehnung als 422 ans Panel; nach zwei Ablehnungen
# gab der Lauf auf ("Maus konnte nicht entscheiden"), obwohl die Antwort auf der
# Seite stand — so um 11:55 im Chrome des Betreibers gesehen.
#
# FIX: der Server fragt EINMAL mit den Gruenden nach, bevor er 422 meldet
# (buildStepRetryPrompt in workers/maus-engine/prompt-template.mjs, Nachfrage in
# control-server/src/routes/mausEngineRoutes.js). Allowlist-Verstoesse werden
# nicht nachverhandelt. Fuenf Waechter: tests/maus-schritt-nachfrage.test.mjs.
# Beide Zweige gruen (64/64). Arbeitszweig: 6a5d093b. Bauzweig-Commit: 01995c91
# (liegt schon im Repo, nur der Push fehlte — der Auto-Modus hat ihn gesperrt).
#
# Rollback: `git push origin <vorheriger-stand>:feature/auth-redesign-github-magiclink`
# ist KEIN Fast-Forward und damit gesperrt; stattdessen `git revert 01995c91` auf
# dem Bauzweig pushen — Zeabur baut den Stand davor.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAUZWEIG="feature/auth-redesign-github-magiclink"
COMMIT="01995c91"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git cat-file -e "$COMMIT^{commit}" 2>/dev/null || { echo "ABBRUCH: Commit $COMMIT liegt nicht im Repo."; exit 1; }
git log --oneline -1 "$COMMIT" | cut -c1-100
git fetch -q origin "$BAUZWEIG" || { echo "ABBRUCH: origin/$BAUZWEIG nicht erreichbar."; exit 1; }
echo "Bauzweig auf dem Server: $(git log --oneline -1 "origin/$BAUZWEIG" | cut -c1-90)"
if git merge-base --is-ancestor "$COMMIT" "origin/$BAUZWEIG"; then
  echo "Der Commit ist schon auf dem Server — nichts zu pushen."
else
  git merge-base --is-ancestor "origin/$BAUZWEIG" "$COMMIT" || {
    echo "ABBRUCH: kein Fast-Forward — der Bauzweig ist inzwischen weitergelaufen."
    echo "Dann: Sitzung bitten, $COMMIT auf den neuen Stand zu setzen (Cherry-Pick), nicht erzwingen."
    exit 1
  }
  echo "== 1. Nachweis der Aenderung (nur Server-Dateien, public/ unberuehrt)"
  git diff --stat "origin/$BAUZWEIG" "$COMMIT" | tail -8
  git diff --quiet "origin/$BAUZWEIG" "$COMMIT" -- public || { echo "ABBRUCH: public/ waere betroffen."; exit 1; }
  echo "== 2. Startzeit des laufenden Servers merken"
  VORHER=$(curl -s -m 15 https://api.smejj.com/api/health | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
  echo "gestartetAm vorher: ${VORHER:-unbekannt}"
  echo "== 3. Fast-Forward-Push auf den Bauzweig"
  git push -q origin "$COMMIT:$BAUZWEIG" || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
  echo "gepusht: $COMMIT -> origin/$BAUZWEIG ($(date +%H:%M:%S))"
  echo "== 4. Warten, bis Zeabur neu gebaut und gestartet hat (real 2-6 Minuten)"
  for i in $(seq 1 48); do
    sleep 10
    JETZT=$(curl -s -m 15 https://api.smejj.com/api/health | python3 -c 'import sys,json; print(json.load(sys.stdin).get("gestartetAm",""))' 2>/dev/null)
    echo "$(date +%H:%M:%S) gestartetAm=$JETZT"
    if [ -n "$JETZT" ] && [ "$JETZT" != "$VORHER" ]; then
      echo
      echo "FERTIG — der Control-Server laeuft neu (gestartetAm gewechselt). Der Nachfrage-Fix ist live."
      echo "Die Sitzung misst jetzt: sechs Anfragen, wie viele kommen im ersten oder zweiten Anlauf richtig."
      exit 0
    fi
  done
  echo
  echo "OFFEN — gepusht, aber gestartetAm hat in 8 Minuten nicht gewechselt."
  echo "Dann baut Zeabur nicht von selbst; Weg: CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs"
  exit 1
fi

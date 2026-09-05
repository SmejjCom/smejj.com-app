#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-05: Maus-Livetest (zweiter Lauf) stempeln
# und ausliefern.
#
# BEFUND (live gemessen 2026-09-05 im Chrome des Betreibers, Auftrag "Erledige
# mit der Maus im Browser: Öffne example.com und sag mir, welche Überschrift dort
# steht"):
#   1. "Ich arbeite in deinem eigenen Chrome …" stand im Chat, die naechste
#      Zeile nahm es zurueck ("… ich nehme den eingebauten Browser"). Jetzt wird
#      erst die Bruecke gefragt, dann gesagt, wo gearbeitet wird.
#   2. Das Stopp-Viereck blieb nach dem fertigen Lauf 90 s stehen (chat-stopp.js
#      hoerte von der Maus nichts) und stoppte die Maus nicht. Die Maus meldet
#      ihren Strom jetzt wie ein Chat-Strom an und ab und hoert auf
#      smejj:chat-stoppen.
#   3. "Maus 1/10: ueberlegt ..." stand minutenlang ohne Ende — der fetch hatte
#      keine Frist; direkt gerufen antwortete der Server in 1 s. Jetzt 180 s je
#      Entscheidung mit lesbarer Meldung.
#   4. ASCII-Umlaute (oeffne, Fuer, faengt, ueberlegt) durch echte ersetzt;
#      "fertig nach 0 Schritten" heisst "fertig, kein Klick noetig".
#
# DER CODE IST SCHON COMMITTET (bc4359a9 auf feature/design-v11, 73 + 150 Tests
# gruen, markenkette/precache/assets gruen). Was die Sitzung NICHT darf, ist der
# Start-Lock-Stempel — index.html, app.js, browser-pane.js und sw.js (v766)
# stehen unter dem Lock. Deshalb dieser Doppelklick.
#
# SICHERHEITSNETZ VOR DEM KOPIEREN: check-deploy-abgleich meldet hier STOPP,
# weil es die von uns GEAENDERTEN Zeilen als "nur live" zaehlt (so ist es
# gebaut: es sucht fremde Arbeit). Der schaerfere Beweis steht unten in
# Schritt 4: jede der zehn Dateien im Live-Repo muss BYTE-GLEICH mit dem Stand
# VOR unserer Aenderung sein (7fe64508 = live d3f4717). Ist das so, gibt es
# keine fremde Arbeit, die verloren gehen koennte. Ist es nicht so: Abbruch.
#
# Rollback: im Frontend-Klon `git revert HEAD && git push origin HEAD:main`;
# im App-Repo `git revert` der beiden Commits.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="7fe64508"
CODE_COMMIT="bc4359a9"
DATEIEN=(index.html sw.js app.js browser-nachladen.js browser-pane-persistenz.js browser-pane.js browser-pane-maus.js maus-absicht.js maus-panel.js sendepfad-nachladen.js)
# git-Umweg um die Xcode-Lizenz (Befund 05.09.): harmlos, wenn er nicht noetig ist.
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: der Code-Commit $CODE_COMMIT ist nicht im aktuellen Zweig."; exit 1; }
if ! git diff --quiet -- public tests; then
  echo "ABBRUCH: ungespeicherte Aenderungen in public/ oder tests/ — erst ansehen (git status)."; exit 1
fi

echo "== 1. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber Wof Kadavanich, 2026-09-05 im Wortlaut: 'Geh chrome browser https://smejj.com/ teste Erledige mit der Maus im Browser und alle Fehler beheben.' Zweiter Live-Lauf desselben Tages, vier Befunde behoben: (1) 'Ich arbeite in deinem eigenen Chrome' stand im Chat und wurde in der naechsten Zeile zurueckgenommen — Ankuendigung jetzt erst nach der Antwort der Bruecke; (2) das Stopp-Viereck blieb nach dem Maus-Lauf 90 s stehen und stoppte die Maus nicht — die Maus meldet ihren Strom jetzt wie ein Chat-Strom an und ab und hoert auf smejj:chat-stoppen; (3) 'Maus 1/10: ueberlegt ...' stand minutenlang ohne Ende — Frist von 180 s je Entscheidung mit lesbarer Meldung; (4) ASCII-Umlaute in den Maus-Texten durch echte Umlaute ersetzt, 'fertig nach 0 Schritten' heisst jetzt 'fertig, kein Klick noetig'. Cache-Marken der Maus-Kette, app.js b135, Service-Worker smejj-shell-v766. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 2. Alle Waechter muessen gruen sein"
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock rot."; exit 1; }
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/maus-absicht.test.mjs > /tmp/maus-kaskade-tests.log 2>&1 \
  || { echo "ABBRUCH: Maus-Tests rot."; tail -30 /tmp/maus-kaskade-tests.log; exit 1; }
grep -E "^# (tests|pass|fail)" /tmp/maus-kaskade-tests.log | tr '\n' ' '; echo

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then
  echo "(Manifest unveraendert — Stempel stand schon)"
else
  git commit -q -m "chore(start-lock): Stempel nach Maus-Livetest 2026-09-05 — index.html, app.js b135, browser-pane.js, SW smejj-shell-v766 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR unserer Aenderung pruefen (fremde Arbeit?)"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$REPO" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:assets/$f" | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:$f" | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && [ "$a" = "$c" ]; then echo "  gleich  $f"; else echo "  FREMD   $f (quelle=$a assets=$b wurzel=$c)"; FREMD=1; fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben. Live-Fassung zur Basis nehmen."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward zu origin/main."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$REPO/public/$f" "$KLON/$f" && cp "$REPO/public/$f" "$KLON/assets/$f" || { echo "ABBRUCH: Kopie von $f fehlgeschlagen."; exit 1; }
  git add "$f" "assets/$f"
done
git status --short | head -30
git commit -q -m "deploy(maus): Livetest-Fixes — Chrome-Ankuendigung erst nach Bruecken-Antwort, Stopp-Viereck gehoert der Maus, 180-s-Frist, echte Umlaute; SW v766 — Quelle smejj.com-app $QUELLE" \
  || { echo "ABBRUCH: nichts zu committen — steht der Stand schon live?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein reiner Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD) -> SmejjCom/smejj-app-frontend main"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/maus-absicht.js" | cut -c1-16)
for i in $(seq 1 30); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/maus-absicht.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  maus-absicht=$L  (erwartet v766 / $ERW)"
  if [ "$V" = "smejj-shell-v766" ] && [ "$L" = "$ERW" ]; then
    echo
    echo "FERTIG — live: Service-Worker v766, maus-absicht.js byte-gleich mit der Quelle."
    echo "Die Sitzung prueft jetzt im Chrome den Maus-Auftrag noch einmal von A bis Z."
    exit 0
  fi
  sleep 5
done
echo
echo "OFFEN — gepusht, aber live noch nicht nachgezogen. In zwei Minuten pruefen:"
echo "  curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

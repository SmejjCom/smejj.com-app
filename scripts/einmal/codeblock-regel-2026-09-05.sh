#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-05 (17): Code kommt immer im Kasten.
#
# BEFUND (live gemessen 2026-09-05 im Code-Bereich): Bei einer Aufgabe mit
# "genauer:" (tiefe Spur ueber /api/agent) lieferte das Modell in ZWEI von DREI
# Laeufen den Code OHNE ```-Zaeune. Er klebte direkt am Satz — gemessen am
# Knoten: 0 <pre>-Bloecke bei 423 bzw. 742 Zeichen Antwort, Text zum Beispiel
# "...mit eigener Implementierung und Randfaellen:function maximum(liste) {".
# Die Oberflaeche baut aus Zaeunen einen Kasten mit Kopier- und Download-Knopf;
# ohne Zaeune fehlt beides. Der Renderer arbeitet korrekt — die REGEL fehlte:
# src/agent/systemregeln.js verlangt normale Schreibweise fuer FORMELN (statt
# LaTeX), sagte zu Code aber nichts.
#
# FIX: eine neue Systemzeile "CODE-DARSTELLUNG:" — Zaeune auf eigener Zeile,
# Sprachangabe, nie roher Code im Fliesstext. Sie gilt in jedem Modus AUSSER im
# Sprachmodus: dort verbietet die Regel direkt darunter Markdown und Code-Bloecke
# ausdruecklich, weil die Antwort vorgelesen wird. Zwei widerspruechliche Ansagen
# waeren schlimmer als keine.
#
# DAS IST SERVERARBEIT: sie gehoert in den Bauzweig, nicht nach design-v11 —
# der Buendel-Abgleich traegt nur public/. Kein Service-Worker-Sprung noetig,
# es aendert sich keine Datei unter public/.
#
# SCHUTZ: tests/systemregeln-codeblock.test.mjs, fuenf Zusagen (normal, Code-
# Auftrag, Web-Ergebnisse, Sprachmodus-Ausnahme, Wortlaut konkret genug, und die
# Sicherheitsregel von Red-Team-Fund Nr. 79 bleibt stehen). Waechter-TUEV
# gefahren: ohne die Regel 3 von 5 ROT, mit ihr 5 von 5 GRUEN.
#
# Rollback: git revert des Commits im Bauzweig; Zeabur baut den Stand davor.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAUZWEIG="feature/auth-redesign-github-magiclink"

cd "$REPO"
echo "== 0. Ausgangslage"
[ -f scripts/einmal/codeblock-regel-patch.cjs ] || { echo "ABBRUCH: Patch-Skript fehlt."; exit 1; }
[ -f scripts/einmal/systemregeln-codeblock.test.mjs.vorlage ] || { echo "ABBRUCH: Test-Vorlage fehlt."; exit 1; }
git fetch -q origin "$BAUZWEIG"
git log --oneline -1 "origin/$BAUZWEIG"

echo "== 1. Arbeitsbaum auf dem Bauzweig"
WT=$(mktemp -d /tmp/smejj-codeblock.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
cp scripts/einmal/codeblock-regel-patch.cjs "$WT/"
cp scripts/einmal/systemregeln-codeblock.test.mjs.vorlage "$WT/tests/systemregeln-codeblock.test.mjs"

ERGEBNIS=0
(
  cd "$WT"
  echo "== 2. Regel setzen (idempotent)"
  node codeblock-regel-patch.cjs
  rm -f codeblock-regel-patch.cjs

  echo "== 3. Pruefen"
  node --test tests/systemregeln-codeblock.test.mjs tests/projektkorpus.test.mjs tests/agent-routes.test.mjs 2>&1 | grep -E "^. (tests|pass|fail)" | tr '\n' ' '; echo
  node --test tests/systemregeln-codeblock.test.mjs > /tmp/kaskade17.log 2>&1 || { echo "ABBRUCH: Waechter rot."; tail -20 /tmp/kaskade17.log; exit 1; }
  # Gegenprobe im Lauf: ohne die Regel MUSS der Waechter rot werden.
  cp src/agent/systemregeln.js /tmp/kaskade17-gesund.js
  git checkout -- src/agent/systemregeln.js
  if node --test tests/systemregeln-codeblock.test.mjs > /dev/null 2>&1; then
    echo "ABBRUCH: der Waechter bleibt gruen, obwohl die Regel fehlt — er prueft nichts."
    cp /tmp/kaskade17-gesund.js src/agent/systemregeln.js
    exit 1
  fi
  cp /tmp/kaskade17-gesund.js src/agent/systemregeln.js
  echo "Waechter-TUEV im Lauf bestanden (ohne Regel rot, mit Regel gruen)."

  echo "== 4. Commit und Push (Zeabur baut)"
  git add -A src tests
  git diff --cached --name-only
  git diff --cached --quiet -- public && echo "public/ unberuehrt — richtig." || { echo "ABBRUCH: public/ waere betroffen."; exit 1; }
  git commit -q -m "fix(systemregeln): Code immer im Codeblock — tiefe Spur lieferte ihn in 2 von 3 Laeufen roh im Fliesstext (live gemessen 2026-09-05), Sprachmodus ausgenommen, Waechter mit Gegenprobe (Betreiber-Doppelklick)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
) || ERGEBNIS=1
cd "$REPO"
git worktree remove --force "$WT"
[ "$ERGEBNIS" -eq 0 ] || { echo "ABBRUCH — nichts ausgeliefert."; exit 1; }

echo "== 5. Warten, bis der Bau durch ist (bis 6 Minuten)"
for i in $(seq 1 36); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api.smejj.com/health || true)
  echo "$(date +%H:%M:%S) api.smejj.com/health=$code"
  [ "$code" = "200" ] && { sleep 20; break; }
  sleep 10
done
echo
echo "FERTIG — die Regel ist im Bauzweig und Zeabur hat neu gebaut."
echo "Die Sitzung prueft jetzt live: eine echte Code-Aufgabe ueber die tiefe Spur"
echo "muss als Kasten mit Kopier-Knopf ankommen."

#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06: drei Befunde aus dem A-bis-Z-Livetest
# stempeln und ausliefern.
#
# BEFUNDE (live im Browser gemessen, nicht aus Tests abgeleitet):
#   A  Die Ansicht "Systemzustand" lag auf /status — daneben liegt aber
#      public/status.html, und GitHub Pages beantwortet /status mit dieser
#      Datei. Der SPA-Fallback kam nie zum Zug: per Direktaufruf, per
#      Lesezeichen und nach jedem Neuladen war die Ansicht unerreichbar.
#      Sie heisst jetzt /systemzustand.
#   B  Die Code-Ansicht hatte keine Ueberschrift, darum blieb der Seitentitel
#      der der Startseite — bei mehreren Tabs nicht unterscheidbar.
#   C  Jedes Speichern holte jedes Chat-Bild neu und erzeugte eine neue
#      Blob-Adresse; 47 abgewiesene Abrufe bei zwei Bildern, nichts gab sie
#      wieder frei.
# CODE: 66e887bd + a22bb083. Neuer Waechter tests/app-routen-kollision.test.mjs.
# SICHERHEITSNETZ: alle 25 Dateien im Live-Repo byte-gleich mit dem Stand VOR
# der Aenderung (7df5df7d, live SW v776).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="7df5df7d"
CODE_COMMIT="66e887bd"
SW_NEU="smejj-shell-v777"
DATEIEN=(404.html app.js arbeitsbereiche.js bedarf-nachladen.js chat-actions.js
  chat-history-cards.js chat-history-view.js chat-medien.js chat-store-bereiche.js
  chat-store.js chat-sync.js chat-title-auto.js code-flaeche.js code-nachladen.js
  erste-schritte.js erwaehnung.js index.html papierkorb.js pwa-schnellstart.js
  search-overlay.js search.js spur-start.js such-nachladen.js sw.js view-routes.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q 'tools: "/systemzustand"' public/view-routes.js || { echo "ABBRUCH: Befund A steht nicht in view-routes.js."; exit 1; }
grep -q 'class="visually-hidden">Code</h2>' public/index.html || { echo "ABBRUCH: Befund B steht nicht in index.html."; exit 1; }
grep -q "ANZEIGE_BLOB" public/chat-medien.js || { echo "ABBRUCH: Befund C steht nicht in chat-medien.js."; exit 1; }
# Nur die Dateien, die HIER ausgeliefert werden, muessen sauber sein — eine
# Parallelsitzung darf an anderen Dateien arbeiten.
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen — eine andere Sitzung arbeitet daran."; exit 1; }
done

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/app-routen-kollision.test.mjs tests/chat-medien.test.mjs tests/statusseite.test.mjs \
  tests/responsive-waechter.test.mjs tests/touch-ziele-waechter.test.mjs > /tmp/livetest-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu diesen drei Befunden sind rot."; tail -30 /tmp/livetest-kaskade.log; exit 1; }
grep -E "^. (tests|pass|fail)" /tmp/livetest-kaskade.log | tr '\n' ' '; echo
# Die volle Suite hat 10 rote Tests. Sie waren VOR dieser Arbeit schon rot
# (gemessen im Worktree auf 10b80e43) und gehoeren zu den Altlasten der
# Bau-Basis, nicht zu dieser Auslieferung. Darum hier bewusst nicht als Sperre.

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-06: 'Bitte oeffne smejj.com im Browser und teste die gesamte App von A bis Z. Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und zuverlaessig funktioniert.' Der Livetest fand drei Fehler: die Ansicht Systemzustand war unter /status von public/status.html verdeckt und per Direktaufruf oder Neuladen unerreichbar (jetzt /systemzustand, mit neuem Waechter fuer jede Route), die Code-Ansicht hatte keine Ueberschrift und darum den Titel der Startseite (versteckte h2), und jedes Speichern erzeugte fuer jedes Chat-Bild eine neue Blob-Adresse, ohne eine alte freizugeben (Gedaechtnis in einer WeakMap). index.html, app.js b144, search.js, Service-Worker smejj-shell-v777. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Livetest-Befunde 2026-09-06 — index.html, app.js b144, search.js, SW smejj-shell-v777 (Betreiber-Doppelklick)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$REPO" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && { [ -z "$c" ] || [ "$a" = "$c" ]; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$REPO/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -f "$KLON/assets/$f" ]; then cp "$REPO/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | head -40
git commit -q -m "deploy(livetest): Ansicht /systemzustand statt verdecktem /status, Titel der Code-Ansicht, Blob-Gedaechtnis fuer Chat-Bilder; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/view-routes.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/view-routes.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  view-routes=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo
    echo "== 7. Die drei Befunde live gegenpruefen"
    # A: /systemzustand muss die App-Shell erreichen (404.html leitet weiter),
    #    /status muss weiter die Betriebsstatus-Seite sein.
    curl -s -m 15 "https://smejj.com/404.html" | grep -q '"/systemzustand"' \
      && echo "  A ok — 404.html kennt /systemzustand" || echo "  A OFFEN — 404.html kennt die Route nicht"
    curl -s -m 15 "https://smejj.com/status" | grep -q "Betriebsstatus" \
      && echo "  A ok — /status bleibt die Statusseite" || echo "  A OFFEN — /status zeigt etwas anderes"
    # B: die versteckte Ueberschrift muss ausgeliefert sein.
    curl -s -m 15 "https://smejj.com/" | grep -q 'class="visually-hidden">Code</h2>' \
      && echo "  B ok — die Code-Ansicht hat eine Ueberschrift" || echo "  B OFFEN — Ueberschrift fehlt live"
    # C: das Blob-Gedaechtnis muss im ausgelieferten Modul stehen.
    curl -s -m 15 "https://smejj.com/assets/chat-medien.js" | grep -q "ANZEIGE_BLOB" \
      && echo "  C ok — Blob-Gedaechtnis ist live" || echo "  C OFFEN — chat-medien.js ist alt"
    echo
    echo "FERTIG — live: Service-Worker $SW_NEU, view-routes.js byte-gleich."
    exit 0
  fi
  sleep 5
done
echo
echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

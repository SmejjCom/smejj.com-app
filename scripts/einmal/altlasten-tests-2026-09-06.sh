#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06: Altlasten der Bau-Basis stempeln und
# ausliefern.
#
# WARUM: Die Suite stand seit Wochen auf 10 rot. Dauer-Rot macht blind — ein
# echter neuer Fehler waere darin nicht aufgefallen. Aufgeraeumt: 3272 gruen,
# 2 rot (die Sperren-Waechter, die genau diese noch ungestempelte Aenderung
# melden; sie werden mit Schritt 2 gruen).
#
# ZWEI ECHTE FEHLER darunter, beide gehen live:
#   1. Zehn Module, die chat-actions-menu.js und composer-plus-menu.js per
#      import() nachladen, fehlten im Offline-Vorrat. Online faellt das nie
#      auf; offline bekam der Browser HTML statt JavaScript und brach die
#      Module ab — Aktionsleiste, Composer-Zeile, erste Schritte und die
#      Textauszieher fuer PDF-, Office- und Tonspur-Anhaenge fielen stumm aus.
#   2. CLIENT_ROUTES.api.trainingCapture gab es in config.js gar nicht; nur
#      ein eingebauter Ersatzpfad rettete die Fragen-Erfassung.
# CODE: 019fac9b.
# SICHERHEITSNETZ: beide Dateien im Live-Repo byte-gleich mit dem Stand VOR
# der Aenderung (019fac9b~1, live SW v777).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="019fac9b~1"
CODE_COMMIT="019fac9b"
SW_NEU="smejj-shell-v778"
DATEIEN=(sw.js config.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q '"/assets/anhang-tonspur.js"' public/sw.js || { echo "ABBRUCH: die zehn Precache-Eintraege fehlen."; exit 1; }
grep -q 'trainingCapture: "/api/training/capture"' public/config.js || { echo "ABBRUCH: trainingCapture fehlt in config.js."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: Service-Worker steht nicht auf $SW_NEU."; exit 1; }
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen."; exit 1; }
done

echo "== 1. Waechter"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
echo "-- die acht aufgeraeumten Tests"
node --test tests/precache-dynamische-importe.test.mjs tests/client-routen-existieren.test.mjs \
  tests/search-overlay.test.mjs tests/erste-schritte.test.mjs tests/chat-frage-karte.test.mjs \
  tests/frage-erfassung.test.mjs > /tmp/altlasten-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die aufgeraeumten Tests sind rot."; tail -30 /tmp/altlasten-kaskade.log; exit 1; }
grep -E "^. (tests|pass|fail)" /tmp/altlasten-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-06: 'Wenn du Fehler findest, behebe sie sofort, deploye erneut und teste live weiter, bis alles stabil, sicher und zuverlaessig funktioniert.' Die Suite stand seit Wochen auf 10 rot; Dauer-Rot verdeckt echte Fehler. Acht davon aufgeraeumt, darunter zwei echte: zehn dynamisch nachgeladene Module fehlten im Offline-Vorrat (Aktionsleiste, Composer-Zeile, erste Schritte, PDF-/Office-/Tonspur-Anhaenge fielen offline stumm aus) und CLIENT_ROUTES.api.trainingCapture gab es in config.js nicht. Die restlichen sechs waren Test-Luecken: hart gepinnte Cache-Marken, ein Helfer der nur statische Importe sah, eine veraltete Erwartung an Cmd+K und ein Stub ohne classList.toggle. sw.js, config.js, Service-Worker smejj-shell-v778. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen und die Sperren gegenpruefen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Altlasten-Aufraeumen 2026-09-06 — sw.js (Precache +10), config.js, SW smejj-shell-v778 (Betreiber-Doppelklick)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
# Jetzt muessen auch die letzten zwei roten Tests gruen sein — sie melden
# genau die eben gestempelten Aenderungen.
node --test tests/dateisperren.test.mjs > /tmp/altlasten-sperren.log 2>&1 \
  || { echo "ABBRUCH: die Sperren-Waechter bleiben rot."; tail -20 /tmp/altlasten-sperren.log; exit 1; }
grep -E "^. (tests|pass|fail)" /tmp/altlasten-sperren.log | tr '\n' ' '; echo
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
git status --short
git commit -q -m "deploy(altlasten): zehn nachgeladene Module in den Offline-Vorrat, trainingCapture in config.js; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
for i in $(seq 1 40); do
  SWTXT=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM")
  V=$(printf '%s' "$SWTXT" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  ZEHN=$(printf '%s' "$SWTXT" | grep -c '/assets/anhang-tonspur.js')
  echo "$(date +%H:%M:%S)  sw=$V  neue-eintraege=$ZEHN  (erwartet $SW_NEU / 1)"
  if [ "$V" = "$SW_NEU" ] && [ "$ZEHN" -ge 1 ]; then
    echo
    echo "== 7. Gegenprobe live"
    FEHLT=0
    for m in kompakt deutsch-klartext erste-schritte chat-actions-woerter composer-zeile verlauf-unten code-feld-unten anhang-pdf-text anhang-office-text anhang-tonspur; do
      printf '%s' "$SWTXT" | grep -q "\"/assets/$m.js\"" || { echo "  FEHLT im Vorrat: $m.js"; FEHLT=1; }
    done
    [ "$FEHLT" -eq 0 ] && echo "  alle zehn Module stehen im Offline-Vorrat"
    # config.js kommt aus dem Precache — der neue Cache-Name holt sie frisch.
    for versuch in 1 2 3 4 5 6; do
      curl -s -m 15 "https://smejj.com/assets/config.js?n=$RANDOM" | grep -q 'trainingCapture' \
        && { echo "  trainingCapture steht in config.js"; break; }
      [ "$versuch" -eq 6 ] && echo "  OFFEN — config.js noch alt, spaeter nachsehen"
      sleep 5
    done
    echo
    echo "FERTIG — live: Service-Worker $SW_NEU."
    exit 0
  fi
  sleep 5
done
echo
echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

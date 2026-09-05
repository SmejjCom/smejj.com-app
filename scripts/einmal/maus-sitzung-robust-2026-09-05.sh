#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-05 (Abend): Maus ueberlebt Sitzungsverlust +
# Hell-Modus-Fix der Parallelsitzung — stempeln und ausliefern.
#
# BEFUND (live 05.09. abends, eigener Tab): der ferne Browser haelt hoechstens vier
# Sitzungen; die aelteste fliegt raus. Mit sieben Panel-Tabs plus Testlaeufen verlor
# die Maus mitten im Lauf ihre Sitzung, das Panel fiel in die eingebettete Ansicht
# ("Inhalt blockiert"), der Lauf endete mit "Maus gestoppt bei: Lesen: heading" ohne
# Grund — und der gelesene Wert war dem Modell nie zurueckgemeldet worden (es las die
# Ueberschrift zweimal). Fix: Sitzungs-Client gibt Fehler mit Grund zurueck, onLost
# verbindet zuerst live neu, die Maus baut ihre Sitzung selbst einmal neu auf,
# zwei Fehlschlaege sind erlaubt (Grund im Verlauf), gelesene Werte gehen zurueck.
#
# CODE IST COMMITTET: 89b90ad8 (Maus) + f06cbc20 (Hell-Modus, Parallelsitzung) +
# d2b965bc (app.js b140, SW v773). 139 + 60 Tests gruen, Marken/Assets/Precache gruen.
# Start-Lock (index.html, app.js, premium-surfaces.js, browser-pane.js, sw.js) braucht
# den Stempel per Doppelklick.
#
# SICHERHEITSNETZ: jede der 14 Dateien im Live-Repo muss BYTE-GLEICH mit dem Stand VOR
# beiden Aenderungen sein (26ab7a9f). Sonst steht dort fremde Arbeit — Abbruch.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="26ab7a9f"
CODE_COMMIT="d2b965bc"
DATEIEN=(index.html sw.js app.js browser-nachladen.js browser-pane-persistenz.js browser-pane.js browser-pane-maus.js browser-pane-session.js maus-absicht.js maus-panel.js sendepfad-nachladen.js premium-surfaces.js settings-surface.js settings-surface.css)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
git diff --quiet -- public tests || { echo "ABBRUCH: ungespeicherte Aenderungen in public/ oder tests/ (git status) — eine andere Sitzung arbeitet gerade."; exit 1; }

echo "== 1. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber Wof Kadavanich, 2026-09-05: 'Ich gebe dir alle Rechte. von A bis Z. Mach hundert Prozent fertig, lass nichts offen.' und 'wenn du fertig bist dann nochmal komplett testen.' Zwei Aenderungen: (1) Maus ueberlebt den Verlust der Live-Browser-Sitzung (der ferne Browser haelt vier Sitzungen, die aelteste fliegt raus) — Sitzungs-Client gibt Fehler mit Grund zurueck, onLost verbindet erst live neu statt einzubetten, die Maus baut die Sitzung einmal selbst neu auf, zwei Fehlschlaege erlaubt, gelesene Werte gehen zurueck ans Modell; (2) Hell-Modus-Fix der Parallelsitzung (Einstellungs-Navigation lesbar, f06cbc20). Marken der Browser-Kette, app.js b140, premium-surfaces b47u, Service-Worker smejj-shell-v773. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 2. Alle Waechter"
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock rot."; exit 1; }
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/browser-pane.test.mjs > /tmp/robust-kaskade-tests.log 2>&1 || { echo "ABBRUCH: Tests rot."; tail -30 /tmp/robust-kaskade-tests.log; exit 1; }
grep -E "^# (tests|pass|fail)" /tmp/robust-kaskade-tests.log | tr '\n' ' '; echo

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Maus-Sitzungsrobustheit + Hell-Modus 2026-09-05 — index.html, app.js b140, premium-surfaces.js, browser-pane.js, SW smejj-shell-v773 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR den Aenderungen pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$REPO" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && [ "$a" = "$c" ]; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
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
git commit -q -m "deploy(maus+hell-modus): Sitzungsverlust ueberleben, Fehlschlag mit Grund, gelesene Werte zurueck; Einstellungs-Navigation im Hell-Modus lesbar; SW v773 — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/browser-pane-maus.js" | cut -c1-16)
for i in $(seq 1 30); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-pane-maus.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  maus=$L  (erwartet v773 / $ERW)"
  if [ "$V" = "smejj-shell-v773" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker v773, browser-pane-maus.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

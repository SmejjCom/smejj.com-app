#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-06: die Maus sichtbar machen (Zeiger im
# Live-Browser) und den Lauf fluessig (Frist, Sekundenzaehler, bildloses
# Hinsehen) — stempeln und ausliefern.
#
# WAS DRIN IST (Betreiber-Auftrag 06.09.):
#   1  ZEIGER: Im Live-Browser faehrt ein Pfeil zum Ziel (400 ms), verweilt,
#      beim Klick erscheint ein Ring, beim Tippen ein Rahmen ums Feld, beim
#      Lesen ein gestrichelter; Scrollen und Laden zeigen eine kurze Marke.
#      Der ferne Browser meldet zu jeder Selektor-Aktion die Zielbox (Bauzweig
#      3dd71604, Zeabur baut ihn selbst).
#   2  FLUESSIG: Hinsehen ohne 150-KB-Bild, 20-s-Frist je Aktion mit sichtbarem
#      zweiten Versuch, Fortschrittszeile mit Sekundenzaehler, "Modell antwortet
#      nicht (502), zweiter Versuch", Zeitbilanz am Ende jedes Laufs.
# CODE: ddd3d1a3 + c8ba5e1e + 033dfe87 + 0a8e1411 (Arbeitszweig feature/design-v11).
# SICHERHEITSNETZ: alle 14 Dateien im Live-Repo byte-gleich mit dem Stand VOR
# der Aenderung (0e50ad9b, live SW v778).
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG="0e50ad9b"
CODE_COMMIT="0a8e1411"
SW_NEU="smejj-shell-v779"
DATEIEN=(browser-pane.js browser-pane-render.js browser-pane-session.js browser-pane-maus.js
  browser-stage.js browser-pane-fernwege.js maus-absicht.js maus-panel.js sendepfad-nachladen.js
  browser-nachladen.js browser-pane-persistenz.js app.js index.html sw.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
echo "== 0. Ausgangslage"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -q 'smejj.browser.zeiger' public/browser-stage.js || { echo "ABBRUCH: der Zeiger steht nicht in browser-stage.js."; exit 1; }
grep -q 'sendeMitFrist' public/browser-pane-maus.js || { echo "ABBRUCH: die Frist steht nicht in browser-pane-maus.js."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
# Nur die Dateien, die HIER ausgeliefert werden, muessen sauber sein — eine
# Parallelsitzung darf an anderen Dateien arbeiten.
for f in "${DATEIEN[@]}"; do
  git diff --quiet -- "public/$f" || { echo "ABBRUCH: public/$f hat ungespeicherte Aenderungen — eine andere Sitzung arbeitet daran."; exit 1; }
done

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/browser-stage.test.mjs tests/maus-absicht.test.mjs \
  tests/browser-pane-session-frist-zeiger.test.mjs tests/remote-browser-session.test.mjs \
  tests/browser-pane.test.mjs tests/maus-chrome-bruecke.test.mjs > /tmp/maus-zeiger-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/maus-zeiger-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/maus-zeiger-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-06: 'MAUS SICHTBAR MACHEN wie bei Claude/Codex: Im Live-Browser einen Zeiger zeichnen, der zum Ziel faehrt, dort kurz verweilt, beim Klick einen Ring zeigt und beim Tippen das Feld hervorhebt. Auch beim Scrollen und Navigieren eine kurze sichtbare Rueckmeldung. FLUESSIGKEIT: observe unter 3 s, Frist von 20 s je observe/act mit Wiederholung, Fortschrittszeile mit Sekundenzaehler statt stummem ueberlegt, Planer-502 sichtbar als Modell antwortet nicht, zweiter Versuch.' Umgesetzt: Zeiger, Ring, Feldrahmen, Scroll- und Ladehinweis in browser-stage.js (v6), Zeiger-Nachrichten und Frist im Sitzungs-Client, Ziel aus der eigenen Beobachtung, sendeMitFrist, Fortschrittsuhr und Zeitbilanz in browser-pane-maus.js, Zeilenschreiber ersetzt Zaehler-Zeilen. Marken gehoben: browser-pane-* 20260906-5, maus-absicht v28, maus-panel v22, sendepfad-nachladen v12, browser-nachladen v10, app.js b146, Service-Worker smejj-shell-v779. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Maus-Zeiger 2026-09-06 — browser-pane.js, browser-pane-render.js (stage v6), app.js b146, index.html, SW smejj-shell-v779 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
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
git commit -q -m "deploy(maus): sichtbarer Zeiger im Live-Browser, Frist je Aktion, Sekundenzaehler, bildloses Hinsehen; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$REPO/public/browser-stage.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/browser-stage.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  browser-stage=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo
    echo "== 7. Die Befunde live gegenpruefen"
    curl -s -m 15 "https://smejj.com/assets/browser-stage.js" | grep -q "smejj.browser.zeiger" \
      && echo "  Zeiger ok — die Buehne kennt die Zeiger-Nachricht" || echo "  Zeiger OFFEN — browser-stage.js ist alt"
    curl -s -m 15 "https://smejj.com/assets/browser-pane-maus.js" | grep -q "sendeMitFrist" \
      && echo "  Frist ok — browser-pane-maus.js ist live" || echo "  Frist OFFEN — browser-pane-maus.js ist alt"
    curl -s -m 15 "https://smejj.com/assets/browser-pane-render.js" | grep -q 'browser-stage.js?v=6' \
      && echo "  Marke ok — die Vorlage laedt die Buehne v6" || echo "  Marke OFFEN — Vorlage laedt noch v5"
    echo
    echo "FERTIG — live: Service-Worker $SW_NEU, browser-stage.js byte-gleich."
    exit 0
  fi
  sleep 5
done
echo
echo "OFFEN — gepusht, live noch nicht nachgezogen. Spaeter: curl -s https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*'"
exit 1

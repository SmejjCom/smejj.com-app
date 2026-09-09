#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-09: Chat-Bilder — Adressen parken,
# fehlende Bilder sichtbar ersetzen — stempeln und ausliefern.
#
# BEFUND (live 09.09., eigenes Browser-Panel): <img src="https://api.smejj.com/
# api/chat-medien?id=…"> wurde bei jedem Zeichnen von img-src blockiert, bevor
# rehydriereMedien auf blob: umschaltete (Konsole voll); ein Bild, das der
# Server nicht mehr hat, blieb ein kaputtes Bildsymbol.
# FIX: parkeMedienAdressen() vor dem Einfuegen, FEHLENDES_BILD als Ersatz.
set -uo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS_VOR_AENDERUNG=""
CODE_COMMIT="d25f7ea8"
SW_VORHER="smejj-shell-v824"
SW_NEU="smejj-shell-v806"
DATEIEN=(app.js arbeitsbereiche.js bedarf-nachladen.js chat-actions.js chat-history-cards.js chat-history-view.js chat-medien.js chat-store-bereiche.js chat-store.js chat-sync.js chat-title-auto.js code-flaeche.js code-nachladen.js erste-schritte.js erwaehnung.js index.html papierkorb.js pwa-schnellstart.js search-overlay.js search.js spur-start.js such-nachladen.js sw.js)
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools

# DER ARBEITSBAUM IM APP-ORDNER KANN AUF EINEM FREMDEN ZWEIG STEHEN (eine
# Parallelsitzung schaltete ihn am 06.09. 22:48 auf ox-alpha-server um).
# Darum arbeitet diese Kaskade in einem EIGENEN Worktree auf feature/design-v11.
cd "$REPO" || { echo "ABBRUCH: App-Ordner nicht erreichbar."; exit 1; }
WT="/private/tmp/claude-501/kaskade-design-v11"
git worktree remove --force "$WT" >/dev/null 2>&1 || true
git fetch -q origin feature/design-v11 || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
if git rev-parse --verify -q feature/design-v11 >/dev/null; then
  git worktree add -q "$WT" feature/design-v11 2>/dev/null || git worktree add -q --detach "$WT" feature/design-v11 || { echo "ABBRUCH: Worktree fuer feature/design-v11 nicht anlegbar."; exit 1; }
else
  git worktree add -q --detach "$WT" origin/feature/design-v11 || { echo "ABBRUCH: Worktree nicht anlegbar."; exit 1; }
fi
ln -sfn "$REPO/node_modules" "$WT/node_modules"
cd "$WT" || { echo "ABBRUCH: Worktree fehlt."; exit 1; }
echo "== 0. Ausgangslage (Worktree $WT)"
git log --oneline -1
git merge-base --is-ancestor "$CODE_COMMIT" HEAD || { echo "ABBRUCH: Code-Commit $CODE_COMMIT nicht im Zweig."; exit 1; }
grep -qF 'parkeMedienAdressen' public/chat-medien.js || { echo "ABBRUCH: das Parken der Medienadressen steht nicht in chat-medien.js."; exit 1; }
grep -q "$SW_NEU" public/sw.js || { echo "ABBRUCH: sw.js traegt nicht $SW_NEU."; exit 1; }
LIVE_SW=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live: $LIVE_SW"
[ "$LIVE_SW" = "$SW_VORHER" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER — Basis stimmt nicht mehr, Kaskade neu bauen lassen."; exit 1; }

echo "== 1. Waechter (vor dem Stempel)"
node scripts/check-markenkette.mjs || { echo "ABBRUCH: Markenkette rot."; exit 1; }
node scripts/build/sync-assets.mjs --check || { echo "ABBRUCH: assets/ nicht im Gleichklang."; exit 1; }
node scripts/check-precache-imports.mjs || { echo "ABBRUCH: Precache unvollstaendig."; exit 1; }
node --test tests/browser-pane-maus.test.mjs tests/browser-pane.test.mjs tests/maus-absicht.test.mjs tests/maus-entscheidung-reparatur.test.mjs > /tmp/maus-schrittgrenze-kaskade.log 2>&1 \
  || { echo "ABBRUCH: die Tests zu dieser Auslieferung sind rot."; tail -30 /tmp/maus-schrittgrenze-kaskade.log; exit 1; }
grep -E "pass |fail " /tmp/maus-schrittgrenze-kaskade.log | tr '\n' ' '; echo

echo "== 2. Start-Lock stempeln (Betreiber-Wortlaut)"
node scripts/check-start-lock.mjs --freeze --confirm "Betreiber, 2026-09-09: checke nochmal und verbessere. Live-Befund: Chat-Bilder wurden bei jedem Zeichnen erst von der Sicherheitsrichtlinie blockiert (Konsole voll), ein fehlendes Bild blieb ein kaputtes Symbol. Umgesetzt: Serveradressen vor dem Einfuegen parken, fehlende Bilder mit sichtbarem Ersatz (chat-medien.js, chat-store.js), Marken bis zur Wurzel, Service-Worker smejj-shell-v806. Stempel per Doppelklick im Finder." \
  || { echo "ABBRUCH: Stempel fehlgeschlagen."; exit 1; }

echo "== 3. Stempel committen und pushen"
git add docs/frontend/start-lock-manifest.json
if git diff --cached --quiet; then echo "(Manifest unveraendert)"; else
  git commit -q -m "chore(start-lock): Stempel Chat-Medien parken 2026-09-09 — chat-medien.js, chat-store.js, app.js, index.html, SW smejj-shell-v791 (Betreiber-Doppelklick)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Commit fehlgeschlagen."; exit 1; }
fi
node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock bleibt rot."; exit 1; }
git push -q origin HEAD:feature/design-v11 || echo "(Push des Arbeitszweigs spaeter nachholen)"
git log --oneline -1
QUELLE=$(git rev-parse --short HEAD)

echo "== 4. Live-Repo gegen den Stand VOR der Aenderung pruefen"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  a=$(git -C "$WT" show "$BASIS_VOR_AENDERUNG:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
  if [ "$a" = "$b" ] && { [ -z "$c" ] || [ "$a" = "$c" ]; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nicht ueberschreiben."; exit 1; }

echo "== 5. Kopieren, committen, Fast-Forward-Push auf main"
git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  cp "$WT/public/$f" "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ -f "$KLON/assets/$f" ]; then cp "$WT/public/$f" "$KLON/assets/$f" && git add "assets/$f"; fi
done
git status --short | head -40
git commit -q -m "deploy(chat-medien): Bildadressen geparkt, Ersatz fuer fehlende Bilder; SW $SW_NEU — Quelle smejj.com-app $QUELLE" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push fehlgeschlagen."; exit 1; }
echo "gepusht: $(git rev-parse --short HEAD)"

echo "== 6. Live-Beweis (GitHub Pages braucht bis zu zwei Minuten)"
ERW=$(shasum -a 256 "$WT/public/chat-medien.js" | cut -c1-16)
for i in $(seq 1 40); do
  V=$(curl -s -m 15 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  L=$(curl -s -m 15 "https://smejj.com/assets/chat-medien.js?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  echo "$(date +%H:%M:%S)  sw=$V  chat-medien=$L  (erwartet $SW_NEU / $ERW)"
  if [ "$V" = "$SW_NEU" ] && [ "$L" = "$ERW" ]; then
    echo; echo "FERTIG — live: Service-Worker $SW_NEU, browser-pane-maus.js byte-gleich."; exit 0
  fi
  sleep 5
done
echo; echo "OFFEN — gepusht, live noch nicht nachgezogen."; exit 1

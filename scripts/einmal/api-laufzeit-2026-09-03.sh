#!/bin/zsh
# smejj.com — Betreiber-Kaskade 2026-09-03: API-Schluessel mit waehlbarer Laufzeit ausliefern
# (Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkt 2).
#
# Was schon passiert ist (ohne Klick):
#   * Server: Laufzeit-Feld, 401 api_key_expired, Cache-Deckel — Commit dfe41f7c, im Bauzweig
#     als 63c6c35f gepusht, Zeabur baut smejj-control daraus. 26/26 API-Tests gruen.
#   * Oberflaeche: Laufzeit-Auswahl (Vorauswahl 1 Jahr, unbefristet nur nach Rueckfrage),
#     Ablaufdatum in der Liste, gelb 14 Tage vorher, rot bei Abgelaufen; 15 Texte in 14 Sprachen;
#     Marken api-center-surface v11 / entwickler.js v14 / settings-surface b57 — Commit e6cb439c
#     auf dem Zweig feature/api-laufzeit (Worktree /private/tmp/claude-501/api-laufzeit).
#
# Was dieser Klick tut: Zweig in design-v11 mergen -> die drei GESPERRTEN Kettenglieder
# (premium-surfaces -> app.js -> index.html) zur Laufzeit hochziehen -> SW +1 -> assets ->
# Start-Lock stempeln -> Pruefungen -> Commit -> Frontend-Klon (live) -> Bauzweig (Ein-Buendel-
# Vertrag: nur public/, docs/frontend, tests/) -> Live-Beweis.
#
# Rollback: git revert des Deploy-Commits im Klon (~/smejj-app-frontend) und des
# Auslieferungs-Commits im Bauzweig; in design-v11 git revert -m 1 des Merge-Commits.
set -euo pipefail
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
KLON="$HOME/smejj-app-frontend"
BAUZWEIG="feature/auth-redesign-github-magiclink"
ZWEIG="feature/api-laufzeit"
FREIGABE="Betreiber Wof Kadavanich, 2026-09-03 (Doppelklick): API-Schluessel bekommen eine waehlbare Laufzeit (30 Tage bis 30 Jahre oder unbefristet, Vorauswahl 1 Jahr), die Liste zeigt das Ablaufdatum; dafuer Marken api-center-surface v11, entwickler.js v14, settings-surface b57 und die drei Kettenglieder darueber, Service-Worker-Cache +1. Grundlage: Beschluss 2026-09-03 (docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md) und 'Laufzeit bauen'."

cd "$REPO"
echo "== 0. Ausgangslage"
git log --oneline -1
BR=$(git branch --show-current)
[ "$BR" = "feature/design-v11" ] || { echo "ABBRUCH: Arbeitskopie steht auf '$BR', nicht auf feature/design-v11."; exit 1; }
git rev-parse --verify -q "$ZWEIG" >/dev/null || { echo "ABBRUCH: Zweig $ZWEIG fehlt."; exit 1; }
git merge-base --is-ancestor e6cb439c "$ZWEIG" || { echo "ABBRUCH: Oberflaechen-Commit e6cb439c liegt nicht auf $ZWEIG."; exit 1; }
# Fremde, ungesicherte Arbeit an Kettendateien darf nicht mit in den Stempel rutschen.
DIRTY=$(git status --porcelain -- public/index.html public/app.js public/premium-surfaces.js public/settings-surface.js public/entwickler.js public/entwickler.html public/api-center-surface.js public/i18n public/sw.js docs/frontend | wc -l | tr -d ' ')
if [ "$DIRTY" != "0" ]; then
  git status --short -- public docs/frontend | head -20
  echo "ABBRUCH: Eine andere Sitzung hat ungesicherte Aenderungen an Kettendateien. Erst DEREN Kaskade klicken (z. B. 'Office lesen ausliefern'), dann diese hier noch einmal."
  exit 1
fi
BASIS=$(git rev-parse HEAD)

echo "== 1. Zweig $ZWEIG in design-v11 mergen"
if ! git merge -q --no-ff "$ZWEIG" -m "merge(api): Laufzeit fuer API-Schluessel ($ZWEIG: Server dfe41f7c, Oberflaeche e6cb439c)"; then
  git merge --abort || true
  echo "ABBRUCH: Merge-Konflikt. design-v11 ist seit dem Zweig weitergelaufen — bitte diese Ausgabe in den Chat kopieren."
  exit 1
fi
git log --oneline -1

echo "== 2. Gesperrte Kettenglieder hochziehen (premium-surfaces -> app.js -> index.html)"
node scripts/einmal/api-laufzeit-marken-2026-09-03.cjs
node scripts/check-markenkette.mjs | tail -1

echo "== 3. Service-Worker-Cache +1 (gemessen am Live-Stand)"
LIVE=$(curl -s -m 20 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1 | tr -dc '0-9')
[ -n "$LIVE" ] || { echo "ABBRUCH: Live-SW-Version nicht lesbar."; exit 1; }
LOKAL=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1 | tr -dc '0-9')
NEXT=$(( (LIVE > LOKAL ? LIVE : LOKAL) + 1 ))
sed -i '' "s/const CACHE_NAME = \"smejj-shell-v[0-9]*\";/const CACHE_NAME = \"smejj-shell-v${NEXT}\";/" public/sw.js
grep -n "const CACHE_NAME" public/sw.js

echo "== 4. assets nachziehen, Start-Lock stempeln, Pruefungen"
npm run -s build:assets | tail -1
node scripts/check-markenkette.mjs | tail -1
node scripts/check-start-lock.mjs --freeze --confirm "$FREIGABE" | tail -1
npm run -s check:start-lock | tail -1
npm run -s check:auslieferung-lock | tail -1
npm run -s check:favicon-lock | tail -1
npm run -s check:modul-syntax | tail -1
node scripts/check-precache-imports.mjs | tail -1
node --test tests/api-laufzeit.test.mjs tests/i18n-ui.test.mjs tests/oeffentliche-api.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs tests/frontend-structure.test.mjs tests/modul-einmal-instanz.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' '; echo
node --test tests/api-laufzeit.test.mjs tests/i18n-ui.test.mjs tests/oeffentliche-api.test.mjs tests/assets-sync.test.mjs tests/module-queries.test.mjs tests/frontend-structure.test.mjs tests/modul-einmal-instanz.test.mjs 2>&1 | grep -q "^ℹ fail 0" || { echo "ABBRUCH: Tests rot — nichts wird gestempelt ausgeliefert. Bitte Ausgabe in den Chat kopieren."; exit 1; }

echo "== 5. Commit design-v11 (nur verfolgte Dateien unter public/ und docs/frontend)"
git add -u public docs/frontend
git commit -q -m "feat(api-bereich): Laufzeit fuer API-Schluessel live — Kettenglieder premium-surfaces/app.js/index.html hochgezogen, SW smejj-shell-v${NEXT}, Start-Lock gestempelt (Betreiber-Doppelklick 2026-09-03)"
QUELLE=$(git rev-parse --short HEAD); echo "design-v11 $QUELLE (Basis $(git rev-parse --short "$BASIS"))"

echo "== 6. Live stellen (Frontend-Klon, Fast-Forward) — Wurzel UND assets/"
cd "$KLON"
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main && git merge -q --ff-only origin/main || true
for f in $(cd "$REPO" && git diff --name-only "$BASIS" "$QUELLE" -- public | grep -v '^public/assets/' | sed 's|^public/||'); do
  mkdir -p "$KLON/$(dirname "$f")" "$KLON/assets/$(dirname "$f")"
  cp "$REPO/public/$f" "$KLON/$f"; cp "$REPO/public/$f" "$KLON/assets/$f"
done
git add -A && git commit -q -m "deploy(api-bereich): Laufzeit fuer API-Schluessel (api-center-surface v11, entwickler v14), SW v${NEXT} — Quelle smejj.com-app $QUELLE"
git merge-base --is-ancestor origin/main HEAD && git push -q origin HEAD:main
echo "Klon $(git rev-parse --short HEAD) gepusht"

echo "== 7. Ein-Buendel-Vertrag: dieselben Dateien in den Bauzweig (nur public/, docs/frontend, tests/)"
cd "$REPO"
git fetch -q origin "$BAUZWEIG"
WT=$(mktemp -d /tmp/smejj-bauzweig.XXXXXX)
git worktree add -q --detach "$WT" "origin/$BAUZWEIG"
(
  cd "$WT"
  git checkout "$QUELLE" -- $(cd "$REPO" && git diff --name-only "$BASIS" "$QUELLE" -- public docs/frontend tests | tr '\n' ' ')
  git diff --cached --quiet -- src control-server || { echo "ABBRUCH: src/ oder control-server/ waere betroffen"; exit 1; }
  git commit -q -m "chore(auslieferung): Laufzeit fuer API-Schluessel (Oberflaeche) + SW v${NEXT} aus design-v11 $QUELLE (nur public/, docs/frontend, tests/)"
  git push -q origin "HEAD:$BAUZWEIG"
  echo "Bauzweig $(git rev-parse --short HEAD) gepusht — Zeabur baut"
)
git worktree remove --force "$WT"
git push -q origin feature/design-v11 || true

echo "== 8. Live-Beweis (bis 3 Minuten)"
for i in $(seq 1 18); do
  v=$(curl -s -m 15 https://smejj.com/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
  e=$(curl -s -m 15 'https://smejj.com/assets/entwickler.js?v=14' | grep -c 'api-center-surface.js?v=11' || true)
  a=$(curl -s -m 15 'https://smejj.com/assets/api-center-surface.js?v=11' | grep -c 'data-ac-laufzeit' || true)
  h=$(curl -s -m 15 https://smejj.com/entwickler.html | grep -c 'entwickler.js?v=14' || true)
  echo "$(date +%H:%M:%S) smejj.com=$v entwickler=$e laufzeit=$a seite=$h"
  if [ "$v" = "smejj-shell-v${NEXT}" ] && [ "$e" -ge 1 ] && [ "$a" -ge 1 ] && [ "$h" -ge 1 ]; then
    echo "FERTIG — Laufzeit-Auswahl live (smejj.com v${NEXT}). Auf https://smejj.com/entwickler.html: 'Schlüssel erstellen' zeigt jetzt das Feld Laufzeit."
    exit 0
  fi
  sleep 10
done
echo "Noch nicht live — in 5 Minuten erneut pruefen."
exit 1

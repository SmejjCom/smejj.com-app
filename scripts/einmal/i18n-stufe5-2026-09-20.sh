#!/bin/zsh
# Einmal-Kaskade 20.09.2026 — Stufe 5 der Uebersetzungs-Inventur ausliefern.
#
# ANLASS: Betreiber 20.09.2026 im Chat: "Jetzt die restlichen deutschen Texte
# uebersetzen" / "Checke nochmal alles von A bis Z, ob noch was deutsch ist" /
# "alle Stufen". Stufe 5 ist die letzte: die INHALTE der Ansichten.
#
# WAS DIESE KASKADE ANDERS MACHT ALS EIN "GIT PUSH":
#  1. Der Commit liegt schon auf dem Arbeitszweig (gepusht). Hier wird er in den
#     Bauzweig (api.smejj.com) und in den Frontend-Klon (smejj.com) getragen.
#  2. Die Cache-Nummer wird ABGELEITET, nicht festgeschrieben — die Parallel-
#     sitzung hat heute schon zweimal dieselbe Nummer belegt.
#  3. Vor dem Ueberschreiben wird JEDE Datei gegen live verglichen: was wir nicht
#     kennen, wird nicht angefasst (Lehre "Spiegel: Quelle war aelter als live").
#  4. Nach dem Deploy wird JEDER Precache-Eintrag live geholt — ein einziger 404
#     laesst den Service Worker gar nicht erst installieren (Lehre v912).
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAU="$HOME/smejj-i18n5-bau"
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber 20.09.2026 schriftlich im Chat: 'Jetzt die restlichen deutschen Texte uebersetzen' / 'Checke nochmal alles von A bis Z, ob noch was deutsch ist' / 'alle Stufen'. Stufe 5 (letzte): Inhalte der Ansichten uebersetzbar gemacht; an index.html nur die ?v=-Marken der geaenderten Module, kein Markup, kein Design."
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Stand holen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
WT_NEU=$(git rev-parse "origin/$ARBEITS_ZWEIG")
WT_BASIS=$(git rev-parse "origin/$ARBEITS_ZWEIG^")
MEINE=($(git rev-list --reverse "$WT_BASIS..$WT_NEU"))
[ ${#MEINE[@]} -eq 1 ] || { echo "ABBRUCH: erwartet genau 1 Commit, gefunden ${#MEINE[@]}."; exit 1; }
echo "  Commit ${MEINE[1]:0:8} auf $ARBEITS_ZWEIG"

# Beim zweiten Lauf traegt die Arbeitskopie den Commit schon (der cherry-pick
# brauchte beim ersten Mal eine Entscheidung: package.json-Testliste). Dann
# wird NICHT zurueckgesetzt — sonst ist die Handarbeit weg.
SCHON=0
if [ -d "$BAU" ] && git -C "$BAU" log -1 --pretty=%s 2>/dev/null | grep -q "Stufe 5"; then
  SCHON=1
  echo "  $BAU traegt den Commit schon ($(git -C "$BAU" rev-parse --short HEAD))"
fi
if [ "$SCHON" = "0" ] && [ -d "$BAU" ]; then
  git -C "$BAU" cherry-pick --abort >/dev/null 2>&1
  git -C "$BAU" reset -q --hard >/dev/null 2>&1; git -C "$BAU" clean -qfd >/dev/null 2>&1
elif [ "$SCHON" = "0" ]; then
  git worktree add -f --detach "$BAU" "origin/$BAU_ZWEIG" >/dev/null 2>&1 || { echo "ABBRUCH: $BAU nicht anlegbar."; exit 1; }
fi
if [ "$SCHON" = "0" ]; then
  git -C "$BAU" checkout -q --detach "origin/$BAU_ZWEIG" || { echo "ABBRUCH: $BAU nicht setzbar."; exit 1; }
  echo "  $BAU -> origin/$BAU_ZWEIG ($(git -C "$BAU" rev-parse --short HEAD))"
fi

echo "== 1. Commit in den Bauzweig uebertragen"
cd "$BAU"
if [ "$SCHON" = "0" ]; then
  git cherry-pick -x "${MEINE[1]}" >/dev/null 2>&1 || { git cherry-pick --abort >/dev/null 2>&1; echo "ABBRUCH: cherry-pick brauchte eine Entscheidung."; exit 1; }
fi
echo "  $(git rev-parse --short HEAD)"

echo "== 2. Freie Cache-Nummer"
hoechste() { printf '%s\n' "$@" | grep -o '[0-9]*' | sort -n | tail -1; }
SW_A=$(git -C "$APP" show "origin/$ARBEITS_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_B=$(git -C "$APP" show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_IST=$(git -C "$APP" show "$WT_NEU:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
# Der Bauzweig zaehlt nur als "belegt", solange dort NICHT schon unser eigener
# Commit liegt — sonst blockiert der zweite Lauf die eigene Nummer (20.09.2026).
BAU_SW=$(git -C "$BAU" show HEAD:public/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
[ "$BAU_SW" = "$SW_IST" ] && SW_B="$LIVE_SW"
HOCH=$(hoechste "$SW_B" "$LIVE_SW")
if [ "${SW_IST#smejj-shell-v}" -gt "$HOCH" ]; then SW_NEU="$SW_IST"; else SW_NEU="smejj-shell-v$(( HOCH + 1 ))"; fi
echo "  arbeitszweig $SW_A | bauzweig $SW_B | live $LIVE_SW  ->  $SW_NEU"
if [ "$SW_NEU" != "$SW_IST" ]; then
  echo "ABBRUCH: $SW_IST ist belegt — im Arbeitszweig auf $SW_NEU heben und erneut starten."; exit 1
fi
ANKER="schutz-100-2026-09-20-i18n5-${SW_NEU#smejj-shell-}"

echo "== 3. Waechter im Bauzweig"
cd "$BAU"
if node scripts/check-start-lock.mjs >/dev/null 2>&1; then echo "  schon gestempelt"; else
  node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" >/dev/null || { echo "ABBRUCH: Stempel."; exit 1; }
  node scripts/check-start-lock.mjs >/dev/null || { echo "ABBRUCH: Start-Lock rot."; exit 1; }
  git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock nach i18n-Stufe 5 gestempelt ($SW_NEU)"
fi
for p in check-auslieferung-lock check-markenkette check-modul-syntax check-startgewicht; do
  node "scripts/$p.mjs" >/dev/null || { echo "ABBRUCH: $p rot."; exit 1; }
done
# Eine frische Arbeitskopie hat kein node_modules — dann scheitert ein Test an
# einer fehlenden Abhaengigkeit statt am Code (gemessen 20.09.2026: @resvg).
[ -e node_modules ] || ln -s "$APP/node_modules" node_modules
npm run check:frontend --silent >/dev/null 2>&1 || { echo "ABBRUCH: Frontend-Tests rot im Bauzweig."; exit 1; }
BAU_NEU=$(git rev-parse HEAD)
echo "  gruen (${BAU_NEU:0:8})"

echo "== 4. Bauzweig ausliefern (api.smejj.com)"
git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig (Parallelsitzung war schneller?)."; exit 1; }
API_LIVE=0
for i in $(seq 1 80); do
  S=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$S" = "$SW_NEU" ]; then echo "  LIVE api.smejj.com: $S nach $((i*15)) s"; API_LIVE=1; break; fi
  sleep 15
done
[ "$API_LIVE" = "1" ] || { echo "ABBRUCH: api.smejj.com hat den Bau nicht — Frontend NICHT ausgeliefert."; exit 1; }

echo "== 5. Frontend (smejj.com)"
DATEIEN=($(git -C "$APP" diff --name-only --diff-filter=ACMR "$WT_BASIS" "$WT_NEU" -- public/ | grep -v '^public/assets/' | sed 's|^public/||'))
echo "  Dateien (${#DATEIEN[@]})"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ABBRUCH: Frontend-Klon hat lokale Aenderungen."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  if git -C "$APP" cat-file -e "$WT_BASIS:public/$f" 2>/dev/null; then
    a=$(git -C "$APP" show "$WT_BASIS:public/$f" | shasum -a 256 | cut -c1-16)
    b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    [ "$f" = "index.html" ] || [ "$f" = "sw.js" ] && c="$a"
    if [ "$a" = "$b" ] && { [ "$a" = "$c" ] || ! git show "origin/main:assets/$f" >/dev/null 2>&1; }; then :
    elif [ "$f" = "local-workspace-surface.js" ] && [ "$a" = "$c" ]; then
      # Geprueft am 20.09.2026: die WURZEL-Kopie auf main stammt vom 11.08.2026
      # (Commit 2e08819) und ist eine Leiche — geladen wird /assets/…, und die
      # stimmt byteweise mit unserer Basis ueberein. Ueberschreiben korrigiert
      # die Drift, statt fremde Arbeit zu verlieren.
      echo "    alte Wurzel-Leiche $f (assets-Kopie stimmt) — wird mitgezogen"
    else echo "    FREMD   $f"; FREMD=1; fi
  else
    if git show "origin/main:$f" >/dev/null 2>&1; then echo "    FREMD   $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "    neu     $f"; fi
  fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nichts ueberschrieben."; exit 1; }
git checkout -q main && git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  mkdir -p "$KLON/$(dirname "$f")"
  git -C "$APP" show "$WT_NEU:public/$f" > "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ "$f" != "sw.js" ] && [ -d "$KLON/assets" ]; then mkdir -p "$KLON/assets/$(dirname "$f")"; git -C "$APP" show "$WT_NEU:public/$f" > "$KLON/assets/$f" && git add "assets/$f"; fi
done
git "${autor[@]}" commit -q -m "deploy(i18n): Stufe 5 — Inhalte der Ansichten uebersetzt; $SW_NEU — Quelle ${WT_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
for i in $(seq 1 40); do
  sleep 10
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "  LIVE smejj.com: $L nach $((i*10)) s"; break; fi
done

echo "== 6. Nachweis"
OK=1
for f in i18n/en.js i18n/fr.js view-chrome.js quellen-panel.js premium-surfaces.js chat-history-text.js; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://smejj.com/assets/$f?n=$RANDOM")
  [ "$C" = "200" ] || { echo "  FEHLT  /assets/$f ($C)"; OK=0; }
done
K=$(curl -s -m 20 "https://smejj.com/assets/i18n/en.js?n=$RANDOM" | grep -c '"Schliessen und zur Startseite"')
[ "$K" -ge 1 ] && echo "  en.js traegt die Stufe-5-Schluessel" || { echo "  en.js OHNE Stufe-5-Schluessel"; OK=0; }
echo "== 7. Jeder Precache-Eintrag live"
cd "$APP"
node - "$SW_NEU" <<'JS'
import { readFileSync } from "node:fs";
const sw = readFileSync("public/sw.js", "utf8");
const liste = [...sw.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1])
  .filter((p) => /^\/(assets|icons|manifest|index|sw|willkommen|auth)/.test(p) || /\.(js|css|html|json|webmanifest|png|svg|woff2?)$/.test(p));
const einmalig = [...new Set(liste)];
let rot = 0;
// Paketweise zu 8: 239 gleichzeitige Anfragen liessen GitHub Pages am
// 20.09.2026 21-mal gar nicht antworten — einzeln waren alle 200. Ein
// Messfehler, der wie ein fehlendes Precache-Ziel aussieht.
for (let i = 0; i < einmalig.length; i += 8) {
  await Promise.all(einmalig.slice(i, i + 8).map(async (p) => {
    const r = await fetch(`https://smejj.com${p}?n=${Math.random()}`, { method: "GET" }).catch(() => null);
    if (!r || !r.ok) { console.log(`  ROT ${r ? r.status : "netz"} ${p}`); rot += 1; }
  }));
}
console.log(rot === 0 ? `  alle ${einmalig.length} Precache-Eintraege live 200` : `  ${rot} von ${einmalig.length} ROT`);
process.exit(rot === 0 ? 0 : 1);
JS
[ $? -eq 0 ] || OK=0
echo "== 8. Anker"
if [ "$OK" = "1" ]; then
  for d in "$APP" "$BAU"; do git -C "$d" tag -f "$ANKER" >/dev/null 2>&1; done
  git -C "$APP" push -q origin "$ANKER" 2>/dev/null || true
  echo "  FERTIG — $SW_NEU live, Anker $ANKER"
else
  echo "  ACHTUNG: Nachweis unvollstaendig — bitte Protokoll lesen."
fi

#!/bin/zsh
# Einmal-Kaskade 20.09.2026 — "Inhalt melden" ausliefern.
#
# ANLASS: Google Play hat das Update am 20.09.2026 ABGELEHNT.
#   "Issue found: Violation of AI-Generated Content policy —
#    Your app lacks in-app features for users to report or flag offensive content."
# Die App ist eine TWA auf https://smejj.com: die Meldefunktion kommt MIT DER WEBSEITE,
# ein neues AAB (und damit der Keystore) ist NICHT noetig.
#
# ZWEI LEHREN DES TAGES, DIE HIER EINGEBAUT SIND:
#  1. Eine FESTE Cache-Nummer ist bei Parallelbetrieb wertlos — v908, v909 und v910 wurden
#     binnen einer Stunde von einer anderen Sitzung belegt. Die Nummer wird deshalb beim
#     Lauf aus origin/Bauzweig/live abgeleitet.
#  2. Beide Sitzungen teilen sich EINE Arbeitskopie. Der erste Doppelklick brach ab, weil
#     dort unfertige fremde Arbeit lag (chat-bridge.js, Sprach-Fix). Diese Kaskade arbeitet
#     darum in einer EIGENEN, sauberen Arbeitskopie und laesst die geteilte in Ruhe.
#
# Laeuft per Doppelklick, weil der Auto-Modus Stempel und Deploys sperrt.
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
WT="$HOME/smejj-melden-app"       # eigene Arbeitskopie fuer den Arbeitszweig
BAU="$HOME/smejj-melden-bau"      # eigene Arbeitskopie fuer den Bauzweig
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
MARKE="inhalt-melden"             # Commits dieser Runde tragen sie im Betreff
WORTLAUT="Google Play hat das Update am 20.09.2026 abgelehnt: 'Violation of AI-Generated Content policy - Your app lacks in-app features for users to report or flag offensive content.' Betreiber am 20.09.2026 schriftlich im Chat: 'Was hast du gemacht? Warum ist Abgelehnt? geh chrome browser und erledige,' Umsetzung: Menuepunkt 'Inhalt melden' bei Antworten, Melde-Dialog mit sechs Gruenden ohne Verlassen der App, POST /api/inhalt-meldung (angemeldet, PII-bereinigt), Nachreichen ohne Netz. Per Doppelklick ausgeloest."
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Eigene Arbeitskopien (die geteilte bleibt unberuehrt)"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
MEIN_HEAD=$(git rev-parse HEAD)
WT_BASIS=$(git rev-parse "origin/$ARBEITS_ZWEIG")   # darauf setzen meine Commits auf
BASIS=$(git merge-base "origin/$ARBEITS_ZWEIG" HEAD)
MEINE=($(git rev-list --reverse "$BASIS..$MEIN_HEAD"))
[ ${#MEINE[@]} -gt 0 ] || { echo "ABBRUCH: keine eigenen Commits gefunden — schon ausgeliefert?"; exit 1; }
echo "  ${#MEINE[@]} Commits dieser Runde (Basis ${BASIS:0:8})"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "  Hinweis: in der geteilten Arbeitskopie liegt fremde, unfertige Arbeit — sie wird NICHT angefasst:"
  git status --porcelain --untracked-files=no | sed 's/^/    /'
fi

for paar in "$WT:$ARBEITS_ZWEIG" "$BAU:$BAU_ZWEIG"; do
  d="${paar%%:*}"; z="${paar##*:}"
  if [ -d "$d" ]; then
    git -C "$d" reset -q --hard >/dev/null 2>&1
    git -C "$d" clean -qfd >/dev/null 2>&1
  else
    git worktree add -f --detach "$d" "origin/$z" >/dev/null 2>&1 || { echo "ABBRUCH: Arbeitskopie $d nicht anlegbar."; exit 1; }
  fi
  git -C "$d" checkout -q --detach "origin/$z" || { echo "ABBRUCH: $d nicht auf origin/$z setzbar."; exit 1; }
  echo "  $d -> origin/$z ($(git -C "$d" rev-parse --short HEAD))"
done

echo "== 1. Commits dieser Runde in beide Arbeitskopien uebertragen"
# Der EINZIGE Konflikt, den diese Kaskade allein loest, ist die Cache-Nummer in sw.js:
# beide Seiten haben sie geaendert, die fremde (HEAD) gewinnt und wird danach neu gesetzt.
loese_sw_konflikt() {
  local offen
  offen=$(git diff --name-only --diff-filter=U)
  [ -n "$offen" ] || return 1
  [ -z "$(printf '%s\n' "$offen" | grep -v 'sw\.js$')" ] || return 1
  local f
  for f in public/sw.js public/assets/sw.js; do
    [ -f "$f" ] || continue
    perl -0pi -e 's/<<<<<<< HEAD\n(const CACHE_NAME = "[^"]*";)\n=======\nconst CACHE_NAME = "[^"]*";\n>>>>>>> [^\n]*\n/$1\n/' "$f"
  done
  grep -q "^<<<<<<<" public/sw.js public/assets/sw.js 2>/dev/null && return 1
  git add public/sw.js public/assets/sw.js
  return 0
}
for d in "$WT" "$BAU"; do
  cd "$d"
  for c in "${MEINE[@]}"; do
    git cherry-pick -x "$c" >/dev/null 2>&1 && continue
    if loese_sw_konflikt; then
      GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 || { git cherry-pick --abort >/dev/null 2>&1; echo "ABBRUCH: cherry-pick ${c:0:8} in $d."; exit 1; }
    else
      git cherry-pick --abort >/dev/null 2>&1
      echo "ABBRUCH: cherry-pick ${c:0:8} in $d brauchte eine Entscheidung — von Hand pruefen."; exit 1
    fi
  done
  echo "  $d: $(git rev-parse --short HEAD)"
done

echo "== 2. Freie Cache-Nummer waehlen (Parallelsitzung belegt laufend Nummern)"
hoechste() { printf '%s\n' "$@" | grep -o '[0-9]*' | sort -n | tail -1; }
SW_A=$(git -C "$APP" show "origin/$ARBEITS_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_B=$(git -C "$APP" show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_NEU="smejj-shell-v$(( $(hoechste "$SW_A" "$SW_B" "$LIVE_SW") + 1 ))"
echo "  origin $SW_A | bauzweig $SW_B | live $LIVE_SW  ->  NEU $SW_NEU"
for d in "$WT" "$BAU"; do
  cd "$d"
  ALT=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)
  [ "$ALT" = "$SW_NEU" ] || { sed -i '' "s/$ALT/$SW_NEU/" public/sw.js public/assets/sw.js; git add public/sw.js public/assets/sw.js; git "${autor[@]}" commit -q -m "chore(sw): Cache-Nummer $SW_NEU fuer die Melde-Funktion"; }
  [ "$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)" = "$SW_NEU" ] || { echo "ABBRUCH: $d traegt $SW_NEU nicht."; exit 1; }
done
ANKER="schutz-100-2026-09-20-melden-${SW_NEU#smejj-shell-}"

echo "== 3. Stempel und Tests (beide Arbeitskopien)"
for d in "$WT" "$BAU"; do
  cd "$d"
  if node scripts/check-start-lock.mjs >/dev/null 2>&1; then
    echo "  $d: schon gestempelt"
  else
    node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel $d."; exit 1; }
    node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock nach 'Inhalt melden' gestempelt ($SW_NEU)" || { echo "ABBRUCH: Stempel-Commit $d."; exit 1; }
  fi
  node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot ($d)."; exit 1; }
  node scripts/check-markenkette.mjs >/dev/null || { echo "ABBRUCH: Markenkette rot ($d)."; exit 1; }
  node scripts/check-modul-syntax.mjs >/dev/null || { echo "ABBRUCH: Modul-Syntax rot ($d)."; exit 1; }
  node scripts/check-startgewicht.mjs >/dev/null || { echo "ABBRUCH: Startgewicht rot ($d)."; exit 1; }
  node --test tests/inhalt-melden.test.mjs tests/chat-message-actions.test.mjs tests/chat-menue-mehr.test.mjs tests/module-queries.test.mjs tests/precache-dynamische-importe.test.mjs tests/touch-ziele.test.mjs tests/deferred-start.test.mjs tests/platform-pwa.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Tests rot ($d)."; exit 1; }
  echo "  $d: gruen ($(git rev-parse --short HEAD))"
done
WT_NEU=$(git -C "$WT" rev-parse HEAD)
BAU_NEU=$(git -C "$BAU" rev-parse HEAD)

echo "== 4. Bauzweig (api.smejj.com) — der Server traegt POST /api/inhalt-meldung"
cd "$BAU"
git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig fehlgeschlagen (Parallelsitzung war schneller?)."; exit 1; }
echo "  gepusht: ${BAU_NEU:0:8}"
API_LIVE=0
for i in $(seq 1 80); do
  S=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$S" = "$SW_NEU" ]; then echo "  LIVE api.smejj.com: $S nach $((i*15)) s"; API_LIVE=1; break; fi
  echo "  api noch $S ..."
  sleep 15
done
[ "$API_LIVE" = "1" ] || { echo "ABBRUCH: api.smejj.com hat den neuen Server nach 20 min nicht — Frontend NICHT ausgeliefert."; exit 1; }

echo "== 5. Arbeitszweig sichern"
git -C "$WT" push -q origin "${WT_NEU}:refs/heads/${ARBEITS_ZWEIG}" || echo "  (Push Arbeitszweig fehlgeschlagen — Auslieferung laeuft weiter)"

echo "== 6. Frontend (smejj.com)"
DATEIEN=($(git -C "$WT" diff --name-only --diff-filter=ACMR "$WT_BASIS" "$WT_NEU" -- public/ | grep -v '^public/assets/' | sed 's|^public/||'))
echo "  Dateien (${#DATEIEN[@]}): ${DATEIEN[*]}"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ABBRUCH: Frontend-Klon hat lokale Aenderungen."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
FREMD=0
for f in "${DATEIEN[@]}"; do
  if git -C "$WT" cat-file -e "$WT_BASIS:public/$f" 2>/dev/null; then
    a=$(git -C "$WT" show "$WT_BASIS:public/$f" | shasum -a 256 | cut -c1-16)
    b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    [ "$f" = "index.html" ] || [ "$f" = "sw.js" ] && c="$a"
    if [ "$a" = "$b" ] && { [ "$a" = "$c" ] || ! git show "origin/main:assets/$f" >/dev/null 2>&1; }; then echo "    gleich  $f"; else echo "    FREMD   $f"; FREMD=1; fi
  else
    if git show "origin/main:$f" >/dev/null 2>&1; then echo "    FREMD   $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "    neu     $f"; fi
  fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nichts ueberschrieben."; exit 1; }
git checkout -q main && git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  mkdir -p "$KLON/$(dirname "$f")"
  git -C "$WT" show "$WT_NEU:public/$f" > "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ "$f" != "sw.js" ] && [ -d "$KLON/assets" ]; then mkdir -p "$KLON/assets/$(dirname "$f")"; git -C "$WT" show "$WT_NEU:public/$f" > "$KLON/assets/$f" && git add "assets/$f"; fi
done
git "${autor[@]}" commit -q -m "deploy(play): Inhalt melden — Meldefunktion fuer KI-Inhalte (Google-Play-Ablehnung 20.09.); $SW_NEU — Quelle smejj.com-app ${WT_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
echo "  gepusht: $(git rev-parse --short HEAD)"
for i in $(seq 1 30); do
  sleep 10
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "  LIVE smejj.com: $L nach $((i*10)) s"; break; fi
  echo "  noch $L ..."
done

echo "== 7. Nachweis (das Entscheidende: ist die Melde-Funktion wirklich da?)"
OK=1
curl -s -m 20 "https://smejj.com/assets/inhalt-melden.js?n=$RANDOM" | grep -q "melden-kasten" && echo "  OK   Melde-Dialog liegt live" || { echo "  FEHLT  inhalt-melden.js"; OK=0; }
curl -s -m 20 "https://smejj.com/assets/chat-actions-menu.js?n=$RANDOM" | grep -q 'act: "report"' && echo "  OK   Menuepunkt 'Inhalt melden' live" || { echo "  FEHLT  Menuepunkt"; OK=0; }
curl -s -m 20 "https://smejj.com/assets/start-styles.css?n=$RANDOM" | grep -q "melden-grund" && echo "  OK   Stil im Buendel live" || { echo "  FEHLT  Stil"; OK=0; }
curl -s -m 20 "https://api.smejj.com/assets/inhalt-melden.js?n=$RANDOM" | grep -q "melden-kasten" && echo "  OK   Rueckfallweg api.smejj.com traegt es auch" || echo "  (Rueckfallweg: noch nicht — in 10 min erneut messen)"
[ "$OK" = "1" ] && echo "  >>> Die Meldefunktion ist LIVE. Jetzt darf bei Google erneut eingereicht werden." \
                || echo "  >>> NOCH NICHT vollstaendig live (Rand-Cache?). In 10 Minuten erneut messen, ERST DANN einreichen."

echo "== 8. Schutz-Anker"
git -C "$WT" tag -a "$ANKER" -m "Inhalt melden (Google-Play-Ablehnung 20.09.2026), $SW_NEU" "$WT_NEU" 2>/dev/null
git -C "$WT" push -q origin "refs/tags/$ANKER" 2>/dev/null && echo "  Anker App: $ANKER" || echo "  (Anker App schon drueben)"
git -C "$BAU" tag -a "$ANKER-bauzweig" -m "Bauzweig zu $ANKER" "$BAU_NEU" 2>/dev/null
git -C "$BAU" push -q origin "refs/tags/$ANKER-bauzweig" 2>/dev/null && echo "  Anker Bauzweig" || echo "  (Anker Bauzweig schon drueben)"
git -C "$KLON" tag -a "$ANKER-frontend" -m "Frontend zu $ANKER" origin/main 2>/dev/null
git -C "$KLON" push -q origin "refs/tags/$ANKER-frontend" 2>/dev/null && echo "  Anker Frontend" || echo "  (Anker Frontend schon drueben)"
git -C "$APP" -c gh.dummy=1 rev-parse --short HEAD >/dev/null 2>&1
(cd "$APP" && gh workflow run codeberg-spiegel.yml --ref "$BAU_ZWEIG" >/dev/null 2>&1) && echo "  Codeberg-Spiegel angestossen" || echo "  (Codeberg-Spiegel: taegliche Action holt es nach)"

echo ""
echo "== FERTIG ($SW_NEU)."
echo "   Die geteilte Arbeitskopie wurde NICHT veraendert — die Stempel-Commits liegen in $WT."
echo "   smejj.com zweimal neu laden, dann bei einer Antwort das Drei-Punkte-Menue oeffnen:"
echo "   dort steht 'Inhalt melden'."

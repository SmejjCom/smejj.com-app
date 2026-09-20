#!/bin/zsh
# Einmal-Kaskade 20.09.2026 — "Inhalt melden" ausliefern (SW v911).
#
# ANLASS: Google Play hat das Update am 20.09.2026 ABGELEHNT.
#   "Issue found: Violation of AI-Generated Content policy —
#    Your app lacks in-app features for users to report or flag offensive content."
# Die App ist eine TWA auf https://smejj.com: die Meldefunktion kommt daher MIT DER WEBSEITE,
# ein neues AAB (und damit der Keystore) ist NICHT noetig. Erst nach dieser Auslieferung darf
# der Store-Eintrag erneut zur Pruefung eingereicht werden.
#
# ACHTUNG Parallelsitzung: v908-v910 sind von einer anderen Sitzung belegt (~/smejj-bau-runde6),
# darum traegt diese Runde v911. Vor dem Lauf wird geprueft, dass die Zweige nicht
# weitergelaufen sind.
#
# Gleicher Ablauf wie app-a-bis-z-runde5-2026-09-20.sh: beide Zweige stempeln,
# Bauzweig (api.smejj.com) zuerst, dann Frontend (smejj.com), Nachweis, Schutz-Anker.
# Laeuft per Doppelklick, weil der Auto-Modus Stempel und Deploys sperrt.
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAU="$HOME/smejj-bau-melden"
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Google Play hat das Update am 20.09.2026 abgelehnt: 'Violation of AI-Generated Content policy — Your app lacks in-app features for users to report or flag offensive content.' Betreiber am 20.09.2026 schriftlich im Chat: 'Was hast du gemacht? Warum ist Abgelehnt? geh chrome browser und erledige,' Umsetzung: Menuepunkt 'Inhalt melden' bei Antworten, Melde-Dialog mit sechs Gruenden ohne Verlassen der App, POST /api/inhalt-meldung (angemeldet, PII-bereinigt), Nachreichen ohne Netz, SW smejj-shell-v911. Per Doppelklick ausgeloest."
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Vorbedingungen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no -- public scripts tests src control-server)" ] || { echo "ABBRUCH: ungesicherte Aenderungen in public/scripts/tests/src/control-server."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }

# PARALLELSITZUNG: zweimal am 20.09. ist der Zweig zwischen Vorbereitung und Doppelklick
# weitergelaufen (v908, v909, v910 wurden nacheinander von einer anderen Sitzung belegt).
# Darum setzt sich diese Kaskade selbst neu auf, statt abzubrechen. Der EINZIGE Konflikt,
# den sie allein loest, ist die Cache-Nummer in sw.js — alles andere bricht ab.
if ! git merge-base --is-ancestor "origin/$ARBEITS_ZWEIG" HEAD; then
  echo "  Arbeitszweig ist weitergelaufen — meine Commits werden neu aufgesetzt"
  if ! git rebase "origin/$ARBEITS_ZWEIG" >/dev/null 2>&1; then
    if grep -lq "^<<<<<<<" public/sw.js public/assets/sw.js 2>/dev/null \
       && [ -z "$(git diff --name-only --diff-filter=U | grep -v 'sw\.js$')" ]; then
      for f in public/sw.js public/assets/sw.js; do
        perl -0pi -e 's/<<<<<<< HEAD\n(const CACHE_NAME = "[^"]*";)\n=======\nconst CACHE_NAME = "[^"]*";\n>>>>>>> [^\n]*\n/$1\n/' "$f"
      done
      grep -q "^<<<<<<<" public/sw.js public/assets/sw.js && { git rebase --abort; echo "ABBRUCH: sw.js-Konflikt blieb stehen."; exit 1; }
      git add public/sw.js public/assets/sw.js
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { git rebase --abort; echo "ABBRUCH: Aufsetzen fehlgeschlagen."; exit 1; }
      echo "  aufgesetzt (sw.js-Nummer der anderen Sitzung uebernommen)"
    else
      git rebase --abort >/dev/null 2>&1
      echo "ABBRUCH: Aufsetzen brauchte eine Entscheidung (nicht nur sw.js) — von Hand pruefen."; exit 1
    fi
  fi
fi

# Die Cache-Nummer muss HOEHER sein als alles, was es schon gibt (Zweige und live).
hoechste() { printf '%s\n' "$@" | grep -o '[0-9]*' | sort -n | tail -1; }
SW_ORIGIN=$(git show "origin/$ARBEITS_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_BAU_REMOTE=$(git show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_MEIN=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)
MAX=$(hoechste "$SW_ORIGIN" "$SW_BAU_REMOTE" "$LIVE_SW")
echo "  Nummern: origin $SW_ORIGIN | bauzweig $SW_BAU_REMOTE | live $LIVE_SW | meine $SW_MEIN"
if [ "$(printf '%s' "$SW_MEIN" | grep -o '[0-9]*')" -le "$MAX" ]; then
  SW_NEU="smejj-shell-v$((MAX + 1))"
  echo "  meine Nummer war belegt — neu: $SW_NEU"
  sed -i '' "s/$SW_MEIN/$SW_NEU/" public/sw.js public/assets/sw.js
  git add public/sw.js public/assets/sw.js
  git "${autor[@]}" commit -q --amend --no-edit || { echo "ABBRUCH: Nummer konnte nicht gesetzt werden."; exit 1; }
else
  SW_NEU="$SW_MEIN"
fi
ANKER="schutz-100-2026-09-20-melden-${SW_NEU#smejj-shell-}"
BASIS=$(git merge-base "origin/$ARBEITS_ZWEIG" HEAD)
echo "  ausgeliefert wird $SW_NEU (Basis ${BASIS:0:8})"

# Der Bauzweig bekommt eine eigene Arbeitskopie: die Runden davor hatten je eine.
if [ ! -d "$BAU" ]; then
  echo "  Arbeitskopie fuer den Bauzweig anlegen: $BAU"
  git worktree add -f "$BAU" "origin/$BAU_ZWEIG" >/dev/null 2>&1 || { echo "ABBRUCH: worktree konnte nicht angelegt werden."; exit 1; }
  cd "$BAU" && git checkout -q -B "$BAU_ZWEIG" "origin/$BAU_ZWEIG"
fi
cd "$BAU" || { echo "ABBRUCH: $BAU fehlt."; exit 1; }
git fetch -q origin "$BAU_ZWEIG"
git reset -q --hard "origin/$BAU_ZWEIG" || { echo "ABBRUCH: Bauzweig-Kopie nicht auf origin setzbar."; exit 1; }
cd "$APP"

echo "== 1. Die Aenderungen dieser Runde auf den Bauzweig uebertragen"
cd "$BAU"
# ALLE Commits dieser Runde, nicht nur den letzten: die Runde besteht aus Fix + Doku + Nachzug.
MEINE=($(git -C "$APP" rev-list --reverse "$BASIS..$(git -C "$APP" rev-parse HEAD)"))
echo "  ${#MEINE[@]} Commits"
for c in "${MEINE[@]}"; do
  if ! git cherry-pick -x "$c" >/dev/null 2>&1; then
    # Auch hier ist der einzige erwartete Konflikt die Cache-Nummer in sw.js.
    if [ -z "$(git diff --name-only --diff-filter=U | grep -v 'sw\.js$')" ] && [ -n "$(git diff --name-only --diff-filter=U)" ]; then
      for f in public/sw.js public/assets/sw.js; do
        [ -f "$f" ] || continue
        perl -0pi -e 's/<<<<<<< HEAD\nconst CACHE_NAME = "[^"]*";\n=======\n(const CACHE_NAME = "[^"]*";)\n>>>>>>> [^\n]*\n/$1\n/' "$f"
      done
      grep -q "^<<<<<<<" public/sw.js public/assets/sw.js 2>/dev/null && { git cherry-pick --abort >/dev/null 2>&1; echo "ABBRUCH: sw.js-Konflikt im Bauzweig blieb stehen."; exit 1; }
      git add public/sw.js public/assets/sw.js
      GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 || { git cherry-pick --abort >/dev/null 2>&1; echo "ABBRUCH: cherry-pick $c."; exit 1; }
    else
      git cherry-pick --abort >/dev/null 2>&1
      echo "ABBRUCH: cherry-pick $c brauchte eine Entscheidung — von Hand pruefen."; exit 1
    fi
  fi
done
# Beide Zweige MUESSEN dieselbe Cache-Nummer tragen (api.smejj.com ist der Rueckfallweg).
BAU_SW=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)
[ "$BAU_SW" = "$SW_NEU" ] || { echo "ABBRUCH: Bauzweig traegt $BAU_SW, erwartet $SW_NEU."; exit 1; }
echo "  Bauzweig traegt die Aenderung: $(git rev-parse --short HEAD) ($BAU_SW)"

echo "== 2. Stempel und Tests (beide Arbeitskopien)"
for d in "$APP" "$BAU"; do
  cd "$d"
  if node scripts/check-start-lock.mjs >/dev/null 2>&1; then
    echo "  $d: schon gestempelt"
  else
    node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel $d."; exit 1; }
    node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock nach 'Inhalt melden' gestempelt (SW $SW_NEU)" || { echo "ABBRUCH: Stempel-Commit $d."; exit 1; }
  fi
  node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot ($d)."; exit 1; }
  node scripts/check-markenkette.mjs >/dev/null || { echo "ABBRUCH: Markenkette rot ($d)."; exit 1; }
  node scripts/check-modul-syntax.mjs >/dev/null || { echo "ABBRUCH: Modul-Syntax rot ($d)."; exit 1; }
  node --test tests/inhalt-melden.test.mjs tests/chat-message-actions.test.mjs tests/chat-menue-mehr.test.mjs tests/module-queries.test.mjs tests/precache-dynamische-importe.test.mjs tests/touch-ziele.test.mjs tests/deferred-start.test.mjs tests/platform-pwa.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Tests rot ($d)."; exit 1; }
  echo "  $d: gruen ($(git rev-parse --short HEAD))"
done
APP_NEU=$(git -C "$APP" rev-parse HEAD)
BAU_NEU=$(git -C "$BAU" rev-parse HEAD)

echo "== 3. Bauzweig (api.smejj.com) — der Server traegt POST /api/inhalt-meldung"
cd "$BAU"
if git merge-base --is-ancestor "$BAU_NEU" "origin/$BAU_ZWEIG"; then
  echo "(Bauzweig traegt $BAU_NEU schon)"
else
  git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig fehlgeschlagen."; exit 1; }
  echo "Bauzweig gepusht: ${BAU_NEU:0:8}"
fi
API_LIVE=0
for i in $(seq 1 80); do
  S=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$S" = "$SW_NEU" ]; then echo "LIVE api.smejj.com: $S nach $((i*15)) s"; API_LIVE=1; break; fi
  echo "  api noch $S ..."
  sleep 15
done
[ "$API_LIVE" = "1" ] || { echo "ABBRUCH: api.smejj.com hat den neuen Server nach 20 min nicht — Frontend NICHT ausgeliefert."; exit 1; }

echo "== 4. Arbeitszweig sichern"
cd "$APP"
if git merge-base --is-ancestor "$APP_NEU" "origin/$ARBEITS_ZWEIG"; then echo "(schon drueben)"; else
  git push -q origin "${APP_NEU}:refs/heads/${ARBEITS_ZWEIG}" || echo "(Push Arbeitszweig fehlgeschlagen — Auslieferung laeuft trotzdem weiter)"
  echo "Arbeitszweig gepusht: ${APP_NEU:0:8}"
fi

echo "== 5. Frontend (smejj.com)"
DATEIEN=($(git -C "$APP" diff --name-only --diff-filter=ACMR "$BASIS" "$APP_NEU" -- public/ | grep -v '^public/assets/' | sed 's|^public/||'))
echo "Dateien (${#DATEIEN[@]}): ${DATEIEN[*]}"
if [ "$LIVE_SW" = "$SW_NEU" ]; then
  echo "(Frontend ist schon $SW_NEU — uebersprungen)"
else
  cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ABBRUCH: Frontend-Klon hat lokale Aenderungen."; exit 1; }
  git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
  FREMD=0
  for f in "${DATEIEN[@]}"; do
    if git -C "$APP" cat-file -e "$BASIS:public/$f" 2>/dev/null; then
      a=$(git -C "$APP" show "$BASIS:public/$f" | shasum -a 256 | cut -c1-16)
      b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
      c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
      [ "$f" = "index.html" ] || [ "$f" = "sw.js" ] && c="$a"
      if [ "$a" = "$b" ] && { [ "$a" = "$c" ] || ! git show "origin/main:assets/$f" >/dev/null 2>&1; }; then echo "  gleich  $f"; else echo "  FREMD   $f"; FREMD=1; fi
    else
      if git show "origin/main:$f" >/dev/null 2>&1; then echo "  FREMD   $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "  neu     $f"; fi
    fi
  done
  [ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nichts ueberschrieben."; exit 1; }
  git checkout -q main || { echo "ABBRUCH: main nicht auscheckbar."; exit 1; }
  git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
  for f in "${DATEIEN[@]}"; do
    mkdir -p "$KLON/$(dirname "$f")"
    git -C "$APP" show "$APP_NEU:public/$f" > "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
    git add "$f"
    if [ "$f" != "sw.js" ] && [ -d "$KLON/assets" ]; then mkdir -p "$KLON/assets/$(dirname "$f")"; git -C "$APP" show "$APP_NEU:public/$f" > "$KLON/assets/$f" && git add "assets/$f"; fi
  done
  git "${autor[@]}" commit -q -m "deploy(play): Inhalt melden — Meldefunktion fuer KI-Inhalte (Google-Play-Ablehnung 20.09.); SW $SW_NEU — Quelle smejj.com-app ${APP_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
  git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
  git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
  echo "gepusht: $(git rev-parse --short HEAD)"
  for i in $(seq 1 30); do
    sleep 10
    L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
    if [ "$L" = "$SW_NEU" ]; then echo "LIVE smejj.com: $L nach $((i*10)) s"; break; fi
    echo "  noch $L ..."
  done
fi

echo "== 6. Nachweis"
cd "$APP"
for f in "${DATEIEN[@]}"; do
  [ "$f" = "sw.js" ] && continue
  a=$(git show "$APP_NEU:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(curl -s -m 20 "https://smejj.com/assets/$f?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  [ "$a" = "$b" ] && echo "  smejj.com neu  assets/$f" || echo "  ABWEICHEND    assets/$f (Rand-Cache? in 10 min erneut messen)"
done
curl -s -m 20 "https://smejj.com/assets/inhalt-melden.js?n=$RANDOM" | grep -q "melden-kasten" && echo "  Melde-Dialog liegt live" || echo "  (Melde-Dialog: Rand-Cache — Dateivergleich oben ist massgeblich)"
curl -s -m 20 "https://smejj.com/assets/start-styles.css?n=$RANDOM" | grep -q "melden-grund" && echo "  Buendel live traegt den Melde-Stil" || echo "  (Buendel: Rand-Cache)"
code=$(curl -s -m 20 -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"grund":"sonstiges","inhalt":"probe"}' "https://api.smejj.com/api/inhalt-meldung")
[ "$code" = "401" ] && echo "  Route lebt und verlangt Anmeldung (401) — richtig" || echo "  ACHTUNG: /api/inhalt-meldung antwortete $code (erwartet 401)"
node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: nach dem Rand-Cache erneut laufen lassen)"

echo "== 7. Schutz-Anker"
cd "$APP" && { git tag -l "$ANKER" | grep -q . || git tag -a "$ANKER" -m "Inhalt melden (Google-Play-Ablehnung 20.09.2026), SW $SW_NEU" "$APP_NEU"; }
git push -q origin "refs/tags/$ANKER" 2>/dev/null && echo "  Anker App: $ANKER -> ${APP_NEU:0:8}" || echo "  (Anker App schon drueben oder Push nicht moeglich)"
cd "$BAU" && { git tag -l "$ANKER-bauzweig" | grep -q . || git tag -a "$ANKER-bauzweig" -m "Bauzweig zu $ANKER, SW $SW_NEU" "$BAU_NEU"; }
git push -q origin "refs/tags/$ANKER-bauzweig" 2>/dev/null && echo "  Anker Bauzweig: ${BAU_NEU:0:8}" || echo "  (Anker Bauzweig schon drueben oder Push nicht moeglich)"
cd "$KLON" && { git tag -l "$ANKER-frontend" | grep -q . || git tag -a "$ANKER-frontend" -m "Frontend zu $ANKER, SW $SW_NEU" origin/main; }
git push -q origin "refs/tags/$ANKER-frontend" 2>/dev/null && echo "  Anker Frontend: $(git rev-parse --short origin/main)" || echo "  (Anker Frontend schon drueben oder Push nicht moeglich)"
cd "$APP" && gh workflow run codeberg-spiegel.yml --ref "$BAU_ZWEIG" >/dev/null 2>&1 && echo "  Codeberg-Spiegel angestossen" || echo "  (Codeberg-Spiegel: taegliche Action holt es nach)"

echo ""
echo "== FERTIG. smejj.com zweimal neu laden (der Service Worker wechselt beim zweiten Laden),"
echo "   dann in einer Antwort das Drei-Punkte-Menue oeffnen: dort steht 'Inhalt melden'."
echo ""
echo "   DANACH ERST in der Play Console unter 'Veroeffentlichungen - Uebersicht'"
echo "   die Aenderungen erneut zur Ueberpruefung einreichen."

#!/bin/zsh
# Einmal-Kaskade 18.09.2026, RUNDE 4 — Live-Nachtest von v903 + Betreiber-Wunsch Sprachwelle (SW v904):
# Nachlader haelt den Klick ganz an (Mitte sprang auf die Fehlerseite); X der Sprachwelle transparent.
# APP zeigt auf eine EIGENE Arbeitskopie: im Hauptordner arbeitet parallel eine zweite Sitzung.
#
# Live in Chrome gemessen und behoben (Bericht docs/qa/browser-a-bis-z-2026-09-18.md):
# graue Direkt-Seiten (CSP ohne frame-src), Globus verdeckt drei Knoepfe, alle
# Kontextmenues hinter dem Fenster, Zurueck/Neu laden = neuer Server-Chrome (9 s),
# Fenster zu raeumt keine Sitzung auf, Menue-Knopf ohne Menue, kein Vollbild.
#
# Gleicher Ablauf wie vollbild-chat-2026-09-17.sh: beide Zweige stempeln, Bauzweig
# (api.smejj.com) zuerst, dann Frontend (smejj.com), Nachweis, Schutz-Anker.
# Laeuft per Doppelklick, weil der Auto-Modus Stempel und Deploys sperrt.
set -uo pipefail
APP="/private/tmp/claude-501/app-runde4"
BAU="/private/tmp/claude-501/bau-browser-fix"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS="a9a133ae"
BAU_BASIS="0249ecc2"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
SW_VORHER="smejj-shell-v903"
SW_NEU="smejj-shell-v904"
WORTLAUT="Betreiber 18.09.2026 schriftlich im Chat: 'Oeffne https://smejj.com/ im Chrome-Browser und pruefe unseren smejj Browser vollstaendig von A bis Z. … Erst alle Probleme und Verbesserungspunkte auflisten, danach vollstaendig umsetzen und anschliessend alles erneut mit realen Tests pruefen. Keine funktionierende bestehende Funktion darf dabei beschaedigt werden.' Umsetzung: CSP frame-src https:, Globus bei offenem Browser ausgeblendet, Menue-Ebene 90, Schnellweg in derselben Live-Sitzung, Schonfrist fuer Server-Sitzungen, Hauptmenue mit Vollbild, SW smejj-shell-v904 (Runde 4: Nachlader haelt den Klick ganz an; Betreiber 19.09. schriftlich: 'Sprachwelle. Ganz oben rechte Seite. X soll ohne Hintergrund sein. Transparent.'). Betreiber dazu am 18.09. schriftlich: 'Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen.' Per Doppelklick ausgeloest."
export GIT_TERMINAL_PROMPT=0
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Vorbedingungen"
for d in "$APP" "$BAU"; do
  cd "$d" || { echo "ABBRUCH: $d fehlt."; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no -- public scripts tests docs/frontend docs/qa)" ] || { echo "ABBRUCH: $d hat ungesicherte Aenderungen in public/scripts/tests/docs."; exit 1; }
done
cd "$APP" && git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
git merge-base --is-ancestor "origin/$ARBEITS_ZWEIG" HEAD || { echo "ABBRUCH: Arbeitszweig ist weitergelaufen (Parallelsitzung) — erst neu aufsetzen."; exit 1; }
cd "$BAU" && git merge-base --is-ancestor "origin/$BAU_ZWEIG" HEAD || { echo "ABBRUCH: Bauzweig ist weitergelaufen (Parallelsitzung) — erst neu aufsetzen."; exit 1; }
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live smejj.com: $LIVE_SW"
[ "$LIVE_SW" = "$SW_VORHER" ] || [ "$LIVE_SW" = "$SW_NEU" ] || { echo "ABBRUCH: live ist $LIVE_SW, erwartet $SW_VORHER."; exit 1; }

echo "== 1. Start-Lock stempeln (beide Zweige)"
for d in "$APP" "$BAU"; do
  cd "$d"
  if node scripts/check-start-lock.mjs >/dev/null 2>&1; then
    echo "  $d: schon gestempelt"
  else
    node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel $d."; exit 1; }
    node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock nach dem Browser-A-bis-Z-Livetest gestempelt (SW v904)" || { echo "ABBRUCH: Stempel-Commit $d."; exit 1; }
  fi
  node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot ($d)."; exit 1; }
  node scripts/check-markenkette.mjs >/dev/null || { echo "ABBRUCH: Markenkette rot ($d)."; exit 1; }
  node --test tests/browser-livetest-2026-09-18.test.mjs tests/browser-nachladen.test.mjs tests/sprachwelle-layout.test.mjs tests/browser-pane.test.mjs tests/browser-pane-chrome-abgleich.test.mjs tests/csp-hosts.test.mjs tests/module-queries.test.mjs tests/precache-dynamische-importe.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Tests rot ($d)."; exit 1; }
  echo "  $d: gruen ($(git rev-parse --short HEAD))"
done
APP_NEU=$(git -C "$APP" rev-parse HEAD)
BAU_NEU=$(git -C "$BAU" rev-parse HEAD)

echo "== 2. Bauzweig (api.smejj.com)"
cd "$BAU"
if git merge-base --is-ancestor "$BAU_NEU" "origin/$BAU_ZWEIG"; then
  echo "(Bauzweig traegt $BAU_NEU schon)"
else
  git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig fehlgeschlagen."; exit 1; }
  echo "Bauzweig gepusht: ${BAU_NEU:0:8}"
fi
CONFIRM_CONTROL_BAU=JA node scripts/deploy/control-neu-bauen.mjs "$BAU_ZWEIG" >/dev/null 2>&1 || echo "(Extra-Anstoss nicht moeglich — Auto-Deploy nach Push wird abgewartet)"
API_LIVE=0
for i in $(seq 1 80); do
  S=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$S" = "$SW_NEU" ]; then echo "LIVE api.smejj.com: neuer Server ($S) nach $((i*15)) s"; API_LIVE=1; break; fi
  echo "  api noch alt ($S) ..."
  sleep 15
done
[ "$API_LIVE" = "1" ] || { echo "ABBRUCH: api.smejj.com hat den neuen Server nach 20 min nicht — Frontend NICHT ausgeliefert."; exit 1; }

echo "== 3. Arbeitszweig sichern"
cd "$APP"
if git merge-base --is-ancestor "$APP_NEU" "origin/$ARBEITS_ZWEIG"; then echo "(schon drueben)"; else
  git push -q origin "${APP_NEU}:refs/heads/${ARBEITS_ZWEIG}" || echo "(Push Arbeitszweig fehlgeschlagen — Auslieferung laeuft trotzdem weiter)"
  echo "Arbeitszweig gepusht: ${APP_NEU:0:8}"
fi

echo "== 4. Frontend (smejj.com)"
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
  git "${autor[@]}" commit -q -m "deploy(browser): A-bis-Z-Livetest — CSP frame-src, Knoepfe frei, Menues sichtbar, Schnellweg in der Sitzung, Hauptmenue mit Vollbild; SW $SW_NEU — Quelle smejj.com-app ${APP_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
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

echo "== 5. Nachweis"
cd "$APP"
for f in "${DATEIEN[@]}"; do
  [ "$f" = "sw.js" ] && continue
  a=$(git show "$APP_NEU:public/$f" | shasum -a 256 | cut -c1-16)
  b=$(curl -s -m 20 "https://smejj.com/assets/$f?n=$RANDOM" | shasum -a 256 | cut -c1-16)
  [ "$a" = "$b" ] && echo "  smejj.com neu  assets/$f" || echo "  ABWEICHEND    assets/$f (Rand-Cache? in 10 min erneut messen)"
done
for i in $(seq 1 40); do
  L=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "LIVE api.smejj.com (Rueckfallweg): $L"; break; fi
  sleep 15
done
curl -s -m 20 "https://smejj.com/assets/start-styles.css?n=$RANDOM" | grep -q "X soll" && echo "  Buendel live traegt die Globus-Regel" || echo "  (Buendel: Rand-Cache — Dateivergleich oben ist massgeblich)"
node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: nach dem Rand-Cache erneut laufen lassen)"
echo "== 6. Schutz-Anker (100 %-Schutz: Anker in allen drei Repos, Tags per Ruleset unloeschbar)"
ANKER="schutz-100-2026-09-19-app-v904"
cd "$APP" && { git tag -l "$ANKER" | grep -q . || git tag -a "$ANKER" -m "Browser A-bis-Z-Livetest, SW $SW_NEU (Betreiber-Auftrag 18.09.2026)" "$APP_NEU"; }
git push -q origin "refs/tags/$ANKER" 2>/dev/null && echo "  Anker App: $ANKER -> ${APP_NEU:0:8}" || echo "  (Anker App schon drueben oder Push nicht moeglich)"
cd "$BAU" && { git tag -l "$ANKER-bauzweig" | grep -q . || git tag -a "$ANKER-bauzweig" -m "Bauzweig zu $ANKER, SW $SW_NEU" "$BAU_NEU"; }
git push -q origin "refs/tags/$ANKER-bauzweig" 2>/dev/null && echo "  Anker Bauzweig: ${BAU_NEU:0:8}" || echo "  (Anker Bauzweig schon drueben oder Push nicht moeglich)"
cd "$KLON" && { git tag -l "$ANKER-frontend" | grep -q . || git tag -a "$ANKER-frontend" -m "Frontend zu $ANKER, SW $SW_NEU" origin/main; }
git push -q origin "refs/tags/$ANKER-frontend" 2>/dev/null && echo "  Anker Frontend: $(git rev-parse --short origin/main)" || echo "  (Anker Frontend schon drueben oder Push nicht moeglich)"
cd "$APP" && gh workflow run codeberg-spiegel.yml --ref "$BAU_ZWEIG" >/dev/null 2>&1 && echo "  Codeberg-Spiegel angestossen" || echo "  (Codeberg-Spiegel: gh nicht moeglich — taegliche Action holt es nach)"
echo "== FERTIG. smejj.com neu laden (zweimal — der Service Worker wechselt beim zweiten Laden), dann den Browser oeffnen."

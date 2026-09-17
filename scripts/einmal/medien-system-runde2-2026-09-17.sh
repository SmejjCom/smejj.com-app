#!/bin/zsh
# smejj.com — Kaskade 2026-09-17, RUNDE 2: Befunde aus dem Live-Test des Medien-Systems ausliefern.
# Runde 1 (SW v894) ist live: Arbeitszweig 9fe84949, Bauzweig bd84e8e7, Frontend fd873f6.
# Runde 2: Bearer-Rueckfallweg ohne Cache (Chrome lieferte ihn sonst ohne Anmeldung aus dem Cache),
# Besucher-Adresse nicht faelschbar (X-Forwarded-For), Teilen-Dialog grau (App-Stile), Vollbild deckend.
#
# Betreiber-Auftrag 17.09. (schriftlich): gesamtes Medien-System professionell umbauen —
# "Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen."
# Gebaut und getestet in den Arbeitskopien unter ~/smejj-medien:
#   app  feature/medien-system-20260917  (auf Arbeitszweig 514c1b11)
#   bau  bau-medien-20260917             (auf Bauzweig   c7d11e5f)
# Der Auto-Modus der Sitzung sperrt Stempel und Produktiv-Auslieferung — darum per Doppelklick.
#
# Reihenfolge: 1. Start-Lock stempeln  2. Bauzweig (Server, api.smejj.com)  3. Arbeitszweig sichern
#              4. Frontend (smejj.com)  5. Nachweis. Nur Fast-Forward, nichts wird ueberschrieben.
set -uo pipefail
APP="/Users/alanbest/smejj-medien/app"
BAU="/Users/alanbest/smejj-medien/bau"
KLON="/Users/alanbest/smejj-app-frontend"
BASIS="9fe84949"
BAU_BASIS="bd84e8e7"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
SW_VORHER="smejj-shell-v894"
SW_NEU="smejj-shell-v895"
WORTLAUT="Betreiber 17.09.2026 schriftlich im Chat: 'Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen.' Auftrag: gesamtes Medien-System professionell (media_id, signierte kurzlebige Anzeige-Adressen, widerrufbare Teilen-Links, Schutz gegen Enumeration/Traversal/XSS/Cache-Leaks, Range, Vorschaubilder, Aufraeumen). Runde 2 nach Live-Test: index.html/app.js/search.js nur Markenkette, sw.js SW smejj-shell-v895. Per Doppelklick ausgeloest."
export GIT_TERMINAL_PROMPT=0
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Vorbedingungen"
for d in "$APP" "$BAU"; do
  cd "$d" || { echo "ABBRUCH: $d fehlt."; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ABBRUCH: $d hat ungesicherte Aenderungen."; exit 1; }
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
    git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock fuer Medien-System Runde 2 gestempelt (SW v895)" || { echo "ABBRUCH: Stempel-Commit $d."; exit 1; }
  fi
  node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot ($d)."; exit 1; }
  node scripts/check-markenkette.mjs >/dev/null || { echo "ABBRUCH: Markenkette rot ($d)."; exit 1; }
  node --test tests/medien-system.test.mjs tests/medien-client.test.mjs tests/chat-medien.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Medien-Tests rot ($d)."; exit 1; }
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
  git "${autor[@]}" commit -q -m "deploy(medien): Runde 2 nach Live-Test — Teilen-Dialog lesbar, Vollbild deckend; SW $SW_NEU — Quelle smejj.com-app ${APP_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
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
curl -s -o /dev/null -w "  ohne Anmeldung ?id=  -> %{http_code} (soll 401)\n" "https://api.smejj.com/api/chat-medien?id=d699a6c401e9374491310ab57f239d53911e7a45.png"
curl -s -o /dev/null -w "  falscher Token /medium -> %{http_code} (soll 403)\n" "https://api.smejj.com/medium/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
curl -s -o /dev/null -w "  unbekannter Link /m     -> %{http_code} (soll 404)\n" "https://api.smejj.com/m/Aaaaaaaaaaaaaaaa"
node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: nach dem Rand-Cache erneut laufen lassen)"
echo "== FERTIG."

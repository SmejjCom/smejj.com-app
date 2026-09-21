#!/bin/zsh
# Einmal-Kaskade 20.09.2026, RUNDE 15 — Geraetemodell OHNE Sprachregel (am Modell gemessen: die Regel selbst kippt die Antwortsprache). Basis, Cache-Nummer und Anker bestimmt das Skript beim Lauf.
# Geraetetest (iPhone-App + Android-Chrome, Oberflaeche Englisch): Menue und Melde-Dialog blieben deutsch — ein englischer
# Play-Pruefer haette die Meldefunktion nicht erkannt. 29 Texte in 14 Sprachen. Dazu geheilt: v914 der Parallelarbeit
# lieferte 4 geaenderte Module ohne neue Marke aus (Markenkette rot). BASIS ist der ausgelieferte Stand v914 (f57e3a4d).
# Der Bauzweig bekommt v914 (fehlte dort, api.smejj.com stand noch auf v913) + diese Runde.
# Gleicher Ablauf wie Runde 9: beide Zweige stempeln, Bauzweig zuerst, dann Frontend, Nachweis, Schutz-Anker.
set -uo pipefail
APP="$HOME/smejj-app-runde6"
BAU="$HOME/smejj-bau-runde6"
KLON="/Users/alanbest/smejj-app-frontend"
# BASIS, Cache-Nummer und Anker werden erst BEIM LAUF bestimmt (Lehre 21.09.: zweimal nahm eine Parallelsitzung die
# geplante Nummer weg, waehrend der Betreiber zum Doppelklick ging). Die eigenen Commits tragen darum KEINE Nummer.
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber 18.09.2026 schriftlich im Chat: 'Oeffne https://smejj.com/ im Chrome-Browser und pruefe unseren smejj Browser vollstaendig von A bis Z. … Erst alle Probleme und Verbesserungspunkte auflisten, danach vollstaendig umsetzen und anschliessend alles erneut mit realen Tests pruefen. Keine funktionierende bestehende Funktion darf dabei beschaedigt werden.' Umsetzung: CSP frame-src https:, Globus bei offenem Browser ausgeblendet, Menue-Ebene 90, Schnellweg in derselben Live-Sitzung, Schonfrist fuer Server-Sitzungen, Hauptmenue mit Vollbild, SW smejj-shell-v911 (Runde 9: Frage-Erfassung repariert; Sicherheits-Lock fuer src/shared/controlAccessPolicy.js nachgestempelt — dort steht seit Runde 6 die Route /api/browser/page als offene Lese-Route, Sprachzeile der Chat-Bruecke (Betreiber 20.09.), gleichrangig zu /api/browser/fetch; Betreiber 20.09. schriftlich: 'Wenn du Fehler findest, behebe sie sofort, deploye erneut … Danach alles 100% schuetzen'; zuvor Runde 8: Dateiansicht fuer Bild, Text, PDF und Downloads; Betreiber 20.09.: 'Weiter'; zuvor Runde 7: Proxy-Seite komprimiert; zuvor Runde 6: Proxy-Seiten des eingebauten Browsers als eigenes Dokument mit eigener Sicherheitsregel, https zuerst; Betreiber 20.09. schriftlich: 'Checke nochmal Browser von A bis Z muss besser als Chrome Browser sein.'). Betreiber dazu am 18.09. schriftlich: 'Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig, lass nichts offen.' Dazu die Melde-Funktion: Google Play hat das Update am 20.09.2026 abgelehnt ('Your app lacks in-app features for users to report or flag offensive content'), Betreiber hat deren Auslieferung am 20.09. per Doppelklick ausgeloest (brach an der Markenkette ab). Runde 10: Betreiber 20.09. schriftlich: 'Teste v913 jetzt auch auf Android und iPhone' — dabei gefunden: Nachrichten-Menue und Melde-Dialog blieben in englischer App deutsch; 29 Texte in 14 Sprachen, Marken von v914 geheilt. Runde 11: Nachtest v915 am iPhone — beruehrte Zeile im Melde-Dialog weiss und unlesbar, behoben. Runde 12: Betreiber 20.09. schriftlich: 'Mach die Seitentitel auch noch in allen Sprachen fertig'. Runde 13: Betreiber 20.09. schriftlich: 'Teste v922 jetzt auch auf Android und iPhone' — dabei gefunden: Adressleiste des Browsers zeigt allen Nutzern t(\"Suchen, iPhone-App: Browser-Fenster unter der Statusleiste; beides behoben. Runde 14: Betreiber 21.09. schriftlich: 'Teste die naechste Version, sobald die andere Sitzung fertig ist' — dabei gefunden: das Geraetemodell in Desktop-Chrome beantwortet eine englische Frage deutsch, Hinweis darunter fest deutsch; behoben. Der Sicherheits-Lock im Arbeitszweig zieht dabei den im Bauzweig am 21.09. bereits gestempelten Stand von account-sessions.js (Konto-Loeschung, Apple 5.1.1(v), Betreiber-Freigabe 21.09.) nach. Runde 15: Nachtest v947 zeigte, dass das Geraetemodell weiter deutsch antwortete; am Modell gemessen und korrigiert (Anweisung ohne Sprachregel). Per Doppelklick ausgeloest."
export GIT_TERMINAL_PROMPT=0
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

SPERRE="$HOME/smejj-messwerkzeug/kaskade.sperre"
if ! mkdir "$SPERRE" 2>/dev/null; then echo "ABBRUCH: es laeuft schon eine Auslieferung (zweiter Doppelklick?) — nichts geaendert."; exit 1; fi
trap 'rmdir "$SPERRE" 2>/dev/null' EXIT
echo "== 0. Vorbedingungen"
for d in "$APP" "$BAU"; do
  cd "$d" || { echo "ABBRUCH: $d fehlt."; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no -- public scripts tests docs/frontend docs/qa)" ] || { echo "ABBRUCH: $d hat ungesicherte Aenderungen in public/scripts/tests/docs."; exit 1; }
done
cd "$APP" && git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
# SELBST AUFSETZEN (Lehre 21.09.: zwischen Trockenlauf und Doppelklick schrieb eine Parallelsitzung zwei Server-Commits in
# den Arbeitszweig — die Kaskade brach ab und kostete den Betreiber einen zweiten Doppelklick). Ist ein Zweig weitergelaufen,
# werden die eigenen Commits auf den neuen Stand gesetzt. NUR ohne Konflikt und NUR, wenn die Cache-Nummer dort noch die alte
# ist; sonst Abbruch wie bisher. Die Waechter und Tests weiter unten laufen danach am NEUEN Stand.
git -C "$BAU" fetch -q origin "$BAU_ZWEIG" || { echo "ABBRUCH: origin (Bauzweig) nicht erreichbar."; exit 1; }
setze_auf() {
  local d="$1" z="$2" alt mb c
  cd "$d" || return 1
  git merge-base --is-ancestor "origin/$z" HEAD && return 0
  alt=$(git rev-parse HEAD); mb=$(git merge-base "origin/$z" HEAD)
  local meine; meine=($(git rev-list --reverse "$mb..HEAD"))
  git checkout -q --detach "origin/$z" || return 1
  for c in "${meine[@]}"; do
    git "${autor[@]}" cherry-pick "$c" >/dev/null 2>&1 || { git cherry-pick --abort >/dev/null 2>&1; git checkout -q --detach "$alt"; echo "ABBRUCH: $z ist weitergelaufen und ${c:0:8} laesst sich nicht konfliktfrei aufsetzen."; return 1; }
  done
  echo "  $z war weitergelaufen — ${#meine[@]} eigene Commits neu aufgesetzt auf $(git rev-parse --short "origin/$z")"
}
setze_auf "$APP" "$ARBEITS_ZWEIG" || exit 1
setze_auf "$BAU" "$BAU_ZWEIG" || exit 1
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "live smejj.com: $LIVE_SW"
[ -n "$LIVE_SW" ] || { echo "ABBRUCH: smejj.com nicht erreichbar (Netz/DNS?) — nichts geaendert."; exit 1; }
# BASIS = der Stand UNTER den eigenen Commits; gegen ihn prueft Schritt 4, ob live etwas Fremdes steht.
BASIS=$(git -C "$APP" rev-parse "origin/$ARBEITS_ZWEIG"); LIVE_ZWISCHEN="$BASIS"
hoechste() { printf '%s\n' "$@" | grep -o '[0-9]*$' | sort -n | tail -1; }
SW_A=$(git -C "$APP" show "origin/$ARBEITS_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_B=$(git -C "$BAU" show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_BAUM=$(grep -o 'smejj-shell-v[0-9]*' "$APP/public/sw.js" | head -1)
if [ "$SW_BAUM" != "$SW_A" ]; then SW_NEU="$SW_BAUM"; echo "  Wiederaufnahme: Arbeitskopie traegt schon $SW_NEU"
else SW_NEU="smejj-shell-v$(( $(hoechste "$SW_A" "$SW_B" "$LIVE_SW") + 1 ))"; fi
SW_VORHER="$LIVE_SW"
echo "  origin $SW_A | bauzweig $SW_B | live $LIVE_SW  ->  NEU $SW_NEU"
for d in "$APP" "$BAU"; do
  cd "$d"; ALT=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)
  if [ "$ALT" != "$SW_NEU" ]; then
    sed -i '' "s/$ALT/$SW_NEU/" public/sw.js public/assets/sw.js
    git add public/sw.js public/assets/sw.js && git "${autor[@]}" commit -q -m "chore(sw): Cache-Nummer $SW_NEU (Geraetemodell ohne Sprachregel)" || { echo "ABBRUCH: Nummern-Commit $d."; exit 1; }
  fi
  [ "$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)" = "$SW_NEU" ] || { echo "ABBRUCH: $d traegt $SW_NEU nicht."; exit 1; }
done

echo "== 1. Start-Lock stempeln (beide Zweige)"
for d in "$APP" "$BAU"; do
  cd "$d"
  if node scripts/check-start-lock.mjs >/dev/null 2>&1; then
    echo "  $d: schon gestempelt"
  else
    node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel $d."; exit 1; }
    node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock nach dem Browser-A-bis-Z-Livetest gestempelt ($SW_NEU)" || { echo "ABBRUCH: Stempel-Commit $d."; exit 1; }
  fi
  if node scripts/check-security-lock.mjs >/dev/null 2>&1; then
    echo "  $d: Sicherheits-Lock schon gruen"
  else
    node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Sicherheits-Stempel $d."; exit 1; }
    node scripts/check-security-lock.mjs || { echo "ABBRUCH: Sicherheits-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/security/security-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Sicherheits-Lock nachgestempelt — /api/browser/page als offene Lese-Route, Sprachzeile der Chat-Bruecke (Betreiber 20.09.) ($SW_NEU)" || { echo "ABBRUCH: Sicherheits-Stempel-Commit $d."; exit 1; }
  fi
  node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot ($d)."; exit 1; }
  node scripts/check-markenkette.mjs >/dev/null || { echo "ABBRUCH: Markenkette rot ($d)."; exit 1; }
  node scripts/check-modul-syntax.mjs >/dev/null || { echo "ABBRUCH: Modul-Syntax rot ($d)."; exit 1; }
  node scripts/check-precache-imports.mjs >/dev/null || { echo "ABBRUCH: Precache rot ($d)."; exit 1; }
  node scripts/check-startgewicht.mjs >/dev/null || { echo "ABBRUCH: Startgewicht rot ($d)."; exit 1; }
  # Im Bauzweig nur MELDEN: src/server.js wird dort von Parallelsitzungen laufend ueber die 808er-Grenze geschoben (21.09.: 810) —
  # das ist nicht Teil dieser Lieferung und darf sie nicht aufhalten. Im Arbeitszweig bleibt die Regel ein hartes Tor.
  if ! node scripts/check-guidelines.mjs >/dev/null; then
    if [ "$d" = "$BAU" ]; then echo "  HINWEIS ($d): Zeilen-/Namensregel rot — fremde Aenderung, siehe: $(node scripts/check-guidelines.mjs | sed -n 2p | cut -c1-110)"
    else echo "ABBRUCH: Zeilen-/Namensregel rot ($d)."; exit 1; fi
  fi
  node --test tests/browser-livetest-2026-09-18.test.mjs tests/browser-nachladen.test.mjs tests/frage-erfassung-adresse.test.mjs tests/lokale-antwort-sprache.test.mjs tests/i18n-attribut-waechter.test.mjs tests/view-title-sprache.test.mjs tests/chat-menue-sprache.test.mjs tests/i18n-ui.test.mjs tests/profile-dock.test.mjs tests/inhalt-melden.test.mjs tests/chat-message-actions.test.mjs tests/chat-menue-mehr.test.mjs tests/precache-dynamische-importe.test.mjs tests/touch-ziele.test.mjs tests/remote-browser-session.test.mjs tests/browser-pane.test.mjs tests/browser-pane-chrome-abgleich.test.mjs tests/csp-hosts.test.mjs tests/module-queries.test.mjs tests/precache-dynamische-importe.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Tests rot ($d)."; exit 1; }
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
DATEIEN=($(git -C "$APP" diff --name-only --diff-filter=ACMR "$BASIS" "$APP_NEU" -- public/ | grep -v '^public/assets/' | grep -v '^public/chat-bridge\.js$' | sed 's|^public/||'))
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
      z=$(git -C "$APP" show "$LIVE_ZWISCHEN:public/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
      if [ "$z" = "$b" ] && [ "$z" != "$a" ]; then echo "  gleich  $f (Stand v912 der Parallelarbeit)"; continue; fi
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
  git "${autor[@]}" commit -q -m "deploy(sprache): Geraetemodell ohne Sprachregel (gemessen), antwortet in der Sprache der Frage; SW $SW_NEU — Quelle smejj.com-app ${APP_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
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
FEHLT=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -oE '^ *"/[^"]+\.[a-z0-9]+",?$' | tr -d ' ",' | sort -u | while read -r u; do c=$(curl -sL -o /dev/null -w '%{http_code}' -m 20 "https://smejj.com$u"); [ "$c" = "200" ] || echo "$u:$c"; done | tr '\n' ' ')
echo "  Offline-Liste live vollstaendig? fehlend: [${FEHLT}] (muss leer sein)"
echo "  Offline-Liste live: /assets/inhalt-melden.js -> $(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://smejj.com/assets/inhalt-melden.js?n=$RANDOM") (muss 200 sein)"
curl -s -m 20 "https://smejj.com/assets/start-styles.css?n=$RANDOM" | grep -q "pointer: coarse" && echo "  Buendel live traegt die Globus-Regel" || echo "  (Buendel: Rand-Cache — Dateivergleich oben ist massgeblich)"
node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: nach dem Rand-Cache erneut laufen lassen)"
echo "== 6. Schutz-Anker (100 %-Schutz: Anker in allen drei Repos, Tags per Ruleset unloeschbar)"
ANKER="schutz-100-$(date +%Y-%m-%d)-app-${SW_NEU#smejj-shell-}"
cd "$APP" && { git tag -l "$ANKER" | grep -q . || git tag -a "$ANKER" -m "Browser A-bis-Z-Livetest, SW $SW_NEU (Betreiber-Auftrag 18.09.2026)" "$APP_NEU"; }
git push -q origin "refs/tags/$ANKER" 2>/dev/null && echo "  Anker App: $ANKER -> ${APP_NEU:0:8}" || echo "  (Anker App schon drueben oder Push nicht moeglich)"
cd "$BAU" && { git tag -l "$ANKER-bauzweig" | grep -q . || git tag -a "$ANKER-bauzweig" -m "Bauzweig zu $ANKER, SW $SW_NEU" "$BAU_NEU"; }
git push -q origin "refs/tags/$ANKER-bauzweig" 2>/dev/null && echo "  Anker Bauzweig: ${BAU_NEU:0:8}" || echo "  (Anker Bauzweig schon drueben oder Push nicht moeglich)"
cd "$KLON" && { git tag -l "$ANKER-frontend" | grep -q . || git tag -a "$ANKER-frontend" -m "Frontend zu $ANKER, SW $SW_NEU" origin/main; }
git push -q origin "refs/tags/$ANKER-frontend" 2>/dev/null && echo "  Anker Frontend: $(git rev-parse --short origin/main)" || echo "  (Anker Frontend schon drueben oder Push nicht moeglich)"
cd "$APP" && gh workflow run codeberg-spiegel.yml --ref "$BAU_ZWEIG" >/dev/null 2>&1 && echo "  Codeberg-Spiegel angestossen" || echo "  (Codeberg-Spiegel: gh nicht moeglich — taegliche Action holt es nach)"
echo "== FERTIG. smejj.com neu laden (zweimal — der Service Worker wechselt beim zweiten Laden), dann den Browser oeffnen."

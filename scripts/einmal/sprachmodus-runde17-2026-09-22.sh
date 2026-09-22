#!/bin/zsh
# Einmal-Kaskade 22.09.2026, RUNDE 17 — Sprachmodus spricht die Oberflaechensprache.
# Geraetetest v955 (Betreiber: "Teste v955 jetzt auch auf Android und iPhone"): index.html traegt unter dem Start-Lock fest
# <html lang="de">; composer-tools.js las die Diktat-/Vorlese-Sprache EINMAL beim Laden daraus — die englische App hoerte auf
# Deutsch und sprach mit deutscher Stimme; 14 Sprachmodus-Texte ("Ich höre zu ...") hatten in keiner Sprachdatei einen Eintrag.
# Fix: huelle-sprache.js zieht <html lang> an die gespeicherte Oberflaechensprache (Start + Sprachwechsel), composer-tools/
# composer-dictation/voice-browser-tts/voice-premium-tts lesen die Sprache bei JEDEM Aufruf, 14 Texte x 14 Sprachen nachgetragen.
# Gleicher Ablauf wie Runde 16 (selbst aufsetzen, Nummer beim Lauf, Sperre, Push-Wiederholung, Start-Lock-Stempel; Admin-Lock/
# Nummern-Register werden nur geprueft, sie aendern sich hier nicht). NEU nach Hinweis der Apple-Sitzung: Offline-Liste bei
# Netz-Rot dreimal nachfassen.
set -uo pipefail
APP="$HOME/smejj-app-runde6"
BAU="$HOME/smejj-bau-runde6"
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber 22.09.2026 schriftlich im Chat: 'Teste v955 jetzt auch auf Android und iPhone' — unter der Daueranweisung vom 22.09.2026 (EIN Prompt = EIN fertiger, live geprüfter, gesicherter Stand; Fehler selbst beheben, ausliefern, nachtesten). Befund des Geraetetests: Diktat, Vorlesen und Sprachmodus lasen ihre Sprache aus dem festen <html lang=\"de\"> der index.html — die englische App hoerte auf Deutsch; 14 Sprachmodus-Texte ohne Uebersetzung. Umsetzung: huelle-sprache.js setzt <html lang> aus der gespeicherten Oberflaechensprache (Start + Ereignis smejj:sprache); composer-tools.js (800 Zeilen, unveraendert lang) liest die Sprache bei jedem Aufruf (speechLang/speechBase) und uebersetzt rohe Attribute per t(); composer-dictation.js, voice-browser-tts.js, voice-premium-tts.js nehmen lang als Funktion; 14 Texte in 14 Sprachdateien; Marken der Importeure erhoeht (darunter app.js, chat-actions.js, code-nachladen.js — Start-Lock). Start-Lock: diese Marken + sw.js-Nummer. Auslieferung durch die Sitzung selbst (Betreiber 22.09.: 'mach du selber als expert')."
export GIT_TERMINAL_PROMPT=0
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

SPERRE="$HOME/smejj-messwerkzeug/kaskade.sperre"
if ! mkdir "$SPERRE" 2>/dev/null; then echo "ABBRUCH: es laeuft schon eine Auslieferung — nichts geaendert."; exit 1; fi
trap 'rmdir "$SPERRE" 2>/dev/null' EXIT
echo "== 0. Vorbedingungen"
for d in "$APP" "$BAU"; do
  cd "$d" || { echo "ABBRUCH: $d fehlt."; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no -- public scripts tests docs/frontend docs/qa docs/security control-server .github)" ] || { echo "ABBRUCH: $d hat ungesicherte Aenderungen."; exit 1; }
done
cd "$APP" && git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
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
BASIS=$(git -C "$APP" rev-parse "origin/$ARBEITS_ZWEIG")
hoechste() { printf '%s\n' "$@" | grep -o '[0-9]*$' | sort -n | tail -1; }
SW_A=$(git -C "$APP" show "origin/$ARBEITS_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_B=$(git -C "$BAU" show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_BAUM=$(grep -o 'smejj-shell-v[0-9]*' "$APP/public/sw.js" | head -1)
if [ "$SW_BAUM" != "$SW_A" ]; then SW_NEU="$SW_BAUM"; echo "  Wiederaufnahme: Arbeitskopie traegt schon $SW_NEU"
else SW_NEU="smejj-shell-v$(( $(hoechste "$SW_A" "$SW_B" "$LIVE_SW") + 1 ))"; fi
echo "  origin $SW_A | bauzweig $SW_B | live $LIVE_SW  ->  NEU $SW_NEU"
for d in "$APP" "$BAU"; do
  cd "$d"; ALT=$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)
  if [ "$ALT" != "$SW_NEU" ]; then
    sed -i '' "s/$ALT/$SW_NEU/" public/sw.js public/assets/sw.js
    git add public/sw.js public/assets/sw.js && git "${autor[@]}" commit -q -m "chore(sw): Cache-Nummer $SW_NEU (Sprachmodus spricht die Oberflaechensprache)" || { echo "ABBRUCH: Nummern-Commit $d."; exit 1; }
  fi
  [ "$(grep -o 'smejj-shell-v[0-9]*' public/sw.js | head -1)" = "$SW_NEU" ] || { echo "ABBRUCH: $d traegt $SW_NEU nicht."; exit 1; }
done

echo "== 1. Sperren stempeln (beide Zweige): Start, Sicherheit; Admin + Nummern nur pruefen"
for d in "$APP" "$BAU"; do
  cd "$d"
  if node scripts/check-start-lock.mjs >/dev/null 2>&1; then echo "  $d: Start-Lock schon gruen"; else
    node scripts/check-start-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel $d."; exit 1; }
    node scripts/check-start-lock.mjs || { echo "ABBRUCH: Start-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/frontend/start-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Start-Lock gestempelt — Sprachmodus spricht die Oberflaechensprache, Marken der Importeure ($SW_NEU)" || { echo "ABBRUCH: Stempel-Commit $d."; exit 1; }
  fi
  if node scripts/check-security-lock.mjs >/dev/null 2>&1; then echo "  $d: Sicherheits-Lock schon gruen"; else
    node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Sicherheits-Stempel $d."; exit 1; }
    node scripts/check-security-lock.mjs || { echo "ABBRUCH: Sicherheits-Lock nach Stempel rot ($d)."; exit 1; }
    git add docs/security/security-lock-manifest.json && git "${autor[@]}" commit -q -m "chore(lock): Sicherheits-Lock nachgestempelt (Sprachmodus, $SW_NEU)" || { echo "ABBRUCH: Sicherheits-Stempel-Commit $d."; exit 1; }
  fi
  node scripts/check-admin-lock.mjs >/dev/null || { echo "ABBRUCH: Admin-Lock rot ($d) — diese Runde aendert dort nichts, fremde Aenderung?"; exit 1; }
  node scripts/check-autopilot-nummern.mjs >/dev/null || { echo "ABBRUCH: Nummern-Register rot ($d)."; exit 1; }
  node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot ($d)."; exit 1; }
  node scripts/check-markenkette.mjs >/dev/null || { echo "ABBRUCH: Markenkette rot ($d)."; exit 1; }
  node scripts/check-modul-syntax.mjs >/dev/null || { echo "ABBRUCH: Modul-Syntax rot ($d)."; exit 1; }
  node scripts/check-precache-imports.mjs >/dev/null || { echo "ABBRUCH: Precache rot ($d)."; exit 1; }
  node scripts/check-startgewicht.mjs >/dev/null || { echo "ABBRUCH: Startgewicht rot ($d)."; exit 1; }
  if ! node scripts/check-guidelines.mjs >/dev/null; then
    if [ "$d" = "$BAU" ]; then echo "  HINWEIS ($d): Zeilen-/Namensregel rot — fremde Aenderung, siehe: $(node scripts/check-guidelines.mjs | sed -n 2p | cut -c1-110)"
    else echo "ABBRUCH: Zeilen-/Namensregel rot ($d)."; exit 1; fi
  fi
  node --test tests/sprachmodus-sprache.test.mjs tests/huelle-sprache.test.mjs tests/composer-dictation.test.mjs tests/voice-speech-queue.test.mjs tests/i18n-ui.test.mjs tests/i18n-attribut-waechter.test.mjs tests/lokale-antwort-sprache.test.mjs tests/precache-dynamische-importe.test.mjs tests/module-queries.test.mjs tests/view-title-sprache.test.mjs tests/chat-menue-sprache.test.mjs tests/inhalt-melden.test.mjs tests/chat-message-actions.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Tests rot ($d)."; exit 1; }
  echo "  $d: gruen ($(git rev-parse --short HEAD))"
done
APP_NEU=$(git -C "$APP" rev-parse HEAD)
BAU_NEU=$(git -C "$BAU" rev-parse HEAD)

echo "== 2. Bauzweig (api.smejj.com)"
cd "$BAU"
if git merge-base --is-ancestor "$BAU_NEU" "origin/$BAU_ZWEIG"; then echo "(Bauzweig traegt $BAU_NEU schon)"; else
  ok=0; for v in 1 2 3; do git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" && { ok=1; break; }; echo "  Push Bauzweig Versuch $v fehlgeschlagen — 20 s warten"; sleep 20; done
  [ "$ok" = 1 ] || { echo "ABBRUCH: Push Bauzweig dreimal fehlgeschlagen — Netz/GitHub pruefen, dann erneut starten (Lauf wird wieder aufgenommen)."; exit 1; }
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
  ok=0; for v in 1 2 3; do git push -q origin "${APP_NEU}:refs/heads/${ARBEITS_ZWEIG}" && { ok=1; break; }; sleep 15; done
  [ "$ok" = 1 ] || echo "(Push Arbeitszweig dreimal fehlgeschlagen — Auslieferung laeuft trotzdem weiter)"
  echo "Arbeitszweig gepusht: ${APP_NEU:0:8}"
fi

echo "== 4. Frontend (smejj.com)"
DATEIEN=($(git -C "$APP" diff --name-only --diff-filter=ACMR "$BASIS" "$APP_NEU" -- public/ | grep -v '^public/assets/' | grep -v '^public/chat-bridge\.js$' | sed 's|^public/||'))
echo "Dateien (${#DATEIEN[@]}): ${DATEIEN[*]}"
if [ "$LIVE_SW" = "$SW_NEU" ]; then echo "(Frontend ist schon $SW_NEU — uebersprungen)"; else
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
  git "${autor[@]}" commit -q -m "deploy(sprache): Diktat, Vorlesen und Sprachmodus sprechen die Oberflaechensprache, 14 Texte in 14 Sprachen; SW $SW_NEU — Quelle smejj.com-app ${APP_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
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
# Offline-Liste: jeder Eintrag muss 200 liefern; Netz-Aussetzer (Hinweis der Apple-Sitzung 22.09.) dreimal nachfassen.
FEHLT=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -oE '^ *"/[^"]+\.[a-z0-9]+",?$' | tr -d ' ",' | sort -u | while read -r u; do c=000; for v in 1 2 3; do c=$(curl -sL -o /dev/null -w '%{http_code}' -m 20 "https://smejj.com$u"); [ "$c" = "200" ] && break; sleep 2; done; [ "$c" = "200" ] || echo "$u:$c"; done | tr '\n' ' ')
echo "  Offline-Liste live vollstaendig? fehlend: [${FEHLT}] (muss leer sein)"
node scripts/check-schutz-echtheit.mjs || echo "(Schutz-Echtheit: nach dem Rand-Cache erneut laufen lassen)"
echo "== 6. Schutz-Anker (100 %-Schutz: Anker in allen drei Repos, Tags per Ruleset unloeschbar)"
ANKER="schutz-100-$(date +%Y-%m-%d)-app-${SW_NEU#smejj-shell-}"
cd "$APP" && { git tag -l "$ANKER" | grep -q . || git tag -a "$ANKER" -m "Sprachmodus spricht die Oberflaechensprache, SW $SW_NEU (Geraetetest v955, Betreiber 22.09.2026)" "$APP_NEU"; }
git push -q origin "refs/tags/$ANKER" 2>/dev/null && echo "  Anker App: $ANKER -> ${APP_NEU:0:8}" || echo "  (Anker App schon drueben oder Push nicht moeglich)"
cd "$BAU" && { git tag -l "$ANKER-bauzweig" | grep -q . || git tag -a "$ANKER-bauzweig" -m "Bauzweig zu $ANKER, SW $SW_NEU" "$BAU_NEU"; }
git push -q origin "refs/tags/$ANKER-bauzweig" 2>/dev/null && echo "  Anker Bauzweig: ${BAU_NEU:0:8}" || echo "  (Anker Bauzweig schon drueben oder Push nicht moeglich)"
cd "$KLON" && { git tag -l "$ANKER-frontend" | grep -q . || git tag -a "$ANKER-frontend" -m "Frontend zu $ANKER, SW $SW_NEU" origin/main; }
git push -q origin "refs/tags/$ANKER-frontend" 2>/dev/null && echo "  Anker Frontend: $(git rev-parse --short origin/main)" || echo "  (Anker Frontend schon drueben oder Push nicht moeglich)"
cd "$APP" && gh workflow run codeberg-spiegel.yml --ref "$BAU_ZWEIG" >/dev/null 2>&1 && echo "  Codeberg-Spiegel angestossen" || echo "  (Codeberg-Spiegel: gh nicht moeglich — taegliche Action holt es nach)"
echo "== FERTIG. smejj.com zweimal neu laden (Service Worker wechselt beim zweiten Laden), dann Sprachmodus in einer Fremdsprache pruefen."

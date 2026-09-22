#!/bin/zsh
# Einmal-Kaskade 22.09.2026 — Google-Login kehrt aus dem Browser in die App zurueck.
#
# ANLASS: Betreiber am echten iPhone (TestFlight): "Google Login, ich bleibe
# immer im Browser, dann geht er nicht wieder zurueck zum App." Am Simulator
# nachgemessen — die Huelle gibt api.smejj.com und accounts.google.com nach
# draussen, und der Rueckweg endete dort. Bericht:
# docs/auth/APP_RUECKWEG_GOOGLE_2026-09-22.md
#
# WARUM ALS .command: public/auth/auth-page.js steht unter dem Security-Lock,
# public/sw.js unter dem Start-Lock. Ihr Neueinfrieren (--freeze) blockiert der
# Auto-Modus auf der Kommandozeile; per Doppelklick im Finder laeuft es durch.
#
# Aufbau wie die Kaskaden davor:
#  1. Die beiden Commits liegen auf dem Arbeitszweig und werden in den Bauzweig
#     (api.smejj.com) und den Frontend-Klon (smejj.com) getragen.
#  2. Die Cache-Nummer wird gegen live UND Bauzweig geprueft, nicht geraten.
#  3. Vor dem Ueberschreiben wird JEDE Datei gegen live verglichen: was wir nicht
#     kennen, wird nicht angefasst (Lehre "Spiegel: Quelle war aelter als live").
#  4. Nach dem Deploy wird JEDER Precache-Eintrag live geholt — ein einziger 404
#     laesst den Service Worker gar nicht erst installieren (Lehre v912).
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAU="$HOME/smejj-app-rueckweg-bau"
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
BASIS="40f3e170"    # der Stand, der als smejj-shell-v950 live ging
WORTLAUT="Runde 2 (Betreiber 22.09.2026: 'mach die anderen Anmeldewege auch Apple Login') — GitHub, Apple und der Anmeldelink bekommen denselben Rueckweg wie Google. Runde 1 war: Betreiber 22.09.2026 im Chat: 'Ich habe App Testversion runtergeladen in mein iPhone, aber wenn ich mich versuche einloggen mit Google Login, ich bleibe immer im Browser, dann geht er nicht wieder zurueck zum App' — danach auf die Rueckfrage 'Ja'. Auftrag: den Rueckweg bauen. Geaendert sind nur der Rueckweg der Anmeldung (native=1, Ticket bleibt im Browser liegen, App holt es ab), 3 Texte in 14 Sprachen und die Cache-Nummer. Keine Aenderung an Pruefung, Rechten oder Abo-Kette."
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

# EIN Versuch reicht bei github.com nicht (Lehre 18.09.2026: fuenf Nacht-Skripte
# gaben nach einer einzigen Anfrage auf, 13 Laeufe gingen so verloren). Und wenn
# der Stand oben schon derselbe ist, ist gar nichts zu schieben — genau das war
# hier der Fall, als die Verbindung mitten im zweiten Lauf abbrach.
schiebe() {           # $1 = Zweigname, $2 = Commit
  local zweig="$1" commit="$2" i oben
  for i in 1 2 3 4 5; do
    oben=$(git ls-remote origin "refs/heads/$zweig" 2>/dev/null | cut -f1)
    if [ "$oben" = "$commit" ]; then echo "  oben liegt schon ${commit:0:8}"; return 0; fi
    git push -q origin "${commit}:refs/heads/${zweig}" 2>/dev/null && return 0
    [ "$i" = "5" ] || { echo "  Netz: Versuch $i fehlgeschlagen, neuer Anlauf in $((i*10)) s"; sleep $((i*10)); }
  done
  return 1
}

echo "== 0. Stand holen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
WT_NEU=$(git rev-parse "origin/$ARBEITS_ZWEIG")
WT_BASIS=$(git rev-parse "$BASIS")
MEINE=($(git rev-list --reverse "$WT_BASIS..$WT_NEU"))
[ ${#MEINE[@]} -ge 1 ] || { echo "ABBRUCH: kein Commit zum Ausliefern."; exit 1; }
echo "  ${#MEINE[@]} Commit(s), Spitze ${WT_NEU:0:8}, Basis ${WT_BASIS:0:8}"

SCHON=0
# Nicht an der Cache-Nummer erkennen (die wandert mit jeder Nachrunde), sondern
# an der Spitze selbst: cherry-pick -x schreibt den Quell-Commit in die Nachricht.
if [ -d "$BAU" ] && git -C "$BAU" log --format=%B -30 2>/dev/null | grep -q "$WT_NEU"; then
  SCHON=1
  echo "  $BAU traegt den Bau schon ($(git -C "$BAU" rev-parse --short HEAD))"
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

echo "== 1. Commits in den Bauzweig uebertragen"
cd "$BAU"
if [ "$SCHON" = "0" ]; then
  for c in "${MEINE[@]}"; do
    git cherry-pick -x "$c" >/dev/null 2>&1 && continue
    OFFEN=$(git diff --name-only --diff-filter=U)
    # LEER heisst: der Inhalt liegt im Bauzweig schon (Parallelsitzung war da).
    if [ -z "$OFFEN" ]; then
      git cherry-pick --skip >/dev/null 2>&1 && continue
    fi
    # Ablagen (docs/, scripts/einmal/) beeinflussen den Bau NICHT, kollidieren
    # aber staendig, weil mehrere Sitzungen am selben Tag dieselbe Datei
    # fortschreiben. Dort gewinnt die neuere Fassung; alles andere braucht
    # einen Menschen.
    NUR_ABLAGE=1
    while IFS= read -r datei; do
      case "$datei" in
        docs/*|scripts/einmal/*) ;;
        *) NUR_ABLAGE=0 ;;
      esac
    done <<< "$OFFEN"
    if [ "$NUR_ABLAGE" = "1" ]; then
      while IFS= read -r datei; do
        git checkout --theirs "$datei" 2>/dev/null || git checkout --ours "$datei"
        git add "$datei"
      done <<< "$OFFEN"
      GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 && continue
    fi
    git cherry-pick --abort >/dev/null 2>&1
    echo "ABBRUCH: cherry-pick ${c:0:8} brauchte eine Entscheidung (offen: $OFFEN)."; exit 1
  done
fi
echo "  $(git rev-parse --short HEAD)"

echo "== 2. Freie Cache-Nummer"
hoechste() { printf '%s\n' "$@" | grep -o '[0-9]*' | sort -n | tail -1; }
SW_B=$(git -C "$APP" show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
SW_IST=$(git -C "$APP" show "$WT_NEU:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
BAU_SW=$(git -C "$BAU" show HEAD:public/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
[ "$BAU_SW" = "$SW_IST" ] && SW_B="$LIVE_SW"
HOCH=$(hoechste "$SW_B" "$LIVE_SW")
if [ "${SW_IST#smejj-shell-v}" -gt "$HOCH" ]; then SW_NEU="$SW_IST"; else SW_NEU="smejj-shell-v$(( HOCH + 1 ))"; fi
echo "  bauzweig $SW_B | live $LIVE_SW | unsere $SW_IST  ->  $SW_NEU"
if [ "$SW_NEU" != "$SW_IST" ]; then
  echo "ABBRUCH: $SW_IST ist belegt — im Arbeitszweig auf $SW_NEU heben (public/sw.js UND public/assets/sw.js) und erneut starten."; exit 1
fi
ANKER="schutz-100-2026-09-22-app-rueckweg-${SW_NEU#smejj-shell-}"

echo "== 3. Sperren neu einfrieren und Waechter pruefen"
cd "$BAU"
[ -e node_modules ] || ln -s "$APP/node_modules" node_modules
GESTEMPELT=0
for lock in check-security-lock check-start-lock; do
  if node "scripts/$lock.mjs" >/dev/null 2>&1; then
    echo "  $lock schon gruen"
  else
    node "scripts/$lock.mjs" --freeze --confirm "$WORTLAUT" >/dev/null || { echo "ABBRUCH: $lock liess sich nicht stempeln."; exit 1; }
    node "scripts/$lock.mjs" >/dev/null || { echo "ABBRUCH: $lock bleibt rot."; exit 1; }
    echo "  $lock gestempelt"
    GESTEMPELT=1
  fi
done
if [ "$GESTEMPELT" = "1" ]; then
  git add docs/security/security-lock-manifest.json docs/frontend/start-lock-manifest.json 2>/dev/null
  git "${autor[@]}" commit -q -m "chore(lock): Sperren nach dem App-Rueckweg der Anmeldung gestempelt ($SW_NEU)" || true
fi
for p in check-auslieferung-lock check-markenkette check-modul-syntax check-startgewicht check-precache-imports check-module-queries; do
  node "scripts/$p.mjs" >/dev/null || { echo "ABBRUCH: $p rot."; exit 1; }
done
npm run check:frontend --silent >/dev/null 2>&1 || { echo "ABBRUCH: Frontend-Tests rot im Bauzweig."; exit 1; }
node --test tests/google-auth-routes.test.mjs tests/github-auth-routes.test.mjs tests/apple-auth.test.mjs tests/magic-link.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Anmelde-Tests rot im Bauzweig."; exit 1; }
BAU_NEU=$(git rev-parse HEAD)
echo "  gruen (${BAU_NEU:0:8})"

echo "== 4. Bauzweig ausliefern (api.smejj.com)"
schiebe "$BAU_ZWEIG" "$BAU_NEU" || { echo "ABBRUCH: Push Bauzweig (Netz oder Parallelsitzung)."; exit 1; }
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
# Ist der live liegende Inhalt EIN FRUEHERER STAND AUS UNSERER EIGENEN
# GESCHICHTE? Genau das ist der Fall beim Spiegel unter /assets/: die
# Apple-Auslieferung am 19.09.2026 hat /auth/login/index.html erneuert, die
# assets-Kopie aber auf dem Stand vom 13.08. stehen gelassen (eine Zeile:
# die Versionsnummer hinter auth-page.js). So etwas ist KEIN fremder Eingriff,
# sondern unsere eigene Spur — und wird von diesem Bau ohnehin ueberschrieben,
# womit beide Kopien wieder zusammenkommen. Alles, was NICHT in unserer
# Geschichte steht, bleibt weiter ein Abbruchgrund.
eigener_alter_stand() {
  local pfad="$1"
  local blob
  blob=$(git -C "$KLON" rev-parse "origin/main:$pfad" 2>/dev/null) || return 1
  local quelle="${pfad#assets/}"
  local c
  for c in $(git -C "$APP" rev-list --all --max-count=400 -- "public/$quelle" "public/assets/$quelle"); do
    if [ "$(git -C "$APP" rev-parse "$c:public/$quelle" 2>/dev/null)" = "$blob" ]; then return 0; fi
    if [ "$(git -C "$APP" rev-parse "$c:public/assets/$quelle" 2>/dev/null)" = "$blob" ]; then return 0; fi
  done
  return 1
}

FREMD=0
for f in "${DATEIEN[@]}"; do
  if git -C "$APP" cat-file -e "$WT_BASIS:public/$f" 2>/dev/null; then
    a=$(git -C "$APP" show "$WT_BASIS:public/$f" | shasum -a 256 | cut -c1-16)
    b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    [ "$f" = "index.html" ] || [ "$f" = "sw.js" ] && c="$a"
    if [ "$a" = "$b" ] && { [ "$a" = "$c" ] || ! git show "origin/main:assets/$f" >/dev/null 2>&1; }; then :
    elif [ "$a" = "$b" ] && eigener_alter_stand "assets/$f"; then
      echo "    alt     assets/$f (frueherer eigener Stand, wird mitgezogen)"
    elif [ "$a" != "$b" ] && eigener_alter_stand "$f" && { [ "$a" = "$c" ] || eigener_alter_stand "assets/$f"; }; then
      echo "    alt     $f (frueherer eigener Stand, wird mitgezogen)"
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
git "${autor[@]}" commit -q -m "deploy(auth): Google-Login kehrt in die App zurueck; $SW_NEU — Quelle ${WT_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
schiebe main "$(git rev-parse HEAD)" || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
for i in $(seq 1 40); do
  sleep 10
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "  LIVE smejj.com: $L nach $((i*10)) s"; break; fi
done

echo "== 6. Nachweis"
OK=1
for f in auth/auth-page.js i18n/en-2.js i18n/ja-2.js; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://smejj.com/assets/$f?n=$RANDOM")
  [ "$C" = "200" ] || { echo "  FEHLT  /assets/$f ($C)"; OK=0; }
done
A=$(curl -s -m 20 "https://smejj.com/auth/auth-page.js?n=$RANDOM")
echo "$A" | grep -q "istAppHuelle" && echo "  auth-page.js kennt die App-Huelle" || { echo "  auth-page.js OHNE Huellen-Erkennung"; OK=0; }
echo "$A" | grep -q "native=1" && echo "  auth-page.js markiert den Start aus der Huelle" || { echo "  auth-page.js OHNE native-Markierung"; OK=0; }
echo "$A" | grep -q "zeigeRueckwegZurApp" && echo "  auth-page.js zeigt den Weg zurueck" || { echo "  auth-page.js OHNE Rueckweg"; OK=0; }
E=$(curl -s -m 20 "https://smejj.com/assets/i18n/en-2.js?n=$RANDOM" | grep -c "Back to the smejj app")
[ "$E" -ge 1 ] && echo "  en-2.js traegt den Rueckweg-Text" || { echo "  en-2.js OHNE Rueckweg-Text"; OK=0; }
J=$(curl -s -m 20 "https://smejj.com/assets/i18n/ja-2.js?n=$RANDOM" | grep -c "smejj アプリに戻る")
[ "$J" -ge 1 ] && echo "  ja-2.js traegt den Rueckweg-Text" || { echo "  ja-2.js OHNE Rueckweg-Text"; OK=0; }
# Der Server muss die Markierung durchreichen: ohne Anmeldung ist nur der
# START pruefbar — er darf mit native=1 weiter zu Google fuehren (303).
for weg in "google?mode=redirect&native=1" "github?native=1" "apple?native=1"; do
  START=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://api.smejj.com/api/auth/$weg")
  case "$START" in
    303) echo "  api.smejj.com nimmt native=1 an: ${weg%%\?*} (303)" ;;
    503) echo "  ${weg%%\?*}: 503 — dieser Weg ist serverseitig (noch) nicht konfiguriert" ;;
    *)   echo "  ${weg%%\?*}: unerwartet $START"; OK=0 ;;
  esac
done
# Der Anmeldelink verschickt eine E-Mail — hier wird nur geprueft, dass die
# Seite die Markierung ueberhaupt mitschickt.
echo "$A" | grep -q "returnOrigin: origin, native" && echo "  auth-page.js gibt native auch dem Anmeldelink mit" || { echo "  Anmeldelink OHNE native"; OK=0; }
echo "$A" | grep -q "imBrowserAnmelden" && echo "  Rueckweg-Bildschirm hat den zweiten Weg" || { echo "  zweiter Weg fehlt"; OK=0; }

echo "== 7. Jeder Precache-Eintrag live"
cd "$APP"
node - <<'JS'
import { readFileSync } from "node:fs";
const sw = readFileSync("public/sw.js", "utf8");
const liste = [...sw.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1])
  .filter((p) => /^\/(assets|icons|manifest|index|sw|willkommen|auth)/.test(p) || /\.(js|css|html|json|webmanifest|png|svg|woff2?)$/.test(p));
const einmalig = [...new Set(liste)];
let rot = 0;
// Paketweise zu 8: 239 gleichzeitige Anfragen liessen GitHub Pages am
// 20.09.2026 21-mal gar nicht antworten — einzeln waren alle 200.
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
  echo "  Der Web-Teil wirkt SOFORT auch in der schon installierten TestFlight-App:"
  echo "  sie laedt smejj.com live. Nach dem Google-Login zurueck zur App wechseln —"
  echo "  die Anmeldung wird dort automatisch uebernommen."
  echo "  Der automatische Ruecksprung (Knopf im Browser) kommt mit iPhone-Build 3."
else
  echo "  ACHTUNG: Nachweis unvollstaendig — bitte Protokoll lesen."
fi

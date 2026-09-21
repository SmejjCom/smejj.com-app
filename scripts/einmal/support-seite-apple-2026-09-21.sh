#!/bin/zsh
# Einmal-Kaskade 21.09.2026 — englische Support-Seite fuer die Apple-Support-URL.
#
# ANLASS: Die A-bis-Z-Inventur des Apple-Kontos fand zwei Dinge, die ein Pruefer
# sieht: die Support-URL zeigt auf imild.com (Firmen-Startseite, kein Wort ueber
# die App, Richtlinie 1.5), und die Hilfeseite behauptete live "smejj.com
# verlangt eine Anmeldung, bevor du es benutzen kannst" — das Gegenteil unserer
# eigenen Anmerkung an die App-Pruefung und des Gastmodus seit v933.
#
# Anders als die Kaskaden davor wird hier NUR EIN Commit uebertragen. Der
# Arbeitszweig traegt Arbeit anderer Sitzungen (Radar, Bruecke), die nicht
# mitgehen soll.
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAU="$HOME/smejj-support-seite-bau"
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
SW_NEU="smejj-shell-v945"
# Der Stand, auf dem der Bauzweig VOR diesem Commit stand. Gegen DEN wird live
# verglichen — nicht gegen origin/$BAU_ZWEIG: sobald Schritt 3 gepusht hat,
# traegt der Bauzweig schon die neue Fassung, und jede Datei saehe "fremd" aus
# (gemessen 21.09.2026, die Kaskade brach genau hier ab).
VOR_STAND="${VOR_STAND:-fe83e80a}"
ANKER="schutz-100-2026-09-21-support-v945"
WORTLAUT="Betreiber 21.09.2026 im Chat: 'mach die support-seite fertig und liefere aus'. Neue statische Seite /en/support.html plus Precache-Eintrag; keine Aenderung an Anmeldung, Abo oder Pruefkette."
# Nur diese Dateien gehen live — bewusst als Liste, nicht aus einem Diff.
DATEIEN=(sw.js hilfe.html hilfe-support.js en/support.html en/index.html)
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Stand holen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
MEIN=$(git log -1 --format=%H --grep="englische Support-Seite fuer die Apple-Support-URL" "origin/$ARBEITS_ZWEIG")
[ -n "$MEIN" ] || { echo "ABBRUCH: Commit nicht im Arbeitszweig gefunden."; exit 1; }
echo "  Commit ${MEIN:0:8}"

LIVE_SW=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
BAU_SW=$(git show "origin/$BAU_ZWEIG:public/sw.js" | grep -o 'smejj-shell-v[0-9]*' | head -1)
echo "  live $LIVE_SW | bauzweig $BAU_SW | neu $SW_NEU"
# Traegt der Bauzweig diesen Commit schon, ist das ein ZWEITER Lauf (der erste
# kam bis api.smejj.com und brach am Frontend ab). Dann ist v945 nicht "belegt",
# sondern unsere eigene Nummer — sonst blockiert die Kaskade sich selbst.
# Nicht ueber die Commit-Kennung: der cherry-pick erzeugt eine NEUE — gemessen
# 21.09.2026, die Weiche griff deshalb nicht. Gefragt wird nach dem ERGEBNIS.
FORTSETZUNG=0
git cat-file -e "origin/$BAU_ZWEIG:public/en/support.html" 2>/dev/null && FORTSETZUNG=1
if [ "$FORTSETZUNG" = "1" ]; then
  echo "  Fortsetzung: der Bauzweig traegt ${MEIN:0:8} schon"
  [ "${LIVE_SW#smejj-shell-v}" -lt "${SW_NEU#smejj-shell-v}" ] || { echo "ABBRUCH: live ist schon $LIVE_SW."; exit 1; }
else
  for alt in "$LIVE_SW" "$BAU_SW"; do
    [ "${alt#smejj-shell-v}" -lt "${SW_NEU#smejj-shell-v}" ] || { echo "ABBRUCH: $SW_NEU ist belegt ($alt)."; exit 1; }
  done
fi

SCHON=0
if [ -d "$BAU" ] && git -C "$BAU" log -1 --pretty=%s 2>/dev/null | grep -q "Apple-Support-URL"; then
  SCHON=1; echo "  $BAU traegt den Commit schon"
elif [ -d "$BAU" ]; then
  git -C "$BAU" cherry-pick --abort >/dev/null 2>&1
  git -C "$BAU" reset -q --hard >/dev/null 2>&1; git -C "$BAU" clean -qfd >/dev/null 2>&1
else
  git worktree add -f --detach "$BAU" "origin/$BAU_ZWEIG" >/dev/null 2>&1 || { echo "ABBRUCH: $BAU nicht anlegbar."; exit 1; }
fi
if [ "$SCHON" = "0" ]; then
  git -C "$BAU" checkout -q --detach "origin/$BAU_ZWEIG" || { echo "ABBRUCH: $BAU nicht setzbar."; exit 1; }
  echo "  $BAU -> origin/$BAU_ZWEIG ($(git -C "$BAU" rev-parse --short HEAD))"
fi

echo "== 1. Den einen Commit in den Bauzweig"
cd "$BAU"
if [ "$SCHON" = "0" ]; then
  if ! git cherry-pick -x "$MEIN" >/dev/null 2>&1; then
    OFFEN=$(git diff --name-only --diff-filter=U)
    if [ -z "$OFFEN" ]; then
      git cherry-pick --skip >/dev/null 2>&1 || { echo "ABBRUCH: leerer cherry-pick liess sich nicht ueberspringen."; exit 1; }
    else
      NUR_ABLAGE=1
      while IFS= read -r datei; do
        case "$datei" in docs/*|scripts/einmal/*) ;; *) NUR_ABLAGE=0 ;; esac
      done <<< "$OFFEN"
      if [ "$NUR_ABLAGE" = "1" ]; then
        while IFS= read -r datei; do
          git checkout --theirs "$datei" 2>/dev/null || git checkout --ours "$datei"
          git add "$datei"
        done <<< "$OFFEN"
        GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 || { echo "ABBRUCH: cherry-pick blieb stecken."; exit 1; }
      else
        git cherry-pick --abort >/dev/null 2>&1
        echo "ABBRUCH: cherry-pick brauchte eine Entscheidung (offen: $OFFEN)."; exit 1
      fi
    fi
  fi
fi
echo "  $(git rev-parse --short HEAD)"
GEBAUT=$(git show HEAD:public/sw.js | grep -o 'smejj-shell-v[0-9]*' | head -1)
[ "$GEBAUT" = "$SW_NEU" ] || { echo "ABBRUCH: Bauzweig traegt $GEBAUT statt $SW_NEU."; exit 1; }

echo "== 2. Sperren und Waechter"
[ -e node_modules ] || ln -s "$APP/node_modules" node_modules
npm run build:assets --silent >/dev/null 2>&1 || true
GESTEMPELT=0
for lock in check-security-lock check-abo-lock check-start-lock; do
  if node "scripts/$lock.mjs" >/dev/null 2>&1; then
    echo "  $lock schon gruen"
  else
    node "scripts/$lock.mjs" --freeze --confirm "$WORTLAUT" >/dev/null || { echo "ABBRUCH: $lock liess sich nicht stempeln."; exit 1; }
    node "scripts/$lock.mjs" >/dev/null || { echo "ABBRUCH: $lock bleibt rot."; exit 1; }
    echo "  $lock gestempelt"
    GESTEMPELT=1
  fi
done
if [ "$GESTEMPELT" = "1" ] || [ -n "$(git status --porcelain)" ]; then
  git add -A
  git "${autor[@]}" commit -q -m "chore(lock): Sperren nach der englischen Support-Seite gestempelt ($SW_NEU)" || true
fi
for p in check-auslieferung-lock check-markenkette check-modul-syntax check-startgewicht check-precache-imports; do
  node "scripts/$p.mjs" >/dev/null || { echo "ABBRUCH: $p rot."; exit 1; }
  echo "  $p gruen"
done
npm run check:frontend --silent >/dev/null 2>&1 || { echo "ABBRUCH: Frontend-Tests rot im Bauzweig."; exit 1; }
BAU_NEU=$(git rev-parse HEAD)
echo "  gruen (${BAU_NEU:0:8})"

echo "== 3. Bauzweig ausliefern (api.smejj.com)"
git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig (Parallelsitzung war schneller?)."; exit 1; }
API_LIVE=0
for i in $(seq 1 80); do
  S=$(curl -s -m 20 "https://api.smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$S" = "$SW_NEU" ]; then echo "  LIVE api.smejj.com: $S nach $((i*15)) s"; API_LIVE=1; break; fi
  sleep 15
done
[ "$API_LIVE" = "1" ] || { echo "ABBRUCH: api.smejj.com hat den Bau nicht — Frontend NICHT ausgeliefert."; exit 1; }

echo "== 4. Frontend (smejj.com)"
cd "$KLON" || { echo "ABBRUCH: Frontend-Klon fehlt."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "ABBRUCH: Frontend-Klon hat lokale Aenderungen."; exit 1; }
git fetch -q origin main || { echo "ABBRUCH: origin/main nicht erreichbar."; exit 1; }
# Vor dem Ueberschreiben: steht live etwas, das wir nicht kennen?
FREMD=0
for f in "${DATEIEN[@]}"; do
  if git -C "$APP" cat-file -e "$VOR_STAND:public/$f" 2>/dev/null; then
    a=$(git -C "$APP" show "$VOR_STAND:public/$f" | shasum -a 256 | cut -c1-16)
    b=$(git show "origin/main:$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    c=$(git show "origin/main:assets/$f" 2>/dev/null | shasum -a 256 | cut -c1-16)
    # sw.js liegt unter /assets/ bewusst in einer eigenen Fassung (Scope-Regel).
    [ "$f" = "sw.js" ] && c="$a"
    if [ "$a" = "$b" ] && { [ "$a" = "$c" ] || [ -z "$c" ]; }; then echo "    kenne  $f"; else echo "    FREMD  $f"; FREMD=1; fi
  else
    if git show "origin/main:$f" >/dev/null 2>&1; then echo "    FREMD  $f (live vorhanden, bei uns neu)"; FREMD=1; else echo "    neu    $f"; fi
  fi
done
[ "$FREMD" -eq 0 ] || { echo "ABBRUCH: live steht etwas, das wir nicht kennen — nichts ueberschrieben."; exit 1; }
git checkout -q main && git merge -q --ff-only origin/main || { echo "ABBRUCH: Klon nicht fast-forward."; exit 1; }
for f in "${DATEIEN[@]}"; do
  mkdir -p "$KLON/$(dirname "$f")"
  git -C "$BAU" show "HEAD:public/$f" > "$KLON/$f" || { echo "ABBRUCH: Kopie $f."; exit 1; }
  git add "$f"
  if [ "$f" != "sw.js" ] && [ -d "$KLON/assets" ]; then
    mkdir -p "$KLON/assets/$(dirname "$f")"
    git -C "$BAU" show "HEAD:public/$f" > "$KLON/assets/$f" && git add "assets/$f"
  fi
done
git "${autor[@]}" commit -q -m "deploy(support): englische Support-Seite /en/support.html; $SW_NEU — Quelle ${MEIN:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
for i in $(seq 1 40); do
  sleep 10
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "  LIVE smejj.com: $L nach $((i*10)) s"; break; fi
done

echo "== 5. Nachweis an der AUSGELIEFERTEN Seite"
OK=1
pruefe() { # URL, Suchwort, Erwartung(ja/nein)
  local inhalt; inhalt=$(curl -s -m 20 "$1?n=$RANDOM")
  local treffer; treffer=$(printf '%s' "$inhalt" | grep -c "$2")
  if [ "$3" = "ja" ]; then
    [ "$treffer" -ge 1 ] && echo "  OK   $1 enthaelt \"$2\"" || { echo "  ROT  $1 OHNE \"$2\""; OK=0; }
  else
    [ "$treffer" -eq 0 ] && echo "  OK   $1 ohne \"$2\"" || { echo "  ROT  $1 enthaelt noch \"$2\""; OK=0; }
  fi
}
C=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://smejj.com/en/support.html?n=$RANDOM")
[ "$C" = "200" ] && echo "  OK   /en/support.html ($C)" || { echo "  ROT  /en/support.html ($C)"; OK=0; }
pruefe "https://smejj.com/en/support.html" "DELETE ACCOUNT" ja
pruefe "https://smejj.com/en/support.html" "Report" ja
pruefe "https://smejj.com/en/support.html" "no account needed" ja
pruefe "https://smejj.com/hilfe.html" "verlangt eine Anmeldung" nein
pruefe "https://smejj.com/hilfe.html" "en/support.html" ja
pruefe "https://smejj.com/en/" "en/privacy.html" ja
pruefe "https://smejj.com/hilfe-support.js" "Send to support" ja

echo "== 6. Jeder Precache-Eintrag live"
cd "$APP"
node - <<'JS'
import { readFileSync } from "node:fs";
const sw = readFileSync("public/sw.js", "utf8");
const liste = [...sw.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1])
  .filter((p) => /^\/(assets|icons|manifest|index|sw|willkommen|auth|en)/.test(p) || /\.(js|css|html|json|webmanifest|png|svg|woff2?)$/.test(p));
const einmalig = [...new Set(liste)];
let rot = 0;
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

echo "== 7. Anker"
if [ "$OK" = "1" ]; then
  for d in "$APP" "$BAU"; do git -C "$d" tag -f "$ANKER" >/dev/null 2>&1; done
  git -C "$APP" push -q origin "$ANKER" 2>/dev/null || true
  echo "  FERTIG — $SW_NEU live, Anker $ANKER"
  echo "  Naechster Schritt: in App Store Connect die Support-URL auf"
  echo "  https://smejj.com/en/support.html aendern."
else
  echo "  ACHTUNG: Nachweis unvollstaendig — bitte Protokoll lesen."
fi

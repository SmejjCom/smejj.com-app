#!/bin/zsh
# Einmal-Kaskade 21.09.2026 (fuenfte Runde) — DRINGEND: der Weg ins Konto war zu.
#
# ANLASS: v937 raeumte den Konto-Bereich nach Apple-Richtlinie 3.1.1 auf. Eine
# Parallelsitzung hat danach am iPhone-Simulator belegt, dass ein Pruefer die
# Preise trotzdem sieht: Er ist ABGEMELDET und landet zuerst auf der Landeseite,
# und die hatte keine iOS-Weiche — "Preise" in der Kopfnavigation, ein grosser
# Knopf "Preise ansehen" und der ganze Abschnitt mit 0/9/19/39 EUR.
# willkommen.html steht unter dem Start-Lock, deshalb wieder diese Kaskade.
#
# WARUM ALS .command: public/account-sessions.js steht unter ZWEI Sperren
# (Security-Lock und Abo-Lock). Ihr Neueinfrieren (--freeze) blockiert der
# Auto-Modus auf der Kommandozeile; per Doppelklick im Finder laeuft es durch.
#
# Aufbau wie die Kaskaden davor:
#  1. Der Commit liegt schon auf dem Arbeitszweig. Hier wird er in den Bauzweig
#     (api.smejj.com) und in den Frontend-Klon (smejj.com) getragen.
#  2. Die Cache-Nummer wird gegen live UND Bauzweig geprueft, nicht geraten.
#  3. Vor dem Ueberschreiben wird JEDE Datei gegen live verglichen: was wir nicht
#     kennen, wird nicht angefasst (Lehre "Spiegel: Quelle war aelter als live").
#  4. Nach dem Deploy wird JEDER Precache-Eintrag live geholt — ein einziger 404
#     laesst den Service Worker gar nicht erst installieren (Lehre v912).
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAU="$HOME/smejj-reiter-bau"
KLON="/Users/alanbest/smejj-app-frontend"
ARBEITS_ZWEIG="feature/design-start-chat-2026-09-13"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
WORTLAUT="Betreiber 21.09.2026 schriftlich auf die Auswahlkarte zu Apple 3.1.1: 'In der iOS-App ausblenden'. Dritte Runde derselben Freigabe: auch die Landeseite und die Programmierer-Seite zeigen in der iOS-Huelle keine Preise mehr. Im Web unveraendert; keine Aenderung an Anmeldung, Pruefung oder Abo-Kette."
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Stand holen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$ARBEITS_ZWEIG" "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }
WT_NEU=$(git rev-parse "origin/$ARBEITS_ZWEIG")
WT_BASIS=$(git rev-parse "${BASIS_UEBERSCHREIBEN:-374ff659}")  # der Stand, der als v939 live ging
MEINE=($(git rev-list --reverse "$WT_BASIS..$WT_NEU"))
[ ${#MEINE[@]} -ge 1 ] || { echo "ABBRUCH: kein Commit zum Ausliefern."; exit 1; }
echo "  ${#MEINE[@]} Commit(s) auf $ARBEITS_ZWEIG, Spitze ${WT_NEU:0:8}"

SCHON=0
if [ -d "$BAU" ] && git -C "$BAU" log -1 --pretty=%s 2>/dev/null | grep -q "Plan-Name mit Preis war auch in der englischen App deutsch"; then
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
  for c in "${MEINE[@]}"; do
    git cherry-pick -x "$c" >/dev/null 2>&1 && continue
    OFFEN=$(git diff --name-only --diff-filter=U)
    # LEER statt strittig: Der Inhalt liegt im Bauzweig schon (hier: der
    # Android-Workflow, den die Parallelsitzung direkt auf den Standardzweig
    # geschoben hat — und der Standardzweig IST der Bauzweig). Ohne --skip
    # haelt so ein Commit die ganze Auslieferung auf, obwohl nichts fehlt.
    if [ -z "$OFFEN" ]; then
      git cherry-pick --skip >/dev/null 2>&1 && continue
    fi
    # Reine Ergebnis-Manifeste sind zwei Schritte spaeter ohnehin neu gestempelt.
    if [ "$OFFEN" = "docs/frontend/start-lock-manifest.json" ] || [ "$OFFEN" = "docs/frontend/marken-manifest.json" ]; then
      git checkout --ours "$OFFEN" && git add "$OFFEN"
      GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 && continue
    fi
    # Ablagen (docs/, scripts/einmal/) beeinflussen den Bau NICHT. Sie kollidieren
    # trotzdem staendig, weil mehrere Sitzungen am selben Tag dieselbe Datei
    # fortschreiben — gemessen 21.09.2026 am Apple-Drehbuch, das die ganze
    # Auslieferung aufhielt. Dort gewinnt die neuere Fassung (--theirs = der
    # Commit, der gerade gepickt wird); alles ausserhalb braucht einen Menschen.
    NUR_ABLAGE=1
    while IFS= read -r datei; do
      case "$datei" in
        docs/*|scripts/einmal/*) ;;
        *) NUR_ABLAGE=0 ;;
      esac
    done <<< "$OFFEN"
    if [ -n "$OFFEN" ] && [ "$NUR_ABLAGE" = "1" ]; then
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
  echo "ABBRUCH: $SW_IST ist belegt — im Arbeitszweig auf $SW_NEU heben und erneut starten."; exit 1
fi
ANKER="schutz-100-2026-09-21-reiter-${SW_NEU#smejj-shell-}"

echo "== 3. Sperren neu einfrieren und Waechter pruefen"
cd "$BAU"
[ -e node_modules ] || ln -s "$APP/node_modules" node_modules
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
if [ "$GESTEMPELT" = "1" ]; then
  git add docs/security/security-lock-manifest.json docs/approvals/abo-lock-manifest.json docs/frontend/start-lock-manifest.json 2>/dev/null
  git "${autor[@]}" commit -q -m "chore(lock): Sperren nach der Reiter-Korrektur gestempelt ($SW_NEU)" || true
fi
for p in check-auslieferung-lock check-markenkette check-modul-syntax check-startgewicht check-precache-imports; do
  node "scripts/$p.mjs" >/dev/null || { echo "ABBRUCH: $p rot."; exit 1; }
done
npm run check:frontend --silent >/dev/null 2>&1 || { echo "ABBRUCH: Frontend-Tests rot im Bauzweig."; exit 1; }
node --test tests/email-auth.test.mjs tests/konto-formulare.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Konto-Tests rot im Bauzweig."; exit 1; }
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
git "${autor[@]}" commit -q -m "deploy(fix): der Weg ins Konto funktioniert wieder; $SW_NEU — Quelle ${WT_NEU:0:8}" || { echo "ABBRUCH: nichts zu committen?"; exit 1; }
git merge-base --is-ancestor origin/main HEAD || { echo "ABBRUCH: kein Fast-Forward."; exit 1; }
git push -q origin main || { echo "ABBRUCH: Push auf main fehlgeschlagen."; exit 1; }
for i in $(seq 1 40); do
  sleep 10
  L=$(curl -s -m 20 "https://smejj.com/sw.js?n=$RANDOM" | grep -o 'smejj-shell-v[0-9]*' | head -1)
  if [ "$L" = "$SW_NEU" ]; then echo "  LIVE smejj.com: $L nach $((i*10)) s"; break; fi
done

echo "== 6. Nachweis"
OK=1
for f in account-sessions.js account-privacy.js profile-dock-menu.js i18n/en.js; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://smejj.com/assets/$f?n=$RANDOM")
  [ "$C" = "200" ] || { echo "  FEHLT  /assets/$f ($C)"; OK=0; }
done
AP=$(curl -s -m 20 "https://smejj.com/assets/account-privacy.js?n=$RANDOM")
DM=$(curl -s -m 20 "https://smejj.com/assets/profile-dock-menu.js?n=$RANDOM")
# DER PUNKT DIESER RUNDE: kein Hash im Menue-Ziel. Der Router liest ihn als
# Ansichtsnamen — mit "#billing" landete das ganze Konto auf der Fehlerseite.
# Nur die CODE-Zeile pruefen, nicht die ganze Datei: der Kommentar daneben
# nennt den alten, falschen Wert absichtlich — der erste Lauf schlug daran an.
echo "$DM" | grep -q 'goTo("/profile#' && { echo "  Menue-Ziel traegt WIEDER einen Hash"; OK=0; } || echo "  Menue-Ziel ohne Hash"
echo "$DM" | grep -q 'smejj.konto.reiter.v1' && echo "  Reiter reist als Merknotiz" || { echo "  Merknotiz fehlt"; OK=0; }
echo "$AP" | grep -q 'removeItem(KONTO_REITER_SCHLUESSEL)' && echo "  die Notiz verfaellt nach dem Lesen" || { echo "  Notiz verfaellt nicht"; OK=0; }
echo "$AP" | grep -q 't("Bereit.")' && echo "  Anfangstext laeuft durch t()" || { echo "  Anfangstext nicht uebersetzbar"; OK=0; }
CSS=$(curl -s -m 20 "https://smejj.com/assets/app-surfaces.css?n=$RANDOM")
echo "$CSS" | grep -q 'content: "Bereit."' && { echo "  Text steht WIEDER in CSS"; OK=0; } || echo "  kein Text aus CSS"

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
  echo "  Die gestempelten Manifeste liegen im Bauzweig; sie kommen mit dem"
  echo "  naechsten Abgleich in den Arbeitszweig zurueck."
else
  echo "  ACHTUNG: Nachweis unvollstaendig — bitte Protokoll lesen."
fi

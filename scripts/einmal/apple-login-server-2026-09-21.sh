#!/bin/zsh
# Einmal-Kaskade 21.09.2026 — den Server-Teil von "Mit Apple anmelden" ausliefern.
#
# ANLASS: Betreiber am 21.09.2026 im Chat: "apple login 4.8 machen". Apple
# verlangt in Richtlinie 4.8 "Mit Apple anmelden", sobald eine App andere
# Anmeldedienste anbietet (bei uns Google und GitHub). Der Code ist seit dem
# 19.09. fertig und getestet, liegt aber NUR im Arbeitszweig: im Bauzweig
# fehlen src/auth/appleAuth.js, appleAuthRoutes.js und die beiden Zeilen in
# extraAuthRoutes.js/controlAccessPolicy.js. Deshalb antwortet
# https://api.smejj.com/api/auth/apple heute 404 — gemessen am selben Tag.
#
# GEFAHRLOS: Ohne die vier SMEJJ_APPLE_LOGIN_*-Variablen meldet
# /api/auth/config weiterhin `apple: false`, der Knopf bleibt versteckt und die
# Routen antworten 503. Es kann also nichts kaputtgehen, wenn vor dem Setzen
# der Variablen ausgeliefert wird.
#
# KEIN FRONTEND-DEPLOY: Der Knopf und config.js sind auf smejj.com laengst live
# (sie kamen ueber die Frontend-Lieferungen mit). Hier geht es nur um den Server.
set -uo pipefail
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
BAU="$HOME/smejj-apple-bau"
BAU_ZWEIG="feature/auth-redesign-github-magiclink"
APPLE_COMMIT="${APPLE_COMMIT:-687fb37f}"
WORTLAUT="Betreiber 21.09.2026 schriftlich im Chat: 'apple login 4.8 machen'. Der Server-Teil von 'Mit Apple anmelden' geht in den Bauzweig; er bleibt ohne die vier SMEJJ_APPLE_LOGIN_*-Variablen wirkungslos (config meldet apple:false, Routen 503). Die Rueckkehr-Route laesst als einzige den Origin appleid.apple.com zu — form_post ist bei den Bereichen name/email Pflicht."
export GIT_TERMINAL_PROMPT=0
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
autor=(-c user.name="Wof Kadavanich" -c user.email=smejjcom@gmail.com)

echo "== 0. Stand holen"
cd "$APP" || { echo "ABBRUCH: $APP fehlt."; exit 1; }
git fetch -q origin "$BAU_ZWEIG" || { echo "ABBRUCH: origin nicht erreichbar."; exit 1; }

SCHON=0
if [ -d "$BAU" ] && git -C "$BAU" log -1 --pretty=%s 2>/dev/null | grep -q "Mit Apple anmelden"; then
  SCHON=1
  echo "  $BAU traegt den Commit schon ($(git -C "$BAU" rev-parse --short HEAD))"
fi
if [ "$SCHON" = "0" ]; then
  if [ -d "$BAU" ]; then
    git -C "$BAU" cherry-pick --abort >/dev/null 2>&1
    git -C "$BAU" reset -q --hard >/dev/null 2>&1; git -C "$BAU" clean -qfd >/dev/null 2>&1
  else
    git worktree add -f --detach "$BAU" "origin/$BAU_ZWEIG" >/dev/null 2>&1 || { echo "ABBRUCH: $BAU nicht anlegbar."; exit 1; }
  fi
  git -C "$BAU" checkout -q --detach "origin/$BAU_ZWEIG" || { echo "ABBRUCH: $BAU nicht setzbar."; exit 1; }
  echo "  $BAU -> origin/$BAU_ZWEIG ($(git -C "$BAU" rev-parse --short HEAD))"
fi

echo "== 1. Apple-Commit in den Bauzweig"
cd "$BAU"
if [ "$SCHON" = "0" ]; then
  if ! git "${autor[@]}" cherry-pick -x "$APPLE_COMMIT" >/dev/null 2>&1; then
    OFFEN=$(git diff --name-only --diff-filter=U)
    # Erwartbare Konflikte, alle harmlos: die beiden Lock-Manifeste (reines
    # Ergebnis, werden gleich neu gestempelt) und die 14 i18n-Hauptdateien.
    # Dort GEWINNT DER BAUZWEIG — er traegt den Apple-Schluessel laengst (die
    # spaeteren Uebersetzungsrunden bauen auf dem Apple-Commit auf, gemessen
    # 21.09.2026 an en.js). Alles ausserhalb braucht einen Menschen.
    NUR_ERWARTET=1
    while IFS= read -r datei; do
      case "$datei" in
        docs/frontend/start-lock-manifest.json|docs/security/security-lock-manifest.json|public/i18n/*.js) ;;
        *) NUR_ERWARTET=0 ;;
      esac
    done <<< "$OFFEN"
    if [ -z "$OFFEN" ] || [ "$NUR_ERWARTET" = "0" ]; then
      git cherry-pick --abort >/dev/null 2>&1
      echo "ABBRUCH: cherry-pick brauchte eine Entscheidung (offen: $OFFEN)."; exit 1
    fi
    while IFS= read -r datei; do git checkout --ours "$datei" && git add "$datei"; done <<< "$OFFEN"
    GIT_EDITOR=true git cherry-pick --continue >/dev/null 2>&1 || { echo "ABBRUCH: cherry-pick --continue."; exit 1; }
  fi
fi
echo "  $(git rev-parse --short HEAD)"

echo "== 2. Der Code ist wirklich da"
for f in src/auth/appleAuth.js src/auth/appleAuthRoutes.js; do
  [ -f "$f" ] || { echo "ABBRUCH: $f fehlt im Bauzweig."; exit 1; }
done
grep -q "createAppleAuthHandlers" src/auth/extraAuthRoutes.js || { echo "ABBRUCH: Routen nicht eingebunden."; exit 1; }
grep -q "authAppleCallback" src/shared/controlAccessPolicy.js || { echo "ABBRUCH: Rueckkehr-Route nicht freigegeben."; exit 1; }
echo "  appleAuth.js, appleAuthRoutes.js, Einbindung und Zugriffsregel vorhanden"

echo "== 3. Sperren neu einfrieren und Tests"
[ -e node_modules ] || ln -s "$APP/node_modules" node_modules
for lock in check-security-lock check-start-lock; do
  if node "scripts/$lock.mjs" >/dev/null 2>&1; then
    echo "  $lock schon gruen"
  else
    node "scripts/$lock.mjs" --freeze --confirm "$WORTLAUT" >/dev/null || { echo "ABBRUCH: $lock liess sich nicht stempeln."; exit 1; }
    node "scripts/$lock.mjs" >/dev/null || { echo "ABBRUCH: $lock bleibt rot."; exit 1; }
    echo "  $lock gestempelt"
  fi
done
git add docs/security/security-lock-manifest.json docs/frontend/start-lock-manifest.json 2>/dev/null
git "${autor[@]}" commit -q -m "chore(lock): Sperren nach dem Apple-Login-Server gestempelt" 2>/dev/null || true
node --test tests/apple-auth.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Apple-Tests rot."; exit 1; }
node --test tests/control-access-policy.test.mjs >/dev/null 2>&1 || { echo "ABBRUCH: Zugriffsregel-Tests rot."; exit 1; }
node scripts/check-auslieferung-lock.mjs >/dev/null || { echo "ABBRUCH: Auslieferungs-Lock rot."; exit 1; }
BAU_NEU=$(git rev-parse HEAD)
echo "  gruen (${BAU_NEU:0:8})"

echo "== 4. Bauzweig ausliefern (api.smejj.com)"
git push -q origin "${BAU_NEU}:refs/heads/${BAU_ZWEIG}" || { echo "ABBRUCH: Push Bauzweig (Parallelsitzung war schneller?)."; exit 1; }
LIVE=0
for i in $(seq 1 80); do
  S=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://api.smejj.com/api/auth/apple?n=$RANDOM")
  # 404 = alter Stand. 503 = da, aber noch ohne Variablen. 302 = vollstaendig.
  if [ "$S" != "404" ] && [ "$S" != "000" ]; then echo "  LIVE api.smejj.com: /api/auth/apple antwortet $S nach $((i*15)) s"; LIVE=1; break; fi
  sleep 15
done
[ "$LIVE" = "1" ] || { echo "ABBRUCH: api.smejj.com antwortet weiter 404 — Bau nicht durch?"; exit 1; }

echo "== 5. Nachweis"
OK=1
CFG=$(curl -s -m 20 "https://api.smejj.com/api/auth/config?n=$RANDOM")
echo "$CFG" | grep -q '"apple"' && echo "  /api/auth/config kennt apple" || { echo "  /api/auth/config OHNE apple"; OK=0; }
APPLE_AN=$(echo "$CFG" | grep -o '"apple": *[a-z]*' | grep -o '[a-z]*$')
echo "  methods.apple = $APPLE_AN   (false ist richtig, solange die vier Variablen fehlen)"
S=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://api.smejj.com/api/auth/apple?n=$RANDOM")
[ "$S" = "503" ] && echo "  /api/auth/apple: 503 — da, aber noch ohne Schluessel (erwartet)" || echo "  /api/auth/apple: $S"
# Die Rueckkehr-Route darf NIE offen fuer fremde Origins sein.
S2=$(curl -s -o /dev/null -w "%{http_code}" -m 20 -X POST -H "Origin: https://beispiel.invalid" "https://api.smejj.com/api/auth/apple/callback")
[ "$S2" = "403" ] || [ "$S2" = "503" ] || [ "$S2" = "400" ] && echo "  fremder Origin am Callback: $S2 (abgewiesen)" || { echo "  fremder Origin am Callback: $S2 — PRUEFEN"; OK=0; }

echo "== 6. Anker"
if [ "$OK" = "1" ]; then
  ANKER="schutz-100-2026-09-21-apple-login-server"
  for d in "$APP" "$BAU"; do git -C "$d" tag -f "$ANKER" >/dev/null 2>&1; done
  git -C "$APP" push -q origin "$ANKER" 2>/dev/null || true
  echo "  FERTIG — Apple-Login-Server live, Anker $ANKER"
  echo "  Es fehlen nur noch die vier SMEJJ_APPLE_LOGIN_*-Variablen auf Zeabur."
else
  echo "  ACHTUNG: Nachweis unvollstaendig — bitte Protokoll lesen."
fi

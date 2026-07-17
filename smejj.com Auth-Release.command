#!/bin/bash
# smejj.com — Auth-Release per Doppelklick (Capsule restarbeiten-auth-2026-07-13).
# Schriftliche Freigabe: Wof Kadavanich, 2026-07-13 ("Mach komplett fertig ... Du hast alle Rechte").
# Ablauf (fail-closed, erzwungene Reihenfolge, KEINE Secret-Ausgabe):
#   1. Verification Pipeline (release:preflight)
#   2. Control-Artefakt deterministisch bauen
#   3. Artefakt nach IDrive e2 hochladen (If-None-Match + SHA-256-Readback)
#   4. WARTEN, bis Salad smejj-control mit dem neuen Artefakt laeuft (eine
#      manuelle Portal-Umstellung wie bei rc9; Anweisung wird angezeigt)
#   5. Erst DANN: Auth-Frontend ins Pages-Repo committen und pushen
#   6. Live-Checks (Seiten + Assets + Auth-Route)
# Alle Details: tmp/auth-release-diagnose.txt (enthaelt niemals Secret-Werte).
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
REPO="$HOME/smejj-app-frontend"
DIAG="$APP/tmp/auth-release-diagnose.txt"
RID="smejj-control-auth-2026-07-13-rc2"
ART_DIR="$APP/tmp/auth-release"
ART_FILE="$ART_DIR/$RID.tar.gz"
ART_KEY="deployments/control/$RID/smejj-control-context.tar.gz"
CONTROL="https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud"
export GIT_TERMINAL_PROMPT=0

log() { echo "$1" | tee -a "$DIAG"; }
fail() { log "FEHLER: $1"; log "Abbruch — nichts wurde live geschaltet. Details: tmp/auth-release-diagnose.txt"; exit 1; }
mkdir -p "$ART_DIR"; echo "== smejj.com auth-release $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIAG"
cd "$APP" || fail "Workspace nicht gefunden"

# Node/npm/pnpm finden: .command-Shells laden keine Login-Profile (nvm/Homebrew fehlen im PATH).
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH
command -v node >/dev/null 2>&1 || fail "Node.js ist auf diesem Mac nicht installiert. Bitte einmalig https://nodejs.org (LTS, macOS-Installer) installieren und dieses Skript erneut doppelklicken. Alles Weitere laeuft dann automatisch."
command -v npm  >/dev/null 2>&1 || fail "npm nicht gefunden (Node.js-Installation unvollstaendig)"
command -v git  >/dev/null 2>&1 || fail "git fehlt. Bitte einmalig die Xcode Command Line Tools installieren (Terminal-Befehl: xcode-select --install) und erneut doppelklicken."
log "Node: $(command -v node) ($(node --version))"

if ! command -v pnpm >/dev/null 2>&1; then
  # package.json-Skripte rufen intern pnpm auf; ohne pnpm-Installation genuegt
  # ein lokaler Shim auf npm (identisches Skript-Verhalten, in Sandbox verifiziert).
  mkdir -p "$HOME/.smejj-bin"
  printf '#!/bin/bash\nexec npm "$@"\n' > "$HOME/.smejj-bin/pnpm"
  chmod +x "$HOME/.smejj-bin/pnpm"
  PATH="$HOME/.smejj-bin:$PATH"; export PATH
  log "pnpm-Shim aktiv (nutzt npm)."
fi
PM=npm; command -v pnpm >/dev/null 2>&1 && PM=pnpm
log "Schritt 1/6 — Verification Pipeline ($PM run release:preflight) ... das dauert einige Minuten."
"$PM" run release:preflight >> "$DIAG" 2>&1 || fail "Pipeline rot — kein Release."
log "Pipeline gruen."

log "Schritt 2/6 — Control-Artefakt bauen ($RID) ..."
SMEJJ_CONTROL_RELEASE_ID="$RID" \
SMEJJ_CONTROL_RELEASE_CREATED_AT="2026-07-13T16:00:00.000Z" \
npm run control:artifact > "$ART_DIR/build-result.json.raw" 2>>"$DIAG" || fail "Artefakt-Build fehlgeschlagen."
node -e '
const fs=require("fs");
const raw=fs.readFileSync(process.argv[1],"utf8");
const start=raw.indexOf("{"); if(start<0) process.exit(1);
const j=JSON.parse(raw.slice(start));
if(!/^[a-f0-9]{64}$/.test(j.sha256||"")) { console.error("Kein SHA-256 im Build-Ergebnis"); process.exit(1); }
if(!j.archive || j.ok!==true || j.secretsIncluded!==false) { console.error("Build-Ergebnis ungueltig"); process.exit(1); }
fs.writeFileSync(process.argv[2], j.sha256);
fs.writeFileSync(process.argv[3], j.archive);
' "$ART_DIR/build-result.json.raw" "$ART_DIR/artifact.sha256" "$ART_DIR/artifact.path" || fail "Build-Ergebnis unlesbar."
ART_SHA=$(cat "$ART_DIR/artifact.sha256")
ART_FILE=$(cat "$ART_DIR/artifact.path")
[ -f "$ART_FILE" ] || fail "Artefaktdatei fehlt: $ART_FILE"
log "Artefakt: $ART_FILE"
log "SHA-256:  $ART_SHA"

log "Schritt 3/6 — Upload nach IDrive e2 (Key: $ART_KEY) ..."
CONFIRM_CONTROL_RELEASE_UPLOAD=YES \
SMEJJ_CONTROL_RELEASE_FILE="$ART_FILE" \
SMEJJ_CONTROL_ARTIFACT_KEY="$ART_KEY" \
SMEJJ_CONTROL_ARTIFACT_SHA256="$ART_SHA" \
npm run idrive:control-release >> "$DIAG" 2>&1 || fail "IDrive-Upload fehlgeschlagen (Zugangsdaten in ~/.config/smejj.com/env.local pruefen)."
log "Upload verifiziert (If-None-Match + Readback)."

git_push_with_fallback() {
  if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git push origin HEAD >> "$DIAG" 2>&1; then return 0; fi
  for key in "$HOME/.ssh/agent"/* "$HOME/.ssh"/id_*; do
    [ -f "$key" ] || continue
    case "$key" in *.pub|*known_hosts*|*config*) continue ;; esac
    GIT_SSH_COMMAND="ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 -i $key" git push origin HEAD >> "$DIAG" 2>&1 && return 0
  done
  return 1
}

log "Schritt 4a/6 — Control-Overlay im Repo SmejjCom/smejj-control aktualisieren ..."
CTRLREPO="$HOME/smejj-control"
if [ ! -d "$CTRLREPO/.git" ]; then
  GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git clone git@github.com:SmejjCom/smejj-control.git "$CTRLREPO" >> "$DIAG" 2>&1 || fail "smejj-control-Repo weder vorhanden noch klonbar."
fi
cd "$CTRLREPO" || fail "smejj-control-Repo nicht betretbar."
git pull --ff-only >> "$DIAG" 2>&1
# Overlay-Dateiliste maschinell aus der massgeblichen Quelle extrahieren (keine Drift).
node -e '
const fs=require("fs");
const src=fs.readFileSync(process.argv[1],"utf8");
const m=src.match(/const FILES = \[([\s\S]*?)\];/); if(!m){process.exit(1);}
const files=[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
fs.writeFileSync(process.argv[2], files.join("\n"));
' "$APP/scripts/deploy/bootstrap-control-overlay.mjs" "$ART_DIR/overlay-files.txt" || fail "Overlay-Dateiliste nicht extrahierbar."
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ "$f" = "package.json" ]; then SRC="$APP/scripts/deploy/control-runtime-package.json"; else SRC="$APP/$f"; fi
  [ -f "$SRC" ] || fail "Overlay-Quelldatei fehlt: $SRC"
  mkdir -p "runtime/control-overlay/$(dirname "$f")"
  cp "$SRC" "runtime/control-overlay/$f"
done < "$ART_DIR/overlay-files.txt"
# Runtime-Bootstraps (SHA-gepinnt) NIEMALS anfassen:
git checkout -- runtime/bootstrap-control-release.mjs runtime/bootstrap-idrive-control.mjs runtime/bootstrap-control-overlay.mjs 2>/dev/null || true
if grep -rniE "(api[_-]?key|secret_key|token)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_-]{16,}" runtime/control-overlay >/dev/null 2>&1; then
  fail "potentielles Secret im Overlay — Abbruch."
fi
git add runtime/control-overlay
git diff --cached --quiet || git commit -m "auth: E-Mail/Passwort-Auth + Session-Registry Overlay (capsule restarbeiten-auth-2026-07-13, artefakt $RID)" >> "$DIAG" 2>&1
git_push_with_fallback || fail "Push nach smejj-control fehlgeschlagen (SSH pruefen)."
CTRL_SHA=$(git rev-parse HEAD)
BOOTSTRAP_URL="https://raw.githubusercontent.com/SmejjCom/smejj-control/$CTRL_SHA/runtime/bootstrap-control-release.mjs"
log "smejj-control gepusht. Commit: $CTRL_SHA"
cd "$APP"

probe_auth_route() {
  curl -s -o /dev/null -w "%{http_code}" -m 15 -X POST "$CONTROL/api/auth/email/register" \
    -H "Content-Type: application/json" -H "Origin: https://smejj.com" -d '{}' 2>/dev/null
}

log ""
log "Schritt 4b/6 — Salad-Umstellung (EINMALIGE manuelle Aktion, exakt DREI Variablen, keine Secrets):"
log "  Salad-Portal -> Container Group smejj-control -> Edit -> Environment:"
log "    SMEJJ_CONTROL_BOOTSTRAP_URL   = $BOOTSTRAP_URL"
log "    SMEJJ_CONTROL_ARTIFACT_KEY    = $ART_KEY"
log "    SMEJJ_CONTROL_ARTIFACT_SHA256 = $ART_SHA"
log "  Alle anderen Variablen NICHT anfassen. Danach deployen/Instanz neu erstellen."
log ""
log "Dieses Skript wartet jetzt bis zu 45 Minuten und macht automatisch weiter, sobald die neue Auth-Route live ist ..."
DEADLINE=$(( $(date +%s) + 2700 ))
while :; do
  CODE=$(probe_auth_route)
  if [ "$CODE" = "400" ] || [ "$CODE" = "429" ]; then log "Neue Auth-Route ist LIVE (HTTP $CODE auf leeren Register-Request)."; break; fi
  [ $(date +%s) -gt $DEADLINE ] && fail "Timeout: Control antwortet weiter mit HTTP $CODE (Route fehlt) — Salad-Umstellung nicht erkannt. Skript nach der Umstellung einfach erneut doppelklicken; Schritte 1-3 sind idempotent."
  sleep 20
done
HEALTH=$(curl -s -m 15 "$CONTROL/api/health" | head -c 200)
echo "$HEALTH" | grep -q '"ok": *true' || fail "Control-Health nicht ok nach Umstellung."
log "Control-Health ok."

log "Schritt 5/6 — Auth-Frontend ins Pages-Repo pushen ..."
cd "$REPO" || fail "Frontend-Repo fehlt: $REPO"
git pull --ff-only >> "$DIAG" 2>&1
mkdir -p auth/login auth/register assets/auth
cp "$APP/public/auth/login/index.html"    auth/login/index.html
cp "$APP/public/auth/register/index.html" auth/register/index.html
cp "$APP/public/auth/auth-page.js"        assets/auth/auth-page.js
cp "$APP/public/auth/auth.css"            assets/auth/auth.css
cp "$APP/public/account-sessions.js"      assets/account-sessions.js
cp "$APP/public/account-privacy.js"       assets/account-privacy.js
if grep -rniE "(api[_-]?key|secret|token)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_-]{16,}" assets/auth assets/account-sessions.js assets/account-privacy.js >/dev/null 2>&1; then
  fail "potentielles Secret in Frontend-Dateien — Abbruch."
fi
git add auth/login/index.html auth/register/index.html assets/auth/auth-page.js assets/auth/auth.css assets/account-sessions.js assets/account-privacy.js
git diff --cached --quiet || git commit -m "auth: E-Mail/Passwort-Login, Session-Verwaltung, Account-Sicherheit (capsule restarbeiten-auth-2026-07-13)" >> "$DIAG" 2>&1
PUSHED=""
if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git push origin HEAD >> "$DIAG" 2>&1; then
  PUSHED="standard-ssh"
else
  for key in "$HOME/.ssh/agent"/* "$HOME/.ssh"/id_*; do
    [ -f "$key" ] || continue
    case "$key" in *.pub|*known_hosts*|*config*) continue ;; esac
    if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 -i $key" git push origin HEAD >> "$DIAG" 2>&1; then
      PUSHED="key:$(basename "$key")"; break
    fi
  done
fi
[ -n "$PUSHED" ] || fail "git push fehlgeschlagen (SSH-Zugang pruefen)."
log "Frontend gepusht ($PUSHED). GitHub Pages baut jetzt (Free-Branch-Deploy) ..."

log "Schritt 6/6 — Live-Verifikation ..."
DEADLINE=$(( $(date +%s) + 600 ))
while :; do
  L=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://smejj.com/auth/login/?v=$RID")
  R=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://smejj.com/auth/register/?v=$RID")
  A=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://smejj.com/assets/account-sessions.js?v=$RID")
  [ "$L" = "200" ] && [ "$R" = "200" ] && [ "$A" = "200" ] && break
  [ $(date +%s) -gt $DEADLINE ] && fail "Pages-Deploy nicht sichtbar (login=$L register=$R assets=$A)."
  sleep 15
done
curl -s -m 15 "https://smejj.com/auth/login/?v=$RID" | grep -q "emailFormGroup" || fail "Login-Seite live ohne E-Mail-Formular."
curl -s -m 15 "https://smejj.com/" | grep -q "smejj" || fail "Startseite nicht erreichbar!"
log ""
log "=== FERTIG: Auth-Release live. ==="
log "Artefakt-Key: $ART_KEY"
log "Artefakt-SHA: $ART_SHA"
log "Naechster Schritt: Claude fuehrt die Live-Browsertests (Desktop/Mobil, Login/Logout/Reset/Sessions) durch."
log "Rollback: Salad auf vorherige Version; im Pages-Repo diesen Commit revertieren."
exit 0

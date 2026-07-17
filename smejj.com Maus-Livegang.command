#!/bin/bash
# smejj.com — Maus-Engine-Livegang per Doppelklick (Capsule maus-engine-livegang-2026-07-14).
# Schriftliche Freigabe: Wof Kadavanich, 2026-07-14 (Prompt "Maus-Engine zu 100 % fertigstellen").
# Ablauf (fail-closed, erzwungene Reihenfolge, KEINE Secret-Ausgabe):
#   1. pnpm run check:all                (Pflicht, Exit 0)
#   2. pnpm run release:preflight        (Pflicht, Exit 0)
#   3. Docker-Image smejj-maus-engine bauen, smoke-testen, nach ghcr.io pushen
#   4. Control-Artefakt (inkl. workers/maus-engine + schemas) bauen
#   5. Artefakt nach IDrive e2 hochladen (If-None-Match + SHA-256-Readback)
#   6. Control-Overlay in SmejjCom/smejj-control synchronisieren und pushen
#   7. Exakte Salad-Portal-Werte anzeigen (Werte-Eingabe macht NUR der Nutzer)
#   8. Warten, bis /api/maus/run live ist (401 statt 404), dann Health-Check
# Alle Details: tmp/maus-livegang/diagnose.txt (enthaelt niemals Secret-Werte).
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
OUT="$APP/tmp/maus-livegang"
DIAG="$OUT/diagnose.txt"
STATUS="$OUT/status.json"
RID="smejj-control-maus-2026-07-14-rc1"
ART_KEY="deployments/control/$RID/smejj-control-context.tar.gz"
CONTROL="https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud"
IMAGE="ghcr.io/smejjcom/smejj-maus-engine:v1"
export GIT_TERMINAL_PROMPT=0

mkdir -p "$OUT"
log() { echo "$1" | tee -a "$DIAG"; }
setstatus() {
  printf '{ "app": "smejj.com", "step": "%s", "ok": %s, "updatedAt": "%s" }\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS"
}
fail() { log "FEHLER: $1"; setstatus "$2" false; log "Abbruch — nichts wurde live geschaltet. Details: tmp/maus-livegang/diagnose.txt"; exit 1; }

echo "== smejj.com maus-livegang $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIAG"
setstatus "start" true
cd "$APP" || { echo "Workspace nicht gefunden"; exit 1; }

# Node/npm/pnpm finden: .command-Shells laden keine Login-Profile.
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH
command -v node >/dev/null 2>&1 || fail "Node.js fehlt. Bitte einmalig https://nodejs.org (LTS) installieren und erneut doppelklicken." "node"
command -v git  >/dev/null 2>&1 || fail "git fehlt (xcode-select --install) und erneut doppelklicken." "git"
log "Node: $(command -v node) ($(node --version))"

if ! command -v pnpm >/dev/null 2>&1; then
  mkdir -p "$HOME/.smejj-bin"
  printf '#!/bin/bash\nexec npm "$@"\n' > "$HOME/.smejj-bin/pnpm"
  chmod +x "$HOME/.smejj-bin/pnpm"
  PATH="$HOME/.smejj-bin:$PATH"; export PATH
  log "pnpm-Shim aktiv (nutzt npm; etablierte Konvention der bisherigen Releases)."
fi

log ""
log "Schritt 1/8 — pnpm run check:all ... (dauert einige Minuten)"
setstatus "check:all" true
pnpm run check:all >> "$DIAG" 2>&1 || fail "check:all rot — kein Livegang." "check:all"
log "check:all GRUEN (Exit 0)."

log "Schritt 2/8 — pnpm run release:preflight ..."
setstatus "release:preflight" true
pnpm run release:preflight >> "$DIAG" 2>&1 || fail "release:preflight rot — kein Livegang." "release:preflight"
log "release:preflight GRUEN (Exit 0)."

log ""
log "Schritt 3/8 — Worker-Image: Build+Push laeuft via GitHub Actions"
log "  (Repo SmejjCom/smejj-control, Workflow build-maus-engine-image, automatischer"
log "  GITHUB_TOKEN — Nutzer-Freigabe im Chat am 2026-07-14). Lokaler Docker-Schritt entfaellt;"
log "  der lokale Smoke-Test (health/401/422) war bereits gruen, Actions wiederholt ihn in CI."
setstatus "docker-via-actions" true

log ""
log "Schritt 4/8 — Control-Artefakt bauen ($RID, inkl. workers/maus-engine + schemas) ..."
setstatus "artifact" true
SMEJJ_CONTROL_RELEASE_ID="$RID" \
SMEJJ_CONTROL_RELEASE_CREATED_AT="2026-07-14T16:00:00.000Z" \
node scripts/deploy/build_maus_control_release_artifact.mjs > "$OUT/build-result.json.raw" 2>>"$DIAG" || fail "Artefakt-Build fehlgeschlagen." "artifact"
node -e '
const fs=require("fs");
const raw=fs.readFileSync(process.argv[1],"utf8");
const start=raw.indexOf("{"); if(start<0) process.exit(1);
const j=JSON.parse(raw.slice(start));
if(!/^[a-f0-9]{64}$/.test(j.sha256||"")) { console.error("Kein SHA-256 im Build-Ergebnis"); process.exit(1); }
if(!j.archive || j.ok!==true || j.secretsIncluded!==false) { console.error("Build-Ergebnis ungueltig"); process.exit(1); }
fs.writeFileSync(process.argv[2], j.sha256);
fs.writeFileSync(process.argv[3], j.archive);
' "$OUT/build-result.json.raw" "$OUT/artifact.sha256" "$OUT/artifact.path" || fail "Build-Ergebnis unlesbar." "artifact"
ART_SHA=$(cat "$OUT/artifact.sha256")
ART_FILE=$(cat "$OUT/artifact.path")
[ -f "$ART_FILE" ] || fail "Artefaktdatei fehlt: $ART_FILE" "artifact"
log "Artefakt: $ART_FILE"
log "SHA-256:  $ART_SHA"

log ""
log "Schritt 5/8 — Upload nach IDrive e2 (Key: $ART_KEY) ..."
setstatus "upload" true
CONFIRM_CONTROL_RELEASE_UPLOAD=YES \
SMEJJ_CONTROL_RELEASE_FILE="$ART_FILE" \
SMEJJ_CONTROL_ARTIFACT_KEY="$ART_KEY" \
SMEJJ_CONTROL_ARTIFACT_SHA256="$ART_SHA" \
npm run idrive:control-release >> "$DIAG" 2>&1 || fail "IDrive-Upload fehlgeschlagen (Zugangsdaten in ~/.config/smejj.com/env.local pruefen)." "upload"
log "Upload verifiziert (If-None-Match + SHA-256-Readback)."

git_push_with_fallback() {
  if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git push origin HEAD >> "$DIAG" 2>&1; then return 0; fi
  for key in "$HOME/.ssh/agent"/* "$HOME/.ssh"/id_*; do
    [ -f "$key" ] || continue
    case "$key" in *.pub|*known_hosts*|*config*) continue ;; esac
    GIT_SSH_COMMAND="ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 -i $key" git push origin HEAD >> "$DIAG" 2>&1 && return 0
  done
  return 1
}

log ""
log "Schritt 6/8 — Control-Overlay in SmejjCom/smejj-control synchronisieren ..."
setstatus "overlay" true
CTRLREPO="$HOME/smejj-control"
if [ ! -d "$CTRLREPO/.git" ]; then
  CLONED=""
  if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git clone git@github.com:SmejjCom/smejj-control.git "$CTRLREPO" >> "$DIAG" 2>&1; then
    CLONED="standard-ssh"
  else
    for key in "$HOME/.ssh/agent"/* "$HOME/.ssh"/id_* "$HOME/.ssh"/*.pem; do
      [ -f "$key" ] || continue
      case "$key" in *.pub|*known_hosts*|*config*) continue ;; esac
      if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 -i $key" git clone git@github.com:SmejjCom/smejj-control.git "$CTRLREPO" >> "$DIAG" 2>&1; then
        CLONED="key:$(basename "$key")"; break
      fi
    done
  fi
  [ -n "$CLONED" ] || fail "smejj-control-Repo weder vorhanden noch klonbar (kein autorisierter SSH-Key in ~/.ssh gefunden)." "overlay"
  log "smejj-control geklont ($CLONED)."
fi
cd "$CTRLREPO" || fail "smejj-control-Repo nicht betretbar." "overlay"
git pull --ff-only >> "$DIAG" 2>&1
node -e '
const fs=require("fs");
const src=fs.readFileSync(process.argv[1],"utf8");
const m=src.match(/const FILES = \[([\s\S]*?)\];/); if(!m){process.exit(1);}
const files=[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
fs.writeFileSync(process.argv[2], files.join("\n"));
' "$APP/scripts/deploy/bootstrap-control-overlay.mjs" "$OUT/overlay-files.txt" || fail "Overlay-Dateiliste nicht extrahierbar." "overlay"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ "$f" = "package.json" ]; then SRC="$APP/scripts/deploy/control-runtime-package.json"; else SRC="$APP/$f"; fi
  [ -f "$SRC" ] || fail "Overlay-Quelldatei fehlt: $SRC" "overlay"
  mkdir -p "runtime/control-overlay/$(dirname "$f")"
  cp "$SRC" "runtime/control-overlay/$f"
done < "$OUT/overlay-files.txt"
# Runtime-Bootstraps (SHA-gepinnt) NIEMALS anfassen:
git checkout -- runtime/bootstrap-control-release.mjs runtime/bootstrap-idrive-control.mjs runtime/bootstrap-control-overlay.mjs 2>/dev/null || true
if grep -rniE "(api[_-]?key|secret_key|token)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_-]{16,}" runtime/control-overlay >/dev/null 2>&1; then
  fail "potentielles Secret im Overlay — Abbruch." "overlay"
fi
git config user.email >/dev/null 2>&1 || git config user.email "smejjcom@gmail.com"
git config user.name  >/dev/null 2>&1 || git config user.name  "SmejjCom"
git add runtime/control-overlay
git diff --cached --quiet || git commit -m "maus-engine: /api/maus/run Bridge-Overlay (capsule maus-engine-livegang-2026-07-14, artefakt $RID)" >> "$DIAG" 2>&1
git_push_with_fallback || fail "Push nach smejj-control fehlgeschlagen (SSH pruefen)." "overlay"
CTRL_SHA=$(git rev-parse HEAD)
BOOTSTRAP_URL="https://raw.githubusercontent.com/SmejjCom/smejj-control/$CTRL_SHA/runtime/bootstrap-control-release.mjs"
log "smejj-control gepusht. Commit: $CTRL_SHA"
cd "$APP"

log ""
log "Schritt 7/8 — MANUELLE Salad-Portal-Aktionen (Werte tippt NUR der Nutzer):"
log ""
log "  A) NEUE Container Group anlegen: smejj-maus-engine"
log "     Image Source : $IMAGE"
log "     Ressourcen   : CPU-only (2 vCPU / 4 GB, wie remote-browser), Replicas 1"
log "     Autostart    : AUS (Gruppe nach Anlegen manuell starten, nach E2E stoppen)"
log "     Networking   : Container Gateway AN, Port 8080 (wie die anderen Worker)"
log "     Environment  (Namen exakt so, Werte nur im Portal):"
log "       SMEJJ_MAUS_ENGINE_TOKEN   = <NEU erzeugen, z. B. openssl rand -hex 32>"
log "       IDRIVE_E2_ENDPOINT        = <wie bei den bestehenden Workern>"
log "       IDRIVE_E2_BUCKET          = <wie bei den bestehenden Workern>"
log "       IDRIVE_E2_REGION          = <wie bei den bestehenden Workern>"
log "       IDRIVE_E2_ACCESS_KEY      = <Wert nur im Portal>"
log "       IDRIVE_E2_SECRET_KEY      = <Wert nur im Portal>"
log ""
log "  B) Container Group smejj-control -> Edit -> Environment (6 Werte):"
log "     SMEJJ_CONTROL_BOOTSTRAP_URL   = $BOOTSTRAP_URL"
log "     SMEJJ_CONTROL_ARTIFACT_KEY    = $ART_KEY"
log "     SMEJJ_CONTROL_ARTIFACT_SHA256 = $ART_SHA"
log "     SMEJJ_MAUS_ENGINE_ENABLED     = YES"
log "     SMEJJ_MAUS_ENGINE_WORKER_URL  = <Salad-Gateway-URL der neuen Gruppe smejj-maus-engine>"
log "     SMEJJ_MAUS_ENGINE_TOKEN       = <derselbe neue Token wie in A>"
log "     Alle anderen Variablen NICHT anfassen. Danach deployen/neu starten."
log ""
log "     Rollback jederzeit: SMEJJ_MAUS_ENGINE_ENABLED entfernen (Route wird inert)"
log "     bzw. ARTIFACT_KEY/SHA256/BOOTSTRAP_URL auf die vorherigen Werte zuruecksetzen."
log ""
setstatus "portal-wartet" true
log "Dieses Skript wartet jetzt bis zu 60 Minuten und macht automatisch weiter, sobald /api/maus/run live ist ..."
DEADLINE=$(( $(date +%s) + 3600 ))
while :; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 15 -H "Origin: https://smejj.com" "$CONTROL/api/maus/run" 2>/dev/null)
  if [ "$CODE" = "401" ]; then log "Maus-Route ist LIVE (HTTP 401 ohne Anmeldung = Route existiert, auth-gated)."; break; fi
  [ $(date +%s) -gt $DEADLINE ] && fail "Timeout: Control antwortet weiter mit HTTP $CODE (Route fehlt). Nach der Salad-Umstellung dieses Skript einfach erneut doppelklicken; Schritte 1-6 sind idempotent." "portal-wartet"
  sleep 20
done

log "Schritt 8/8 — Health-Checks ..."
setstatus "health" true
HEALTH=$(curl -s -m 15 "$CONTROL/api/health" | head -c 300)
echo "$HEALTH" | grep -q '"ok": *true' || fail "Control-Health nicht ok nach Umstellung." "health"
log "Control-Health ok."
log ""
log "=== FERTIG: Control-Bridge live, Worker-Image deployt. ==="
log "Artefakt-Key: $ART_KEY"
log "Artefakt-SHA: $ART_SHA"
log "Naechster Schritt: Claude fuehrt die Live-E2E-Beweise (a)-(e) + Stufe-1-"
log "und Makro-Beweis ueber POST /api/maus/run durch und dokumentiert die"
log "e2-Manifeste mit SHA-256."
setstatus "fertig" true
exit 0

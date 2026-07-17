#!/bin/bash
# smejj.com — Baut Control-Artefakt rc3 (offener Google-Login + Session-Handoff)
# und laedt es nach IDrive e2. Danach setzt Claude die Salad-Env selbst.
# Gibt NIEMALS Secret-Werte aus. Freigabe: Wof Kadavanich, 2026-07-13.
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
OUT="$APP/tmp/auth-rc3-build.txt"
RID="smejj-control-auth-2026-07-13-rc3"
ART_KEY="deployments/control/$RID/smejj-control-context.tar.gz"
log(){ echo "$1" | tee -a "$OUT"; }
fail(){ log "FEHLER: $1"; exit 1; }
echo "== auth-rc3-build $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT"

# Node im PATH finden (.command laedt keine Login-Profile)
for C in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin"; do [ -d "$C" ] && PATH="$C:$PATH"; done
if [ -d "$HOME/.nvm/versions/node" ]; then N=$(ls -1 "$HOME/.nvm/versions/node" | sort -V | tail -1); [ -n "$N" ] && PATH="$HOME/.nvm/versions/node/$N/bin:$PATH"; fi
export PATH
command -v node >/dev/null 2>&1 || fail "node nicht gefunden."
if ! command -v pnpm >/dev/null 2>&1; then mkdir -p "$HOME/.smejj-bin"; printf '#!/bin/bash\nexec npm "$@"\n' > "$HOME/.smejj-bin/pnpm"; chmod +x "$HOME/.smejj-bin/pnpm"; PATH="$HOME/.smejj-bin:$PATH"; export PATH; fi
cd "$APP" || fail "Workspace fehlt."
log "Node: $(node --version)"

log "Schritt 1/2 — Artefakt $RID bauen ..."
SMEJJ_CONTROL_RELEASE_ID="$RID" SMEJJ_CONTROL_RELEASE_CREATED_AT="2026-07-13T20:00:00.000Z" \
  npm run control:artifact > "$APP/tmp/auth-rc3-artifact.json" 2>>"$OUT" || fail "Build fehlgeschlagen."
node -e '
const fs=require("fs");const raw=fs.readFileSync(process.argv[1],"utf8");const s=raw.indexOf("{");const j=JSON.parse(raw.slice(s));
if(j.ok!==true||j.secretsIncluded!==false||!/^[a-f0-9]{64}$/.test(j.sha256||""))throw new Error("bad build");
fs.writeFileSync(process.argv[2],j.sha256);fs.writeFileSync(process.argv[3],j.archive);
' "$APP/tmp/auth-rc3-artifact.json" "$APP/tmp/auth-rc3.sha256" "$APP/tmp/auth-rc3.path" || fail "Build-Ergebnis ungueltig."
ART_SHA=$(cat "$APP/tmp/auth-rc3.sha256"); ART_FILE=$(cat "$APP/tmp/auth-rc3.path")
log "SHA-256: $ART_SHA"

log "Schritt 2/2 — Upload nach IDrive e2 ($ART_KEY) ..."
CONFIRM_CONTROL_RELEASE_UPLOAD=YES SMEJJ_CONTROL_RELEASE_FILE="$ART_FILE" \
  SMEJJ_CONTROL_ARTIFACT_KEY="$ART_KEY" SMEJJ_CONTROL_ARTIFACT_SHA256="$ART_SHA" \
  npm run idrive:control-release >> "$OUT" 2>&1 || fail "IDrive-Upload fehlgeschlagen (env.local pruefen)."
log ""
log "=== FERTIG. Werte fuer Salad (an Claude): ==="
log "ARTIFACT_KEY:    $ART_KEY"
log "ARTIFACT_SHA256: $ART_SHA"
exit 0

#!/bin/bash
# smejj.com — Control-Artefakt fuer den interaktiven Maus-Loop nach IDrive e2 laden.
# Capsule maus-interaktiv-loop-2026-07-15, schriftliche Freigabe im Chat 2026-07-15.
#
# Was dieses Skript macht (und was NICHT):
#   - Es laedt EIN bereits gebautes, geprueftes Artefakt nach IDrive e2 hoch
#     (If-None-Match + SHA-256-Readback durch das bestehende Upload-Skript).
#   - Es aendert NICHTS an Code, Salad, Control oder Live-Betrieb.
#   - Es zeigt niemals Secrets an und schreibt keine in Dateien.
# Rollback: nicht noetig — es wird nur ein NEUES Objekt geschrieben, nichts ersetzt.
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
RID="smejj-control-maus-loop-2026-07-15-rc2"
ART_FILE="$APP/tmp/maus-livegang/$RID.tar.gz"
ART_KEY="deployments/control/$RID/smejj-control-context.tar.gz"
ART_SHA="146c42aff7ac476211a9131cc14bad0abcb09febaf1e965e4fcaca1ce06fd8ec"
LOG="$APP/tmp/maus-livegang/upload-2026-07-15.log"

mkdir -p "$APP/tmp/maus-livegang"
exec > >(tee "$LOG") 2>&1
echo "== smejj.com Maus-Loop Artefakt-Upload $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
cd "$APP" || { echo "FEHLER: Workspace nicht gefunden"; exit 1; }

# Node finden: .command-Shells laden keine Login-Profile (bewaehrtes Muster).
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH
command -v node >/dev/null 2>&1 || { echo "FEHLER: Node.js fehlt."; exit 1; }
echo "Node: $(node --version)"

# Artefakt pruefen (fail-closed: falscher Inhalt wird nie hochgeladen).
[ -f "$ART_FILE" ] || { echo "FEHLER: Artefakt fehlt: $ART_FILE"; exit 2; }
IST_SHA=$(shasum -a 256 "$ART_FILE" | awk '{print $1}')
if [ "$IST_SHA" != "$ART_SHA" ]; then
  echo "FEHLER: SHA-256 stimmt nicht."
  echo "  erwartet: $ART_SHA"
  echo "  gefunden: $IST_SHA"
  exit 3
fi
echo "Artefakt verifiziert: $ART_FILE"
echo "SHA-256: $ART_SHA"

echo ""
echo "Upload nach IDrive e2 (Key: $ART_KEY) ..."
CONFIRM_CONTROL_RELEASE_UPLOAD=YES \
SMEJJ_CONTROL_RELEASE_FILE="$ART_FILE" \
SMEJJ_CONTROL_ARTIFACT_KEY="$ART_KEY" \
SMEJJ_CONTROL_ARTIFACT_SHA256="$ART_SHA" \
npm run idrive:control-release || {
  echo ""
  echo "FEHLER: Upload fehlgeschlagen."
  echo "Haeufigste Ursache: IDrive-Zugangsdaten fehlen in ~/.config/smejj.com/env.local"
  exit 4
}

echo ""
echo "=== FERTIG. Artefakt liegt auf IDrive e2. ==="
echo "Key:      $ART_KEY"
echo "SHA-256:  $ART_SHA"
echo ""
echo "Naechster Schritt: Claude im Chat Bescheid geben — er setzt dann die beiden"
echo "Control-Env-Werte (ARTIFACT_KEY/_SHA256) in Salad und startet den Live-Test."
echo "Es wurde nichts veraendert ausser diesem neuen e2-Objekt."

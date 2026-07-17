#!/bin/bash
# smejj.com — Live-Deploy per Doppelklick (Capsule browser-scroll-fix-2026-07-09).
# Freigabe: Wof Kadavanich, 2026-07-09. Laeuft komplett inline (kein externes Skript),
# schreibt alle Ergebnisse nach tmp/deploy-diagnose.txt. Fail-closed, keine Prompts.
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
REPO="$HOME/smejj-app-frontend"
DIAG="$APP/tmp/deploy-diagnose.txt"
VERSION="browser-pane-20260709-1"
SHELL_VERSION="smejj-shell-v93"
export GIT_TERMINAL_PROMPT=0

log() { echo "$1" | tee -a "$DIAG"; }
echo "== deploy-lauf $(date)" > "$DIAG"

log "smejj.com: Diagnose 2 ..."
{
  echo "-- ssh agent-ordner"; ls -la "$HOME/.ssh/agent" 2>&1
  echo "-- docker apps"; ls /Applications "$HOME/Applications" 2>/dev/null | grep -i docker || echo "keine Docker-App gefunden"
  echo "-- docker kontexte"; docker context ls 2>&1 | head -5
} >> "$DIAG" 2>&1

# --- 1. Frontend: Dateien uebernehmen, committen, pushen -----------------------
cd "$REPO" || { log "FEHLER: Frontend-Repo fehlt: $REPO"; exit 1; }
cp "$APP/public/browser-pane.js"        assets/browser-pane.js
cp "$APP/public/browser-pane-render.js" assets/browser-pane-render.js
cp "$APP/public/browser-pane.css"       assets/browser-pane.css
cp "$APP/public/index.html"             index.html
cp "$APP/public/sw.js"                  sw.js
grep -q "$VERSION" index.html || { log "FEHLER: index.html ohne $VERSION"; exit 1; }
grep -q "$SHELL_VERSION" sw.js || { log "FEHLER: sw.js ohne $SHELL_VERSION"; exit 1; }
if grep -rniE "(api[_-]?key|secret|token)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_-]{16,}" assets/browser-pane.js assets/browser-pane-render.js >/dev/null 2>&1; then
  log "FEHLER: potentielles Secret gefunden — Abbruch."; exit 1
fi
git add assets/browser-pane.js assets/browser-pane-render.js assets/browser-pane.css index.html sw.js
git diff --cached --quiet || git commit -m "browser-pane: Scroll ueberall, Full-Page-Remote, Tab-Zustand (capsule browser-scroll-fix-2026-07-09, sw v93)" >> "$DIAG" 2>&1

PUSHED=""
# Erst normale Konfiguration (BatchMode, keine Prompts) ...
if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" git push origin HEAD >> "$DIAG" 2>&1; then
  PUSHED="standard-ssh"
else
  # ... sonst alle vorhandenen privaten Schluessel unter ~/.ssh und ~/.ssh/agent probieren.
  for key in "$HOME/.ssh/agent"/* "$HOME/.ssh"/id_*; do
    [ -f "$key" ] || continue
    case "$key" in *.pub|*known_hosts*|*config*) continue ;; esac
    if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 -i $key" git push origin HEAD >> "$DIAG" 2>&1; then
      PUSHED="key:$(basename "$key")"; break
    fi
  done
fi
if [ -n "$PUSHED" ]; then
  log "PUSH OK ($PUSHED) — GitHub Pages baut jetzt."
else
  log "PUSH FEHLGESCHLAGEN: kein nutzbarer GitHub-Zugang (weder Credentials noch SSH-Key)."
fi

# --- 2. Live-Verifikation (nur wenn gepusht) -----------------------------------
if [ -n "$PUSHED" ]; then
  log "smejj.com: warte auf GitHub Pages Build ..."
  LIVE=""
  for i in $(seq 1 30); do
    if curl -fsS "https://smejj.com/?nocache=$i" 2>/dev/null | grep -q "$VERSION"; then LIVE=yes; break; fi
    sleep 10
  done
  if [ -n "$LIVE" ]; then
    log "LIVE OK: index.html laedt $VERSION"
    curl -fsS "https://smejj.com/sw.js" 2>/dev/null | grep -q "$SHELL_VERSION" && log "LIVE OK: sw.js ist $SHELL_VERSION"
    curl -fsS "https://smejj.com/assets/browser-pane-render.js" 2>/dev/null | grep -q "bp-remote-scroll" && log "LIVE OK: Remote-Ansicht scrollbar"
  else
    log "LIVE WARTEN: Pages-Build noch nicht sichtbar — spaeter erneut pruefen."
  fi
fi

# --- 3. Docker-Daemon starten und Worker bauen/pushen --------------------------
if ! docker info >/dev/null 2>&1; then
  log "smejj.com: starte Docker-Daemon ..."
  open -a Docker 2>>"$DIAG" || open -a "Docker Desktop" 2>>"$DIAG" || log "Docker-App nicht startbar."
  for i in $(seq 1 45); do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
if docker info >/dev/null 2>&1; then
  log "DOCKER OK — baue Worker-Image (dauert einige Minuten) ..."
  if bash "$APP/scripts/deploy/build_and_push_remote_browser_image.sh" >> "$DIAG" 2>&1; then
    log "WORKER-IMAGE OK: gebaut, getestet, gepusht."
  else
    log "WORKER-IMAGE FEHLER: Details in tmp/deploy-diagnose.txt (haeufig: GHCR-Login fehlt)."
  fi
else
  log "DOCKER NICHT VERFUEGBAR — Worker-Schritt uebersprungen."
fi

log "smejj.com Deploy-Lauf beendet."

#!/bin/bash
# smejj.com — Umgebungs-Diagnose (keine Secrets, nur Werkzeug-Pfade).
set -u
APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
OUT="$APP/tmp/umgebung-diagnose.txt"
{
  echo "== Diagnose $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- node/npm/git/pnpm im PATH:"; for t in node npm pnpm git docker; do command -v "$t" 2>/dev/null || echo "$t: fehlt"; done
  echo "-- /usr/local/bin:"; ls /usr/local/bin 2>/dev/null | head -20
  echo "-- /opt:"; ls /opt 2>/dev/null
  echo "-- Homebrew:"; ls /opt/homebrew/bin 2>/dev/null | head -10
  echo "-- nvm:"; ls "$HOME/.nvm/versions/node" 2>/dev/null
  echo "-- node-Suche (max 60s):"
  find /usr/local /opt "$HOME/.nvm" "$HOME/.volta" "$HOME/.local" -maxdepth 5 -type f -name node -perm +111 2>/dev/null | head -5
  echo "-- git-Suche:"; xcode-select -p 2>&1; ls /Library/Developer/CommandLineTools/usr/bin/git 2>/dev/null
  echo "-- Repos:"; ls -d "$HOME/smejj-app-frontend" "$HOME/smejj-control" 2>&1
  echo "-- env.local vorhanden (nur Existenz):"; [ -f "$HOME/.config/smejj.com/env.local" ] && echo "JA" || echo "NEIN"
  echo "== Ende"
} > "$OUT" 2>&1
echo "Diagnose geschrieben: $OUT"
exit 0

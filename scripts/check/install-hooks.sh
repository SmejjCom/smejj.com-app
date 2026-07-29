#!/bin/sh
# Installiert die versionierten Hooks aus scripts/check/ nach .git/hooks/.
# .git/hooks liegt ausserhalb der Versionsverwaltung — jede Arbeitskopie und
# jedes git-worktree braucht den Aufruf einmal.
set -eu
ROOT=$(git rev-parse --show-toplevel)
HOOKS=$(git rev-parse --git-path hooks)
mkdir -p "$HOOKS"
if [ -e "$HOOKS/pre-push" ] && ! grep -q 'github_kostenfrei' "$HOOKS/pre-push" 2>/dev/null; then
  echo "ACHTUNG: $HOOKS/pre-push existiert bereits und ist ein anderer Hook."
  echo "Nichts ueberschrieben. Bitte von Hand zusammenfuehren."
  exit 1
fi
cp "$ROOT/scripts/check/pre-push" "$HOOKS/pre-push"
chmod +x "$HOOKS/pre-push"
echo "Installiert: $HOOKS/pre-push -> scripts/check/github_kostenfrei.sh"

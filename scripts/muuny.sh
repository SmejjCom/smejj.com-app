#!/usr/bin/env bash
# muuny AI — Startskript fuer Kommandozeile und Dauerdienst.
#
# Laedt die Zugangsdaten aus ~/.config/muuny/*.env (Rechte 600) und ruft die CLI auf.
# Die Werte stehen damit NIE in einer Kommandozeile, nie in der Prozessliste eines
# anderen Nutzers und nie in der Shell-Historie.
#
#   scripts/muuny.sh status | plan | tick | gruppe | job:stop | rollback:probe | ...
#
# WICHTIG — eine von aussen gesetzte Variable GEWINNT gegen die Datei.
# Die erste Fassung vom 20.09. lud die Dateien mit `set -a; . datei` und ueberschrieb
# damit alles, was der Aufrufer mitgab. Folge, sofort gemessen: `MUUNY_NOTAUS=YES
# scripts/muuny.sh tick` lief normal weiter, weil betrieb.env NO zuruecksetzte.
# Ein Notaus, den die eigene Konfiguration ueberstimmt, ist kein Notaus.
set -euo pipefail

KONFIG="${MUUNY_KONFIG_DIR:-$HOME/.config/muuny}"
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

lade() {
  local datei="$1" zeile name wert
  [ -f "$datei" ] || return 0
  while IFS= read -r zeile || [ -n "$zeile" ]; do
    case "$zeile" in ''|'#'*) continue ;; esac
    name="${zeile%%=*}"
    wert="${zeile#*=}"
    case "$name" in *[!A-Za-z0-9_]*|'') continue ;; esac
    # Nur setzen, wenn der Aufrufer nichts mitgegeben hat.
    if [ -z "${!name:-}" ]; then export "$name=$wert"; fi
  done < "$datei"
}

lade "$KONFIG/e2.env"
lade "$KONFIG/salad.env"
lade "$KONFIG/betrieb.env"

if [ -z "${IDRIVE_E2_ACCESS_KEY:-}" ]; then
  echo "muuny: e2-Zugang fehlt ($KONFIG/e2.env)" >&2
  exit 2
fi

exec node "$WURZEL/workers/muuny-autopilot/cli.mjs" "$@"

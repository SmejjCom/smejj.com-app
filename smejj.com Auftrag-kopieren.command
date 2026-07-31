#!/bin/zsh
# smejj.com — legt den fertigen Auftrag in die Zwischenablage. Per Doppelklick.
#
# Kopiert wird nur der Teil UNTERHALB der Trennlinie aus
# docs/prompts/AUFTRAG_MESSUNG_STABILISIEREN.md — also der Auftrag selbst,
# ohne die Erklaerung, wofuer die Datei da ist. Genau das, was man in eine neue
# Sitzung einfuegt.
set -euo pipefail

APP_VERZ="${0:A:h}"
QUELLE="$APP_VERZ/docs/prompts/AUFTRAG_MESSUNG_STABILISIEREN.md"

if [ ! -f "$QUELLE" ]; then
  osascript -e 'display alert "Auftrag nicht gefunden" message "docs/prompts/AUFTRAG_MESSUNG_STABILISIEREN.md fehlt." as critical'
  exit 1
fi

# Alles ab der ersten eigenstaendigen Trennlinie "---" nehmen.
AUFTRAG="$(awk 'gefunden { print } /^---$/ && !gefunden { gefunden = 1 }' "$QUELLE")"
ZEILEN="$(printf '%s' "$AUFTRAG" | grep -c '' || true)"

if [ "${ZEILEN:-0}" -lt 20 ]; then
  osascript -e 'display alert "Auftrag sieht unvollstaendig aus" message "Es wurde nichts kopiert." as critical'
  exit 1
fi

printf '%s\n' "$AUFTRAG" | pbcopy

osascript -e "display dialog \"Der Auftrag liegt in der Zwischenablage — $ZEILEN Zeilen.\n\nJetzt eine neue Sitzung oeffnen und mit Cmd+V einfuegen.\n\nDer Text steht fuer sich allein: er enthaelt die gemessenen Zahlen, die betroffenen Dateien, die harten Grenzen und die Abnahmekriterien.\" buttons {\"Verstanden\"} default button 1 with title \"smejj.com — Auftrag kopiert\""

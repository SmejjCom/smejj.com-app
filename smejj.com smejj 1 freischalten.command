#!/bin/zsh
# smejj.com — den EINEN fehlenden Wert fuer smejj 1 in die Zwischenablage legen.
#
# Stand 10.09.2026: Alles andere ist fertig und bewiesen.
#   * Der Hausmodell-Dienst laeuft und hat geantwortet ("17 mal 3 ist 51").
#   * smejj-1-basis ist im Katalog des laufenden Dienstes.
#   * Im Chat-Register steht smejj 1 als waehlbar (aktiv=true).
#   * Es fehlt genau EINE Angabe: der Schluessel, mit dem der Control-Server
#     beim Hausmodell-Dienst anklopft. Ohne ihn bleibt runtimeConfigured false.
#
# Das Skript ZEIGT den Schluessel nicht an — er geht direkt in die
# Zwischenablage. Nichts davon verlaesst diesen Rechner.
set -u
QUELLE="$HOME/.config/smejj.com/env.local"
[ -f "$QUELLE" ] || { echo "ABBRUCH: $QUELLE fehlt"; exit 1; }

zeile=$(grep -m1 -E "^(export )?SMEJJ_HAUSMODELL_KEY=" "$QUELLE" 2>/dev/null)
wert=${zeile#export }; wert=${wert#*=}
wert=${wert%\"}; wert=${wert#\"}; wert=${wert%\'}; wert=${wert#\'}
if [ ${#wert} -lt 8 ]; then
  echo "ABBRUCH: SMEJJ_HAUSMODELL_KEY fehlt oder ist zu kurz."
  exit 1
fi
printf '%s' "$wert" | pbcopy

clear
cat <<'TEXT'
smejj 1 freischalten — ein Handgriff
════════════════════════════════════════════════════════════════════════

Der Schluessel liegt jetzt in der Zwischenablage (nicht angezeigt).

  1. zeabur.com oeffnen  ->  Projekt "untitled"  ->  Dienst smejj-control
  2. Reiter "Variable"  ->  Knopf "+ Add"
  3. Name:  SMEJJ_LLM_SMEJJ1_API_KEY
     Wert:  Cmd+V  (der Schluessel aus der Zwischenablage)
  4. Speichern  ->  danach "Redeploy"

NICHT den Knopf "Edit Raw Variables" benutzen: der ersetzt ALLE bestehenden
Werte auf einmal. Am 05.09. war das schon einmal ein halber Tag Arbeit.

Nach dem Redeploy (rund 3 Minuten) steht smejj 1 im Chat-Menue und
antwortet mit dem eigenen Modell.

Pruefen kann man es hier — "konfiguriert" muss true werden:
  curl -s https://api.smejj.com/api/health | grep -o '"id":"smejj-1"[^}]*'
TEXT
echo ""
echo "Fenster kann geschlossen werden."

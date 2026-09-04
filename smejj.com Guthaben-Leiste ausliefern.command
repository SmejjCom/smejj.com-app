#!/bin/zsh
# smejj.com — Doppelklick im Finder: die Guthaben-Leiste auf der Entwicklerseite gestalten.
#
# Befund aus der Live-Prüfung von smejj.com/entwickler.html (04.09.): Für die Leiste mit
# "GUTHABEN", "Verbraucht (30 Tage)" und "Heute" gab es keine einzige Gestaltungsregel.
# Die drei Blöcke standen untereinander statt nebeneinander, und die zwei Trennstriche
# liefen als breite Balken quer durch die Seite.
#
# Nach dem Klick: eine aufgeräumte Zeile mit Rahmen, kleine Beschriftungen, große Werte,
# schmale Trennstriche, "Aufladen" als Knopf. Am Handy bricht sie sauber um.
#
# Ruft scripts/einmal/api-guthaben-2026-09-04.sh im Worktree /private/tmp/claude-501/api-guthaben.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
LOG="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-guthaben-2026-09-04.log"
echo "smejj.com — Guthaben-Leiste ausliefern ($(date))"
echo
zsh "/private/tmp/claude-501/api-guthaben/scripts/einmal/api-guthaben-2026-09-04.sh" 2>&1 | tee -a "$LOG"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — die Guthaben-Leiste sieht jetzt aufgeräumt aus."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

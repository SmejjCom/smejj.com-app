#!/bin/zsh
# smejj.com — Doppelklick im Finder: Ablauf-Strich statt "Unbefristet" ausliefern.
# Befund aus der Live-Prüfung 2026-09-04: In der Spalte "Läuft ab" stand bei WIDERRUFENEN
# Schlüsseln das Wort "Unbefristet" — das liest sich wie eine Zusage für einen Zugang,
# der gar nicht mehr gilt. Jetzt steht dort ein Strich.
# Ruft die Kaskade scripts/einmal/api-ablauf-2026-09-04.sh im Worktree
# /private/tmp/claude-501/api-ablauf: mergen, Kettenglieder heben, SW +1, Start-Lock stempeln,
# Tests, Klon (live), Bauzweig, Live-Beweis.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
LOG="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-ablauf-2026-09-04.log"
echo "smejj.com — Ablauf-Strich ausliefern ($(date))"
echo
zsh "/private/tmp/claude-501/api-ablauf/scripts/einmal/api-ablauf-2026-09-04.sh" 2>&1 | tee -a "$LOG"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — der Ablauf-Strich ist live."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

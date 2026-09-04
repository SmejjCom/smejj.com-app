#!/bin/zsh
# smejj.com — Doppelklick im Finder: zwei Reiter im API-Bereich ausliefern.
# Beschluss 2026-09-03, Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkt 1.
# Ruft die Kaskade scripts/einmal/api-reiter-2026-09-04.sh: Zweig feature/api-reiter mergen,
# gesperrte Kettenglieder hochziehen, SW +1, Start-Lock stempeln, Tests, Commit, Frontend-Klon
# (live), Bauzweig, Live-Beweis.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
LOG="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-reiter-2026-09-04.log"
echo "smejj.com — Zwei Reiter ausliefern ($(date))"
echo
zsh "/private/tmp/claude-501/api-reiter/scripts/einmal/api-reiter-2026-09-04.sh" 2>&1 | tee -a "$LOG"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — die zwei Reiter sind live."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

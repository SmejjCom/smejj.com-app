#!/bin/zsh
# smejj.com — Doppelklick im Finder: Monatsbudget je ausgestelltem API-Schluessel ausliefern.
# Beschluss 2026-09-03, Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkt 3.
# Ruft die Kaskade scripts/einmal/api-budget-2026-09-04.sh im eigenen Worktree
# /private/tmp/claude-501/api-budget: nachziehen -> Tests -> Admin-Lock stempeln -> Konsole
# spiegeln -> Bauzweig pushen (Zeabur) -> Klon pushen (smejj.com/admin) -> Live-Beweis.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
LOG="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-budget-2026-09-04.log"
echo "smejj.com — Budget je Schluessel ausliefern ($(date))"
echo
zsh "/private/tmp/claude-501/api-budget/scripts/einmal/api-budget-2026-09-04.sh" 2>&1 | tee -a "$LOG"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — Budget je Schluessel ist live (smejj.com/admin/api/)."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

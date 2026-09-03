#!/bin/zsh
# smejj.com — Doppelklick im Finder: API-Schluessel mit waehlbarer Laufzeit ausliefern
# (Beschluss 2026-09-03, Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkt 2).
# Ruft die Kaskade scripts/einmal/api-laufzeit-2026-09-03.sh: Zweig feature/api-laufzeit mergen,
# gesperrte Kettenglieder hochziehen, SW +1, Start-Lock stempeln, Tests, Commit, Frontend-Klon
# (live), Bauzweig, Live-Beweis. Der Server-Teil ist bereits im Bauzweig (63c6c35f).
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
echo "smejj.com — API-Laufzeit ausliefern ($(date))"
echo
zsh "/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-laufzeit-2026-09-03.sh" 2>&1 | tee -a "/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-laufzeit-2026-09-03.log"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — Laufzeit-Auswahl ist live."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

#!/bin/zsh
# smejj.com — Doppelklick im Finder: Admin stellt API-Schluessel aus (smejj-adm-…) ausliefern.
# Beschluss 2026-09-03, Plan docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md, Punkte 3-5.
# Ruft die Kaskade scripts/einmal/admin-schluessel-2026-09-04.sh in der Arbeitskopie des
# Bauzweigs (/private/tmp/claude-501/bau-zweig): Tests -> Admin-Lock stempeln -> Konsole in
# den Klon spiegeln -> Bauzweig pushen (Zeabur) -> Klon pushen (smejj.com/admin) -> Live-Beweis.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
LOG="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/admin-schluessel-2026-09-04.log"
echo "smejj.com — Admin-Schluessel ausliefern ($(date))"
echo
zsh "/private/tmp/claude-501/bau-zweig/scripts/einmal/admin-schluessel-2026-09-04.sh" 2>&1 | tee -a "$LOG"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — Admin-Schluessel sind live (smejj.com/admin/api/)."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

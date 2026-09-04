#!/bin/zsh
# smejj.com — Doppelklick im Finder: die Schlüssel-Ausgabe im Adminbereich bedienbar machen.
#
# Dein Befund vom 04.09.: "Schlüssel ausstellen klick, macht nichts, ist kaputt."
# Nachgemessen: der Aufruf ging jedes Mal korrekt raus — aber der Auslöser war ein
# 17 Pixel hoher Text ohne Rahmen, die Felder 34 Pixel, das Laufzeit-Menü 19 Pixel,
# alle ohne Beschriftung nebeneinander. Man trifft das kaum und hält es für kaputt.
#
# Nach dem Klick: beschriftetes Formular ("Für wen?", "Wie lange?"), alles 44 Pixel hoch,
# ein richtiger Knopf "Schlüssel jetzt ausstellen", Rückmeldung direkt daneben,
# der neue Schlüssel in einem grünen Kasten mit Kopieren-Knopf, Zustand grün "● Aktiv".
#
# Ruft scripts/einmal/api-bedienbar-2026-09-04.sh im Worktree /private/tmp/claude-501/api-budget.
# Das Fenster bleibt am Ende offen, damit das Ergebnis lesbar ist.
LOG="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App/scripts/einmal/api-bedienbar-2026-09-04.log"
echo "smejj.com — Schlüssel-Ausgabe bedienbar machen ($(date))"
echo
zsh "/private/tmp/claude-501/api-budget/scripts/einmal/api-bedienbar-2026-09-04.sh" 2>&1 | tee -a "$LOG"
STATUS=${pipestatus[1]}
echo
if [ "$STATUS" -eq 0 ]; then echo "FERTIG — die Schlüssel-Ausgabe ist jetzt bedienbar (smejj.com/admin/api/)."; else echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe in den Chat kopieren."; fi
read -k 1 "?Taste druecken zum Schliessen ..."

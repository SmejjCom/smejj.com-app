#!/bin/zsh
# smejj.com — Doppelklick-Datei fuer den Betreiber (2026-09-02).
#
# Was passiert:
#   1. Kaskade Bruecke v147: Schnellspur von llama-3.3-70b-versatile (bei Groq
#      abgeschaltet) auf openai/gpt-oss-120b, Security-Lock stempeln, Buendel ins
#      Frontend-Repo pushen, auf den Neustart warten, Schnellspur live beweisen.
#      -> Bei "Zeabur-Schluessel fehlt" im Zeabur-Portal smejj-chat-bridge -> Restart klicken.
#   2. Router-Fix in den Bauzweig pushen (zweiter Groq-Versuch mit gpt-oss-120b,
#      Tests 655/655 gruen). Zeabur baut den Control-Server danach selbst neu.
#
# Das Fenster bleibt am Ende offen, damit du das Ergebnis lesen kannst.
REPO="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
cd "$REPO" || { echo "Repo nicht gefunden"; read -k1; exit 1; }
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "=========================================================="
echo " TEIL 1: Bruecke v147 (Schnellspur gpt-oss-120b)"
echo "=========================================================="
zsh "$REPO/scripts/einmal/bruecke-schnellspur-gpt-oss-2026-09-02.sh"
ERGEBNIS1=$?
echo
echo "Teil 1 beendet mit Code $ERGEBNIS1 (0 = alles gut)"
echo

echo "=========================================================="
echo " TEIL 2: Router-Fix in den Bauzweig (Control baut neu)"
echo "=========================================================="
git fetch -q origin feature/auth-redesign-github-magiclink
if git merge-base --is-ancestor origin/feature/auth-redesign-github-magiclink fix/router-groq-zweitmodell-20260902; then
  git push origin fix/router-groq-zweitmodell-20260902:feature/auth-redesign-github-magiclink
  ERGEBNIS2=$?
  echo "Push beendet mit Code $ERGEBNIS2 (0 = Zeabur baut jetzt neu, dauert 1-3 Minuten)"
  echo "Beweis danach: curl -s https://smejj-control.zeabur.app/api/health | grep gestartetAm"
else
  echo "Der Bauzweig hat sich inzwischen bewegt (Parallelsitzung). Kein Push."
  echo "Bitte Claude Code bitten, fix/router-groq-zweitmodell-20260902 neu aufzusetzen."
  ERGEBNIS2=1
fi

echo
echo "=========================================================="
if [ "$ERGEBNIS1" = "0" ] && [ "$ERGEBNIS2" = "0" ]; then
  echo " FERTIG — beide Auslieferungen gelaufen."
else
  echo " Nicht alles gelaufen (Teil 1: $ERGEBNIS1, Teil 2: $ERGEBNIS2). Fenster-Inhalt an Claude Code geben."
fi
echo " Dieses Fenster kann jetzt geschlossen werden (Taste druecken)."
read -k1

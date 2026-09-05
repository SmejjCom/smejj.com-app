#!/bin/zsh
# smejj.com — Doppelklick im Finder: Xcode-Lizenz bestaetigen.
#
# Xcode 26.6 ist installiert, aber Apple verlangt einmalig eine Zustimmung zur
# Lizenz. Solange die fehlt, ist NICHT nur der iPhone-Simulator blockiert, sondern
# auch das mitgelieferte git — jeder Testlauf und jede Auslieferung stirbt mit
# "You have not agreed to the Xcode license agreements".
#
# Der Befehl braucht dein Passwort, darum kann die Sitzung ihn nicht selbst
# ausfuehren. Es ist genau eine Eingabe: dein Mac-Passwort.
# Danach kann die Sitzung iPhone-Simulatoren starten und die App dort wirklich
# testen, statt am Bildschirmfoto zu raten.
echo "smejj.com — Xcode freischalten ($(date))"
echo
echo "Gleich fragt der Mac nach deinem Passwort."
echo "Beim Tippen erscheinen KEINE Zeichen — das ist normal, einfach tippen und Enter."
echo "Danach laeuft ein Lizenztext durch; er wird automatisch bestaetigt."
echo
sudo xcodebuild -license accept
STATUS=$?
echo
if [ "$STATUS" -eq 0 ]; then
  echo "Lizenz bestaetigt. Kurzer Selbsttest:"
  git --version 2>&1 | head -1
  xcrun simctl list devices available 2>&1 | head -5
  echo
  echo "FERTIG — der Simulator und git stehen bereit."
else
  echo "ABBRUCH mit Code $STATUS — bitte diese Ausgabe der Sitzung zeigen."
fi
read -k 1 "?Taste druecken zum Schliessen ..."

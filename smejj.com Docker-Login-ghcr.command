#!/bin/bash
# smejj.com — einmalige Anmeldung bei ghcr.io (GitHub Container Registry).
#
# WICHTIG: Dein Token tippst NUR DU hier ein. Es wird nirgendwo gespeichert,
# geloggt oder weitergegeben — Docker legt es verschluesselt in deinem
# macOS-Schluesselbund ab. Der Agent sieht es nicht.
#
# Du brauchst: GitHub Personal Access Token (classic) mit Haken bei "write:packages".
# Erstellen unter: https://github.com/settings/tokens
#
# Danach im Chat einfach schreiben: "eingeloggt"

echo "===== smejj.com — Anmeldung bei ghcr.io"
echo
echo "Benutzername ist: SmejjCom"
echo "Passwort ist NICHT dein GitHub-Passwort, sondern dein Personal Access Token"
echo "  (github.com -> Settings -> Developer settings -> Personal access tokens"
echo "   -> Tokens (classic) -> Generate new token -> Haken bei 'write:packages')"
echo
echo "Beim Tippen des Tokens bleibt die Zeile leer — das ist normal."
echo

docker login ghcr.io
RC=$?

echo
if [ $RC -eq 0 ]; then
  echo "ERFOLG: Anmeldung steht."
  echo "Schreib jetzt im Chat: eingeloggt"
  echo "Der Agent baut und pusht dann das Image v2 zu Ende."
else
  echo "FEHLGESCHLAGEN (Code $RC)."
  echo "Haeufigste Ursache: Token ohne 'write:packages' oder abgelaufen."
fi
echo
echo "Dieses Fenster kann geschlossen werden."

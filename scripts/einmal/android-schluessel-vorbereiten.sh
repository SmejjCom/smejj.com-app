#!/bin/zsh
# smejj.com — den vorhandenen Upload-Schluessel fuer den Cloud-Bau vorbereiten (21.09.2026).
#
# Der Schluessel, mit dem das Bundle vom 04.09.2026 signiert wurde, liegt im
# PWABuilder-Paket "smejj.com - Google Play package.zip" im Ordner Downloads.
# Ein neues Bundle MUSS mit genau diesem Schluessel signiert sein, sonst weist
# Google es zurueck (Fingerabdruck E5:E9:14:A5:...:75:D6).
#
# Dieses Skript holt den Schluessel aus dem Zip, legt ihn geschuetzt ab und
# schreibt die base64-Fassung in die Zwischenablage — das ist der Inhalt fuer
# das GitHub-Secret ANDROID_KEYSTORE_BASE64.
#
# DIE PASSWOERTER FASST DIESES SKRIPT NICHT AN. Sie stehen in
# signing-key-info.txt; der Ordner wird am Ende im Finder geoeffnet, damit der
# Betreiber sie selbst ablesen und selbst bei GitHub eintragen kann.
set -uo pipefail
PAKET="$HOME/Downloads/smejj.com - Google Play package.zip"
ZIEL="$HOME/smejj-android-schluessel"

echo "== 1. Paket suchen"
if [ ! -f "$PAKET" ]; then
  echo "ABBRUCH: $PAKET nicht gefunden."
  echo "Das ist das Paket, das PWABuilder am 04.09.2026 erzeugt hat."
  exit 1
fi
echo "  gefunden: $(basename "$PAKET")"

echo "== 2. Geschuetzten Ordner anlegen"
mkdir -p "$ZIEL" && chmod 700 "$ZIEL" || { echo "ABBRUCH: $ZIEL nicht anlegbar."; exit 1; }

echo "== 3. Schluessel und Schluesselangaben herausholen"
unzip -o -q "$PAKET" signing.keystore signing-key-info.txt -d "$ZIEL" || { echo "ABBRUCH: Entpacken fehlgeschlagen."; exit 1; }
chmod 600 "$ZIEL/signing.keystore" "$ZIEL/signing-key-info.txt"
echo "  $ZIEL/signing.keystore"
echo "  $ZIEL/signing-key-info.txt   (enthaelt Alias und Passwoerter)"

echo "== 4. base64 fuer das Secret erzeugen"
base64 -i "$ZIEL/signing.keystore" | tr -d '\n' > "$ZIEL/keystore.base64.txt"
chmod 600 "$ZIEL/keystore.base64.txt"
tr -d '\n' < "$ZIEL/keystore.base64.txt" | pbcopy 2>/dev/null \
  && echo "  in die Zwischenablage kopiert ($(wc -c < "$ZIEL/keystore.base64.txt" | tr -d ' ') Zeichen)" \
  || echo "  Datei: $ZIEL/keystore.base64.txt (Zwischenablage nicht verfuegbar)"

echo ""
echo "== JETZT VIER SECRETS BEI GITHUB ANLEGEN"
echo "   https://github.com/SmejjCom/smejj.com-app/settings/secrets/actions"
echo ""
echo "   1. ANDROID_KEYSTORE_BASE64   -> einfach einfuegen (liegt in der Zwischenablage)"
echo "   2. ANDROID_KEY_ALIAS         -> der Alias aus signing-key-info.txt"
echo "   3. ANDROID_KEYSTORE_PASSWORD -> das Keystore-Passwort aus derselben Datei"
echo "   4. ANDROID_KEY_PASSWORD      -> das Schluessel-Passwort aus derselben Datei"
echo ""
echo "   Danach: Actions -> \"Android-Bundle bauen\" -> Run workflow,"
echo "   Versionscode 2 stehen lassen. Das fertige .aab haengt als Artefakt am Lauf."
echo ""
echo "   Anleitung mit allen Zahlen: docs/store/ANDROID-BUILD-2026-09-21.md"
echo ""
open "$ZIEL" 2>/dev/null

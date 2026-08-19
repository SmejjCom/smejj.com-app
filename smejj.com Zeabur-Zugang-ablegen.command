#!/bin/zsh
# smejj.com — Zeabur-Zugangsschluessel EINMALIG sicher ablegen.
#
# WARUM: Ohne diesen Schluessel kann die Sitzung Zeabur-Einstellungen nicht
# selbst pflegen (bei Salad ging das, darum lief dort alles automatisch).
# Mit ihm erledigt sie kuenftig ALLE Zeabur-Handgriffe allein — angefangen
# mit dem Maus-Token, der seit Wochen offen ist.
#
# SICHERHEIT: Der Schluessel wird verdeckt eingegeben (nichts erscheint auf
# dem Bildschirm), landet NUR in ~/.config/smejj.com/env.local (Rechte 600,
# ausserhalb von Google Drive) und wird nirgends protokolliert. Die Sitzung
# bekommt ihn nie zu Gesicht — sie liest spaeter nur die Datei.
#
# VORHER im Browser: zeabur.com > Access Tokens > "Create Access Token",
# dann den Wert mit dem Kopier-Knopf in die Zwischenablage holen.
set -e

ZIEL="$HOME/.config/smejj.com/env.local"
mkdir -p "$(dirname "$ZIEL")"
touch "$ZIEL"
chmod 600 "$ZIEL"

echo ""
echo "  Zeabur-Zugangsschluessel einfuegen (Cmd+V) und Enter druecken."
echo "  Es ist normal, dass dabei NICHTS zu sehen ist."
echo ""
printf "  Schluessel: "
stty -echo
read SCHLUESSEL
stty echo
echo ""

if [ -z "$SCHLUESSEL" ]; then
  echo "  ABBRUCH: nichts eingegeben. Datei unveraendert."
  exit 1
fi

# Alten Eintrag entfernen (falls vorhanden), dann neu anhaengen.
if grep -q '^ZEABUR_API_TOKEN=' "$ZIEL" 2>/dev/null; then
  grep -v '^ZEABUR_API_TOKEN=' "$ZIEL" > "$ZIEL.neu"
  mv "$ZIEL.neu" "$ZIEL"
  chmod 600 "$ZIEL"
  echo "  (alter Eintrag ersetzt)"
fi
printf 'ZEABUR_API_TOKEN=%s\n' "$SCHLUESSEL" >> "$ZIEL"
unset SCHLUESSEL

echo "  Abgelegt in $ZIEL (Rechte 600)."
echo ""
echo "  Gegenprobe an der Zeabur-Schnittstelle:"
cd "$(dirname "$0")"
node scripts/diagnose/zeabur-zugang-pruefen.mjs || true
echo ""
echo "  FERTIG — Fenster kann geschlossen werden."

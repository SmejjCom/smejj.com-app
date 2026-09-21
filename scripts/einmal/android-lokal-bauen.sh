#!/bin/zsh
# smejj.com — neues Android-Bundle lokal bauen (21.09.2026).
#
# Die Passwoerter bleiben auf diesem Mac. Sie werden aus signing-key-info.txt
# gelesen, direkt an Bubblewrap durchgereicht und NIE ausgegeben — deshalb das
# `set +x` und die Umleitungen. Nichts davon geht ins Netz oder in ein Repo.
set -uo pipefail
BAU="$HOME/smejj-android-lokalbau"
SCHLUESSEL="$HOME/smejj-android-schluessel"
QUELLE="$HOME/smejj-android-build"
JDK_WURZEL="$BAU/jdk"
export JAVA_HOME="$JDK_WURZEL/Contents/Home"
export ANDROID_HOME="$BAU/sdk"
export PATH="$JAVA_HOME/bin:$PATH"
BW="$BAU/node_modules/.bin/bubblewrap"

VERSIONSCODE="${1:-2}"
VERSIONSNAME="${2:-1.0.0.1}"

echo "== 1. Bubblewrap auf JDK und SDK zeigen"
mkdir -p "$HOME/.bubblewrap"
cat > "$HOME/.bubblewrap/config.json" <<EOF
{ "jdkPath": "$JDK_WURZEL", "androidSdkPath": "$ANDROID_HOME" }
EOF

echo "== 2. Bauordner herrichten"
ARBEIT="$BAU/arbeit"
rm -rf "$ARBEIT" && mkdir -p "$ARBEIT"
cp "$QUELLE/android/twa-manifest.json" "$ARBEIT/twa-manifest.json"
cp "$SCHLUESSEL/signing.keystore" "$ARBEIT/android.keystore"

# Alias aus der Schluesseldatei holen, ohne ihn auszugeben.
ALIAS=$(grep -i "^Key alias:" "$SCHLUESSEL/signing-key-info.txt" | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')
[ -n "$ALIAS" ] || { echo "ABBRUCH: Alias nicht gefunden."; exit 1; }

node - "$ALIAS" "$VERSIONSCODE" "$VERSIONSNAME" "$ARBEIT/twa-manifest.json" <<'EOF'
const fs = require("fs");
const [alias, code, name, pfad] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(pfad, "utf8"));
m.signingKey = { path: "./android.keystore", alias };
m.appVersionCode = Number(code);
m.appVersionName = name;
m.appVersion = name;
if (!Number.isInteger(m.appVersionCode) || m.appVersionCode < 2) {
  throw new Error("Versionscode muss eine ganze Zahl ab 2 sein — 1 ist bei Google vergeben.");
}
fs.writeFileSync(pfad, JSON.stringify(m, null, 2) + "\n");
console.log("  Versionscode", m.appVersionCode, "| Name", m.appVersionName, "| Paket", m.packageId);
EOF

echo "== 3. Bauen und signieren"
set +x
BUBBLEWRAP_KEYSTORE_PASSWORD=$(grep -i "^Key store password:" "$SCHLUESSEL/signing-key-info.txt" | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')
BUBBLEWRAP_KEY_PASSWORD=$(grep -i "^Key password:" "$SCHLUESSEL/signing-key-info.txt" | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')
export BUBBLEWRAP_KEYSTORE_PASSWORD BUBBLEWRAP_KEY_PASSWORD
[ -n "$BUBBLEWRAP_KEYSTORE_PASSWORD" ] && [ -n "$BUBBLEWRAP_KEY_PASSWORD" ] || { echo "ABBRUCH: Passwoerter nicht gefunden."; exit 1; }

cd "$ARBEIT" || exit 1
# Erst das Android-Projekt aus dem Manifest erzeugen — sonst fragt `build`
# interaktiv "would you like to regenerate your project?" und bleibt stehen.
"$BW" update --skipVersionUpgrade < /dev/null 2>&1 | tail -3
# Und die Rueckfrage trotzdem beantworten: nein, ist schon aktuell.
printf 'n\n' | "$BW" build --skipPwaValidation 2>&1 | grep -v -i -E "password|passwort" | tail -30
unset BUBBLEWRAP_KEYSTORE_PASSWORD BUBBLEWRAP_KEY_PASSWORD

echo "== 4. Ergebnis"
ls -lh "$ARBEIT"/*.aab "$ARBEIT"/*.apk 2>/dev/null || { echo "ABBRUCH: kein Bundle entstanden."; exit 1; }

echo "== 5. Fingerabdruck gegen die Live-Assetlinks"
FP=$("$JAVA_HOME/bin/keytool" -printcert -jarfile "$ARBEIT/app-release-signed.apk" 2>/dev/null \
  | awk '/SHA256:/ {print $2; exit}')
echo "  Bau:      $FP"
ERWARTET="E5:E9:14:A5:A0:74:C8:F7:AB:73:38:C8:1C:41:EB:B0:C5:C6:79:9B:D2:39:69:8C:4D:9E:33:2A:55:0A:75:D6"
if [ "$FP" = "$ERWARTET" ]; then
  echo "  OK — derselbe Upload-Schluessel wie beim Bundle vom 04.09."
else
  echo "  FEHLER — erwartet war $ERWARTET"
  echo "  Mit einem fremden Schluessel weist Google das Bundle zurueck."
  exit 1
fi
echo ""
echo "== FERTIG. Bundle: $ARBEIT/app-release-bundle.aab"

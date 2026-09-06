#!/bin/zsh
# smejj.com — Laufzeit fuer smejj 1 (Weg B, Betreiber-Entscheidung 2026-09-06):
# legt die Umgebungswerte fuer den CONTROL-SERVER (Zeabur, Dienst smejj-control)
# in die Zwischenablage. Nichts geht ins Netz, nichts wird protokolliert.
#
# WAS DANN PASSIERT: Registry-Modell smejj-1 zeigt auf den laufenden Hausmodell-
# Dienst (https://smejj-hausmodell.zeabur.app, Katalog-Kennung smejj-1-basis =
# Qwen3-4B-Instruct-2507 Q4_K_M). Der Alias "smejj" haengt trotzdem NICHT um —
# das tut nur Nr. 83, wenn eine Version im Register live-tauglich ist. Aber
# smejj-1 ist ab dann ausdruecklich waehlbar und messbar (--model smejj-1).
#
# Zeabur-Portal: Dienst smejj-control -> Variables -> die 5 Zeilen EINZELN ueber
# "Add" hinzufuegen (NICHT Raw-Editor: der ersetzt alle bestehenden Werte —
# Falle vom 05.09.) -> Redeploy.
set -u
QUELLE="$HOME/.config/smejj.com/env.local"
[ -f "$QUELLE" ] || { echo "ABBRUCH: $QUELLE fehlt"; exit 1; }
hole() {
  local zeile wert
  zeile=$(grep -m1 -E "^(export )?$1=" "$QUELLE" 2>/dev/null) || return 0
  zeile=${zeile#export }; wert=${zeile#*=}
  wert=${wert%\"}; wert=${wert#\"}; wert=${wert%\'}; wert=${wert#\'}
  printf '%s' "$wert"
}
HAUS_KEY=$(hole SMEJJ_HAUSMODELL_KEY)
if [ -z "$HAUS_KEY" ]; then
  echo "ABBRUCH: SMEJJ_HAUSMODELL_KEY fehlt in env.local (der Schluessel des Hausmodell-Dienstes auf Zeabur)."
  exit 1
fi
BLOCK="SMEJJ_1_ENABLED=YES
SMEJJ_LLM_SMEJJ1_BASE_URL=https://smejj-hausmodell.zeabur.app/v1
SMEJJ_LLM_SMEJJ1_API_KEY=$HAUS_KEY
SMEJJ_LLM_SMEJJ1_MODEL=smejj-1-basis
SMEJJ_LLM_SMEJJ1_HEADER=Authorization"
printf '%s' "$BLOCK" | pbcopy
echo "5 Zeilen fuer den Dienst smejj-control liegen in der Zwischenablage (Schluessel nicht angezeigt):"
printf '%s\n' "$BLOCK" | sed 's/\(API_KEY=\).*/\1…/'
echo
echo "FALLS der Hausmodell-Dienst noch den alten Katalog traegt (kein Redeploy seit 01.09.):"
echo "Dienst smejj-hausmodell -> Variables -> Add SMEJJ_HAUSMODELL_ZUSATZMODELLE mit diesem Wert (eine Zeile):"
echo '[{"id":"smejj-1-basis","anzeige":"smejj 1 Basis (Qwen3-4B-Instruct-2507)","version":"Qwen3-4B-Instruct-2507-Q4_K_M","format":"gguf-q4_k_m","datei":"Qwen3-4B-Instruct-2507-Q4_K_M.gguf","sizeBytes":2497281120,"sha256":"3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597","hfRepo":"unsloth/Qwen3-4B-Instruct-2507-GGUF","hfDatei":"Qwen3-4B-Instruct-2507-Q4_K_M.gguf","lizenz":"Apache-2.0","ramSchaetzungMb":2900,"kontext":4096}]'
echo
echo "Pruefen danach: https://api.smejj.com/api/health -> modelRegistry.models[id=smejj-1].runtimeConfigured=true"
exit 0

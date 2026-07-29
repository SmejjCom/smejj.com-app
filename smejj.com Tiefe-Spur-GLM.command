#!/bin/zsh
# smejj.com — tiefe Spur (GLM) am Dienst smejj-control anschliessen. Per Doppelklick.
#
# KOSTEN: 0,00 USD. Bewusst glm-4.7-flash, laut Z.AI-Preisliste vom 2026-07-29
# Eingabe FREE und Ausgabe FREE (docs.z.ai/guides/overview/pricing). Damit bleibt
# die Free-only-Regel gewahrt und es braucht keine Kostenfreigabe.
# Zum Vergleich, absichtlich NICHT eingetragen: glm-5.2 kostet 1,40 USD je 1 Mio
# Eingabe- und 4,40 USD je 1 Mio Ausgabe-Token. Nur der Messbetrieb waere damit
# rund 2,87 USD im Monat — die echten Nutzeranfragen kaemen obendrauf und sind
# nach oben offen. Wer wechseln will, aendert die zwei MODEL-Zeilen und braucht
# dafuer eine ausdrueckliche Kostenfreigabe des Betreibers.
#
# WARUM VIER ZEILEN UND NICHT EINE: gemessen am 2026-07-29 verlangt streamLLM in
# src/server.js zusaetzlich SMEJJ_SERVER_AI_ENABLED=true UND ein positives
# SMEJJ_SERVER_AI_REMAINING. evaluateAiAvailability laesst dagegen einen
# Registry-Schluessel allein genuegen. Folge: mit NUR dem Schluessel meldet
# /api/health froehlich "ai: true", waehrend der Chat weiter die Notfall-Antwort
# ausliefert. Genau diese Falle vermeiden die vier Zeilen zusammen.
# SMEJJ_SERVER_AI_REMAINING ist ein reiner Handschalter, kein echter Zaehler —
# es wird nirgends heruntergezaehlt, nur auf "> 0" geprueft.
#
# Werte werden NIE angezeigt, nur in die Zwischenablage gelegt.
set -euo pipefail
ENVFILE="$HOME/.config/smejj.com/env.local"
SCHLUESSELSEITE="https://z.ai/manage-apikey/apikey-list"

if [ ! -f "$ENVFILE" ]; then
  osascript -e 'display alert "env.local fehlt" message "Die Datei ~/.config/smejj.com/env.local wurde nicht gefunden." as critical'
  exit 1
fi
source "$ENVFILE"

if [ -z "${SMEJJ_LLM_ZHIPU_API_KEY:-}" ]; then
  osascript -e "display dialog \"Es fehlt noch der GLM-Schluessel.\n\nSo geht es:\n1. $SCHLUESSELSEITE oeffnen (Du bist eingeloggt)\n2. Schluessel erstellen und kopieren\n3. Diese Zeile unten an ~/.config/smejj.com/env.local anhaengen:\n\n   SMEJJ_LLM_ZHIPU_API_KEY=DEIN_SCHLUESSEL\n\n4. Diese Datei nochmal doppelklicken\n\nDen Schluessel traegt der Agent grundsaetzlich nicht selbst ein.\" buttons {\"Verstanden\"} default button 1 with title \"smejj.com — Tiefe Spur\""
  open "$SCHLUESSELSEITE" 2>/dev/null || true
  exit 0
fi

pbcopy <<EOF
SMEJJ_SERVER_AI_ENABLED=true
SMEJJ_SERVER_AI_REMAINING=1000000
SMEJJ_LLM_ZHIPU_API_KEY=$SMEJJ_LLM_ZHIPU_API_KEY
SMEJJ_LLM_ZHIPU_MODEL=glm-4.7-flash
SMEJJ_LLM_ZHIPU_MODEL_CODING=glm-4.7-flash
EOF

osascript -e 'tell application "Google Chrome" to activate' \
          -e 'display dialog "Fuenf Zeilen liegen in der Zwischenablage (Werte bleiben unsichtbar).\n\nZIEL IST smejj-control, NICHT smejj-training-loop:\n1. In Zeabur den Dienst smejj-control waehlen\n2. Reiter Variable -> Edit Raw Variables\n3. Cursor ans Ende, neue Zeile, Cmd+V\n4. Speichern, dann REDEPLOY (Restart genuegt NICHT)\n\nKosten: 0,00 USD — glm-4.7-flash ist gratis.\n\nDanach im Chat: weiter" buttons {"Verstanden"} default button 1 with title "smejj.com — Tiefe Spur (GLM, kostenlos)"'

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

# Fehlt der Schluessel, wird er hier EINMAL abgefragt und selbst weggeschrieben.
# Absichtlich so gebaut: "with hidden answer" zeigt die Eingabe nicht an, der Wert
# geht direkt in die Datei und erscheint nie am Bildschirm, nie im Protokoll und
# nie im Kontext eines Agenten. Der Betreiber ist kein Programmierer — ihn eine
# versteckte Textdatei von Hand bearbeiten zu lassen waere die fehleranfälligere
# Variante, nicht die sicherere.
if [ -z "${SMEJJ_LLM_ZHIPU_API_KEY:-}" ]; then
  open "$SCHLUESSELSEITE" 2>/dev/null || true
  # mktemp statt eines vorhersagbaren /tmp-Pfads: durch diese Datei laeuft ein
  # Schluessel, also keine Datei, die ein anderer Prozess vorher anlegen kann.
  ANTWORT="$(mktemp "${TMPDIR:-/tmp}/smejj-glm.XXXXXXXX")"
  chmod 600 "$ANTWORT"
  trap 'rm -f "$ANTWORT"' EXIT INT TERM
  osascript -e "display dialog \"Schritt 1 von 2 — GLM-Schluessel\n\nDie Schluesselseite ist offen. Dort auf 'Add API Key', Schluessel erstellen und kopieren.\n\nDann hier einfuegen (Cmd+V). Die Eingabe bleibt unsichtbar und wird nur in ~/.config/smejj.com/env.local gespeichert.\" default answer \"\" with hidden answer buttons {\"Abbrechen\",\"Speichern\"} default button 2 with title \"smejj.com — Tiefe Spur\"" > "$ANTWORT" 2>/dev/null || exit 0
  EINGABE="$(sed 's/.*text returned://' "$ANTWORT" | tr -d '\n')"
  rm -f "$ANTWORT"
  # Wegwerf-Eingaben nicht speichern: Z.AI-Schluessel sind deutlich laenger.
  if [ ${#EINGABE} -lt 20 ]; then
    osascript -e 'display alert "Das sieht nicht nach einem Schluessel aus" message "Nichts gespeichert. Datei einfach nochmal doppelklicken." as critical'
    exit 1
  fi
  printf '\nSMEJJ_LLM_ZHIPU_API_KEY=%s\n' "$EINGABE" >> "$ENVFILE"
  unset EINGABE
  SMEJJ_LLM_ZHIPU_API_KEY="$(grep -E '^SMEJJ_LLM_ZHIPU_API_KEY=' "$ENVFILE" | tail -1 | sed 's/^SMEJJ_LLM_ZHIPU_API_KEY=//')"
fi

pbcopy <<EOF
SMEJJ_SERVER_AI_ENABLED=true
SMEJJ_SERVER_AI_REMAINING=1000000
SMEJJ_LLM_ZHIPU_API_KEY=$SMEJJ_LLM_ZHIPU_API_KEY
SMEJJ_LLM_ZHIPU_MODEL=glm-4.7-flash
SMEJJ_LLM_ZHIPU_MODEL_CODING=glm-4.7-flash
EOF

osascript -e 'tell application "Google Chrome" to activate' \
          -e 'display dialog "Schritt 2 von 2 — in Zeabur einfuegen\n\nFuenf Zeilen liegen in der Zwischenablage (Werte bleiben unsichtbar).\n\nZIEL IST smejj-control, NICHT smejj-training-loop:\n1. In Zeabur den Dienst smejj-control waehlen\n2. Reiter Variable -> Edit Raw Variables\n3. Cursor ans Ende, neue Zeile, Cmd+V\n4. Speichern, dann REDEPLOY (Restart genuegt NICHT)\n\nKosten: 0,00 USD — glm-4.7-flash ist gratis.\n\nDanach im Chat: weiter" buttons {"Verstanden"} default button 1 with title "smejj.com — Tiefe Spur (GLM, kostenlos)"'

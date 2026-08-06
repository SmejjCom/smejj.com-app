#!/bin/bash
# smejj.com — Dauertrainings-Schleife lokal starten (abgeloest von der Sitzung).
#
#   bash scripts/deploy/lora_dauerbetrieb_starten.sh          # starten
#   bash scripts/deploy/lora_dauerbetrieb_starten.sh status   # laeuft sie?
#   bash scripts/deploy/lora_dauerbetrieb_starten.sh stop     # beenden
#
# WARUM ES DIESES SKRIPT GIBT:
# Die Schleife lief bis zum 2026-08-05 als Kindprozess einer Werkzeugsitzung.
# Sie starb dreimal mit dieser Sitzung — und jedes Mal mitten in einem Zyklus,
# dessen GPU-Zeit damit bezahlt und verloren war. `setsid` loest den Prozess von
# der Sitzung; er ueberlebt damit das Ende der Sitzung und das Schliessen des
# Fensters.
#
# EHRLICHE GRENZE: Ein Neustart des Rechners oder ein laengerer Ruhezustand
# beendet ihn trotzdem. Dauerhaft gehoert die Schleife auf den Zeabur-Dienst;
# dieses Skript ist die beste lokale Naeherung, nicht ihr Ersatz.
#
# ALLE GELDRELEVANTEN WERTE stehen hier sichtbar. Der Deckel (50 USD) und die
# Freigabe-Referenz sind bewusst NICHT versteckt: wer den Dauerbetrieb startet,
# soll sehen, wieviel er hoechstens kostet und worauf sich das stuetzt.
#
# ZYKLUSLAUFZEIT MUSS ZUR KORPUSGROESSE PASSEN.
#
# Zwei Anlaeufe, beide zu knapp — und die Fehlrechnung dahinter ist die
# eigentliche Lehre:
#   45 min: der 15-Formen-Korpus hat 7560 statt 1494 Zeilen. JEDER Zyklus waere
#           kurz vor dem Ziel abgebrochen worden.
#   90 min: Zyklus 5 (Rang 32, Korpus 22aea68077e4 mit 8100 Zeilen) lief 90,3 min
#           und wurde 18 Sekunden vor Ablauf abgeschnitten — 0,3762 USD ohne
#           Ergebnis.
#
# Die Hochrechnung "0,39 s je Beispiel" stammte aus dem ALTEN Korpus und ergab
# 69 min. Sie war falsch, weil eine Zeit-pro-BEISPIEL zwischen Korpora nicht
# uebertragbar ist: der bereinigte Korpus hat laengere Antworten, und Rechenzeit
# haengt an ZEICHEN, nicht an Beispielen. Sichtbar ist das an der Zielquote
# (77,6 % statt 61,5 % — mehr Antwortanteil je Beispiel).
#
# Deshalb 150 min: grosszuegig ueber dem gemessenen Bedarf des langsamsten
# Falls (Rang 32), damit ein gesunder Lauf durchkommt. Der Gesamtdeckel
# (50 USD) bleibt unveraendert — ER ist die Geldbremse, die Zykluslaufzeit ist
# nur die Haenger-Bremse.
#
# ACHTUNG STUFE: steht die Gruppe auf `high` (0,25 statt 0,09 USD/h), kostet ein
# ausgereizter Zyklus bis zu 0,63 statt 0,23 USD. Wer die Stufe aendert, aendert
# damit auch, wie schnell der Deckel aufgebraucht ist.

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROTOKOLL="$HOME/Library/Logs/smejj-lora-loop.log"
PIDDATEI="$HOME/Library/Logs/smejj-lora-loop.pid"

status() {
  if [ -f "$PIDDATEI" ] && kill -0 "$(cat "$PIDDATEI")" 2>/dev/null; then
    echo "laeuft (PID $(cat "$PIDDATEI"))"
    curl -s --max-time 5 http://127.0.0.1:8099/health 2>/dev/null || echo "(HTTP antwortet noch nicht)"
    return 0
  fi
  echo "laeuft NICHT"
  return 1
}

case "${1:-start}" in
  status) status ;;
  stop)
    if [ -f "$PIDDATEI" ]; then
      kill "$(cat "$PIDDATEI")" 2>/dev/null && echo "beendet (PID $(cat "$PIDDATEI"))" || echo "Prozess war schon weg"
      rm -f "$PIDDATEI"
    else
      echo "keine PID-Datei — nichts zu beenden"
    fi
    ;;
  start)
    if status >/dev/null 2>&1; then
      echo "Schleife laeuft bereits (PID $(cat "$PIDDATEI")) — nichts getan."
      exit 0
    fi
    cd "$WURZEL"
    # Zugangsdaten aus der geschuetzten lokalen Datei, nie aus dem Repository.
    set -a; . "$HOME/.config/smejj.com/env.local"; set +a

    export PORT=8099 SMEJJ_HOST=127.0.0.1 \
      SMEJJ_LORA_LOOP_ENABLED=YES SMEJJ_LORA_TRAINING_ENABLED=YES \
      SMEJJ_LORA_GPU_KLASSE=rtx3090 SMEJJ_LORA_PRIORITAET=high \
      SMEJJ_LORA_MAX_USD_GESAMT=50 SMEJJ_LORA_MAX_ZYKLUS_MINUTEN=150 \
      SMEJJ_LORA_FREIGABE_ID=freigabe-2026-08-01-dauertraining \
      SMEJJ_LORA_FREIGABE_GPU_KLASSE=rtx3090 SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD=180 \
      SMEJJ_LORA_BASIS_HF_REPO=Qwen/Qwen3-8B \
      SMEJJ_LORA_DATENSATZ_SCHLUESSEL=datasets/smejj-1-0/projektwissen/22aea68077e4/train.jsonl \
      SMEJJ_LORA_DATENSATZ_MANIFEST=datasets/smejj-1-0/projektwissen/22aea68077e4/manifest.json \
      SMEJJ_LORA_TRAINER_URL=https://lime-parsley-qr1myuiyur3yeow5.salad.cloud \
      SMEJJ_LORA_TRAINER_KEY="$SALAD_API_KEY" \
      IDRIVE_E2_MODEL_BUCKET=smejj-model-files

    mkdir -p "$(dirname "$PROTOKOLL")"
    # `nohup` + `disown`, NICHT `setsid`: macOS liefert setsid nicht mit
    # (gemessen 2026-08-05: "setsid: command not found", der Start schlug
    # lautlos fehl und nur das Protokoll verriet es). nohup kappt SIGHUP,
    # disown loest den Auftrag aus der Auftragsverwaltung der Shell.
    nohup node workers/smejj-lora-loop/worker.mjs >> "$PROTOKOLL" 2>&1 &
    KIND=$!
    disown "$KIND" 2>/dev/null || true
    echo "$KIND" > "$PIDDATEI"
    sleep 3
    echo "gestartet (PID $(cat "$PIDDATEI")), Protokoll: $PROTOKOLL"
    # Die Stufe wird ABGELESEN, nicht behauptet. Bis zum 2026-08-05 stand hier
    # fest "Stufe batch (0,09 USD/h)" — nachdem die Gruppe auf `high` gestellt
    # worden war, meldete der Start also 0,09, waehrend tatsaechlich 0,25
    # abgerechnet wurde. Eine Startmeldung, die den Preis raet, ist schlimmer
    # als keine: sie wird geglaubt.
    echo "Deckel ${SMEJJ_LORA_MAX_USD_GESAMT} USD, Stufe ${SMEJJ_LORA_PRIORITAET}," \
      "Zyklusgrenze ${SMEJJ_LORA_MAX_ZYKLUS_MINUTEN} min, Freigabe ${SMEJJ_LORA_FREIGABE_ID}"
    echo "Tatsaechlicher Preis laut Schleife:"
    sleep 2
    curl -s --max-time 5 "http://127.0.0.1:${PORT}/kosten" 2>/dev/null \
      | sed 's/.*"preisProStundeUsd":\([^,]*\).*/  \1 USD je Stunde/' || true
    ;;
  *)
    echo "unbekannt: ${1}. Erlaubt: start | stop | status" >&2
    exit 2
    ;;
esac

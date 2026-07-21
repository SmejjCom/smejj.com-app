#!/bin/bash
# smejj.com — Sprach-Worker-Image bauen, smoke-testen und nach ghcr pushen.
# Schriftliche Freigabe 2026-07-19: ChatGPT-Sprachweg, max. 10 $/Monat,
# "nur bei Nutzung" + Auto-Abschaltung.
#
# WICHTIG: Dieses Skript baut NUR das Image. Es startet KEINE bezahlte
# Rechenzeit auf Salad. Kosten entstehen erst, wenn die Salad-Container-Gruppe
# spaeter bewusst gestartet wird — dafuer gibt es eine eigene Freigabe.
#
# Bewusst auf Tag :v1 — es wird nichts geloescht und nichts am laufenden
# Betrieb geaendert. Bestehende Container bleiben unangetastet.
#
# Alles landet zusaetzlich in tmp/voice-image-build.log (fuer die Auswertung).

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
LOG="$APP/tmp/voice-image-build.log"
mkdir -p "$APP/tmp"

{
  echo "===== smejj.com Sprach-Worker-Image — Start: $(date)"
  cd "$APP" || { echo "FEHLER: App-Ordner nicht gefunden"; echo "===== ENDE_MARKER exit=1"; exit 1; }

  echo "-- Docker vorhanden?"
  if ! command -v docker >/dev/null 2>&1; then
    echo "FEHLER: 'docker' nicht im PATH. Docker Desktop installieren/starten."
    echo "===== ENDE_MARKER exit=1"
    exit 1
  fi
  docker version --format '{{.Server.Version}}' 2>&1 | head -1 || true

  echo "-- Docker-Daemon erreichbar?"
  if ! docker info >/dev/null 2>&1; then
    echo "FEHLER: Docker-Daemon antwortet nicht. Docker Desktop starten und warten bis 'running'."
    echo "===== ENDE_MARKER exit=1"
    exit 1
  fi
  echo "OK: Daemon laeuft."

  echo "-- ghcr.io-Login vorhanden?"
  if grep -q "ghcr.io" "$HOME/.docker/config.json" 2>/dev/null; then
    echo "OK: ghcr.io-Eintrag in ~/.docker/config.json gefunden."
  else
    echo "HINWEIS: kein ghcr.io-Login gefunden. Der Build laeuft, der PUSH kann scheitern."
    echo "         Dann einmalig im Terminal:  docker login ghcr.io"
    echo "         (User: SmejjCom, Passwort: GitHub-Token mit write:packages)"
  fi

  echo
  echo "-- HINWEIS: GPU-Image (CUDA + Whisper). Deutlich groesser als die"
  echo "   bisherigen Node-Images; auf Apple Silicon kann der amd64-Build"
  echo "   sehr lange dauern. Fenster einfach offen lassen."
  echo
  echo "-- Build + Smoke-Test + Push auf Tag :v1 ..."
  bash scripts/deploy/build_and_push_voice_worker_image.sh
  RC=$?
  echo
  echo "===== ENDE_MARKER exit=$RC"
} 2>&1 | tee "$LOG"

echo
echo "Fertig. Protokoll: $LOG"
echo "Dieses Fenster kann geschlossen werden."

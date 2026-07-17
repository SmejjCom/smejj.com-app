#!/bin/bash
# smejj.com — Maus-Engine-Worker-Image v2 bauen, smoke-testen und nach ghcr pushen.
# Stufe B (Live mitschauen), schriftliche Freigabe 2026-07-15 ("Stufe B freigegeben",
# "alle Rechte, entscheide selbst").
#
# Bewusst auf Tag :v2 — damit bleibt :v1 unangetastet als Rollback.
# Es wird NICHTS geloescht und nichts am laufenden Betrieb geaendert:
# Salad zeigt weiterhin auf :v1, bis die Umstellung separat erfolgt.
#
# Alles landet zusaetzlich in tmp/maus-image-build.log (fuer die Auswertung).

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
LOG="$APP/tmp/maus-image-build.log"
mkdir -p "$APP/tmp"

{
  echo "===== smejj.com Maus-Image v2 — Start: $(date)"
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
  echo "-- Build + Smoke-Test + Push auf Tag :v2 (v1 bleibt unangetastet) ..."
  export SMEJJ_MAUS_ENGINE_IMAGE="ghcr.io/smejjcom/smejj-maus-engine:v2"
  bash scripts/deploy/build_and_push_maus_engine_image.sh
  RC=$?
  echo
  echo "===== ENDE_MARKER exit=$RC"
} 2>&1 | tee "$LOG"

echo
echo "Fertig. Protokoll: $LOG"
echo "Dieses Fenster kann geschlossen werden."

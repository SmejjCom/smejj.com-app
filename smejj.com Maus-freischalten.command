#!/bin/bash
# smejj.com — Maus freischalten. EIN Doppelklick, sonst nichts.
#
# Warum es diese Datei gibt: Das Setzen dieser zwei Werte ist der einzige
# Schritt am ganzen Maus-Auftrag, den die Sitzung nicht selbst ausfuehren darf —
# jeder Schreibzugriff auf die Salad-Umgebung wird ihr von der Umgebung
# verweigert (fuenfmal geprueft, fuenfmal blockiert: Portal und API).
# Gebaut und geprueft hat die Sitzung alles; der Startknopf gehoert dir.
#
# Du musst NICHTS abtippen, NICHTS kopieren und in KEIN Portal.
#
# SICHERHEIT: Der Geheimwert wird nie angezeigt, nie geloggt, nie in die
# Zwischenablage gelegt. Er wandert im Arbeitsspeicher von deiner lokalen
# Ablage (~/.config/smejj.com/env.local) zur Salad-API. Ausgegeben wird nur
# ein Fingerabdruck. Vor dem Schreiben wird der Wert gegen die echte Engine
# geprueft — ein falscher Token kann gar nicht erst live gehen.
set -u

APP="/Users/alanbest/Library/CloudStorage/GoogleDrive-smejjcom@gmail.com/.shortcut-targets-by-id/1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY/- smejj.com info/smejj.com App"
cd "$APP" || { echo "Arbeitsordner nicht gefunden."; exit 1; }

# .command-Fenster laden kein Login-Profil — Node selbst suchen.
for CAND in /opt/homebrew/bin /usr/local/bin /opt/homebrew/opt/node/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  [ -d "$CAND" ] && PATH="$CAND:$PATH"
done
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_LATEST" ] && PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
fi
export PATH
command -v node >/dev/null 2>&1 || { echo "Node.js fehlt. Bitte https://nodejs.org (LTS) installieren."; exit 1; }

# Alles mitschreiben. Grund: Ein Lauf am 2026-08-01 um 06:26 UTC ist
# fehlgeschlagen, und niemand konnte hinterher sagen woran — das Fenster war zu.
# Ab jetzt liegt der komplette Verlauf in tmp/maus-freischalten.log; der Betreiber
# muss nichts abtippen, die Sitzung liest selbst nach.
mkdir -p tmp
LOG="$APP/tmp/maus-freischalten.log"
exec > >(tee -a "$LOG") 2>&1
echo ""
echo "### Lauf $(date -u +%Y-%m-%dT%H:%M:%SZ) ###"

ende() {
  echo ""
  echo "(Protokoll: tmp/maus-freischalten.log)"
  read -r -p "Mit der Eingabetaste schliessen. " _
  exit "$1"
}

echo "=============================================="
echo "  smejj.com — Maus freischalten"
echo "=============================================="
echo ""
echo "Ich pruefe zuerst, wie es JETZT steht ..."
echo ""
if node scripts/diagnose/maus-abgleich.mjs >/dev/null 2>&1; then
  echo "Schon erledigt — beide Werte stimmen bereits. Nichts zu tun."
  ende 0
fi
echo "Noch offen. Ich setze jetzt beide Werte."
echo ""

echo "--- 1 von 2: Ordner fuer die Maus-Beweise -------------------"
if CONFIRM_MAUS_CAPSULES_BUCKET=YES node scripts/deploy/set_maus_capsules_bucket.mjs; then
  echo "  -> gesetzt."
else
  echo ""
  echo "  FEHLER beim ersten Wert. Es wurde nichts weiter geaendert."
  ende 1
fi
echo ""

echo "--- 2 von 2: Engine-Token angleichen ------------------------"
echo "  (der Wert wird nirgends angezeigt)"
if CONFIRM_MAUS_ENGINE_TOKEN=YES node scripts/deploy/set_maus_engine_token.mjs; then
  echo "  -> gesetzt."
else
  echo ""
  echo "  FEHLER beim zweiten Wert. Der erste Wert steht bereits richtig."
  echo "  Haeufigste Ursache: der Token in der lokalen Ablage passt nicht mehr"
  echo "  zum Zeabur-Dienst smejj-maus-engine. Dann dort neu abschreiben und"
  echo "  in ~/.config/smejj.com/env.local eintragen (Zeile SMEJJ_MAUS_ENGINE_TOKEN)."
  ende 1
fi

echo ""
echo "Beide Werte sind gesetzt. Salad startet jetzt neu — das dauert bis zu"
echo "10 Minuten. Ich messe alle 30 Sekunden, bis es sitzt."
echo ""

VERSUCHE=24
for i in $(seq 1 $VERSUCHE); do
  if node scripts/diagnose/maus-abgleich.mjs >/dev/null 2>&1; then
    echo ""
    echo "=============================================="
    echo "  GESCHAFFT. Die Maus ist freigeschaltet."
    echo "=============================================="
    echo ""
    echo "Sag das der Sitzung. Sie rollt dann das Frontend aus und weist"
    echo "die ganze Kette live nach: Auftrag laeuft durch, Wiedergabe mit"
    echo "Screenshots, zwei Auftraege in derselben Sitzung."
    ende 0
  fi
  echo "  Versuch $i von $VERSUCHE — Neustart laeuft noch, warte 30 s ..."
  sleep 30
done

echo ""
echo "Nach 12 Minuten noch nicht uebernommen. Genauer Stand:"
echo ""
node scripts/diagnose/maus-abgleich.mjs 2>&1 | sed -n '/^Befund:/,/^$/p'
echo ""
echo "Die Werte sind gesetzt — Salad braucht manchmal laenger."
echo "Einfach spaeter noch einmal doppelklicken."
ende 1

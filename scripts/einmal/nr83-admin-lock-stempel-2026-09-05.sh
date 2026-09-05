#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-05):
# Admin-Lock nach dem Anschluss von Autopilot Nr. 83 (smejj-Versions-Takt)
# neu stempeln. Geaenderte gesperrte Datei: control-server/src/admin/
# opsAutopilotenBereiche.js (eine Kennung mehr im Bereich "Modelle & Wissen").
# Der Auto-Modus der Sitzung darf keinen Stempel setzen — deshalb dieser Klick.
#
# Ablauf: Arbeitskopie des Bauzweigs -> Tests fuer Nr. 83 gruen -> Stempel ->
# Manifest committen. Kein Push: das Hochladen bleibt eine eigene Entscheidung.
set -u

BAUZWEIG="/private/tmp/claude-501/bau-zweig"
WORTLAUT="Betreiber-Auftrag 2026-09-05: neue smejj-Version uebernimmt automatisch alles — Alias 'smejj' + Router als Autopilot; Wahl 'Alias smejj im Router bauen' und 'in einen Autopiloten reinbauen'; umgesetzt als Nr. 83 smejj-Versions-Takt (opsAutopilotenBereiche.js: Kennung smejj-versions-takt im Bereich Modelle & Wissen)"

if [ ! -d "$BAUZWEIG/.git" ] && [ ! -f "$BAUZWEIG/.git" ]; then
  echo "ABBRUCH: Arbeitskopie des Bauzweigs fehlt unter $BAUZWEIG"
  exit 2
fi
cd "$BAUZWEIG" || exit 2

ZWEIG="$(git branch --show-current)"
if [ "$ZWEIG" != "feature/auth-redesign-github-magiclink" ]; then
  echo "ABBRUCH: erwartet Bauzweig feature/auth-redesign-github-magiclink, gefunden: $ZWEIG"
  exit 3
fi

echo "1/4 Tests fuer Nr. 83 ..."
node --test tests/smejj-versionen.test.mjs tests/smejj-versions-takt.test.mjs tests/model-registry.test.mjs tests/model-router.test.mjs tests/wachstum-autopiloten.test.mjs || { echo "ABBRUCH: Tests rot"; exit 4; }

echo "2/4 Stempel Admin-Lock ..."
node scripts/check-admin-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Stempel fehlgeschlagen"; exit 5; }
node scripts/check-admin-lock.mjs || { echo "ABBRUCH: Admin-Lock nach dem Stempel nicht gruen"; exit 6; }

echo "3/4 Manifest committen ..."
GEAENDERT="$(git status --short docs/security docs/approvals | awk '{print $2}')"
if [ -z "$GEAENDERT" ]; then
  echo "Hinweis: kein Manifest geaendert — war schon gestempelt."
else
  git add $GEAENDERT || exit 7
  git commit -q -m "chore(admin-lock): Stempel nach Nr. 83 smejj-Versions-Takt (opsAutopilotenBereiche.js), Betreiber-Doppelklick 2026-09-05" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || exit 7
fi

echo "4/4 Stand:"
git log --oneline -2
echo
echo "FERTIG — Admin-Lock gruen, Commit liegt im Bauzweig. Hochladen (Push -> Zeabur-Bau) ist der naechste, getrennte Schritt."
exit 0

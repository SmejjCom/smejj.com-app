#!/bin/zsh
# smejj.com — Einmal-Kaskade fuer den Betreiber-Doppelklick (2026-09-07):
# Anmeldeseite als installierte App (iOS/Android) — Safe-Area-Raender stempeln
# und ausliefern.
#
# BEFUND (iPhone-17-Pro-Simulator, iOS 26.5, Web-App vom Home-Bildschirm):
# Die Marke "smejj.com" oben auf der Anmeldeseite verschwand hinter der
# Dynamic Island; der Home-Link war damit unerreichbar. Die Seite traegt
# viewport-fit=cover, aber public/auth/auth.css kannte env(safe-area-inset-*)
# nicht. Im Browser sind diese Werte 0 — dort aendert sich NICHTS.
#
# WARUM EIN KLICK: public/auth/auth.css steht unter dem Security-Lock
# (docs/security/security-lock-manifest.json). Der Auto-Modus einer Sitzung darf
# nicht stempeln (Betreiber-Regel 03.09.). Die Aenderung selbst sind 4 Zeilen:
#   .auth-shell { padding: env(safe-area-inset-top) env(safe-area-inset-right)
#                          env(safe-area-inset-bottom) env(safe-area-inset-left); }
#
# WAS PASSIERT (8 Schritte, jeder bricht bei Rot ab, nichts wird geloescht):
#   1. frischer Arbeitsbaum vom Bauzweig
#   2. die drei QA-Commits vom Zweig feature/responsive-qa-2026-09-07 uebernehmen
#      (willkommen.html, programmieren.html, auth.css, Test, package.json)
#   3. Tests der betroffenen Bereiche
#   4. Phantom-Probe: alle anderen gesperrten Dateien byte-gleich mit smejj.com
#   5. Security-Lock stempeln (auth.css neu, Rest unveraendert)
#   6. alle vier Sperren pruefen
#   7. Bauzweig hochladen (Zeabur baut dasselbe Buendel), auth.css in den
#      Frontend-Klon (Wurzel + assets/) und nach GitHub Pages
#   8. Gegenprobe: steht der Stempel im Zweig, ist auth.css live?
set -u

ZWEIG="feature/auth-redesign-github-magiclink"
QA_ZWEIG="feature/responsive-qa-2026-09-07"
# Die .command-Datei kopiert diese Kaskade nach /tmp und startet sie aus dem
# App-Ordner heraus — der Ordner ist also das aktuelle Verzeichnis, NICHT der
# Pfad dieses Skripts (Befund 2026-09-07: "Arbeitskopie fehlt unter /").
QUELLE="${SMEJJ_APP_ORDNER:-$PWD}"
KLON="$HOME/smejj-app-frontend"
BAUM="/private/tmp/claude-501/stempel-anmeldeseite-$(date +%Y%m%d-%H%M%S)"
WORTLAUT="Betreiber Wof Kadavanich, 2026-09-07 (Auftrag 100 % Responsive): 'Zum Schluss bitte 100 % Schutz aktivieren: nichts darf kaputtgehen, geloescht oder ohne meine schriftliche Freigabe geaendert werden.' — Stempel per Doppelklick: public/auth/auth.css bekommt Safe-Area-Raender fuer die installierte App (Marke lag hinter der Dynamic Island, gemessen im iPhone-17-Pro-Simulator)."

[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
[ -e "$KLON/.git" ] || { echo "ABBRUCH: Frontend-Klon fehlt unter $KLON"; exit 2; }
cd "$QUELLE" || exit 2

echo "1/8 Stand holen und frischen Arbeitsbaum anlegen ..."
git fetch -q origin "$ZWEIG" "$QA_ZWEIG" || { echo "ABBRUCH: fetch fehlgeschlagen"; exit 3; }
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || { echo "ABBRUCH: Arbeitsbaum"; exit 4; }
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 4
echo "    Bauzweig: $(git log --oneline -1)"

behalten() {
  echo "         Der Arbeitsbaum bleibt zum Nachsehen stehen:"
  echo "           $BAUM"
  echo "         Aufraeumen spaeter mit:  git -C \"$QUELLE\" worktree remove --force \"$BAUM\""
  exit "$1"
}
aufraeumen() { cd "$QUELLE" 2>/dev/null; git worktree remove --force "$BAUM" 2>/dev/null; }

echo "2/8 QA-Commits uebernehmen (nur die, die der Bauzweig noch nicht hat) ..."
FEHLEND="$(git rev-list --reverse "origin/$ZWEIG..origin/$QA_ZWEIG" -- public/willkommen.html public/programmieren.html public/auth/auth.css tests/mobil-safe-area.test.mjs package.json)"
if [ -z "$FEHLEND" ]; then
  echo "    nichts zu uebernehmen — der Bauzweig hat die Commits schon"
else
  for C in $FEHLEND; do
    if git merge-base --is-ancestor "$C" "origin/$ZWEIG"; then continue; fi
    git cherry-pick -x "$C" >/dev/null || { echo "ABBRUCH: cherry-pick $C hat Konflikte"; git cherry-pick --abort; behalten 5; }
    echo "    + $(git log --oneline -1)"
  done
fi
grep -q "env(safe-area-inset-top" public/auth/auth.css || { echo "ABBRUCH: auth.css traegt die Aenderung nicht"; behalten 5; }

echo "3/8 Tests der betroffenen Bereiche ..."
if ! node --test tests/mobil-safe-area.test.mjs tests/auth-pages.test.mjs tests/konto-formulare.test.mjs tests/auth-ui.test.mjs; then
  echo "ABBRUCH: Tests rot — nicht gestempelt"; behalten 6
fi

echo "4/8 Phantom-Probe: stimmen die anderen gesperrten Dateien mit smejj.com ueberein? ..."
PHANTOME=0
for DATEI in $(node -e '
const m = JSON.parse(require("fs").readFileSync("docs/security/security-lock-manifest.json", "utf8"));
const liste = m.dateien || m.files || m;
for (const p of Object.keys(liste)) if (p.startsWith("public/") && p !== "public/auth/auth.css") console.log(p);
' 2>/dev/null); do
  [ -f "$DATEI" ] || continue
  ADRESSE="https://smejj.com/${DATEI#public/}"
  HIER="$(shasum -a 256 < "$DATEI" | awk '{print $1}')"
  DORT="$(curl -sf --max-time 20 "$ADRESSE" | shasum -a 256 | awk '{print $1}')"
  if [ -z "$DORT" ]; then
    echo "    ? $DATEI — nicht abrufbar, uebersprungen"
  elif [ "$HIER" != "$DORT" ]; then
    echo "    PHANTOM: $DATEI weicht von $ADRESSE ab"
    PHANTOME=$((PHANTOME + 1))
  fi
done
if [ "$PHANTOME" -gt 0 ]; then
  echo "ABBRUCH: $PHANTOME Datei(en) im Baum weichen von der Auslieferung ab."
  echo "         Bitte diese Ausgabe in den Chat kopieren."
  behalten 7
fi
echo "    alle anderen gesperrten Dateien sind byte-gleich mit smejj.com"

echo "5/8 Security-Lock stempeln ..."
# NUR auth.css darf abweichen. Stand 2026-09-07: auf dem Bauzweig ist
# public/chat-bridge.js aus einer anderen Sitzung ebenfalls veraendert. Ein
# Stempel wuerde das still mit absegnen — genau das verbietet die Sperre.
VERSTOESSE="$(node scripts/check-security-lock.mjs 2>&1 | grep -E '^[[:space:]]+- ' | sed -E 's/^[[:space:]]+- //; s/: .*//')"
FREMD="$(printf '%s\n' "$VERSTOESSE" | grep -v '^public/auth/auth.css$' | grep -v '^$' || true)"
if [ -n "$FREMD" ]; then
  echo "    Hinweis: weitere gesperrte Dateien weichen ab (fremde Arbeit, NICHT Teil dieses Stempels):"
  printf '%s\n' "$FREMD" | sed 's/^/           /'
  echo "    Darum TEILSTEMPEL: nur der Eintrag fuer public/auth/auth.css wird erneuert,"
  echo "    die fremden Dateien bleiben rot, bis ihre Sitzung sie stempelt."
  node -e '
const fs = require("fs"); const crypto = require("crypto");
const pfad = "docs/security/security-lock-manifest.json";
const m = JSON.parse(fs.readFileSync(pfad, "utf8"));
const datei = "public/auth/auth.css";
m.files[datei] = crypto.createHash("sha256").update(fs.readFileSync(datei)).digest("hex");
m.frozenAt = new Date().toISOString();
m.confirmation = process.argv[1] + " — TEILSTEMPEL nur fuer " + datei + "; unveraendert und weiter offen: " + process.argv[2].split("\n").join(", ");
fs.writeFileSync(pfad, JSON.stringify(m, null, 2) + "\n");
console.log("    Manifest: " + datei + " = " + m.files[datei].slice(0, 12) + "…");
' "$WORTLAUT" "$FREMD" || { echo "ABBRUCH: Teilstempel fehlgeschlagen"; behalten 8; }
else
  node scripts/check-security-lock.mjs --freeze --confirm "$WORTLAUT" || { echo "ABBRUCH: Security-Lock nicht gestempelt"; behalten 8; }
fi

echo "6/8 Alle vier Sperren pruefen ..."
for pruefung in start admin favicon; do
  node "scripts/check-${pruefung}-lock.mjs" || { echo "ABBRUCH: ${pruefung}-lock rot"; behalten 9; }
done
# Security-Lock: auth.css darf NICHT mehr gemeldet werden; fremde Dateien duerfen (Vorbestand).
NACHHER="$(node scripts/check-security-lock.mjs 2>&1 | grep -E '^[[:space:]]+- ' | sed -E 's/^[[:space:]]+- //; s/: .*//' || true)"
if printf '%s\n' "$NACHHER" | grep -q '^public/auth/auth.css$'; then
  echo "ABBRUCH: auth.css ist nach dem Stempel immer noch rot"; behalten 9
fi
echo "    security-lock: auth.css gruen$( [ -n "$NACHHER" ] && echo " (weiter rot, fremd: $(printf '%s' "$NACHHER" | tr '\n' ' '))" )"

echo "7/8 Hochladen: Bauzweig, dann Frontend-Klon ..."
git add docs/security docs/approvals 2>/dev/null
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "chore(schutz): Security-Lock nach dem Safe-Area-Fix der Anmeldeseite gestempelt (Betreiber-Doppelklick 2026-09-07)" \
  -m "auth.css: .auth-shell mit env(safe-area-inset-*) — gemessen im iPhone-17-Pro-Simulator als installierte App." \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: commit"; behalten 10; }
if ! git push -q origin "HEAD:$ZWEIG"; then
  echo "Push abgelehnt (der Zweig hat sich bewegt) — bitte Claude Code Bescheid geben."
  behalten 11
fi
echo "    Bauzweig: $(git log --oneline -1)"

cd "$KLON" || behalten 12
git fetch -q origin main && git checkout -q main && git pull -q --ff-only origin main || { echo "ABBRUCH: Klon nicht auf origin/main"; behalten 12; }
cp "$BAUM/public/auth/auth.css" auth/auth.css
cp "$BAUM/public/auth/auth.css" assets/auth/auth.css
git add auth/auth.css assets/auth/auth.css
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q \
  -m "deploy(anmeldeseite): Safe-Area-Raender fuer die installierte App (Stempel 2026-09-07)" \
  -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" || { echo "ABBRUCH: Klon-Commit (nichts geaendert?)"; behalten 13; }
git push -q origin HEAD:main || { echo "ABBRUCH: Push in den Frontend-Klon"; behalten 14; }
echo "    Klon: $(git log --oneline -1)"

echo "8/8 Gegenprobe ..."
cd "$BAUM"
git fetch -q origin "$ZWEIG"
HIER="$(shasum -a 256 < docs/security/security-lock-manifest.json | cut -d' ' -f1)"
DORT="$(git show "origin/$ZWEIG:docs/security/security-lock-manifest.json" | shasum -a 256 | cut -d' ' -f1)"
[ "$HIER" = "$DORT" ] || { echo "ABBRUCH: Stempel NICHT im Zweig angekommen"; behalten 15; }
echo "    ok: Manifest steht im Zweig"
echo -n "    warte auf GitHub Pages "
for i in $(seq 1 30); do
  if curl -s "https://smejj.com/auth/auth.css?p=$i" | grep -q "safe-area-inset-top"; then echo; echo "    ok: auth.css ist live"; aufraeumen; echo; echo "FERTIG — Security-Lock gestempelt, Anmeldeseite live mit Safe-Area-Raendern."; exit 0; fi
  echo -n "."; sleep 10
done
echo; echo "HINWEIS: Stempel steht, aber auth.css ist nach 5 Minuten noch nicht live — Pages baut noch. Spaeter pruefen:"
echo "         curl -s https://smejj.com/auth/auth.css | grep -c safe-area"
aufraeumen
exit 0

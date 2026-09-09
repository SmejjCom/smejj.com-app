#!/bin/zsh
# smejj.com — die Anmeldeseite ins Favicon-Register nachtragen, danach den
# Service-Worker-Sprung fahren. Ein Aufruf, mehr nicht.
#
# WARUM: check-favicon-lock.mjs war rot ("htmlHeadReferences") und blockierte damit
# JEDEN Stempel — auch den fuer den schlanken Chat-Bereich. Nachgemessen wurde:
#   9 Favicon-Dateien      byte-identisch
#   Web-Manifest-Ikonen    identisch
#   Generatorquellen       identisch
# Es fehlt NUR die Seite public/auth/index.html im Register. Sie entstand nach dem
# Einfrieren (23.08.), und ihre Favicon-Verweise stimmen mit allen 43 bereits
# registrierten Seiten zeichengenau ueberein. Reiner Zuwachs, kein Rueckbau.
#
# Chirurgisch nachgetragen statt neu eingefroren: so bleiben frozenAt (23.08.) und der
# urspruengliche Betreiber-Wortlaut stehen, und der Nachtrag steht mit Grund und Freigabe
# unter "amendments". Ein Neu-Einfrieren haette beides ueberschrieben.
#
# Freigabe: Betreiber Wof Kadavanich, 2026-09-09, auf Nachfrage "Ja, nachtragen".
#
# "--probe": nur nachtragen und pruefen, ohne Commit, Push und Sprung.
set -u
PROBE=0; [ "${1:-}" = "--probe" ] && PROBE=1
ZWEIG="feature/auth-redesign-github-magiclink"
QUELLE="${SMEJJ_APP_ORDNER:-$PWD}"
BAUM="/private/tmp/claude-501/favicon-nachtrag-$(date +%Y%m%d-%H%M%S)"
[ -d /Library/Developer/CommandLineTools ] && export DEVELOPER_DIR=/Library/Developer/CommandLineTools
[ -e "$QUELLE/.git" ] || { echo "ABBRUCH: Arbeitskopie fehlt unter $QUELLE"; exit 2; }
cd "$QUELLE" || exit 2

echo "1/4  Bauzweig holen ..."
git fetch -q origin "$ZWEIG" || { echo "ABBRUCH: fetch"; exit 3; }
git worktree prune
git worktree add -q --detach "$BAUM" "origin/$ZWEIG" || { echo "ABBRUCH: Arbeitsbaum"; exit 3; }
ln -sfn "$QUELLE/node_modules" "$BAUM/node_modules"
cd "$BAUM" || exit 3
echo "     $(git log --oneline -1)"

echo
echo "2/4  Beweis fuehren: wurde wirklich kein Favicon veraendert?"
node --input-type=module <<'PRUEFUNG' || { echo "ABBRUCH: es weicht mehr ab als die eine Seite"; exit 4; }
import fs from "node:fs";
import crypto from "node:crypto";
const m = JSON.parse(fs.readFileSync("docs/frontend/favicon-lock-manifest.json", "utf8"));
let ab = 0;
for (const [f, h] of Object.entries({ ...m.assets, ...m.sources })) {
  const ist = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  if (ist !== h) { console.log("  ABWEICHENDE DATEI:", f); ab++; }
}
const ikonenGleich = JSON.stringify(JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8")).icons)
  === JSON.stringify(m.webManifestIcons);
console.log(`  Favicon-Dateien abweichend: ${ab}`);
console.log(`  Web-Manifest-Ikonen unveraendert: ${ikonenGleich}`);
const links = (f) => {
  const h = fs.readFileSync(f, "utf8");
  return [...h.matchAll(/<link\b[^>]*>/gi)].map(([t]) => t.trim())
    .filter((t) => /\brel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/i.test(t));
};
const neu = JSON.stringify(links("public/auth/index.html"));
const gleich = Object.values(m.htmlHeadReferences).filter((v) => JSON.stringify(v) === neu).length;
console.log(`  Seiten mit identischen Verweisen: ${gleich} von ${Object.keys(m.htmlHeadReferences).length}`);
const sauber = ab === 0 && ikonenGleich && gleich === Object.keys(m.htmlHeadReferences).length;
process.exit(sauber ? 0 : 1);
PRUEFUNG

echo
echo "3/4  Nachtragen ..."
node --input-type=module <<'NACHTRAG' || { echo "ABBRUCH: Nachtrag"; exit 5; }
import fs from "node:fs";
const P = "docs/frontend/favicon-lock-manifest.json";
const m = JSON.parse(fs.readFileSync(P, "utf8"));
const NEU = "public/auth/index.html";
if (m.htmlHeadReferences[NEU]) { console.log("  schon eingetragen — nichts zu tun"); process.exit(0); }
const links = (f) => {
  const h = fs.readFileSync(f, "utf8");
  return [...h.matchAll(/<link\b[^>]*>/gi)].map(([t]) => t.trim())
    .filter((t) => /\brel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["']/i.test(t));
};
const zusammen = { ...m.htmlHeadReferences, [NEU]: links(NEU) };
m.htmlHeadReferences = Object.fromEntries(Object.keys(zusammen).sort().map((k) => [k, zusammen[k]]));
m.amendments = [...(m.amendments || []), {
  at: new Date().toISOString(),
  change: "htmlHeadReferences um public/auth/index.html ergaenzt",
  why: "Die Anmeldeseite entstand nach dem Einfrieren. Ihre Favicon-Verweise sind mit allen bereits registrierten Seiten identisch; keine Favicon-Datei, keine Generatorquelle und keine Web-Manifest-Ikone wurde veraendert (im Skript nachgemessen). Reiner Zuwachs, kein Rueckbau.",
  approval: "Betreiber Wof Kadavanich, 2026-09-09: auf Nachfrage 'Ja, nachtragen'.",
}];
fs.writeFileSync(P, `${JSON.stringify(m, null, 2)}\n`);
console.log("  Seiten im Register:", Object.keys(m.htmlHeadReferences).length);
NACHTRAG
node scripts/check-favicon-lock.mjs || { echo "ABBRUCH: Waechter weiter rot"; exit 5; }

if [ "$PROBE" = 1 ]; then
  echo; echo "PROBE — nachgetragen und gruen, nichts gesichert."
  echo "        Arbeitsbaum zum Nachsehen: $BAUM"
  exit 0
fi

echo
echo "4/4  Sichern und hochladen ..."
git add docs/frontend/favicon-lock-manifest.json
git -c user.name="Wof Kadavanich" -c user.email="smejjcom@gmail.com" commit -q -F - <<'MELDUNG' || { echo "ABBRUCH: commit"; exit 6; }
chore(favicon-lock): die Anmeldeseite ins Register nachgetragen

Der Waechter war rot ("htmlHeadReferences") und blockierte damit jeden Stempel. Kein
Favicon war veraendert: Favicon-Dateien byte-identisch, Web-Manifest-Ikonen identisch,
Generatorquellen identisch. Es fehlte nur public/auth/index.html im Register — eine
Seite, die nach dem Einfrieren (23.08.) entstand und deren Verweise mit allen bereits
registrierten Seiten zeichengenau uebereinstimmen. Reiner Zuwachs, kein Rueckbau.

Bewusst chirurgisch nachgetragen statt neu eingefroren: so bleiben frozenAt (23.08.) und
der urspruengliche Betreiber-Wortlaut erhalten, und der Nachtrag steht mit Grund und
Freigabe unter "amendments" — ein Neu-Einfrieren haette beides ueberschrieben und die
Aenderung unsichtbar gemacht.

Freigabe: Betreiber Wof Kadavanich, 2026-09-09, auf ausdrueckliche Nachfrage "Ja, nachtragen".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MELDUNG
git push -q origin "HEAD:$ZWEIG" || { echo "ABBRUCH: Push abgelehnt"; exit 7; }
echo "     $(git log --oneline -1)"
cd "$QUELLE" && git worktree remove --force "$BAUM" 2>/dev/null

echo
echo "Jetzt der Service-Worker-Sprung ..."
SMEJJ_ANLASS="unterer Chat-Bereich kompakt (132px-Loch entfernt) + app-helfer.js im Precache" \
SMEJJ_STEMPEL_WORTLAUT="Betreiber Wof Kadavanich, 2026-09-09: Auftrag 'unteren Chat-Eingabebereich professionell nach UI/UX-Standards optimieren, Ursache statt Pixel'. Ausgeliefert: 132px-Polster unter dem Verlauf entfernt (das Eingabefeld ist ein Raster-Geschwister, kein Overlay) und app-helfer.js in den Precache aufgenommen, die bisher 404 war. Freigabe 'pusche selber'." \
  "$QUELLE/scripts/einmal/sw-sprung-2026-09-07.sh"

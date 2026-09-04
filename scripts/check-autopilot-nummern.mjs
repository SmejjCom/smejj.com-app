#!/usr/bin/env node
// smejj.com — 100%-Schutz der AUTOPILOTEN-NUMMERN.
//
// Betreiber-Freigabe 2026-09-04, Wortlaut:
//   "Autopilots sind Numerieren sollen so bleiben, du sollst 100 % schutzen,
//    soll ohne schriftliche Bestaetigung nicht geaendert werden, nicht
//    geloescht werden, legt hundert Prozent Schutz drauf."
//
// WARUM EIN NUMMERN-MANIFEST UND KEIN DATEI-HASH:
// Ein Hash ueber opsAutopilotenListe*.js wuerde jeden Tippfehler in einer
// Beschreibung zum Sicherheitsvorfall machen und gleichzeitig den Weiterbau
// blockieren — Autopilot Nr. 82 waere dann nur noch mit Neu-Einfrieren zu
// bauen, und wer staendig neu einfriert, segnet irgendwann alles mit ab (dieselbe
// Begruendung steht in scripts/lib/datei-sperre.mjs). Geschuetzt wird deshalb
// GENAU das, was der Betreiber genannt hat: die ZUORDNUNG Nummer -> Autopilot.
//
// Was fail-closed abgewiesen wird (Exit 1):
//   1. Eine vergebene Nummer zeigt auf einen ANDEREN Autopiloten (Umnummerierung).
//   2. Eine vergebene Nummer ist verschwunden (Loeschung).
//   3. Eine Nummer ist zweimal vergeben.
//   4. Ein Autopilot traegt zwei Nummern.
//   5. Ein Autopilot hat gar keine Nummer (er waere in der Konsole namenlos).
//
// Was ausdruecklich ERLAUBT bleibt: eine NEUE Nummer fuer einen NEUEN
// Autopiloten. Der Schutz sichert den Bestand, er verbietet nicht den Weiterbau.
// Neue Nummern werden gemeldet und wandern erst mit --freeze ins Manifest.
//
// Aufruf:
//   node scripts/check-autopilot-nummern.mjs
//   node scripts/check-autopilot-nummern.mjs --freeze --confirm "<Wortlaut des Betreibers>"
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = path.join(WURZEL, "docs/security/autopilot-nummern-lock.json");
const QUELLE = path.join(WURZEL, "control-server/src/admin/opsAutopilotenListe.js");

/** Die gelebte Zuordnung: Nummer -> Autopilot-Kennung, direkt aus der Registry. */
export async function nummernAusDerQuelle(quelle = QUELLE) {
  const modul = await import(pathToFileURL(quelle).href);
  const liste = modul.AUTOPILOTEN || [];
  return liste.map((a) => ({ nummer: String(a.nummer || "").trim(), id: String(a.id || "").trim(), name: a.name || "" }));
}

function manifestLesen() {
  if (!existsSync(MANIFEST)) return null;
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

/**
 * Vergleicht Bestand und Manifest.
 * @returns {{befunde: string[], neu: Array<{nummer: string, id: string}>}}
 */
export function pruefe(bestand, manifest) {
  const befunde = [];
  const neu = [];

  // 5. Jeder Autopilot braucht eine Nummer.
  for (const a of bestand) {
    if (!a.nummer) befunde.push(`Autopilot "${a.id}" hat keine Nummer — in der Konsole stuende dort ein Strich.`);
  }

  // 3./4. Doppelvergabe in beide Richtungen.
  const proNummer = new Map();
  const proId = new Map();
  for (const a of bestand) {
    if (!a.nummer) continue;
    if (proNummer.has(a.nummer)) {
      befunde.push(`Nummer ${a.nummer} ist zweimal vergeben: "${proNummer.get(a.nummer)}" und "${a.id}".`);
    } else proNummer.set(a.nummer, a.id);
    if (proId.has(a.id)) {
      befunde.push(`Autopilot "${a.id}" traegt zwei Nummern: ${proId.get(a.id)} und ${a.nummer}.`);
    } else proId.set(a.id, a.nummer);
  }

  const eingefroren = (manifest && manifest.nummern) || {};
  // 1./2. Kein Wandern, kein Verschwinden.
  for (const [nummer, id] of Object.entries(eingefroren)) {
    const jetzt = proNummer.get(nummer);
    if (jetzt === undefined) {
      befunde.push(`Nummer ${nummer} ("${id}") ist verschwunden — geloescht oder umbenannt. Das ist ohne schriftliche Freigabe nicht erlaubt.`);
    } else if (jetzt !== id) {
      befunde.push(`Nummer ${nummer} gehoerte "${id}", zeigt jetzt aber auf "${jetzt}". Umnummerieren ist ohne schriftliche Freigabe nicht erlaubt.`);
    }
  }

  // Zuwachs: erlaubt, aber sichtbar.
  for (const [nummer, id] of proNummer.entries()) {
    if (eingefroren[nummer] === undefined) neu.push({ nummer, id });
  }
  neu.sort((a, b) => Number(a.nummer) - Number(b.nummer));
  return { befunde, neu };
}

function einfrieren(bestand, wortlaut) {
  if (!wortlaut || wortlaut.trim().length < 10) {
    console.error("autopilot-nummern-lock: --freeze verlangt --confirm \"<Wortlaut der Betreiber-Freigabe>\".");
    process.exit(1);
  }
  const nummern = {};
  for (const a of [...bestand].sort((x, y) => Number(x.nummer) - Number(y.nummer))) {
    if (a.nummer) nummern[a.nummer] = a.id;
  }
  writeFileSync(MANIFEST, `${JSON.stringify({
    lock: "smejj autopilot nummern lock v1 (100% Schutz)",
    frozenAt: new Date().toISOString(),
    confirmation: wortlaut,
    rule: "Eine vergebene Autopiloten-Nummer darf ohne ausdrueckliche schriftliche Freigabe des Betreibers nicht wandern, nicht doppelt vergeben und nicht geloescht werden. Neue Nummern fuer neue Autopiloten bleiben erlaubt.",
    quelle: "control-server/src/admin/opsAutopilotenListe.js",
    anzahl: Object.keys(nummern).length,
    nummern
  }, null, 2)}\n`);
  console.log(`autopilot-nummern-lock: ${Object.keys(nummern).length} Nummern eingefroren.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const bestand = await nummernAusDerQuelle();
  if (argv.includes("--freeze")) {
    const i = argv.indexOf("--confirm");
    einfrieren(bestand, i >= 0 ? argv[i + 1] : "");
    return;
  }
  const manifest = manifestLesen();
  if (!manifest) {
    console.error(`autopilot-nummern-lock: Manifest fehlt (${path.relative(WURZEL, MANIFEST)}). Erst einfrieren.`);
    process.exit(1);
  }
  const { befunde, neu } = pruefe(bestand, manifest);
  for (const n of neu) console.log(`autopilot-nummern-lock: neue Nummer ${n.nummer} = "${n.id}" (erlaubt; mit --freeze uebernehmen).`);
  if (befunde.length) {
    console.error(`autopilot-nummern-lock: ${befunde.length} Verstoss/Verstoesse gegen den 100%-Schutz:`);
    for (const b of befunde) console.error(`  - ${b}`);
    console.error(`\n  Manifest: ${path.relative(WURZEL, MANIFEST)}`);
    console.error(`  Freigabe vom ${manifest.frozenAt}: "${manifest.confirmation}"`);
    process.exit(1);
  }
  console.log(`autopilot-nummern-lock: OK — ${Object.keys(manifest.nummern).length} Nummern unveraendert, ${bestand.length} Autopiloten geprueft.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((fehler) => { console.error("autopilot-nummern-lock:", fehler.message); process.exit(1); });
}

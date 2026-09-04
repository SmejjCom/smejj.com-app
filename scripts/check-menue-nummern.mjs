#!/usr/bin/env node
// smejj.com — 100%-Schutz der NUMMERN IM ADMIN-MENUE (linke Schiene).
//
// Betreiber-Freigabe 2026-09-04, Wortlaut:
//   "Adminbereich. Linke Seite Menue-Ueberschriften, auch nummerieren und dann
//    hundert Prozent Schutz drauflegen."
//
// Dieselbe Bauart wie scripts/check-autopilot-nummern.mjs und aus demselben
// Grund: geschuetzt wird die ZUORDNUNG (Nummer -> Bereich), nicht die Datei.
// Ein Hash ueber console.js wuerde jede Zeile Konsolen-Arbeit zum
// Sicherheitsvorfall machen und den Schutz durch staendiges Neu-Einfrieren
// entwerten.
//
// Was fail-closed abgewiesen wird (Exit 1):
//   1. Eine vergebene Seiten-Nummer zeigt auf einen ANDEREN Bereich.
//   2. Eine vergebene Nummer ist verschwunden (Bereich geloescht/umbenannt).
//   3. Eine Nummer ist zweimal vergeben.
//   4. Eine Gruppen-Ueberschrift hat eine andere Nummer als eingefroren.
//   5. Eine registrierte Seite hat gar keine Nummer — sie fiele in der Schiene
//      ans Ende ihrer Gruppe und traege eine leere Plakette.
//   6. Eine Nummer steht in der Tabelle, aber keine Seite registriert sich
//      dafuer (Karteileiche — die Nummer waere blockiert, ohne zu wirken).
//
// Erlaubt bleibt: eine NEUE Nummer fuer einen NEUEN Bereich.
//
// Aufruf:
//   node scripts/check-menue-nummern.mjs
//   node scripts/check-menue-nummern.mjs --freeze --confirm "<Wortlaut>"
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registrierteSeiten } from "./deploy/sync_admin_console_pages.mjs";

const WURZEL = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = path.join(WURZEL, "docs/security/adminmenue-nummern-lock.json");
const KONSOLE = path.join(WURZEL, "control-server/admin-ui/console.js");

/**
 * Liest eine der beiden Tabellen aus console.js.
 *
 * Bewusst per Textsuche statt Import: console.js ist ein Browser-Skript und
 * wuerde in Node sofort ueber `window` und `document` stolpern. Dieselbe
 * Entscheidung, aus demselben Grund, steht in
 * scripts/deploy/sync_admin_console_pages.mjs.
 */
export function tabelle(name, quelle = KONSOLE) {
  const text = readFileSync(quelle, "utf8");
  const anfang = new RegExp(`const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\{`).exec(text);
  if (!anfang) throw new Error(`Tabelle ${name} steht nicht mehr in control-server/admin-ui/console.js`);
  const start = anfang.index + anfang[0].length - 1;
  let tiefe = 0;
  let ende = start;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") tiefe += 1;
    else if (text[i] === "}") { tiefe -= 1; if (tiefe === 0) { ende = i; break; } }
  }
  const block = text.slice(start + 1, ende);
  const eintraege = {};
  for (const treffer of block.matchAll(/(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:\s*"([^"]+)"/g)) {
    eintraege[treffer[1] || treffer[2]] = treffer[3];
  }
  return eintraege;
}

function manifestLesen() {
  if (!existsSync(MANIFEST)) return null;
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

/** @returns {{befunde: string[], neu: Array<{nummer: string, pfad: string}>}} */
export function pruefe(seiten, gruppen, registriert, manifest) {
  const befunde = [];
  const neu = [];

  // 5./6. Tabelle und Registrierung muessen sich decken.
  for (const pfad of registriert) {
    if (!seiten[pfad]) befunde.push(`Seite "${pfad}" ist in der Konsole registriert, hat aber keine Nummer in SEITEN_NUMMERN.`);
  }
  for (const pfad of Object.keys(seiten)) {
    if (!registriert.includes(pfad)) befunde.push(`Nummer ${seiten[pfad]} steht auf "${pfad}", aber keine Konsolen-Datei registriert diese Seite.`);
  }

  // 3. Keine Nummer zweimal.
  const proNummer = new Map();
  for (const [pfad, nummer] of Object.entries(seiten)) {
    if (proNummer.has(nummer)) befunde.push(`Nummer ${nummer} ist zweimal vergeben: "${proNummer.get(nummer)}" und "${pfad}".`);
    else proNummer.set(nummer, pfad);
  }

  const alteSeiten = (manifest && manifest.seiten) || {};
  const alteGruppen = (manifest && manifest.gruppen) || {};

  // 1./2. Kein Wandern, kein Verschwinden.
  for (const [pfad, nummer] of Object.entries(alteSeiten)) {
    if (seiten[pfad] === undefined) {
      befunde.push(`Bereich "${pfad}" (Nummer ${nummer}) ist aus der Nummern-Tabelle verschwunden. Ohne schriftliche Freigabe nicht erlaubt.`);
    } else if (seiten[pfad] !== nummer) {
      befunde.push(`Bereich "${pfad}" trug die Nummer ${nummer} und traegt jetzt ${seiten[pfad]}. Umnummerieren ist ohne schriftliche Freigabe nicht erlaubt.`);
    }
  }

  // 4. Gruppen-Ueberschriften.
  for (const [gruppe, nummer] of Object.entries(alteGruppen)) {
    if (gruppen[gruppe] === undefined) befunde.push(`Gruppe "${gruppe}" (Nummer ${nummer}) steht nicht mehr in GRUPPEN_NUMMERN.`);
    else if (gruppen[gruppe] !== nummer) befunde.push(`Gruppe "${gruppe}" trug die Nummer ${nummer} und traegt jetzt ${gruppen[gruppe]}.`);
  }

  for (const [pfad, nummer] of Object.entries(seiten)) {
    if (alteSeiten[pfad] === undefined) neu.push({ nummer, pfad });
  }
  return { befunde, neu };
}

function einfrieren(seiten, gruppen, wortlaut) {
  if (!wortlaut || wortlaut.trim().length < 10) {
    console.error("adminmenue-nummern-lock: --freeze verlangt --confirm \"<Wortlaut der Betreiber-Freigabe>\".");
    process.exit(1);
  }
  writeFileSync(MANIFEST, `${JSON.stringify({
    lock: "smejj adminmenue nummern lock v1 (100% Schutz)",
    frozenAt: new Date().toISOString(),
    confirmation: wortlaut,
    rule: "Eine vergebene Nummer im Admin-Menue (Gruppe und Bereich) darf ohne ausdrueckliche schriftliche Freigabe des Betreibers nicht wandern, nicht doppelt vergeben und nicht geloescht werden. Neue Nummern fuer neue Bereiche bleiben erlaubt.",
    quelle: "control-server/admin-ui/console.js (GRUPPEN_NUMMERN, SEITEN_NUMMERN)",
    gruppen,
    seiten
  }, null, 2)}\n`);
  console.log(`adminmenue-nummern-lock: ${Object.keys(gruppen).length} Gruppen und ${Object.keys(seiten).length} Bereiche eingefroren.`);
}

async function main() {
  const argv = process.argv.slice(2);
  const seiten = tabelle("SEITEN_NUMMERN");
  const gruppen = tabelle("GRUPPEN_NUMMERN");
  if (argv.includes("--freeze")) {
    const i = argv.indexOf("--confirm");
    einfrieren(seiten, gruppen, i >= 0 ? argv[i + 1] : "");
    return;
  }
  const manifest = manifestLesen();
  if (!manifest) {
    console.error(`adminmenue-nummern-lock: Manifest fehlt (${path.relative(WURZEL, MANIFEST)}). Erst einfrieren.`);
    process.exit(1);
  }
  const { befunde, neu } = pruefe(seiten, gruppen, registrierteSeiten(), manifest);
  for (const n of neu) console.log(`adminmenue-nummern-lock: neue Nummer ${n.nummer} = "${n.pfad}" (erlaubt; mit --freeze uebernehmen).`);
  if (befunde.length) {
    console.error(`adminmenue-nummern-lock: ${befunde.length} Verstoss/Verstoesse gegen den 100%-Schutz:`);
    for (const b of befunde) console.error(`  - ${b}`);
    console.error(`\n  Manifest: ${path.relative(WURZEL, MANIFEST)}`);
    console.error(`  Freigabe vom ${manifest.frozenAt}: "${manifest.confirmation}"`);
    process.exit(1);
  }
  console.log(`adminmenue-nummern-lock: OK — ${Object.keys(manifest.gruppen).length} Gruppen, ${Object.keys(manifest.seiten).length} Bereiche unveraendert.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((fehler) => { console.error("adminmenue-nummern-lock:", fehler.message); process.exit(1); });
}

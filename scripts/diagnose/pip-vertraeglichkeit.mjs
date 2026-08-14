#!/usr/bin/env node
// smejj.com — Vertraeglichkeit einer requirements.txt pruefen, OHNE zu bauen.
//
// Warum es das gibt (Befund 2026-08-14): Der Bild-Maler bekam die geprueften
// Bibliotheks-Fassungen, und der Zeabur-Bau brach nach einer Minute ab —
// "ResolutionImpossible", weil diffusers 0.38.0 ein safetensors>=0.8.0
// verlangt, waehrend 0.4.5 festgenagelt war. Der Fehler war erst NACH dem
// Push sichtbar. Jeder Fehlbau kostet Bauzeit und, schlimmer, Vertrauen in
// die Ampel: ein FAILED sieht aus wie "die Aktualisierung war falsch",
// obwohl nur ein Begleitpaket nachziehen musste.
//
// Dieses Skript liest die Pins, holt zu jedem die Abhaengigkeiten aus dem
// PyPI-Verzeichnis und prueft, ob die gepinnten Fassungen einander genuegen.
// Es ersetzt den Bau nicht (Plattform-Raeder, torch aus dem Dockerfile), aber
// es faengt genau die Klasse Fehler ab, die den Bau sofort abbrechen laesst.
//
// Aufruf:
//   node scripts/diagnose/pip-vertraeglichkeit.mjs <pfad/zu/requirements.txt>
//
// Exit 0 = keine Widersprueche gefunden. Exit 1 = mindestens einer.
import { readFileSync } from "node:fs";

const datei = process.argv[2];
if (!datei) {
  console.error("Aufruf: node scripts/diagnose/pip-vertraeglichkeit.mjs <requirements.txt>");
  process.exit(2);
}

/** Nur echte Pins (name==version). Alles andere kann dieses Skript nicht pruefen. */
function lesePins(text) {
  const pins = new Map();
  const ungeprueft = [];
  for (const roh of text.split("\n")) {
    const zeile = roh.split("#")[0].trim();
    if (!zeile) continue;
    const treffer = zeile.match(/^([A-Za-z0-9._-]+)(\[[^\]]*\])?==([A-Za-z0-9._+-]+)$/);
    if (treffer) pins.set(treffer[1].toLowerCase().replace(/_/g, "-"), treffer[3]);
    else ungeprueft.push(zeile);
  }
  return { pins, ungeprueft };
}

/** Versionsvergleich, ausreichend fuer PyPI-Pins: 1.2.10 > 1.2.9, rc < final. */
function vergleiche(a, b) {
  const teile = (v) => String(v).split(/[.+-]/).map((t) => (/^\d+$/.test(t) ? Number(t) : t));
  const x = teile(a);
  const y = teile(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const l = x[i] ?? 0;
    const r = y[i] ?? 0;
    if (l === r) continue;
    // Zahl schlaegt Text: 0.8.0 > 0.8.0rc1 (Vorabfassungen sind kleiner).
    if (typeof l === "number" && typeof r === "string") return 1;
    if (typeof l === "string" && typeof r === "number") return -1;
    return l < r ? -1 : 1;
  }
  return 0;
}

function erfuellt(version, operator, grenze) {
  const c = vergleiche(version, grenze);
  if (operator === ">=") return c >= 0;
  if (operator === ">") return c > 0;
  if (operator === "<=") return c <= 0;
  if (operator === "<") return c < 0;
  if (operator === "==") return c === 0;
  if (operator === "!=") return c !== 0;
  return true; // ~=, === und Exoten: nicht bewertbar, also nicht meckern
}

async function holeAbhaengigkeiten(name, version) {
  const antwort = await fetch(`https://pypi.org/pypi/${name}/${version}/json`);
  if (!antwort.ok) return { fehlt: true, liste: [] };
  const daten = await antwort.json();
  return { fehlt: false, liste: daten.info?.requires_dist || [] };
}

const { pins, ungeprueft } = lesePins(readFileSync(datei, "utf8"));
const befunde = [];
const fehlendeVersionen = [];

for (const [name, version] of pins) {
  const { fehlt, liste } = await holeAbhaengigkeiten(name, version);
  if (fehlt) { fehlendeVersionen.push(`${name}==${version}`); continue; }
  for (const eintrag of liste) {
    // Zusatz-Gruppen (extra == "dev") installiert niemand mit; ueberspringen.
    if (/;\s*extra\s*==/.test(eintrag)) continue;
    const kopf = eintrag.split(";")[0].trim();
    const treffer = kopf.match(/^([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*(.*)$/);
    if (!treffer) continue;
    const zielName = treffer[1].toLowerCase().replace(/_/g, "-");
    const zielPin = pins.get(zielName);
    if (!zielPin) continue; // nicht gepinnt: pip darf frei waehlen
    for (const bedingung of (treffer[3] || "").split(",")) {
      const b = bedingung.trim().match(/^(>=|<=|==|!=|<|>|~=|===)\s*([A-Za-z0-9._+*-]+)$/);
      if (!b) continue;
      if (!erfuellt(zielPin, b[1], b[2])) {
        befunde.push(`${name}==${version} verlangt ${zielName}${b[1]}${b[2]} — gepinnt ist ${zielPin}`);
      }
    }
  }
}

if (fehlendeVersionen.length) {
  console.log(`WARNUNG: nicht im Verzeichnis gefunden — ${fehlendeVersionen.join(", ")}`);
}
if (ungeprueft.length) {
  console.log(`Hinweis: ${ungeprueft.length} Zeile(n) ohne festen Pin, nicht geprueft.`);
}
if (befunde.length === 0) {
  console.log(`pip-vertraeglichkeit OK — ${pins.size} gepinnte Pakete, kein Widerspruch gefunden.`);
  process.exit(fehlendeVersionen.length ? 1 : 0);
}
console.log(`pip-vertraeglichkeit VERLETZT (${befunde.length}):`);
for (const b of befunde) console.log(`  - ${b}`);
process.exit(1);

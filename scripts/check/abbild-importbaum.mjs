// smejj.com — Abbild-Waechter: deckt ein Dockerfile den Importbaum seines Dienstes?
//
// WOZU, in einem Satz: Ein Container, dem EINE importierte Datei fehlt, startet
// nicht — er antwortet 502, und im Bau-Protokoll steht kein Fehler.
//
// Das ist keine Sorge auf Vorrat. Am 2026-08-03 lief der LoRA-Trainer 28
// Stunden als "running, ready=true", waehrend die Anwendung darin gar nicht
// bediente. Am 2026-09-04 starb der con-Autopilot beim Start mit
// ERR_MODULE_NOT_FOUND, weil eine einzige COPY-Zeile fuer hash.js fehlte.
// Beide Male war die Ursache erst nach langer Suche sichtbar, weil ein
// fehlendes Modul von aussen wie ein kaputter Dienst aussieht.
//
// WARUM DER IMPORTBAUM MEHRZEILIG GELESEN WIRD, und das ist der Kern des
// Werkzeugs: Ein Muster wie /import[^\n]*from/ findet einzeilige Importe und
// uebersieht jeden Block der Form
//
//     import {
//       eins,
//       zwei
//     } from "./modul.js";
//
// Genau daran ist der erste Anlauf dieses Skripts am 07.09. gescheitert: 41
// statt 59 Dateien, 18 stumm unterschlagen. Ein Waechter, der zu wenig findet,
// ist schlimmer als keiner — er unterschreibt ein kaputtes Abbild.
//
// Aufruf:
//   node scripts/check/abbild-importbaum.mjs <Dockerfile> <Einstiegsdatei>
//   node scripts/check/abbild-importbaum.mjs --alle

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Dienste, die dieser Waechter kennt: Dockerfile -> Einstiegsdatei. */
export const DIENSTE = Object.freeze([
  { dockerfile: "Dockerfile.smejj-lora-loop", einstieg: "workers/smejj-lora-loop/worker.mjs" },
  { dockerfile: "Dockerfile.con-autopilot", einstieg: "workers/con-autopilot/server.mjs" }
]);

/**
 * Loest den Importbaum einer Einstiegsdatei auf — relative Importe, transitiv.
 *
 * Erfasst statische Importe/Exporte UND dynamische `import("./…")`. Letztere
 * sind die gefaehrlicheren: sie stuerzen nicht beim Start ab, sondern erst
 * beim ersten Aufruf — also womoeglich mitten in einem bezahlten Lauf.
 */
export function importbaum(einstieg, { wurzel = WURZEL, lies = (p) => readFileSync(p, "utf8"), gibtEs = existsSync } = {}) {
  const gesehen = new Set();
  const fehlend = [];
  // Drei Formen, und alle drei bringen einen Container zu Fall, wenn ihre Datei
  // fehlt:
  //   1. import … from "./x"   (auch ueber mehrere Zeilen)
  //   2. import("./x")         dynamisch — stuerzt erst beim ersten Aufruf ab
  //   3. import "./x"          NEBENWIRKUNG, ohne "from". Vom ersten Anlauf am
  //      07.09. uebersehen, weil das Muster "from" verlangte; ein Test hat es
  //      gefunden. Solche Importe registrieren etwas und sehen harmlos aus.
  const muster = /\b(?:import|export)\s[\s\S]{0,400}?from\s*["'](\.[^"']+)["']|\bimport\(\s*["'](\.[^"']+)["']\s*\)|\bimport\s+["'](\.[^"']+)["']/g;

  function gehe(datei) {
    const rel = path.relative(wurzel, datei);
    if (gesehen.has(rel)) return;
    gesehen.add(rel);
    if (!gibtEs(datei)) { fehlend.push(rel); return; }
    const text = lies(datei);
    muster.lastIndex = 0;
    let treffer;
    while ((treffer = muster.exec(text))) {
      gehe(path.resolve(path.dirname(datei), treffer[1] || treffer[2] || treffer[3]));
    }
  }
  gehe(path.resolve(wurzel, einstieg));
  return { dateien: [...gesehen].sort(), fehlend };
}

/** Die Pfade, die ein Dockerfile per COPY in das Abbild holt. */
export function kopiertePfade(dockerfileText = "") {
  const pfade = [];
  for (const zeile of String(dockerfileText).split("\n")) {
    const t = zeile.trim();
    if (!/^COPY\s/i.test(t)) continue;
    // COPY [--flags] <quelle…> <ziel>  — die letzte Angabe ist das Ziel.
    const teile = t.replace(/^COPY\s+/i, "").split(/\s+/).filter((s) => !s.startsWith("--"));
    for (const quelle of teile.slice(0, -1)) pfade.push(quelle.replace(/^\.\//, ""));
  }
  return pfade;
}

/**
 * Deckt einer der kopierten Pfade diese Datei ab?
 *
 * Ein Ordner deckt alles unter sich ab; eine Datei nur sich selbst. Bewusst
 * KEINE Glob-Auswertung: ein Waechter, der Muster raet, faellt genau dort um,
 * wo es darauf ankommt.
 */
export function istAbgedeckt(datei, pfade = []) {
  return pfade.some((p) => datei === p || datei.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * Wird diese Datei von .dockerignore aus dem BAU-KONTEXT ausgeschlossen?
 *
 * Das ist die zweite Art, wie eine Datei fehlen kann — und die heimtueckischere:
 * Eine COPY-Zeile IST da, aber Docker sieht die Datei gar nicht. Der Bau bricht
 * dann mit "failed to compute cache key" ab (Dauertrainings-Schleife am
 * 01.08.) oder "failed to calculate checksum" (Bruecken-Waechter am 07.08.) —
 * eine Fehlermeldung, die nirgends den Namen der fehlenden Regel nennt.
 *
 * Die Auswertung folgt Dockers Regel: alle Muster der Reihe nach, das LETZTE
 * passende entscheidet, "!" macht eine Ausnahme. Bewusst nur die Formen, die
 * hier wirklich vorkommen (Praefix, "/" + "*", "/**"). Ein Waechter, der
 * komplizierte Glob-Muster RAET, faellt genau dort um, wo es darauf ankommt —
 * darum meldet ein unbekanntes Muster lieber nichts, als es falsch zu deuten.
 */
export function vonDockerignoreAusgeschlossen(datei, zeilen = []) {
  let ausgeschlossen = false;
  for (const roh of zeilen) {
    const zeile = String(roh).trim();
    if (!zeile || zeile.startsWith("#")) continue;
    const negiert = zeile.startsWith("!");
    const muster = (negiert ? zeile.slice(1) : zeile).replace(/^\.\//, "");
    if (muster.includes("?") || muster.slice(0, -3).includes("*")) continue; // nicht deutbar
    const basis = muster.replace(/\/\*\*$/, "").replace(/\/\*$/, "").replace(/\*$/, "");
    if (!basis) continue;
    if (datei === basis || datei.startsWith(`${basis}/`)) ausgeschlossen = !negiert;
  }
  return ausgeschlossen;
}

/** Prueft einen Dienst. Rein genug fuer Tests: alles Aeussere ist einreichbar. */
export function pruefeDienst({ dockerfile, einstieg }, { wurzel = WURZEL, lies = (p) => readFileSync(p, "utf8"), gibtEs = existsSync } = {}) {
  const dfPfad = path.resolve(wurzel, dockerfile);
  if (!gibtEs(dfPfad)) return { ok: false, dockerfile, fehlerhaft: [], gruende: [`Dockerfile fehlt: ${dockerfile}`] };
  const { dateien, fehlend } = importbaum(einstieg, { wurzel, lies, gibtEs });
  const pfade = kopiertePfade(lies(dfPfad));
  const nichtKopiert = dateien.filter((d) => !istAbgedeckt(d, pfade));

  const ignorePfad = path.resolve(wurzel, ".dockerignore");
  const ignoreZeilen = gibtEs(ignorePfad) ? lies(ignorePfad).split("\n") : [];
  const ausgesperrt = dateien.filter((d) => vonDockerignoreAusgeschlossen(d, ignoreZeilen));

  const gruende = [];
  if (fehlend.length) gruende.push(`${fehlend.length} importierte Datei(en) existieren gar nicht: ${fehlend.slice(0, 5).join(", ")}`);
  if (nichtKopiert.length) gruende.push(`${nichtKopiert.length} Datei(en) werden NICHT ins Abbild kopiert`);
  if (ausgesperrt.length) gruende.push(`${ausgesperrt.length} Datei(en) sperrt .dockerignore aus dem Bau-Kontext aus`);
  return { ok: gruende.length === 0, dockerfile, einstieg, gesamt: dateien.length, fehlerhaft: nichtKopiert, ausgesperrt, fehlend, gruende };
}

function main() {
  const argv = process.argv.slice(2);
  const auftraege = argv[0] === "--alle" || argv.length === 0
    ? DIENSTE
    : [{ dockerfile: argv[0], einstieg: argv[1] }];

  let fehler = 0;
  for (const auftrag of auftraege) {
    const b = pruefeDienst(auftrag);
    if (b.ok) {
      console.log(`OK  ${b.dockerfile}: alle ${b.gesamt} importierten Dateien liegen im Abbild.`);
      continue;
    }
    fehler += 1;
    console.error(`FEHLER  ${b.dockerfile}: ${b.gruende.join("; ")}`);
    for (const d of b.fehlerhaft) console.error(`    fehlt im Abbild: ${d}`);
    for (const d of b.ausgesperrt || []) console.error(`    von .dockerignore ausgesperrt: ${d}`);
    for (const d of b.fehlend || []) console.error(`    Import zeigt ins Leere: ${d}`);
  }
  if (fehler) {
    console.error("\nEin Container, dem eine importierte Datei fehlt, startet nicht und antwortet 502 —");
    console.error("ohne dass im Bau-Protokoll ein Fehler steht. Fehlende COPY-Zeilen ergaenzen.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

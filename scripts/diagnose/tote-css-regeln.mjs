#!/usr/bin/env node
// smejj.com — welche Regeln im Startseiten-Buendel spricht NIEMAND an?
//
// Betreiber-Auftrag 2026-09-04: "Gewicht der Startseite druecken".
//
// WARUM STATISCH UND NICHT IM BROWSER: Im Browser gemessen trafen 51 % der
// 1157 Regeln kein einziges Element — aber das ist ein SCHNAPPSCHUSS eines
// Zustands. `#code.view.is-active` trifft nichts, solange man nicht in der
// Code-Ansicht steht; wer danach loescht, zerlegt die Ansicht. Genau diese
// Falle steht schon als Lehre im Projekt ("Pruefung prueft die falsche Frage").
//
// Deshalb hier die andere Frage, die man OHNE Zustand beantworten kann:
// Kommt die Klasse oder die Kennung, die eine Regel anspricht, IRGENDWO im
// ausgelieferten Markup oder in irgendeiner Moduldatei vor? Wenn nicht, kann
// kein Zustand sie je erzeugen — dann ist die Regel tot.
//
// Das Ergebnis ist ein BERICHT, kein Loeschen. Er nennt Kandidaten samt der
// Zeichenkette, die nirgends vorkommt, damit ein Mensch entscheidet.
//
// Aufruf: node scripts/diagnose/tote-css-regeln.mjs [--csv]
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OEFFENTLICH = path.join(WURZEL, "public");
const BUENDEL = path.join(OEFFENTLICH, "start-styles.css");

/** Alles, was ein Selektor treffen koennte: Markup und Modulcode. */
function heuhaufen() {
  const teile = [];
  const gehe = (ordner, tiefe = 0) => {
    if (tiefe > 4) return;
    for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
      if (eintrag.name.startsWith(".") || eintrag.name === "node_modules") continue;
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) { gehe(voll, tiefe + 1); continue; }
      if (!/\.(html|js|mjs)$/.test(eintrag.name)) continue;
      if (statSync(voll).size > 2_000_000) continue;
      teile.push(readFileSync(voll, "utf8"));
    }
  };
  gehe(OEFFENTLICH);
  return teile.join("\n");
}

/** Die Namen, die eine Regel braucht: .klasse und #kennung. */
function namenIn(selektor) {
  const namen = new Set();
  for (const t of selektor.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) namen.add(t[1]);
  for (const t of selektor.matchAll(/#(-?[_a-zA-Z][\w-]*)/g)) namen.add(t[1]);
  return [...namen];
}

/** Regeln aus dem Buendel — ohne CSS-Parser, aber robust genug fuer den Bericht. */
function regeln(css) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const gefunden = [];
  const muster = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  for (const t of ohneKommentare.matchAll(muster)) {
    const selektor = t[1].trim().replace(/\s+/g, " ");
    if (!selektor || selektor.startsWith("@") || selektor.includes("%")) continue;
    gefunden.push({ selektor, laenge: t[0].length });
  }
  return gefunden;
}

function main() {
  const css = readFileSync(BUENDEL, "utf8");
  const alle = regeln(css);
  const heu = heuhaufen();
  const tot = [];
  for (const r of alle) {
    const namen = namenIn(r.selektor);
    if (!namen.length) continue;                       // reine Element-Selektoren: nie tot
    // Tot ist eine Regel nur, wenn KEINER ihrer Namen irgendwo vorkommt.
    const lebendig = namen.some((n) => heu.includes(n));
    if (!lebendig) tot.push({ ...r, namen });
  }
  const totBytes = tot.reduce((s, r) => s + r.laenge, 0);
  if (process.argv.includes("--csv")) {
    console.log("selektor;bytes;fehlende_namen");
    for (const r of tot) console.log(`${r.selektor};${r.laenge};${r.namen.join(" ")}`);
    return;
  }
  console.log(`tote-css-regeln: ${alle.length} Regeln im Buendel, ${tot.length} spricht niemand an (${Math.round(totBytes / 1024)} KB roh).`);
  console.log("  Kandidaten (der Name in Klammern kommt in KEINEM Markup und KEINEM Modul vor):");
  for (const r of tot.slice(0, 25)) console.log(`    ${r.selektor.slice(0, 64)}  (${r.namen.join(", ")})`);
  if (tot.length > 25) console.log(`    … und ${tot.length - 25} weitere (--csv fuer die ganze Liste)`);
  console.log("  Das ist ein BERICHT. Geloescht wird nichts — die Startseite steht unter Design-Lock.");
}

main();

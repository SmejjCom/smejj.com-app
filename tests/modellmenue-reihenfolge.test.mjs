// Waechter fuer die Reihenfolge im Modell-Menue.
//
// Betreiber-Auftrag 2026-08-18 im Wortlaut: "Auto soll ganz oben 1. sein,
// smejj 1.0 2. sein, Das heisst Auto wechsel platz mit smejj 1.0."
//
// WARUM DIESER WAECHTER SEINE DATEI SUCHT statt sie fest zu kennen:
// Erst stand das Menue in public/code-flaeche.js. Wenige Stunden spaeter zog
// eine Parallelsitzung es nach public/code-modell-menue.js aus (800-Zeilen-
// Regel) — die Reihenfolge blieb korrekt, aber der Waechter prueft eine Datei,
// in der die Zeilen nicht mehr stehen. Ein Test, der ins Leere greift, ist
// schlimmer als keiner: er meldet gruen und schuetzt nichts.
// Darum sucht dieser Waechter das Menue selbst und schlaegt Alarm, wenn er es
// NIRGENDS findet.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const AUTO = 'titel: "Auto"';
const HAUS = 'titel: "smejj 1.0"';
// fileURLToPath, NICHT .pathname: der Projektordner heisst
// "- smejj.com info/smejj.com App" — mit Leerzeichen. .pathname liefert sie
// als %20, und fs findet dann keine einzige Datei. Dieselbe Falle hat heute
// schon den Funktions-Waechter still leerlaufen lassen.
const ORDNER = fileURLToPath(new URL("../public/", import.meta.url));

/** Findet die Datei, die das Modell-Menue baut — egal wie sie gerade heisst. */
function findeMenueDatei() {
  const treffer = [];
  for (const name of readdirSync(ORDNER)) {
    if (!name.endsWith(".js")) continue;
    const text = readFileSync(join(ORDNER, name), "utf8");
    if (text.includes(AUTO) && text.includes(HAUS)) treffer.push({ name, text });
  }
  return treffer;
}

test("das Modell-Menue ist ueberhaupt auffindbar", () => {
  const treffer = findeMenueDatei();
  assert.ok(treffer.length > 0, "Keine Datei unter public/ baut das Menue — umbenannt oder geloescht?");
  assert.equal(treffer.length, 1, `Menue steht in MEHREREN Dateien: ${treffer.map((t) => t.name).join(", ")}`);
});

test("Auto steht VOR smejj 1.0", () => {
  const [{ name, text }] = findeMenueDatei();
  const auto = text.indexOf(AUTO);
  const haus = text.indexOf(HAUS);
  assert.ok(auto < haus, `In ${name} steht Auto bei ${auto}, smejj 1.0 bei ${haus} — Auto muss vorne stehen`);
});

test("beide Zeilen existieren genau einmal", () => {
  // Gegenprobe: ein Copy-Paste-Unfall wuerde die Reihenfolge-Pruefung oben
  // zufaellig gruen halten, obwohl das Menue doppelte Eintraege zeigt.
  const [{ text }] = findeMenueDatei();
  assert.equal(text.split(AUTO).length - 1, 1);
  assert.equal(text.split(HAUS).length - 1, 1);
});

test("Auto ruft weiterhin KEIN /select", () => {
  // Der Router waehlt erst, wenn der Auftrag da ist. Wuerde die Auto-Zeile
  // beim Umsortieren oder Umziehen einen /select-Aufruf erben, waere die Wahl
  // eingefroren und der sparsame Weg kaputt.
  const [{ text }] = findeMenueDatei();
  const block = text.slice(text.indexOf(AUTO), text.indexOf(HAUS));
  assert.ok(!/providers\/cline\/select/.test(block), "Auto darf kein /select rufen");
  assert.match(block, /AUTO_MARKE/);
});

test("die Begruendung des Betreibers steht im Code", () => {
  // Damit der naechste Umbau weiss, warum die Reihenfolge so ist.
  const [{ text }] = findeMenueDatei();
  assert.match(text, /Auto soll ganz oben/);
});

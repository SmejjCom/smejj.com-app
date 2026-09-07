// Waechter fuer die Reihenfolge im Modell-Menue.
//
// Betreiber-Ansage 2026-09-07 im Wortlaut:
//   "smejj 1.3 — Spezialfälle / smejj 1.2 — Komplex / smejj 1.1 — Alltag /
//    smejj 1.0 — Standard / Auto — Automatisch"
// Die Staffel steht absteigend, Auto GANZ UNTEN. Das loest die Regel vom
// 18.08.2026 ab ("Auto soll ganz oben 1. sein"), die zuvor hier stand.
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
const STAFFEL = ['titel: "smejj 1.3"', 'titel: "smejj 1.2"', 'titel: "smejj 1.1"', 'titel: "smejj 1.0"'];
// fileURLToPath, NICHT .pathname: der Projektordner heisst
// "- smejj.com info/smejj.com App" — mit Leerzeichen. .pathname liefert sie
// als %20, und fs findet dann keine einzige Datei.
const ORDNER = fileURLToPath(new URL("../public/", import.meta.url));

/** Findet die Datei, die das Modell-Menue baut — egal wie sie gerade heisst. */
function findeMenueDatei() {
  const treffer = [];
  for (const name of readdirSync(ORDNER)) {
    if (!name.endsWith(".js")) continue;
    const text = readFileSync(join(ORDNER, name), "utf8");
    if (text.includes(AUTO) && text.includes(STAFFEL[3])) treffer.push({ name, text });
  }
  return treffer;
}

test("das Modell-Menue ist ueberhaupt auffindbar", () => {
  const treffer = findeMenueDatei();
  assert.ok(treffer.length > 0, "Keine Datei unter public/ baut das Menue — umbenannt oder geloescht?");
  assert.equal(treffer.length, 1, `Menue steht in MEHREREN Dateien: ${treffer.map((t) => t.name).join(", ")}`);
});

test("die Staffel steht absteigend: 1.3, 1.2, 1.1, 1.0", () => {
  const [{ name, text }] = findeMenueDatei();
  const stellen = STAFFEL.map((s) => text.indexOf(s));
  for (const [i, stelle] of stellen.entries()) {
    assert.ok(stelle >= 0, `${STAFFEL[i]} fehlt in ${name}`);
  }
  for (let i = 1; i < stellen.length; i++) {
    assert.ok(stellen[i - 1] < stellen[i],
      `In ${name} steht ${STAFFEL[i - 1]} nicht vor ${STAFFEL[i]}`);
  }
});

test("Auto steht GANZ UNTEN, hinter der ganzen Staffel", () => {
  const [{ name, text }] = findeMenueDatei();
  const auto = text.indexOf(AUTO);
  const letzte = text.indexOf(STAFFEL[STAFFEL.length - 1]);
  assert.ok(auto > letzte, `In ${name} steht Auto bei ${auto}, smejj 1.0 bei ${letzte} — Auto gehoert nach unten`);
});

test("jede Zeile existiert genau einmal", () => {
  // Gegenprobe: ein Copy-Paste-Unfall wuerde die Reihenfolge-Pruefung oben
  // zufaellig gruen halten, obwohl das Menue doppelte Eintraege zeigt.
  const [{ text }] = findeMenueDatei();
  for (const zeile of [AUTO, ...STAFFEL]) {
    assert.equal(text.split(zeile).length - 1, 1, `${zeile} kommt nicht genau einmal vor`);
  }
});

test("jede Stufe schaltet auf eine ANDERE Spur", () => {
  // Der eigentliche Schutz. Vier Namen mit derselben Wirkung waeren eine
  // Attrappe: der Nutzer waehlt 1.3 und bekommt, was 1.0 auch geliefert haette.
  const [{ text }] = findeMenueDatei();
  const stufen = [...text.matchAll(/stufe: "([a-z]+)"/g)].map((m) => m[1]);
  const erwartet = ["spezial", "gruendlich", "auto", "schnell"];
  assert.deepEqual(stufen, erwartet,
    "Die vier Stufen muessen in der Reihenfolge 1.3, 1.2, 1.1, 1.0 je eine eigene Spur setzen");
  assert.equal(new Set(stufen).size, 4, "keine zwei Zeilen duerfen dieselbe Spur setzen");
});

test("die Wahl setzt Modell UND Stufe", () => {
  // Ohne die Stufe waehlt jemand 1.2 und bekaeme weiter die Spur, die vorher
  // eingestellt war — das Menue saehe richtig aus und waere doch wirkungslos.
  const [{ text }] = findeMenueDatei();
  assert.match(text, /localStorage\.setItem\(MODELL_KEY, titel\)/);
  assert.match(text, /localStorage\.setItem\(STUFE_KEY, stufe\)/);
});

test("Auto ruft weiterhin KEIN /select", () => {
  // Der Router waehlt erst, wenn der Auftrag da ist. Wuerde die Auto-Zeile
  // beim Umsortieren oder Umziehen einen /select-Aufruf erben, waere die Wahl
  // eingefroren und der sparsame Weg kaputt.
  const [{ text }] = findeMenueDatei();
  // Nur der Auto-Block, nicht der Rest der Datei: weiter unten steht ein
  // /select fuer einen anderen Zweck. Ohne diese Grenze schluege der Waechter
  // an, sobald Auto ans Ende wandert — und meldete einen Fehler, den es nicht
  // gibt. Ein Test, der beim Umsortieren blind rot wird, wird abgeschaltet.
  const ab = text.indexOf(AUTO);
  const ende = text.indexOf("feld.append(menue)", ab);
  const block = text.slice(ab, ende > ab ? ende : undefined);
  assert.ok(!/providers\/cline\/select/.test(block), "Auto darf kein /select rufen");
  assert.match(block, /AUTO_MARKE/);
});

test("die Begruendung des Betreibers steht im Code", () => {
  // Damit der naechste Umbau weiss, warum die Reihenfolge so ist — und dass
  // sie eine aeltere Regel bewusst abgeloest hat.
  const [{ text }] = findeMenueDatei();
  assert.match(text, /Betreiber-Ansage 2026-09-07/);
  // Ueber Zeilenumbrueche hinweg suchen: der Kommentar im Menue ist umbrochen,
  // und ein Waechter, der an der Zeilenbreite scheitert, prueft die falsche
  // Frage.
  assert.match(text.replace(/\s*\n\s*\/\/\s*/g, " "), /Reihenfolge ist absteigend/);
});

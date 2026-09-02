// smejj.com — Code-Feld am unteren Rand: Flaeche fuellt die Ansicht statt fester Hoehe, Rand mit safe-area.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/code-feld-unten.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("Regeln: Flaeche flex 1 ohne feste Hoehe, Leiste auf der Kante (nur safe-area), Spezifitaet 1,3,0", () => {
  assert.match(m.REGELN, /#code \.codeflaeche\.codeflaeche\.codeflaeche\{flex:1 1 auto;height:auto;max-height:none;min-height:0\}/);
  assert.match(m.REGELN, /#code \.codeunten\.codeunten\{padding-bottom:env\(safe-area-inset-bottom,0px\)\}/);
  assert.match(m.REGELN, /#code \.codefeld\.codefeld\{padding-bottom:0\}/);
  assert.ok(!/100d?vh - 96px/.test(m.REGELN), "keine geratene Hoehe mehr");
});

test("sorgeFuerStil haengt genau EIN style-Element an den head", () => {
  const knoten = [];
  const doc = { getElementById: (id) => knoten.find((k) => k.id === id) || null, createElement: () => ({}), head: { appendChild: (k) => knoten.push(k) } };
  assert.equal(m.sorgeFuerStil(doc), true);
  assert.equal(m.sorgeFuerStil(doc), false);
  assert.equal(knoten.length, 1);
  assert.equal(knoten[0].textContent, m.REGELN);
});

test("Haken im Startmodul chat-actions-menu.js", () => {
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/code-feld-unten.js").catch(() => {})'));
});

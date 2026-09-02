// smejj.com — Kompakt-Programm: nur Abstaende, keine Zielgroessen, keine Schriftgroessen; Haken im Startmodul.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/kompakt.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("Regeln halbieren die gemessenen Abstaende: Ansicht-Gap 20->10, Kopf 12+10->6+4, Einstellungen 72->24", () => {
  assert.match(m.REGELN, /body \.view\.is-active\.is-active\{gap:10px;padding-top:24px\}/);
  assert.match(m.REGELN, /:has\(> \.view-chrome\)\{padding-top:42px\}/, "Ansichten mit Kopfleiste bleiben unter der Leiste");
  assert.match(m.REGELN, /\.view-header\.view-header\{padding-bottom:6px;margin-bottom:4px\}/);
  assert.match(m.REGELN, /body #settings\.view\.is-active\{padding-top:28px\}/, "Einstellungen 72 -> 28 (id-Regel im Buendel)");
  assert.match(m.REGELN, /\.settings-panel\.settings-panel\{padding:14px\}/);
  assert.match(m.REGELN, /\.ch-gruppe\.ch-gruppe\{margin-top:12px\}/);
  // Stufe 2: Chat-Feld auf die Kante (nur safe-area), Polster 6, Kopfzeile/Chips 12 statt 20
  assert.match(m.REGELN, /\.prompt-glass\.prompt-glass\{padding:6px 8px 6px 12px;margin-bottom:env\(safe-area-inset-bottom,0px\)\}/);
  assert.match(m.REGELN, /body #start \.home-feed\.home-feed\{gap:12px\}/);
});

test("keine Schriftgroessen, keine min-height/height, keine width — Ziele bleiben 44 px, Schrift bleibt gross", () => {
  assert.ok(!/font-size|line-height|min-height|[^-]height:|width:/.test(m.REGELN), m.REGELN);
});

test("sorgeFuerStil haengt genau ein style-Element an; Haken in chat-actions-menu.js", () => {
  const knoten = [];
  const doc = { getElementById: (id) => knoten.find((k) => k.id === id) || null, createElement: () => ({}), head: { appendChild: (k) => knoten.push(k) } };
  assert.equal(m.sorgeFuerStil(doc), true); assert.equal(m.sorgeFuerStil(doc), false); assert.equal(knoten.length, 1);
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/kompakt.js").catch(() => {})'));
});

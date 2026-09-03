// smejj.com — Werkzeugzeile am Handy: eine Zeile, Ziele 44 px, Pillen schrumpfen; Haken im Startmodul.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/composer-zeile.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("Breitenrechnung bei 375 px geht auf: 44+75+82+44+44 plus 4 Luecken a 6 < 327", () => {
  const pille = Math.floor(375 * 0.20), modell = Math.floor(375 * 0.22);
  assert.ok(44 + pille + modell + 44 + 44 + 4 * 6 < 375 - 32 - 16, `${44 + pille + modell + 44 + 44 + 24}`);
  assert.match(m.REGELN, /fpille-nachdenken\.fpille-nachdenken\{max-width:20vw;min-width:0/);
  assert.match(m.REGELN, /\.text-chip\.text-chip\{max-width:22vw;min-width:44px/, "Modell-Chip nie unter 44 px (Betriebswache 03.09.: 30x44)");
  assert.match(m.REGELN, /\.send-button\.send-button\{width:44px;min-width:44px;flex:0 0 44px\}/);
});

test("unter 390 px nur das Symbol der Pille; Regeln nur unter 600 px; Haken in chat-actions-menu.js", () => {
  assert.match(m.REGELN, /@media \(max-width:390px\)\{[^}]*\.chip-label\{display:none\}/);
  assert.ok(m.REGELN.startsWith("@media (max-width:600px){"));
  assert.ok(!/height:\s*(3[0-9]|4[0-3])px/.test(m.REGELN), "keine Ziele unter 44 px");
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/composer-zeile.js").catch(() => {})'));
});

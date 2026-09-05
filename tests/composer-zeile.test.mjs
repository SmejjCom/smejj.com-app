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

test("unter 430 px nur das Symbol der Pille; Regeln nur unter 600 px; Haken in chat-actions-menu.js", () => {
  // Schwelle am 2026-09-05 von 390 auf 430 gehoben: die gaengigen iPhones sind
  // 393 bis 430 pt breit und fielen vorher durchs Raster.
  assert.match(m.REGELN, /@media \(max-width:430px\)\{[^}]*\.chip-label\{display:none\}/);
  assert.ok(m.REGELN.startsWith("@media (max-width:600px){"));
  assert.ok(!/height:\s*(3[0-9]|4[0-3])px/.test(m.REGELN), "keine Ziele unter 44 px");
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/composer-zeile.js").catch(() => {})'));
});

test("die Symbol-Schwelle deckt die heute gaengigen iPhones", () => {
  // NACHGEMESSEN 2026-09-05 auf dem iPhone-Simulator (iPhone 17 Pro, iOS 26.5,
  // 402 pt) und im Geraete-Emulator: Die Schwelle stand bei 390 px und lag damit
  // UNTER den aktuellen Geraeten — SE 375, 13/14 390, 15/16 393, 17 Pro 402,
  // Pro Max 430. Bei 402 pt wurden die Textpillen darum gequetscht statt ersetzt:
  // "Nachdenken" brauchte 81 px und bekam 6 (im Screenshot blieb ein "N" stehen),
  // der Modell-Chip brauchte 70 und bekam 44 ("smejj" statt "smejj 1.0").
  assert.match(m.REGELN, /@media \(max-width:430px\)/, "die Symbol-Schwelle muss 430 px sein");
  assert.doesNotMatch(m.REGELN, /@media \(max-width:390px\)/, "die alte 390er-Schwelle darf nicht zurueckkommen");
});

test("der Modell-Chip bekommt seine natuerliche Breite zurueck", () => {
  // .ghost-button setzt unter 560 px ein festes width:30px. Eine groessere
  // max-width allein blieb wirkungslos, weil die BASIS fest war — erst width:auto
  // laesst den Chip auf seine 70 px wachsen. Ohne das stand dort "smejj".
  assert.match(m.REGELN, /model-picker \.text-chip\.text-chip\{max-width:32vw;width:auto\}/,
    "max-width UND width:auto muessen gesetzt sein");
});

test("der Abstandhalter gibt den Platz frei", () => {
  // Er hielt 126 px besetzt und drueckte beide Chips zusammen.
  assert.match(m.REGELN, /prompt-spacer\{flex:1 1 0;min-width:0\}/);
});

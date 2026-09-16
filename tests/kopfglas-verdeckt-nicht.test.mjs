// Regression Live-Test 17.09.2026 (Pixel 412x783, SW v892): der Kopf-Glasstreifen aus
// mobil-dock.js lag im Chat ueber der ersten Nachricht, weil der Verlauf seit v891 an der
// Oberkante beginnt. Der Streifen muss im Chat (Handy) ausgeblendet bleiben.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../public/design-v13-kompakt.css", import.meta.url), "utf8");
const buendel = await readFile(new URL("../public/start-styles.css", import.meta.url), "utf8");

test("Kopfglas ist im Chat am Handy ausgeblendet (Verlauf beginnt an der Oberkante)", () => {
  const regel = /html body:not\(:has\(#code\.is-active\)\) \.mobil-kopfglas\.mobil-kopfglas \{\s*display: none;/;
  assert.match(css, regel);
  assert.match(buendel, regel, "start-styles.css neu buendeln");
  // Die Regel steht im selben Handy-Block wie das 6-px-Polster des Verlaufs.
  const block = css.slice(css.indexOf("Handy, dritte Runde"));
  assert.ok(block.indexOf("mobil-kopfglas") > block.indexOf("safe-area-inset-top, 0px) + 6px"));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";


test("Adressleiste rollt beim Verlassen an den Anfang — sonst steht bei langen Adressen nur das Ende (Betreiber-Bild 06.09.: '88709133371969')", () => {
  const quelle = fs.readFileSync("public/browser-pane-vorschlaege.js", "utf8");
  const blur = quelle.slice(quelle.lastIndexOf('feld.addEventListener("blur"'));
  const block = blur.slice(0, 700);
  assert.match(block, /feld\.scrollLeft = 0/);
  assert.match(block, /setSelectionRange\(0, 0\)/);
});

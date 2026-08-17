// Waechter-TUEV: Auszeichnungs-Zeichen weg, INHALT unversehrt.
import test from "node:test";
import assert from "node:assert/strict";
import { lesbarerSprechtext } from "../public/voice-overlay-ui.js";

test("Markdown-Zeichen verschwinden, der Inhalt bleibt", () => {
  const roh = "### Wetter-Call\n\nBaue einen **Wetter-Call** ein — z. B. `Open-Meteo`:\n\n```js\nconst r = await fetch(url);\n```\n\n> Danach passe ich es an.";
  const sauber = lesbarerSprechtext(roh);
  for (const zeichen of ["```", "###", "**", "`"]) {
    assert.equal(sauber.includes(zeichen), false, `noch drin: ${zeichen}`);
  }
  for (const inhalt of ["Wetter-Call", "Open-Meteo", "const r = await fetch(url);", "Danach passe ich es an."]) {
    assert.equal(sauber.includes(inhalt), true, `verloren: ${inhalt}`);
  }
});

test("Reiner Text bleibt unveraendert", () => {
  const text = "Heute wird es in San Jose 24 Grad warm und sonnig.";
  assert.equal(lesbarerSprechtext(text), text);
  assert.equal(lesbarerSprechtext(""), "");
});

test("Rechenzeichen im Fliesstext ueberleben (kein Kursiv-Fehlgriff)", () => {
  const text = "Die Flaeche ist 3 * 4 Meter gross.";
  assert.equal(lesbarerSprechtext(text), text);
});

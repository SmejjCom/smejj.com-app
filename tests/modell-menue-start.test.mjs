// smejj.com — EIN Modell-Menue, immer (Betreiber 2026-08-24): der Start-Knopf
// wird von modell-menue-start.js verdrahtet, das IMMER mit der Seite laedt —
// nicht mehr vom nachgeladenen code-flaeche.js. Der Klick schluckt das alte
// Menue und oeffnet den einen Baustein.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { initModellMenueStart } = await import("../public/modell-menue-start.js");

function knopfStub() {
  const hoerer = [];
  return {
    dataset: {}, attribute: {},
    addEventListener: (art, fn, opt) => hoerer.push({ art, fn, opt }),
    setAttribute(n, v) { this.attribute[n] = v; },
    hoerer
  };
}

test("verdrahtet den Start-Knopf genau einmal, mit Capture", () => {
  const knopf = knopfStub();
  const dokument = { getElementById: (id) => (id === "modelPickerButton" ? knopf : null) };
  assert.equal(initModellMenueStart({ dokument, lade: async () => ({ oeffneModellMenue: () => {} }) }), true);
  assert.equal(knopf.dataset.modellZentral, "an");
  assert.equal(knopf.hoerer.length, 1);
  assert.equal(knopf.hoerer[0].opt?.capture, true, "Capture — sonst kommt das alte Menue zuerst dran");
  assert.equal(initModellMenueStart({ dokument }), false, "nie doppelt verdrahten");
});

test("der Klick schluckt das alte Menue und oeffnet den EINEN Baustein", async () => {
  const knopf = knopfStub();
  knopf.offsetParent = { halter: true };
  const altesMenue = { hidden: false };
  const dokument = { getElementById: (id) => (id === "modelPickerButton" ? knopf : id === "modelPickerMenu" ? altesMenue : null) };
  const rufe = [];
  initModellMenueStart({ dokument, lade: async () => ({ oeffneModellMenue: (k) => rufe.push(k) }) });
  let gestoppt = 0;
  await knopf.hoerer[0].fn({ preventDefault: () => gestoppt++, stopImmediatePropagation: () => gestoppt++ });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(gestoppt, 2, "der Klick erreicht das alte app.js-Menue nie");
  assert.equal(altesMenue.hidden, true, "das alte Menue bleibt zu");
  assert.deepEqual(rufe[0].menueId, "startModellMenue");
  assert.equal(rufe[0].chip, knopf);
});

test("code-flaeche verdrahtet den Knopf NICHT doppelt (Wachhund im Quelltext)", () => {
  const quelle = readFileSync("public/code-flaeche.js", "utf8");
  assert.match(quelle, /modellZentral !== "an"\) startKnopf\?\.addEventListener/, "code-flaeche muss den Wachhund pruefen");
  const html = readFileSync("public/index.html", "utf8");
  assert.match(html, /modell-menue-start\.js\?v=/, "das zentrale Modul laedt immer mit der Seite");
});

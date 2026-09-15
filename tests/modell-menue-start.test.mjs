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
    removeAttribute(n) { delete this.attribute[n]; },
    hoerer
  };
}

test("verdrahtet den Start-Knopf genau einmal, mit Capture", () => {
  const knopf = knopfStub();
  const dokument = { getElementById: (id) => (id === "modelPickerButton" ? knopf : null) };
  assert.equal(initModellMenueStart({ dokument, lade: async () => ({ oeffneModellMenue: () => {} }) }), true);
  assert.equal(knopf.dataset.modellZentral, "an");
  const klicks = knopf.hoerer.filter((h) => h.art === "click");
  assert.equal(klicks.length, 1);
  assert.equal(klicks[0].opt?.capture, true, "Capture — sonst kommt das alte Menue zuerst dran");
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
  await knopf.hoerer.find((h) => h.art === "click").fn({ preventDefault: () => gestoppt++, stopImmediatePropagation: () => gestoppt++ });
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

// ---- Livetest 15.09.2026 (M5): Menue erst nach 0,8–5,1 s, aria-expanded zu frueh ----

function dokumentMit(knopf) {
  const menues = new Map();
  return {
    menues,
    getElementById: (id) => (id === "modelPickerButton" ? knopf : menues.get(id) || null)
  };
}

test("KAPUTT (v883) und GESUND: aria-expanded erst, wenn das Menue WIRKLICH da ist", async () => {
  // Gegenprobe: so verdrahtete v883 den Klick — "true" synchron, das Modul kam spaeter.
  const altKnopf = knopfStub();
  const altKlick = () => { altKnopf.setAttribute("aria-expanded", "true"); return new Promise(() => {}); };
  altKlick();
  assert.equal(altKnopf.attribute["aria-expanded"], "true", "KAPUTT: aufgeklappt gemeldet, obwohl kein Menue da ist");
  assert.doesNotMatch(readFileSync("public/modell-menue-start.js", "utf8"), /knopf\.setAttribute\("aria-expanded", "true"\);/, "kein festes true vor dem Rendern mehr");

  const knopf = knopfStub();
  const dokument = dokumentMit(knopf);
  let freigeben;
  const langsam = new Promise((r) => { freigeben = r; });
  initModellMenueStart({ dokument, leerlauf: null, lade: () => langsam });
  const klick = knopf.hoerer.find((h) => h.art === "click").fn;
  klick({ preventDefault() {}, stopImmediatePropagation() {} });
  assert.notEqual(knopf.attribute["aria-expanded"], "true", "waehrend des Ladens ist noch nichts aufgeklappt");
  assert.equal(knopf.attribute["aria-busy"], "true", "sofort sichtbarer Zustand: laedt");
  klick({ preventDefault() {}, stopImmediatePropagation() {} }); // ungeduldiger zweiter Klick
  freigeben({ oeffneModellMenue: () => { dokument.menues.set("startModellMenue", { parentNode: null }); } });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(knopf.attribute["aria-expanded"], "true", "jetzt ist das Menue da");
  assert.equal(knopf.attribute["aria-busy"], undefined);
});

test("GESUND: Zeigen, Fokus oder Fingerdruck laden das Menue VOR dem Klick — genau einmal", async () => {
  const knopf = knopfStub();
  let geladen = 0;
  initModellMenueStart({ dokument: dokumentMit(knopf), leerlauf: null, lade: async () => { geladen += 1; return { oeffneModellMenue() {} }; } });
  for (const art of ["pointerenter", "focus", "pointerdown", "touchstart"]) {
    const h = knopf.hoerer.find((x) => x.art === art);
    assert.ok(h, `Vorladen bei ${art}`);
    h.fn({});
  }
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(geladen, 1, "ein Modul, ein Abruf");
});

test("GESUND: in einer ruhigen Minute nach dem Laden wird vorgeladen", async () => {
  const knopf = knopfStub();
  let geladen = 0;
  initModellMenueStart({ dokument: dokumentMit(knopf), leerlauf: (f) => f(), lade: async () => { geladen += 1; return {}; } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(geladen, 1);
});

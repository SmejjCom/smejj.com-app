// Die Montage des Job-Wegs: Versionsvergabe und Datenpruefung.
//
// Beide Stellen haben eine gemeinsame Eigenschaft: ein Fehler faellt hier nicht
// auf, sondern erst Stunden spaeter — als ueberschriebener Adapter oder als
// bezahlter Lauf ohne Daten.

import test from "node:test";
import assert from "node:assert/strict";

import { baueDatenPruefung, baueJobWeg, versionFuer } from "../workers/smejj-lora-loop/saladWeg.js";

// --- Versionsvergabe ---------------------------------------------------------

test("der erste Autopilot-Lauf faengt HINTER den Handlaeufen an", () => {
  // smejj 1.0 bis 1.4 sind von Hand gebaut. Faenge der Autopilot bei 0 an,
  // ueberschriebe sein erster Lauf einen bestehenden Adapter — und danach
  // gaebe es zwei verschiedene smejj-1-0, ohne dass irgendwo ein Fehler steht.
  assert.equal(versionFuer(0), "smejj-1-5");
  assert.equal(versionFuer(1), "smejj-1-6");
  assert.equal(versionFuer(9), "smejj-1-14");
});

test("Praefix und Startnummer sind einstellbar", () => {
  assert.equal(versionFuer(0, { praefix: "smejj-2-", start: 0 }), "smejj-2-0");
  assert.equal(versionFuer(3, { praefix: "probe-", start: 100 }), "probe-103");
});

test("ein kaputter Zyklus-Index vergibt keinen kaputten Namen", () => {
  // Ein Name wie "smejj-1-NaN" waere ein Ablagepfad, unter dem ein Adapter
  // landet und den niemand wiederfindet.
  for (const kaputt of [null, undefined, NaN, -5, "abc"]) {
    assert.equal(versionFuer(kaputt), "smejj-1-5", `Index ${String(kaputt)} ergab einen anderen Namen`);
  }
  assert.equal(versionFuer(2.7), "smejj-1-7", "Nachkommastellen werden abgeschnitten, nicht gerundet");
});

test("zwei Zyklen bekommen NIE denselben Namen", () => {
  const namen = new Set();
  for (let i = 0; i < 30; i += 1) namen.add(versionFuer(i));
  assert.equal(namen.size, 30);
});

// --- Datenpruefung -----------------------------------------------------------

function e2Attrappe(inhalt = {}) {
  return { async getJson(k, ersatz = null) { return Object.prototype.hasOwnProperty.call(inhalt, k) ? inhalt[k] : ersatz; } };
}

test("der Datensatz gilt nur mit Manifest UND Paaren als vorhanden", async () => {
  // Das Feld heisst in der echten Ablage "paare" (geprueft am 07.09. gegen
  // datasets/smejj-1-1/manifest.json), aeltere Datensaetze nannten es "zeilen".
  const pruefe = baueDatenPruefung({ e2: e2Attrappe({ "datasets/smejj-1-1/manifest.json": { name: "smejj-1-1", paare: 4506 } }), datensatzName: "smejj-1-1" });
  const r = await pruefe();
  assert.equal(r.vorhanden, true);
  assert.equal(r.zeilen, 4506);
});

test("ein LEERER Datensatz ist nicht vorhanden — ein Lauf darauf waere bezahlte Zeit fuer nichts", async () => {
  for (const manifest of [{ paare: 0 }, { paare: null }, { name: "x" }]) {
    const pruefe = baueDatenPruefung({ e2: e2Attrappe({ "datasets/d/manifest.json": manifest }), datensatzName: "d" });
    const r = await pruefe();
    assert.equal(r.vorhanden, false, `Manifest ${JSON.stringify(manifest)} galt faelschlich als brauchbar`);
    assert.match(r.gruende[0], /leer/);
  }
});

test("fehlt das Manifest, ist die Antwort NEIN", async () => {
  const r = await baueDatenPruefung({ e2: e2Attrappe(), datensatzName: "gibtsnicht" })();
  assert.equal(r.vorhanden, false);
  assert.match(r.gruende[0], /manifest_fehlt/);
});

test("eine Ablage, die NICHT ANTWORTET, ist kein 'vermutlich schon da'", async () => {
  // Am 03.08. meldete eine Datenpruefung "vorhanden", weil sie gegen eine
  // kaputte Konfiguration fragte (bucket: undefined). Ein 404 beweist nichts,
  // solange die Abfrage selbst nicht steht.
  const kaputt = { async getJson() { throw new Error("bucket undefined"); } };
  const r = await baueDatenPruefung({ e2: kaputt, datensatzName: "d" })();
  assert.equal(r.vorhanden, false);
  assert.match(r.gruende[0], /nicht_lesbar/);
});

test("ohne Ablage oder Namen wird nichts behauptet", async () => {
  assert.equal((await baueDatenPruefung({})()).vorhanden, false);
  assert.equal((await baueDatenPruefung({ e2: e2Attrappe() })()).vorhanden, false);
});

// --- Montage -----------------------------------------------------------------

test("jeder Zyklus bekommt einen EIGENEN Trainer und Messer mit eigener Version", () => {
  const konfig = { salad: {}, versionPraefix: "smejj-1-", versionStart: 5, datensatzName: "smejj-1-1" };
  const client = { async lese() { return { ok: true, status: 200, daten: {} }; } };
  const eins = baueJobWeg({ konfig, zyklusIndex: 0, e2: e2Attrappe(), suite: { cases: [{ id: "a" }] }, client });
  const zwei = baueJobWeg({ konfig, zyklusIndex: 1, e2: e2Attrappe(), suite: { cases: [{ id: "a" }] }, client });
  assert.equal(eins.version, "smejj-1-5");
  assert.equal(zwei.version, "smejj-1-6");
  assert.notEqual(eins.trainer, zwei.trainer, "ein einmal gebauter Trainer schriebe alle Adapter unter denselben Namen");
  assert.equal(eins.trainer.art, "salad-job");
  assert.equal(typeof eins.messe, "function");
  assert.equal(typeof eins.pruefeDaten, "function");
});

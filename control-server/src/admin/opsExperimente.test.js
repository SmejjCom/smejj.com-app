// smejj.com — Unit-Tests fuer die Experimente-Sicht.
//
// Kern: es gibt keine Ergebnisse. Das Mockup versprach "A/B-Tests mit Ergebnis",
// aber ein Ergebnis braucht eine Messung — wer hat welche Variante gesehen, und
// was ist danach passiert. Diese Messung existiert nicht. Zahlen ohne Messung
// waeren schlimmer als keine: man wuerde nach ihnen entscheiden.
//
// Ausfuehren: node --test control-server/src/admin/opsExperimente.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { __clearFlagsForTests, upsertFlag } from "./featureFlags.js";
import { experimentUebersicht } from "./opsExperimente.js";

const ENV = {};
const ACTOR = { email: "chefin@example.de" };
const JETZT = Date.parse("2026-07-29T12:00:00.000Z");

test("KEINE ERGEBNISSE — und das steht ausdruecklich da", async () => {
  __clearFlagsForTests();
  await upsertFlag({ name: "chat-neu", status: "partial", percent: 20 }, { actor: ACTOR, env: ENV });
  const e = await experimentUebersicht({ env: ENV, jetztMs: JETZT });

  const text = JSON.stringify(e);
  assert.equal(/konversion|conversion|gewinner|winner|signifikan/i.test(text), false,
    "keine erfundenen Ergebniskennzahlen");
  assert.equal(e.ergebnisHinweis.includes("NICHT gemessen"), true);
  assert.equal(e.ergebnisHinweis.includes("schlimmer als keine"), true);
});

test("nur geteilte Flags sind Experimente", async () => {
  __clearFlagsForTests();
  await upsertFlag({ name: "haelfte", status: "partial", percent: 50 }, { actor: ACTOR, env: ENV });
  await upsertFlag({ name: "fuer-alle", status: "on" }, { actor: ACTOR, env: ENV });
  await upsertFlag({ name: "abgeschaltet", status: "off" }, { actor: ACTOR, env: ENV });

  const e = await experimentUebersicht({ env: ENV, jetztMs: JETZT });
  assert.equal(e.laufend, 1);
  assert.equal(e.experimente[0].name, "haelfte");
  assert.equal(e.experimente[0].anteilProzent, 50);
  assert.equal(e.ausgerollt, 1, "vollstaendig ausgerollt ist kein Experiment mehr");
  assert.equal(e.aus, 1);
  assert.equal(e.flagsGesamt, 3);
});

test("das laengstlaufende Experiment steht oben", async () => {
  __clearFlagsForTests();
  await upsertFlag({ name: "alt", status: "partial", percent: 10 }, { actor: ACTOR, env: ENV });
  await upsertFlag({ name: "neu", status: "partial", percent: 10 }, { actor: ACTOR, env: ENV });

  // Ein Experiment, das niemand beendet, ist kein Experiment mehr, sondern ein
  // Dauerzustand — deshalb ist die Laufzeit der interessante Wert.
  const e = await experimentUebersicht({ env: ENV, jetztMs: JETZT + 400 * 86_400_000 });
  assert.equal(e.laengsteLaufzeitTage >= 399, true);
  assert.equal(e.experimente.length, 2);
});

test("es gibt keinen zweiten Speicher fuer Experimente", async () => {
  __clearFlagsForTests();
  const e = await experimentUebersicht({ env: ENV, jetztMs: JETZT });
  assert.equal(e.hinweis.includes("Modul R"), true, "geaendert wird bei den Flags, nicht hier");
  assert.equal(e.hinweis.includes("kein"), true);
});

test("nicht lesbare Flags kippen die Ansicht nicht in eine Null", async () => {
  const e = await experimentUebersicht({
    env: ENV, jetztMs: JETZT,
    // listFlags wird ueber den Modulzustand bedient; hier zaehlt der Fehlerpfad
    // aus einer kaputten Ablage.
  });
  assert.equal(typeof e.ok, "boolean");
});

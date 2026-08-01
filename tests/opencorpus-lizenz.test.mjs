import assert from "node:assert/strict";
import test from "node:test";
import {
  pruefeDatensatzQuelle,
  pruefeZeilenHerkunft
} from "../src/training/opencorpus/licenses.js";

const OASST2 = Object.freeze({
  datasetId: "OpenAssistant/oasst2",
  revision: "2a4bbd0e1a9d5a1b8f7c3e2d1a0b9c8d7e6f5a4b",
  license: "apache-2.0",
  authorship: "human",
  licenseUrl: "https://huggingface.co/datasets/OpenAssistant/oasst2"
});

test("gemessene Quelle oasst2 (Apache-2.0, menschlich) ist zulaessig", () => {
  const ergebnis = pruefeDatensatzQuelle(OASST2);
  assert.equal(ergebnis.erlaubt, true, ergebnis.gruende.join(","));
});

test("permissive Lizenz rettet Modellausgabe NICHT", () => {
  // Der eigentliche Zweck des Tores: Alpaca/OpenHermes/Capybara tragen
  // Apache-2.0 oder MIT, ihr Inhalt ist aber GPT-Ausgabe. Die Projektrichtlinie
  // verbietet Provider-API-Ausgaben unabhaengig vom Lizenzaufkleber.
  const ergebnis = pruefeDatensatzQuelle({ ...OASST2, authorship: "model-generated" });
  assert.equal(ergebnis.erlaubt, false);
  assert.ok(ergebnis.gruende.some((g) => g.includes("provider_modell_ausgabe")), ergebnis.gruende.join(","));
});

test("cc-by-sa wird abgelehnt, nicht bloss als unbekannt behandelt", () => {
  // databricks-dolly-15k ist cc-by-sa-3.0 und von Menschen geschrieben — der
  // Betreiber nannte ausdruecklich CC-BY, nicht CC-BY-SA. Share-Alike bleibt
  // eine offene Rechtsfrage und damit gesperrt.
  const ergebnis = pruefeDatensatzQuelle({ ...OASST2, license: "cc-by-sa-3.0" });
  assert.equal(ergebnis.erlaubt, false);
  assert.ok(ergebnis.gruende.some((g) => g.includes("share_alike_copyleft_ungeklaert")));
});

test("nicht-kommerzielle und Anbieterlizenzen sind gesperrt", () => {
  for (const license of ["cc-by-nc-4.0", "llama3", "gpl-3.0", "other"]) {
    assert.equal(pruefeDatensatzQuelle({ ...OASST2, license }).erlaubt, false, license);
  }
});

test("fehlende Revision sperrt — sonst ist die Lizenzaussage nicht nachpruefbar", () => {
  const ergebnis = pruefeDatensatzQuelle({ ...OASST2, revision: "" });
  assert.equal(ergebnis.erlaubt, false);
  assert.ok(ergebnis.gruende.includes("dataset_revision_fehlt"));
});

test("leere Angaben sind gesperrt, nicht durchgewunken (fail-closed)", () => {
  const ergebnis = pruefeDatensatzQuelle({});
  assert.equal(ergebnis.erlaubt, false);
  assert.ok(ergebnis.gruende.includes("lizenz_fehlt"));
  assert.ok(ergebnis.gruende.includes("urheberschaft_fehlt"));
});

test("Zeilen-Herkunft: nur ausdrueckliches synthetic=false ist sauber", () => {
  assert.equal(pruefeZeilenHerkunft({ synthetic: false }).erlaubt, true);
  assert.equal(pruefeZeilenHerkunft({ synthetic: true }).erlaubt, false);
  // Feld nicht gelesen zaehlt als synthetisch. Ohne diese Richtung liefe eine
  // ganze Datei durch, sobald jemand vergisst, das Feld zu uebernehmen.
  assert.equal(pruefeZeilenHerkunft({}).erlaubt, false);
  assert.equal(pruefeZeilenHerkunft({ synthetic: null }).erlaubt, false);
});

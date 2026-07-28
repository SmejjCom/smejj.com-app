// smejj.com — Unit-Tests fuer die Betriebssicht auf Jobs.
//
// Der wichtigste Test ist der erste: ein Betriebsbildschirm darf keinen
// Auftragstext zeigen. Sonst waere die Regel aus Stufe 3 (Inhalte nur mit
// Vier-Augen oder Einwilligung) still ausgehebelt — ohne dass es jemandem
// auffaellt, weil die Ansicht ja "nur" den Betrieb zeigt.
//
// Ausfuehren: node --test control-server/src/admin/opsJobs.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { jobUebersicht } from "./opsJobs.js";

const JETZT = Date.parse("2026-07-28T12:00:00.000Z");

function job(felder = {}) {
  return {
    id: "job_1",
    status: "running",
    modelId: "glm-5-2",
    userId: "u_maria",
    projectId: "project_smejj",
    task: "Baue mir eine Rechnungsverwaltung mit meinen Kundendaten",
    contextPaths: { include: ["kunden.csv"] },
    repository: { url: "https://github.com/privat/geheim", name: "geheim" },
    createdAt: "2026-07-28T11:55:00.000Z",
    updatedAt: "2026-07-28T11:59:00.000Z",
    ...felder
  };
}

test("kein Auftragstext, keine Kontextpfade, keine Repository-Adresse", () => {
  const ergebnis = jobUebersicht({ jetztMs: JETZT, quelle: () => [job()] });
  const text = JSON.stringify(ergebnis);
  assert.equal(text.includes("Rechnungsverwaltung"), false, "der Auftragstext darf nirgends auftauchen");
  assert.equal(text.includes("kunden.csv"), false, "Kontextpfade sind Inhalt");
  assert.equal(text.includes("github.com/privat/geheim"), false, "die Repository-Adresse bleibt draussen");
  assert.equal(ergebnis.jobs[0].mitRepository, true, "die Tatsache genuegt fuer den Betrieb");
});

test("Betriebsmerkmale sind vollstaendig da — die Ansicht soll ja etwas taugen", () => {
  const j = jobUebersicht({ jetztMs: JETZT, quelle: () => [job()] }).jobs[0];
  assert.equal(j.id, "job_1");
  assert.equal(j.status, "running");
  assert.equal(j.modellId, "glm-5-2");
  assert.equal(j.nutzerId, "u_maria", "die Kennung verbindet den Lauf mit der Nutzerakte");
  assert.equal(j.abgeschlossen, false);
});

test("haengt: laeuft noch und hat sich lange nicht gemeldet", () => {
  const frisch = jobUebersicht({ jetztMs: JETZT, quelle: () => [job()] }).jobs[0];
  assert.equal(frisch.haengt, false, "eine Minute alt ist nicht haengend");

  const alt = jobUebersicht({
    jetztMs: JETZT,
    quelle: () => [job({ updatedAt: "2026-07-28T11:00:00.000Z" })]
  }).jobs[0];
  assert.equal(alt.haengt, true, "eine Stunde ohne Lebenszeichen faellt auf");
});

test("ein abgeschlossener Job haengt nie, egal wie alt er ist", () => {
  const alt = jobUebersicht({
    jetztMs: JETZT,
    quelle: () => [job({ status: "succeeded", updatedAt: "2026-07-01T00:00:00.000Z" })]
  }).jobs[0];
  assert.equal(alt.abgeschlossen, true);
  assert.equal(alt.haengt, false);
});

test("was kaputt ist, steht oben", () => {
  const ergebnis = jobUebersicht({
    jetztMs: JETZT,
    quelle: () => [
      job({ id: "fertig", status: "succeeded" }),
      job({ id: "laeuft", status: "running" }),
      job({ id: "kaputt", status: "failed" }),
      job({ id: "haengt", status: "running", updatedAt: "2026-07-28T10:00:00.000Z" })
    ]
  });
  assert.deepEqual(ergebnis.jobs.map((j) => j.id), ["haengt", "kaputt", "laeuft", "fertig"]);
  assert.equal(ergebnis.haengt, 1);
  assert.equal(ergebnis.fehlgeschlagen, 1);
  assert.equal(ergebnis.laufend, 2);
});

test("die Ansicht behauptet keine Vollstaendigkeit, die sie nicht hat", () => {
  const ergebnis = jobUebersicht({ jetztMs: JETZT, quelle: () => [] });
  assert.equal(ergebnis.hinweis.includes("Arbeitsspeicher"), true);
  assert.equal(ergebnis.hinweis.includes("Task Capsule"), true);
});

test("ein Job ohne Zeitstempel kippt die Liste nicht", () => {
  const j = jobUebersicht({ jetztMs: JETZT, quelle: () => [{ id: "roh" }] }).jobs[0];
  assert.equal(j.status, "unknown");
  assert.equal(j.alterMs, null);
  assert.equal(j.haengt, false, "ohne Zeitangabe wird nichts behauptet");
});

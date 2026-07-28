// smejj.com — Unit-Tests fuer die KI-Transparenz (EU-KI-Verordnung Art. 50).
// Ausfuehren: node --test control-server/src/compliance/aiTransparency.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_ACT_ENFORCEMENT_DATE, AI_SYSTEMS, RISK,
  aiTransparencyHeaders, findAiSystem, transparencyNotice, transparencyReport
} from "./aiTransparency.js";

test("die Maus-Engine bekommt den verschaerften Hinweis, nicht den allgemeinen", () => {
  const maus = transparencyNotice("maus-engine-v2");
  const chat = transparencyNotice("glm-5.2");
  assert.notEqual(maus, chat);
  assert.match(maus, /bedient hier eigenstaendig einen Browser/);
  assert.match(maus, /abbrechen/, "der Hinweis muss den Ausweg nennen, nicht nur die Tatsache");
  assert.match(chat, /von einem KI-System erzeugt/);
});

test("ein unbekanntes System faellt auf den allgemeinen Hinweis zurueck, nicht ins Leere", () => {
  const hinweis = transparencyNotice("gibt-es-nicht");
  assert.match(hinweis, /von einem KI-System erzeugt/);
  assert.equal(findAiSystem("gibt-es-nicht"), null);
});

test("die Kennzeichnung ist maschinenlesbar und headertauglich", () => {
  const headers = aiTransparencyHeaders("maus-engine-v2");
  assert.equal(headers["x-smejj-ai-generated"], "true");
  assert.equal(headers["x-smejj-ai-system"], "maus-engine-v2");
  assert.equal(headers["x-smejj-ai-risk"], RISK.limited);
  // Header duerfen keine Zeilenumbrueche oder Nicht-ASCII enthalten.
  for (const [name, value] of Object.entries(headers)) {
    assert.match(name, /^[a-z0-9-]+$/, `Headername ${name}`);
    assert.equal(/[\r\n]/.test(value), false, `Zeilenumbruch in ${name}`);
    // eslint-disable-next-line no-control-regex
    assert.equal(/[^\x20-\x7e]/.test(value), false, `Nicht-ASCII in ${name}`);
  }
  assert.equal(decodeURIComponent(headers["x-smejj-ai-notice"]), transparencyNotice("maus-engine-v2"));
});

test("kein System ist als Hochrisiko oder verboten eingestuft", () => {
  for (const system of AI_SYSTEMS) {
    assert.notEqual(system.risiko, RISK.high, `${system.id} waere Hochrisiko`);
    assert.notEqual(system.risiko, RISK.prohibited, `${system.id} waere verboten`);
  }
  assert.equal(transparencyReport().hochrisiko, false);
});

test("jedes System mit begrenztem Risiko traegt Transparenzpflicht UND Protokollierung", () => {
  for (const system of AI_SYSTEMS.filter((s) => s.risiko === RISK.limited)) {
    assert.equal(system.transparenzpflicht, true, `${system.id} ohne Transparenzpflicht`);
    assert.equal(system.protokolliert, true, `${system.id} ohne Protokollierung`);
  }
});

test("der Bericht nennt Frist, Begruendung und die Belegdokumente", () => {
  const bericht = transparencyReport({ nowIso: "2026-07-28T10:00:00.000Z" });
  assert.equal(bericht.ok, true);
  assert.equal(bericht.plattform, "smejj.com");
  assert.equal(bericht.stand, "2026-07-28T10:00:00.000Z");
  assert.equal(bericht.rechtsrahmen.durchsetzungAb, AI_ACT_ENFORCEMENT_DATE);
  assert.equal(AI_ACT_ENFORCEMENT_DATE, "2026-08-02");
  assert.match(bericht.hochrisikoBegruendung, /Anhang III/);
  assert.ok(bericht.dokumentation.includes("docs/compliance/RISIKOEINSTUFUNG_MAUS_ENGINE.md"));
  assert.equal(bericht.aufbewahrung.auditLog, "10 Jahre, unveraenderlich");
});

test("der Bericht enthaelt keine Betriebs- oder Nutzerdaten", () => {
  const roh = JSON.stringify(transparencyReport());
  for (const verboten of ["@", "apiKey", "token", "secret", "IDRIVE", "salad.cloud"]) {
    assert.equal(roh.includes(verboten), false, `Bericht enthaelt "${verboten}"`);
  }
});

test("die Systemliste ist unveraenderlich — niemand kann die Einstufung zur Laufzeit drehen", () => {
  assert.throws(() => { AI_SYSTEMS.push({ id: "schmuggel" }); });
  assert.throws(() => { AI_SYSTEMS[0].risiko = RISK.minimal; });
});

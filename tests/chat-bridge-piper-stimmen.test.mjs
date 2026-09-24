// Piper-Stimme je Sprache (Bruecke v174, 24.09.2026): Thorsten darf nie fremden Text sprechen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPiperStimmenLader, piperStimmeFuer, PIPER_STIMMEN } from "../public/chat-bridge-piper-stimmen.js";

test("Deutsch und leere Sprache nutzen die Startstimme", () => {
  assert.deepEqual(piperStimmeFuer("de-DE"), { bedient: true, stimme: null });
  assert.deepEqual(piperStimmeFuer(""), { bedient: true, stimme: null });
});

test("jede App-Sprache bekommt ihre eigene Stimme", () => {
  assert.equal(piperStimmeFuer("en-US").stimme, "en_US-lessac-medium");
  assert.equal(piperStimmeFuer("pt_BR").stimme, "pt_BR-faber-medium");
  assert.equal(piperStimmeFuer("JA").stimme, "ja_JP-hi_fi_captain-medium");
  for (const [sprache, stimme] of Object.entries(PIPER_STIMMEN)) {
    assert.ok(stimme.startsWith(`${sprache}_`), sprache);
  }
  assert.equal(Object.keys(PIPER_STIMMEN).length, 14);
});

test("unbekannte Sprache wird nicht bedient (Browser-Stimme statt Thorsten)", () => {
  assert.deepEqual(piperStimmeFuer("sw"), { bedient: false, stimme: null });
});

test("Lader laedt jede Stimme einmal und erst nach Ablauf erneut", async () => {
  let uhr = 0;
  const aufrufe = [];
  const lader = createPiperStimmenLader({ laden: async (s) => { aufrufe.push(s); return true; }, gueltigMs: 1000, jetzt: () => uhr });
  assert.equal(await lader.sicherstellen(null), true);
  await Promise.all([lader.sicherstellen("en_US-lessac-medium"), lader.sicherstellen("en_US-lessac-medium")]);
  assert.deepEqual(aufrufe, ["en_US-lessac-medium"]);
  uhr = 500;
  await lader.sicherstellen("en_US-lessac-medium");
  assert.equal(aufrufe.length, 1);
  uhr = 2000;
  await lader.sicherstellen("en_US-lessac-medium");
  assert.equal(aufrufe.length, 2);
  lader.vergessen("en_US-lessac-medium");
  await lader.sicherstellen("en_US-lessac-medium");
  assert.equal(aufrufe.length, 3);
});

test("fehlgeschlagener Download meldet false und wird erneut versucht", async () => {
  let ok = false;
  let n = 0;
  const lader = createPiperStimmenLader({ laden: async () => { n += 1; if (!ok) throw new Error("netz"); return true; } });
  assert.equal(await lader.sicherstellen("fr_FR-siwis-medium"), false);
  ok = true;
  assert.equal(await lader.sicherstellen("fr_FR-siwis-medium"), true);
  assert.equal(n, 2);
});

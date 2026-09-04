// TUEV der Wache: sie muss bei GESUNDEM Stand gruen und bei KAPUTTEM Stand rot melden.
import test from "node:test";
import assert from "node:assert/strict";
import { gesamturteil, herzschlagUrteil, waehleDeckel, MAX_ALTER_MIN_STANDARD } from "../workers/con-autopilot/wache.js";

test("Herzschlag: frisch gruen, veraltet rot, fehlend rot", () => {
  const jetzt = Date.parse("2026-09-04T12:00:00Z");
  const vor = (min) => ({ letzterTick: new Date(jetzt - min * 60_000).toISOString() });
  assert.equal(herzschlagUrteil(vor(3), { jetzt }).ok, true);
  assert.equal(herzschlagUrteil(vor(MAX_ALTER_MIN_STANDARD), { jetzt }).ok, true);
  assert.equal(herzschlagUrteil(vor(600), { jetzt }).ok, false);
  assert.equal(herzschlagUrteil(vor(600), { jetzt }).grund, "herzschlag_veraltet");
  assert.equal(herzschlagUrteil({}, { jetzt }).grund, "kein_herzschlag");
  assert.equal(herzschlagUrteil({ letzterTick: "kaputt" }, { jetzt }).ok, false);
  assert.equal(Math.round(herzschlagUrteil(vor(45), { jetzt }).alterMin), 45);
});

test("Deckel: der des Dienstes gewinnt, sonst wird die Herkunft genannt", () => {
  assert.deepEqual(waehleDeckel({ grenzen: { gesamtdeckelUsd: 10 } }, 2), { deckel: 10, herkunft: "Dienst" });
  assert.deepEqual(waehleDeckel({}, 2), { deckel: 2, herkunft: "Standardwert dieser Wache" });
  assert.deepEqual(waehleDeckel({ grenzen: { gesamtdeckelUsd: 0 } }, 5), { deckel: 5, herkunft: "Standardwert dieser Wache" });
});

test("Sammelurteil: ein einziges Rot faerbt alles rot", () => {
  assert.equal(gesamturteil([{ ok: true, text: "a" }, { ok: true, text: "b" }]).ok, true);
  const u = gesamturteil([{ ok: true, text: "a" }, { ok: false, text: "Herzschlag veraltet" }]);
  assert.equal(u.ok, false);
  assert.equal(u.rot, 1);
  assert.deepEqual(u.gruende, ["Herzschlag veraltet"]);
});

// Stufe-1-Sofortschutz: Wem gehoert der lokale Chat-Verlauf?
// (docs/verlauf-pro-konto-plan.md, Live-Befund 2026-08-12)
import test from "node:test";
import assert from "node:assert/strict";
import { ownerDecision, sessionUserId, OWNER_KEY } from "../public/chat-owner.js";

test("ohne Sitzung wird NIE geloescht", () => {
  assert.equal(ownerDecision("", ""), "nichts");
  assert.equal(ownerDecision("user_a", ""), "nichts");
  assert.equal(ownerDecision("user_a", null), "nichts");
});

test("gleicher Besitzer: nichts zu tun", () => {
  assert.equal(ownerDecision("user_a", "user_a"), "nichts");
  assert.equal(ownerDecision("  user_a  ", "user_a"), "nichts");
});

test("Bestandsgeraet ohne Besitzer: uebernehmen ohne Loeschen (Migration)", () => {
  assert.equal(ownerDecision("", "user_a"), "uebernehmen");
  assert.equal(ownerDecision(null, "user_a"), "uebernehmen");
});

test("anderes Konto uebernimmt das Geraet: fremden Verlauf leeren", () => {
  assert.equal(ownerDecision("user_a", "user_b"), "leeren-und-uebernehmen");
});

test("sessionUserId liest nur echte, angemeldete Sitzungen", () => {
  const fake = (wert) => ({ getItem: () => wert });
  assert.equal(sessionUserId(fake(JSON.stringify({ authenticated: true, userId: "user_a" }))), "user_a");
  assert.equal(sessionUserId(fake(JSON.stringify({ authenticated: false, userId: "user_a" }))), "");
  assert.equal(sessionUserId(fake(JSON.stringify({ userId: "user_a" }))), "");
  assert.equal(sessionUserId(fake(null)), "");
  assert.equal(sessionUserId(fake("kaputt{json")), "");
  assert.equal(sessionUserId({ getItem: () => { throw new Error("gesperrt"); } }), "");
});

test("OWNER_KEY ist der dokumentierte Schluessel", () => {
  assert.equal(OWNER_KEY, "smejj.chat.owner.v1");
});

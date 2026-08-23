// Stufe-1-Sofortschutz: Wem gehoert der lokale Chat-Verlauf?
// (docs/verlauf-pro-konto-plan.md, Live-Befund 2026-08-12)
import test from "node:test";
import assert from "node:assert/strict";
import { gehoertNutzer, ownerDecision, sessionUserId, OWNER_KEY } from "../public/chat-owner.js";

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

// ---- Stufe 2: Verlauf pro Konto getrennt statt geleert ----

test("gehoertNutzer: eigener Chat ja, fremder nein", () => {
  assert.equal(gehoertNutzer({ ownerId: "user_a" }, "user_a", "user_a"), true);
  assert.equal(gehoertNutzer({ ownerId: "user_b" }, "user_a", "user_a"), false);
});

test("gehoertNutzer: ohne Sitzung wird NICHTS gezeigt (fail-closed)", () => {
  assert.equal(gehoertNutzer({ ownerId: "user_a" }, "", "user_a"), false);
  assert.equal(gehoertNutzer({}, "", ""), false);
});

test("gehoertNutzer: Altbestand ohne Besitzer gehoert dem Geraete-Besitzer", () => {
  // Chat aus der Zeit vor Stufe 2, Geraet gehoerte user_a:
  assert.equal(gehoertNutzer({}, "user_a", "user_a"), true);
  assert.equal(gehoertNutzer({}, "user_b", "user_a"), false); // user_b sieht ihn NICHT
});

test("gehoertNutzer: frisches Geraet ohne Marke — Altbestand gehoert dem Angemeldeten", () => {
  assert.equal(gehoertNutzer({}, "user_a", ""), true);
});

test("gehoertNutzer: leerer ownerId zaehlt wie kein Besitzer, Leerzeichen egal", () => {
  assert.equal(gehoertNutzer({ ownerId: "   " }, "user_a", "user_a"), true);
  assert.equal(gehoertNutzer({ ownerId: " user_a " }, "user_a", ""), true);
  assert.equal(gehoertNutzer(null, "user_a", "user_a"), true); // fehlendes Objekt = kein Besitzer
});

// ---- Stufe 4: die Kontokennung des Servers als Alias der Sitzung ----
import { kontoAliase, merkeKontoKennung, KONTO_KEY } from "../public/chat-owner.js";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("Alias: der Server-Besitzer gilt als eigen, aber nur mit Alias", () => {
  const chat = { ownerId: "user_158c1e609cc03bb4c36f70b7e059fbfd" };
  assert.equal(gehoertNutzer(chat, "user_sitzung", ""), false, "ohne Alias bleibt es fremd (bisheriges Verhalten)");
  assert.equal(gehoertNutzer(chat, "user_sitzung", "", ["user_158c1e609cc03bb4c36f70b7e059fbfd"]), true);
  assert.equal(gehoertNutzer(chat, "", "", ["user_158c1e609cc03bb4c36f70b7e059fbfd"]), false, "ohne Sitzung nie");
  assert.equal(gehoertNutzer({ ownerId: "user_dritter" }, "user_sitzung", "", ["user_158c1e609cc03bb4c36f70b7e059fbfd"]), false);
});

test("Alias wird nur fuer DIESELBE Sitzung ausgegeben — ein zweites Konto erbt ihn nie", () => {
  const s = fakeStorage();
  assert.equal(merkeKontoKennung(s, "user_a", "user_158c1e609cc03bb4c36f70b7e059fbfd"), true);
  assert.deepEqual(kontoAliase(s, "user_a"), ["user_158c1e609cc03bb4c36f70b7e059fbfd"]);
  assert.deepEqual(kontoAliase(s, "user_b"), []);
  assert.deepEqual(kontoAliase(s, ""), []);
});

test("Alias: nur saubere Kennungen werden gemerkt, kaputter Speicher gibt leer", () => {
  const s = fakeStorage();
  assert.equal(merkeKontoKennung(s, "user_a", "../fremd"), false);
  assert.equal(merkeKontoKennung(s, "", "user_x"), false);
  assert.equal(s.getItem(KONTO_KEY), null);
  s.setItem(KONTO_KEY, "{kein json");
  assert.deepEqual(kontoAliase(s, "user_a"), []);
});

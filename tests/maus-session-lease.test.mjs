// smejj.com Maus-Engine — Tests fuer den Sitzungs-Lease auf IDrive e2.
// Ohne Netz, ohne Zugangsdaten: der Store bekommt get/put injiziert.
// Geprueft wird genau die Entscheidung, die im Betrieb daruber bestimmt, ob
// eine zweite Instanz eine fremde Sitzung anfassen darf.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLease,
  leaseVerdict,
  leaseKey,
  isValidSessionId,
  createLeaseStore,
  LEASE_DEFAULT_TTL_MS,
  LEASE_HARD_LIMIT_MS
} from "../workers/maus-engine/session-lease.mjs";

const JETZT = Date.parse("2026-07-31T12:00:00Z");

test("sessionId: nur enge Kennungen, kein Zurechtbiegen", () => {
  assert.equal(isValidSessionId("maus-selbsttest-1"), true);
  assert.equal(isValidSessionId("kurz"), false, "zu kurz");
  assert.equal(isValidSessionId("Gross-Buchstaben-1"), false);
  assert.equal(isValidSessionId("pfad/traversal-1"), false);
  assert.equal(isValidSessionId("-startet-mit-strich"), false);
  assert.throws(() => leaseKey("../../fremd"), /session_id_ungueltig/);
  assert.equal(leaseKey("maus-sitzung-1"), "capsules/maus-engine/sessions/maus-sitzung-1/lease.json");
});

test("leaseVerdict: kein Objekt heisst frei", () => {
  assert.deepEqual(leaseVerdict(null, { holder: "a", now: JETZT }), { ok: true, grund: "frei" });
});

test("leaseVerdict: eigener gueltiger Lease darf weitergefuehrt werden", () => {
  const lease = buildLease({ sessionId: "maus-sitzung-1", holder: "instanz-a", now: JETZT });
  const verdict = leaseVerdict(lease, { holder: "instanz-a", now: JETZT + 1000 });
  assert.deepEqual(verdict, { ok: true, grund: "eigen" });
});

test("leaseVerdict: FREMDER gueltiger Lease wird abgelehnt (fail-closed)", () => {
  const lease = buildLease({ sessionId: "maus-sitzung-1", holder: "instanz-a", now: JETZT });
  const verdict = leaseVerdict(lease, { holder: "instanz-b", now: JETZT + 1000 });
  assert.deepEqual(verdict, { ok: false, grund: "fremd_aktiv" });
});

test("leaseVerdict: abgelaufener fremder Lease ist frei (Selbstheilung nach Neustart)", () => {
  const lease = buildLease({ sessionId: "maus-sitzung-1", holder: "instanz-a", now: JETZT });
  const verdict = leaseVerdict(lease, { holder: "instanz-b", now: JETZT + LEASE_DEFAULT_TTL_MS + 1 });
  assert.deepEqual(verdict, { ok: true, grund: "abgelaufen" });
});

test("leaseVerdict: Hartlimit schlaegt jede Verlaengerung", () => {
  const lease = buildLease({ sessionId: "maus-sitzung-1", holder: "instanz-a", now: JETZT });
  // Eigener Halter, frisch verlaengert — aber die Sitzung ist insgesamt zu alt.
  const spaet = { ...lease, expiresAt: new Date(JETZT + LEASE_HARD_LIMIT_MS + 60_000).toISOString() };
  const verdict = leaseVerdict(spaet, { holder: "instanz-a", now: JETZT + LEASE_HARD_LIMIT_MS + 1 });
  assert.deepEqual(verdict, { ok: true, grund: "hartlimit_erreicht" });
});

test("leaseVerdict: beendeter Lease ist frei", () => {
  const lease = { ...buildLease({ sessionId: "maus-sitzung-1", holder: "instanz-a", now: JETZT }), status: "beendet" };
  assert.deepEqual(leaseVerdict(lease, { holder: "instanz-b", now: JETZT }), { ok: true, grund: "beendet" });
});

function speicherStore(startZeit = JETZT) {
  const objekte = new Map();
  let jetzt = startZeit;
  const store = createLeaseStore({
    getObject: async (key) => {
      if (!objekte.has(key)) throw new Error("404");
      return objekte.get(key);
    },
    putObject: async (key, body) => { objekte.set(key, body); },
    clock: { now: () => jetzt }
  });
  return { store, objekte, vorspulen(ms) { jetzt += ms; }, jetzt: () => jetzt };
}

test("claim: erste Uebernahme schreibt einen aktiven Lease", async () => {
  const { store, objekte } = speicherStore();
  const ergebnis = await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-a", capsuleRef: "c1" });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.grund, "frei");
  assert.equal(ergebnis.lease.status, "aktiv");
  assert.equal(ergebnis.lease.capsuleRef, "c1");
  assert.equal(objekte.size, 1);
});

test("claim: fremde Instanz wird abgewiesen und schreibt NICHT", async () => {
  const { store, objekte } = speicherStore();
  await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  const vorher = objekte.get(leaseKey("maus-sitzung-1"));
  const ergebnis = await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-b" });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "fremd_aktiv");
  assert.equal(ergebnis.holder, "instanz-a");
  assert.equal(objekte.get(leaseKey("maus-sitzung-1")), vorher, "fremder Lease darf nicht ueberschrieben werden");
});

test("renew: eigener Lease behaelt createdAt, verschiebt aber expiresAt", async () => {
  const { store, vorspulen } = speicherStore();
  const erst = await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  vorspulen(60_000);
  const zweit = await store.renew({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  assert.equal(zweit.ok, true);
  assert.equal(zweit.grund, "eigen");
  assert.equal(zweit.lease.createdAt, erst.lease.createdAt, "Hartlimit darf sich nicht durch Verlaengern zuruecksetzen");
  assert.ok(Date.parse(zweit.lease.expiresAt) > Date.parse(erst.lease.expiresAt));
});

test("release: nur der eigene Halter darf beenden", async () => {
  const { store } = speicherStore();
  await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  const fremd = await store.release({ sessionId: "maus-sitzung-1", holder: "instanz-b" });
  assert.deepEqual(fremd, { ok: false, grund: "fremd_aktiv" });
  const eigen = await store.release({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  assert.equal(eigen.ok, true);
  const danach = await store.read("maus-sitzung-1");
  assert.equal(danach.status, "beendet");
});

test("nach release darf eine fremde Instanz uebernehmen", async () => {
  const { store } = speicherStore();
  await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  await store.release({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  const uebernahme = await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-b" });
  assert.equal(uebernahme.ok, true);
  assert.equal(uebernahme.grund, "beendet");
});

test("ohne Konfiguration ist der Store stumm statt zu raten", async () => {
  const store = createLeaseStore({});
  assert.equal(store.disabled, true);
  assert.equal(await store.read("maus-sitzung-1"), null);
  const ergebnis = await store.claim({ sessionId: "maus-sitzung-1", holder: "instanz-a" });
  assert.equal(ergebnis.ok, true, "ohne e2 blockiert der Lease nicht — er behauptet nur nichts");
});

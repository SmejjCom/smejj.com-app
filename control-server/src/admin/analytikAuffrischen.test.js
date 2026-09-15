// smejj.com — Unit-Tests: der Autopilot-Takt haelt die Analytik-Projektion frisch.
// Ausfuehren: node --test control-server/src/admin/analytikAuffrischen.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { TAKT_AB_SEKUNDEN, halteAnalytikFrisch } from "./analytikAuffrischen.js";

const JETZT = Date.parse("2026-09-15T12:00:00.000Z");
const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example", IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim", IDRIVE_E2_BUCKET: "eimer"
});

test("gesund: eine frische Projektion wird nicht neu gezaehlt", async () => {
  let gebaut = 0;
  const e = await halteAnalytikFrisch({
    env: ENV, jetztMs: JETZT,
    lese: async () => ({ ok: true, alterSekunden: 120 }),
    baue: async () => { gebaut += 1; return { ok: true }; }
  });
  assert.deepEqual(e, { ok: true, gebaut: false, alterSekunden: 120 });
  assert.equal(gebaut, 0);
});

test("BEFUND 15.09.: eine zehn Tage alte Projektion wird vom Takt neu gebaut — ohne Seitenaufruf", async () => {
  let gelesenOhneCache = null;
  let gezaehltMit = null;
  const e = await halteAnalytikFrisch({
    env: ENV, jetztMs: JETZT,
    lese: async (p) => { gelesenOhneCache = p.leseCacheMs; return { ok: true, alterSekunden: 15229 * 60 }; },
    zaehle: async (p) => { gezaehltMit = p; return { laeufe: {} }; },
    baue: async ({ zaehleAlles }) => { await zaehleAlles(); return { ok: true, gebautAm: new Date(JETZT).toISOString() }; }
  });
  assert.equal(e.ok, true);
  assert.equal(e.gebaut, true);
  assert.equal(gelesenOhneCache, 0, "der Takt liest den Stand auf IDrive e2, nicht den gemerkten");
  assert.equal(gezaehltMit.jetztMs, JETZT);
  assert.equal(TAKT_AB_SEKUNDEN < 60 * 60, true, "bei 30-Minuten-Takt spaetestens stuendlich");
});

test("fehlt die Projektion ganz, wird ebenfalls gebaut", async () => {
  const e = await halteAnalytikFrisch({
    env: ENV, jetztMs: JETZT,
    lese: async () => ({ ok: false, error: "projektion_nicht_gebaut" }),
    zaehle: async () => ({}),
    baue: async () => ({ ok: true, gebautAm: "2026-09-15T12:00:00.000Z" })
  });
  assert.equal(e.gebaut, true);
});

test("kaputt: ein gescheiterter Neubau meldet seinen Grund und wirft nicht", async () => {
  const e = await halteAnalytikFrisch({
    env: ENV, jetztMs: JETZT,
    lese: async () => ({ ok: true, alterSekunden: 99_999 }),
    zaehle: async () => ({}),
    baue: async () => ({ ok: false, error: "keine_quelle_lesbar", nichtGeschrieben: true })
  });
  assert.deepEqual(e, { ok: false, gebaut: false, grund: "keine_quelle_lesbar" });

  const geworfen = await halteAnalytikFrisch({
    env: ENV, jetztMs: JETZT, lese: async () => { throw new Error("Netz weg"); }
  });
  assert.equal(geworfen.ok, false);
  assert.equal(geworfen.grund, "Netz weg");
});

test("ohne Objektspeicher wird nichts gezaehlt", async () => {
  let gebaut = 0;
  const e = await halteAnalytikFrisch({ env: {}, jetztMs: JETZT, baue: async () => { gebaut += 1; return { ok: true }; } });
  assert.equal(e.grund, "speicher_nicht_eingerichtet");
  assert.equal(gebaut, 0);
});

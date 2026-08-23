// smejj.com — Unit-Tests fuer die API-Betreibersicht (Modul G).
// Ausfuehren: node --test control-server/src/admin/opsApi.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { apiUebersicht } from "./opsApi.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";

const JETZT = Date.parse("2026-08-23T12:00:00.000Z");
const KONTO_A = authenticatedUserId({ email: "anna@example.de" });
const KONTO_B = authenticatedUserId({ email: "ben@example.de" });

function speicherAus(objekte) {
  return {
    async liste(prefix) { return Object.keys(objekte).filter((k) => k.startsWith(prefix)); },
    async lies(key) { return objekte[key] || null; }
  };
}

function ereignis(konto, iso, modell, p, c, kostenMikro) {
  return [`api-billing/ereignisse/${konto}/${iso.slice(0, 10)}/req_${iso.replace(/\D/g, "")}.json`,
    { kontoId: konto, zeitpunkt: iso, modell, promptTokens: p, completionTokens: c, kostenMikro }];
}

test("Uebersicht: Konten, Schluessel, Fenster heute/7/30, Umsatz, Aufladungen, Alarm", async () => {
  const objekte = Object.fromEntries([
    [`api-billing/konten/${KONTO_A}.json`, { kontoId: KONTO_A, guthabenMikro: 400_000, aufgeladenMikro: 10_000_000, verbrauchtMikro: 10_600_000, anfragen: 3 }],
    [`api-billing/konten/${KONTO_B}.json`, { kontoId: KONTO_B, guthabenMikro: 1_000_000, aufgeladenMikro: 0, verbrauchtMikro: 0, anfragen: 0 }],
    ereignis(KONTO_A, "2026-08-23T10:00:00.000Z", "smejj-1.0", 1000, 500, 1_250),
    ereignis(KONTO_A, "2026-08-20T10:00:00.000Z", "smejj-1.0-code", 2000, 1000, 5_000),
    ereignis(KONTO_A, "2026-07-30T10:00:00.000Z", "smejj-1.0", 100, 10, 65),
    ["api-billing/aufladungen/cs_live_1.json", { kontoId: KONTO_A, cents: 1000, livemode: true, verbuchtAm: "2026-08-22T00:00:00.000Z" }],
    ["api-billing/aufladungen/cs_test_1.json", { kontoId: KONTO_B, cents: 500, livemode: false, verbuchtAm: "2026-08-22T00:00:00.000Z" }]
  ]);
  const d = await apiUebersicht({
    jetztMs: JETZT,
    speicher: speicherAus(objekte),
    leseIndex: async () => ({ ok: true, entries: [{ userId: "u1", email: "anna@example.de" }, { userId: "u2", email: "ben@example.de" }] }),
    leseSchluesselIndex: async (id) => id === KONTO_A
      ? { schluessel: [{ name: "ZCode", letzte4: "ab12", erstelltAm: "x" }, { name: "alt", letzte4: "cd34", erstelltAm: "x", widerrufenAm: "y" }] }
      : null
  });

  assert.equal(d.ok, true);
  assert.equal(d.kontenMitApi, 2);
  assert.equal(d.kontenMitAktivemSchluessel, 1);
  assert.equal(d.aktiveSchluessel, 1);
  assert.equal(d.heute.anfragen, 1);
  assert.equal(d.tage7.anfragen, 2);
  assert.equal(d.tage30.anfragen, 3, "der 30.07. liegt 24 Tage zurueck und zaehlt");
  assert.equal(d.tage30.tokens, 4610);
  assert.equal(d.tage30.umsatzUsd, 0.0063);
  assert.equal(d.eingezahltUsd, 10);
  assert.equal(d.eingezahltTestUsd, 5);
  assert.equal(d.nachModell[0].modell, "smejj-1.0-code");

  const anna = d.konten.find((k) => k.kontoId === KONTO_A);
  assert.equal(anna.konto, "anna@example.de");
  assert.equal(anna.guthabenUsd, 0.4);
  assert.match(anna.alarm, /Guthaben 0\.40 USD/);
  assert.equal(anna.aktiveSchluessel, 1);
  assert.equal(anna.widerrufeneSchluessel, 1);
  assert.equal(anna.aufladungen.length, 1);
  assert.equal(d.konten[0].kontoId, KONTO_A, "groesster Umsatz zuerst");

  const ben = d.konten.find((k) => k.kontoId === KONTO_B);
  assert.match(ben.alarm, /Testzahlung/);
  assert.ok(d.nichtErfasst.some((p) => /Einkaufspreis/.test(p.was)), "Marge steht als Luecke, nicht als Null");
});

test("ohne Speicher: ehrlich 'nicht eingerichtet', keine erfundenen Zahlen", async () => {
  const d = await apiUebersicht({ env: {}, jetztMs: JETZT });
  assert.equal(d.ok, false);
  assert.equal(d.error, "speicher_nicht_eingerichtet");
});

// smejj.com — Tests fuer Modul E, Teil 2 (Abos & Umsatz).
// Ausfuehren: node --test control-server/src/admin/opsUmsatz.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { umsatzUebersicht, mrrBeiStripe, offeneRechnungen } from "./opsUmsatz.js";

const JETZT = Date.parse("2026-08-23T07:30:00.000Z");

const ABRECHNUNG = {
  ok: true, total: 3, zahlend: 2, handlungsbedarf: 0,
  nachPlan: [{ plan: "plus", gesamt: 2, zahlend: 2 }, { plan: "max", gesamt: 1, zahlend: 0 }],
  abos: [
    { konto: "a@x.de", plan: "plus", zustand: "active", livemodus: true, kuendigtZumPeriodenende: false },
    { konto: null, zahlendeAdresse: "b@x.de", plan: "plus", zustand: "active", livemodus: true, kuendigtZumPeriodenende: true, laufzeitEndeAm: "2026-09-01", tageBisEnde: 9 },
    { konto: "c@x.de", plan: "max", zustand: "canceled", livemodus: true, kuendigtZumPeriodenende: false }
  ]
};
const API = { ok: true, tage30: { umsatzUsd: 12.5 }, eingezahltUsd: 20, guthabenGesamtUsd: 7.5 };
const VERBRAUCH = { erstelltAm: "2026-08-23T07:29:00.000Z", tage: [{ tag: "2026-08-23", anfragen: 40, kostenUsd: 0.31 }, { tag: "2026-08-22", anfragen: 3, kostenUsd: null }] };

function stripeStub(subs, invoices) {
  return async (url) => {
    if (url.includes("/subscriptions")) return { ok: true, json: async () => ({ data: subs, has_more: false }) };
    if (url.includes("/invoices")) return { ok: true, json: async () => ({ data: invoices }) };
    return { ok: false, status: 404 };
  };
}

test("MRR bei Stripe: Jahresabo auf den Monat gerechnet, Testmodus nicht gezaehlt", async () => {
  const fetchImpl = stripeStub([
    { livemode: true, items: { data: [{ quantity: 1, price: { unit_amount: 900, currency: "eur", recurring: { interval: "month", interval_count: 1 } } }] } },
    { livemode: true, items: { data: [{ quantity: 1, price: { unit_amount: 12000, currency: "eur", recurring: { interval: "year", interval_count: 1 } } }] } },
    { livemode: false, items: { data: [{ quantity: 1, price: { unit_amount: 3900, currency: "eur", recurring: { interval: "month" } } }] } }
  ], []);
  const m = await mrrBeiStripe({ env: { STRIPE_SECRET_KEY: "sk_test_x" }, fetchImpl });
  assert.equal(m.gemessen, true);
  assert.equal(m.cent, 1900);
  assert.equal(m.abos, 2);
  assert.equal(m.test, 1);
});

test("ohne Stripe-Schluessel: MRR geschaetzt aus Planpreisen, und das steht dran", async () => {
  const u = await umsatzUebersicht({
    env: {}, jetztMs: JETZT, leseAbrechnung: async () => ABRECHNUNG, leseApi: async () => API, leseVerbrauch: () => VERBRAUCH,
    leseMrr: () => mrrBeiStripe({ env: {} }), leseRechnungen: () => offeneRechnungen({ env: {} })
  });
  assert.equal(u.umsatz.mrr.gemessen, false);
  assert.equal(u.umsatz.mrr.cent, 1800, "zwei aktive plus-Abos zu 9,00");
  assert.match(u.umsatz.mrr.quelle, /geschaetzt/);
  assert.equal(u.umsatz.zahlung.offeneRechnungen.gemessen, false);
});

test("Kennzahlen: feste Kosten, Modellkosten seit Neustart getrennt, 'bleibt uebrig' ohne Modellkosten", async () => {
  const u = await umsatzUebersicht({
    env: { STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "whsec" }, jetztMs: JETZT, startzeitMs: JETZT - 3600_000,
    leseAbrechnung: async () => ABRECHNUNG, leseApi: async () => API, leseVerbrauch: () => VERBRAUCH,
    leseMrr: async () => ({ gemessen: true, cent: 2700, abos: 3, waehrung: "eur", test: 0 }),
    leseRechnungen: async () => ({ gemessen: true, anzahl: 2, cent: 1800 })
  });
  const z = u.umsatz;
  assert.equal(z.kosten.festeUsdProMonat, 6);
  assert.equal(z.kosten.modelleSeitNeustart.usd, 0.31);
  assert.equal(z.kosten.modelleSeitNeustart.tageOhnePreis, 1);
  assert.equal(z.bleibtUebrigUsdVorModellen, 27 + 12.5 - 6);
  assert.equal(z.jePlan[0].umsatzCentProMonat, 1800);
  assert.equal(z.jePlan[0].margeCent, null, "Marge je Plan wird nicht erfunden");
  assert.equal(z.abspruenge.anzahl, 1);
  assert.equal(z.abspruenge.gruendeErfasst, false);
  assert.equal(z.zahlung.offeneRechnungen.anzahl, 2);
  assert.equal(z.zahlung.webhookGeheimnisGesetzt, true);
  assert.ok(z.nichtErfasst.length >= 3);
  assert.equal(u.total, 3, "die bisherige Abrechnungs-Uebersicht bleibt enthalten");
});

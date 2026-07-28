// smejj.com — Unit-Tests fuer die Abrechnungs-Sicht.
//
// Kern: ein Zahlungsausfall ist eine Aufgabe, kein Logeintrag. Er steht oben
// und sagt, was zu tun ist.
//
// Ausfuehren: node --test control-server/src/admin/opsAbrechnung.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { emailKey } from "../auth/emailUserStore.js";
import { abrechnungUebersicht } from "./opsAbrechnung.js";

const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "eimer"
});

const INDEX = async () => ({ ok: true, entries: [{ userId: "u_1", email: "maria@example.de" }] });

function kunde(id, felder = {}) {
  return {
    key: `billing/customers/${id}.json`,
    daten: {
      ref: emailKey("maria@example.de"),
      plan: "pro",
      status: "active",
      periodEnd: "2026-08-15T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      livemode: true,
      subscriptionId: "sub_" + id,
      ...felder
    }
  };
}

function netz(kunden) {
  const nachKey = new Map(kunden.map((k) => [k.key, k.daten]));
  return async (url) => {
    const adresse = new URL(String(url));
    if (adresse.searchParams.get("list-type") === "2") {
      const inhalt = [...nachKey.keys()]
        .map((k) => `<Contents><Key>${k}</Key><Size>200</Size><LastModified>2026-07-01T00:00:00.000Z</LastModified></Contents>`)
        .join("");
      return antwort(`<?xml version="1.0"?><ListBucketResult>${inhalt}<IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
    const key = decodeURIComponent(adresse.pathname.split("/").slice(2).join("/"));
    const daten = nachKey.get(key);
    if (!daten) return { ok: false, status: 404, text: async () => "", headers: { get: () => null } };
    return antwort(JSON.stringify(daten));
  };
}

function antwort(text) {
  return { ok: true, status: 200, text: async () => text, arrayBuffer: async () => Buffer.from(text), headers: { get: () => null } };
}

test("EIN ZAHLUNGSAUSFALL STEHT OBEN UND SAGT, WAS ZU TUN IST", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([
      kunde("cus_ok", { status: "active" }),
      kunde("cus_weg", { status: "canceled" }),
      kunde("cus_offen", { status: "past_due" })
    ])
  });
  assert.equal(e.abos[0].zustand, "past_due", "der Ausfall steht ganz oben");
  assert.equal(e.abos[0].dringlichkeit, "hoch");
  assert.equal(typeof e.abos[0].naechsterSchritt, "string");
  assert.equal(e.abos[0].naechsterSchritt.length > 10, true, "es steht dabei, was zu tun ist");
  assert.equal(e.handlungsbedarf, 1);
});

test("die Kunden-Kennung wird ueber den Hash zur Adresse", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([kunde("cus_1")])
  });
  assert.equal(e.abos[0].konto, "maria@example.de",
    "der Kunden-Datensatz kennt nur sha256 der Adresse — der Weg zurueck laeuft ueber den Index");
});

test("eine unbekannte Zuordnung bleibt offen statt geraten", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT,
    leseIndex: async () => ({ ok: true, entries: [] }),
    fetchImpl: netz([kunde("cus_fremd")])
  });
  assert.equal(e.abos[0].konto, null, "lieber keine Adresse als eine falsche");
  assert.equal(e.abos[0].kundenId, "cus_fremd", "die Kennung genuegt zum Nachschlagen bei Stripe");
});

test("Betraege und Zahlungsmittel werden nicht gespiegelt", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([kunde("cus_1")])
  });
  const text = JSON.stringify(e);
  assert.equal(/betrag|amount|karte|card|iban/i.test(text), false,
    "Geldbetraege und Zahlungsmittel liegen bei Stripe und gehoeren dorthin");
  assert.equal(e.hinweis.includes("bei Stripe"), true);
});

test("Testabos werden getrennt gezaehlt — sonst haelt man sie fuer Umsatz", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([kunde("cus_echt", { livemode: true }), kunde("cus_test", { livemode: false })])
  });
  assert.equal(e.testmodus, 1);
});

test("die Restlaufzeit wird gerechnet, nicht gespeichert", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([kunde("cus_1", { periodEnd: "2026-08-15T00:00:00.000Z" })])
  });
  assert.equal(e.abos[0].tageBisEnde, 18);
});

test("Kuendigung zum Periodenende wird gezaehlt", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([kunde("cus_1", { cancelAtPeriodEnd: true })])
  });
  assert.equal(e.gekuendigtZumPeriodenende, 1);
  assert.equal(e.abos[0].kuendigtZumPeriodenende, true);
});

test("Plaene werden gruppiert, zahlende getrennt gezaehlt", async () => {
  const e = await abrechnungUebersicht({
    env: ENV, jetztMs: JETZT, leseIndex: INDEX,
    fetchImpl: netz([
      kunde("a", { plan: "pro", status: "active" }),
      kunde("b", { plan: "pro", status: "canceled" }),
      kunde("c", { plan: "max", status: "trialing" })
    ])
  });
  assert.equal(e.zahlend, 2, "aktiv und Testphase zaehlen als zahlend");
  const pro = e.nachPlan.find((p) => p.plan === "pro");
  assert.equal(pro.gesamt, 2);
  assert.equal(pro.zahlend, 1);
});

test("ohne Speicher wird das gesagt, nicht geraten", async () => {
  const e = await abrechnungUebersicht({ env: {}, fetchImpl: async () => { throw new Error("nie erreicht"); } });
  assert.equal(e.ok, false);
  assert.equal(e.error, "speicher_nicht_eingerichtet");
});

// smejj.com — Tests fuer Modul B, Teil 2 (Nutzer-Lage).
// Ausfuehren: node --test control-server/src/admin/opsNutzerLage.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { nutzerLage } from "./opsNutzerLage.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";

const JETZT = Date.parse("2026-08-23T07:00:00.000Z");

const INDEX = {
  ok: true, builtAt: "2026-08-23T06:00:00.000Z", ageSeconds: 3600, count: 3, unreadable: 0, refreshing: false, truncated: false,
  entries: [
    { userId: "u1", email: "smejjcom@gmail.com", name: "Alan", method: "google", role: "owner", status: "active", emailVerified: true, createdAt: "2026-07-01T00:00:00Z", activeSessions: 2, lastSeenAt: "2026-08-23T06:50:00Z" },
    { userId: "u2", email: "m.keller@web.de", name: "M. Keller", method: "email", role: "user", status: "active", emailVerified: true, createdAt: "2026-08-20T00:00:00Z", activeSessions: 0, lastSeenAt: "2026-08-10T06:50:00Z" },
    { userId: "u3", email: "neu@example.org", name: "", method: "passkey", role: "user", status: "blocked", emailVerified: false, createdAt: "2026-08-22T00:00:00Z", activeSessions: 0 }
  ]
};

const ABRECHNUNG = {
  ok: true, zahlend: 2,
  abos: [
    { kundenId: "cus_1", konto: "smejjcom@gmail.com", plan: "Gold", zustand: "active", klartext: "laeuft", paidEmail: "7shahnazaryan@gmail.com" },
    { kundenId: "cus_2", konto: "m.keller@web.de", plan: "Silber", zustand: "active", klartext: "laeuft", paidEmail: "m.keller@web.de" },
    { kundenId: "cus_3", konto: null, plan: "Plus", zustand: "active", klartext: "laeuft", zahlendeAdresse: "fremd@example.org", naechsterSchritt: "anschreiben" }
  ]
};

const VERBRAUCH = { topNutzer: [{ nutzer: authenticatedUserId({ userId: "u1" }), anfragen: 12, kostenUsd: 0.04 }] };

function lage(extra = {}) {
  return nutzerLage({
    env: {}, jetztMs: JETZT,
    leseIndex: async () => INDEX,
    leseAbrechnung: async () => ABRECHNUNG,
    leseVerbrauch: () => VERBRAUCH,
    ...extra
  });
}

test("'bezahlt als' ist eine eigene Spalte: andere Adresse, dieselbe, oder kein Abo", async () => {
  const u = await lage();
  const je = Object.fromEntries(u.eintraege.map((x) => [x.userId, x]));
  assert.equal(je.u1.bezahltAls, "7shahnazaryan@gmail.com");
  assert.equal(je.u1.plan, "Gold");
  assert.equal(je.u2.bezahltAls, "dieselbe");
  assert.equal(je.u3.bezahltAls, null);
  assert.equal(je.u3.plan, "Frei");
  assert.equal(u.abos.zweiAdressen, 1);
});

test("nicht zuordenbares Abo steht oben — mit zahlender Adresse, damit klar ist, wen man anschreibt", async () => {
  const u = await lage();
  assert.equal(u.abos.nichtZugeordnet, 1);
  assert.equal(u.abos.nichtZugeordnetListe[0].zahlendeAdresse, "fremd@example.org");
});

test("Kennzahlen: heute aktiv nur mit lastSeenAt; Verbrauch je Konto seit Neustart", async () => {
  const u = await lage();
  assert.equal(u.konten.gesamt, 3);
  assert.equal(u.konten.heuteAktiv, 1);
  assert.equal(u.konten.neuDieseWoche, 2);
  assert.equal(u.index.kenntZuletzt, true);
  assert.deepEqual(u.eintraege.find((x) => x.userId === "u1").verbrauch, { anfragen: 12, kostenUsd: 0.04 });
  assert.match(u.verbrauchHinweis, /Neustart/);
});

test("Suche filtert die Liste, nicht die Kennzahlen", async () => {
  const u = await lage({ query: "keller" });
  assert.equal(u.eintraege.length, 1);
  assert.equal(u.konten.gesamt, 3);
});

test("ohne Index: 409-Hinweis statt leerer Seite; Abrechnung still -> erreichbar=false", async () => {
  const ohne = await lage({ leseIndex: async () => ({ ok: false, error: "user_index_missing" }) });
  assert.equal(ohne.ok, false);
  assert.match(ohne.hint, /rebuild/);
  const still = await lage({ leseAbrechnung: async () => { throw new Error("s3 down"); } });
  assert.equal(still.abos.erreichbar, false);
  assert.equal(still.eintraege[0].plan, "Frei");
});

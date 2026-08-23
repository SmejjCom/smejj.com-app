// smejj.com — Tests: Abo auf ein Konto umhaengen.
// Ausfuehren: node --test control-server/src/billing/aboUmhaengen.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { aboAufKontoUmhaengen } from "./aboUmhaengen.js";
import { emailKey } from "../auth/emailUserStore.js";

const INDEX = { ok: true, entries: [{ email: "smejjcom@gmail.com" }, { email: "m@x.de" }] };
const KUNDE = { ref: emailKey("7shahnazaryan@gmail.com"), paidEmail: "7shahnazaryan@gmail.com", plan: "plus", status: "active", subscriptionId: "sub_1", livemode: true };

function umgebung(ueber = {}) {
  const geschrieben = { refs: [], kunden: [] };
  const opts = {
    env: {},
    leseIndex: async () => INDEX,
    leseKunde: async () => ({ ...KUNDE }),
    schreibeRef: async (ref, rec) => { geschrieben.refs.push({ ref, rec }); return rec; },
    schreibeKunde: async (id, rec) => { geschrieben.kunden.push({ id, rec }); return rec; },
    ...ueber
  };
  return { opts, geschrieben };
}

test("haengt das Abo auf das Konto: neuer Ref-Datensatz, Kunde zeigt auf die Konto-Adresse, paidEmail bleibt", async () => {
  const { opts, geschrieben } = umgebung();
  const r = await aboAufKontoUmhaengen("SmejjCom@gmail.com", "cus_V4GGvjGpI1hmUh", opts);
  assert.equal(r.ok, true);
  assert.equal(r.after.ref, emailKey("smejjcom@gmail.com"));
  assert.equal(r.after.paidEmail, "7shahnazaryan@gmail.com", "die Kaufadresse ist der Beleg und wird nie veraendert");
  assert.equal(geschrieben.refs[0].ref, emailKey("smejjcom@gmail.com"));
  assert.equal(geschrieben.refs[0].rec.customerId, "cus_V4GGvjGpI1hmUh");
  assert.equal(geschrieben.kunden[0].rec.ref, emailKey("smejjcom@gmail.com"));
  assert.equal(geschrieben.kunden[0].rec.refVorher, KUNDE.ref, "der alte Ref bleibt nachvollziehbar");
});

test("fail-closed: unbekanntes Konto, ungueltige Kunden-ID, kein laufendes Abo, keine Aenderung", async () => {
  assert.equal((await aboAufKontoUmhaengen("niemand@x.de", "cus_1", umgebung().opts)).error, "admin_user_not_found");
  assert.equal((await aboAufKontoUmhaengen("m@x.de", "sub_falsch", umgebung().opts)).error, "billing_customer_id_invalid");
  assert.equal((await aboAufKontoUmhaengen("m@x.de", "cus_1", umgebung({ leseKunde: async () => ({ ...KUNDE, status: "canceled" }) }).opts)).error, "billing_subscription_not_active");
  assert.equal((await aboAufKontoUmhaengen("m@x.de", "cus_1", umgebung({ leseKunde: async () => null }).opts)).error, "billing_customer_not_found");
  const gleich = await aboAufKontoUmhaengen("7shahnazaryan@gmail.com", "cus_1", umgebung({ leseIndex: async () => ({ ok: true, entries: [{ email: "7shahnazaryan@gmail.com" }] }) }).opts);
  assert.equal(gleich.error, "admin_no_change");
  const { opts, geschrieben } = umgebung({ leseIndex: async () => ({ ok: false }) });
  assert.equal((await aboAufKontoUmhaengen("m@x.de", "cus_1", opts)).error, "admin_directory_unavailable");
  assert.equal(geschrieben.refs.length + geschrieben.kunden.length, 0, "bei jedem Fehler wird nichts geschrieben");
});

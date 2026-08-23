// smejj.com — Abrechnung der oeffentlichen API: Preise, Guthaben, Buchung,
// Aufladung (idempotent), Sperre bei 0. Speicher im Prozess (keine IDrive-Env).
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { kostenMikro, mikroZuUsd, usdZuMikro, PREISE_USD_JE_MIO } from "../control-server/src/publicapi/publicApiPreise.js";
import {
  __leereLedgerSpeicher, bucheAnfrage, darfAnfragen, leseKonto, verbucheAufladung, erzeugeAufladung
} from "../control-server/src/publicapi/publicApiLedger.js";
import { applyStripeEvent } from "../control-server/src/billing/stripeEventApply.js";
import { handlePublicApiRoute } from "../control-server/src/publicapi/publicApiRoutes.js";
import { __leerePruefCache, erzeugeSchluessel } from "../control-server/src/publicapi/publicApiKeys.js";
import { __clearProviderCredentialMemoryForTests } from "../control-server/src/providers/providerCredentialVault.js";

const KONTO = "user_0badf00d";
const env = () => ({
  SMEJJ_PUBLIC_API_ENABLED: "1",
  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-key-2026",
  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
  SMEJJ_PROVIDER_CREDENTIAL_ALLOW_MEMORY: "YES",
  SMEJJ_LLM_BASE_URL: "https://backend.example.com/v1", SMEJJ_LLM_API_KEY: "k", SMEJJ_LLM_MODEL: "x7", SMEJJ_LLM_PROVIDER_ORDER: "custom"
});

test("Preise: ganzzahlige Mikro-USD, unbekanntes Modell = teuerster Satz", () => {
  // 1 Mio Eingabe-Token smejj-1.0 = 0,50 USD = 500_000 Mikro
  assert.equal(kostenMikro("smejj-1.0", 1_000_000, 0), 500_000);
  assert.equal(kostenMikro("smejj-1.0", 0, 1_000_000), 1_500_000);
  assert.equal(kostenMikro("smejj-1.0", 21, 1), Math.round(21 * 0.5) + Math.round(1 * 1.5));
  assert.equal(kostenMikro("gibt-es-nicht", 1_000_000, 0), PREISE_USD_JE_MIO["smejj-1.0-reasoning"].eingabe * 1_000_000);
  assert.equal(mikroZuUsd(1_234_567), 1.2346);
  assert.equal(usdZuMikro(25), 25_000_000);
  assert.equal(usdZuMikro(-3), 0);
});

test("Neues Konto bekommt Startguthaben genau EINMAL", async () => {
  __leereLedgerSpeicher();
  const e = { SMEJJ_PUBLIC_API_STARTGUTHABEN_USD: "2" };
  const a = await leseKonto(KONTO, e);
  assert.equal(a.guthabenMikro, 2_000_000);
  await bucheAnfrage(KONTO, { anfrageId: "req_1", modell: "smejj-1.0", promptTokens: 1_000_000, completionTokens: 0, env: e });
  const b = await leseKonto(KONTO, e);
  assert.equal(b.guthabenMikro, 1_500_000, "Startguthaben darf nicht erneut gutgeschrieben werden");
  assert.equal(b.anfragen, 1);
  assert.equal(b.verbrauchtMikro, 500_000);
});

test("Bei 0 ist Schluss; Aufladung hebt die Sperre; doppelte Zustellung zaehlt einmal", async () => {
  __leereLedgerSpeicher();
  const e = { SMEJJ_PUBLIC_API_STARTGUTHABEN_USD: "0" };
  assert.equal((await darfAnfragen(KONTO, e)).ok, false);
  const session = { id: "cs_test_abcdefgh123", mode: "payment", payment_status: "paid", amount_total: 2500, metadata: { zweck: "api-guthaben", kontoId: KONTO } };
  const erste = await applyStripeEvent({ type: "checkout.session.completed", data: { object: session } }, e);
  assert.equal(erste.action, "topup_applied");
  const zweite = await applyStripeEvent({ type: "checkout.session.completed", data: { object: session } }, e);
  assert.equal(zweite.action, "topup_already_applied");
  const konto = await leseKonto(KONTO, e);
  assert.equal(konto.guthabenMikro, 25_000_000);
  assert.equal(konto.aufgeladenMikro, 25_000_000);
  assert.equal((await darfAnfragen(KONTO, e)).ok, true);
  // Unbezahlt oder fremder Zweck: nichts passiert.
  assert.equal((await verbucheAufladung({ ...session, id: "cs_test_zzz99999", payment_status: "unpaid" }, e)).handled, false);
});

test("Aufladen: nur feste Stufen, Stripe-Sitzung traegt die Konto-Zuordnung in metadata", async () => {
  await assert.rejects(() => erzeugeAufladung(KONTO, 7, { env: { STRIPE_SECRET_KEY: "sk_test" } }), /api_billing_betrag_invalid/);
  await assert.rejects(() => erzeugeAufladung(KONTO, 10, { env: {} }), /billing_not_configured/);
  let gesendet = "";
  const fetchImpl = (_url, o) => { gesendet = o.body; return Promise.resolve(new Response(JSON.stringify({ id: "cs_x", url: "https://checkout.stripe.com/x" }), { status: 200 })); };
  const r = await erzeugeAufladung(KONTO, 10, { env: { STRIPE_SECRET_KEY: "sk_test", SMEJJ_APP_ORIGIN: "https://smejj.com" }, fetchImpl, email: "a@b.de" });
  assert.equal(r.url, "https://checkout.stripe.com/x");
  const form = new URLSearchParams(gesendet);
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("metadata[zweck]"), "api-guthaben");
  assert.equal(form.get("metadata[kontoId]"), KONTO);
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1000");
  assert.equal(form.get("success_url"), "https://smejj.com/entwickler.html?aufgeladen=1");
});

test("/v1 ohne Guthaben: 402 insufficient_quota im OpenAI-Format", async () => {
  __clearProviderCredentialMemoryForTests(); __leerePruefCache(); __leereLedgerSpeicher();
  const e = { ...env(), SMEJJ_PUBLIC_API_STARTGUTHABEN_USD: "0" };
  const { klartext } = await erzeugeSchluessel("user_11112222", {}, e);
  const req = Readable.from([JSON.stringify({ messages: [{ role: "user", content: "hi" }] })]);
  req.method = "POST"; req.headers = { host: "x", authorization: `Bearer ${klartext}` };
  const teile = []; const z = { status: 0, headers: {} };
  const res = { get headersSent() { return z.status > 0; }, setHeader(k, v) { z.headers[k.toLowerCase()] = v; }, writeHead(s, h = {}) { z.status = s; Object.assign(z.headers, h); }, write(t) { teile.push(String(t)); }, end(t) { if (t) teile.push(String(t)); } };
  await handlePublicApiRoute(req, new URL("https://x/v1/chat/completions"), res, { env: e, fetchImpl: () => { throw new Error("darf nicht rufen"); } });
  assert.equal(z.status, 402);
  const fehler = JSON.parse(teile.join("")).error;
  assert.equal(fehler.code, "insufficient_quota");
  assert.equal(fehler.type, "insufficient_quota");
});

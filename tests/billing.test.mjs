// smejj.com — Tests fuer das Billing-Modul (Stripe-Webhook + Abo-Status).
// Alles ohne Server-Boot und ohne IDrive: der Store faellt ohne IDRIVE_E2_*-Env
// auf den In-Memory-Modus zurueck (gleiches Muster wie email-auth.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature } from "../control-server/src/billing/stripeWebhookVerify.js";
import {
  PLAN_BY_STRIPE_PRODUCT,
  __clearBillingMemoryStoreForTests,
  resolveSubscriptionStatus
} from "../control-server/src/billing/subscriptionStore.js";
import { applyStripeEvent } from "../control-server/src/billing/stripeEventApply.js";
import { createBillingHandlers } from "../control-server/src/routes/billingRoutes.js";
import { emailKey } from "../control-server/src/auth/emailUserStore.js";

const EMPTY_ENV = {}; // erzwingt In-Memory-Store (kein IDrive konfiguriert)
const REF = emailKey("abo-tester@example.com");
const SECRET = "whsec_test_secret";

function sign(rawBody, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const mac = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

function checkoutEvent({ ref = REF, customer = "cus_TestKunde1", subscription = "sub_Test1" } = {}) {
  return {
    type: "checkout.session.completed",
    created: 1_753_500_000,
    livemode: false,
    data: { object: { mode: "subscription", client_reference_id: ref, customer, subscription } }
  };
}

function subscriptionEvent({
  type = "customer.subscription.updated", customer = "cus_TestKunde1", status = "active",
  product = "prod_UxSGVIRDGNdHaI", created = 1_753_500_100, periodEnd = 1_756_178_400
} = {}) {
  return {
    type,
    created,
    livemode: false,
    data: {
      object: {
        id: "sub_Test1",
        customer,
        status,
        cancel_at_period_end: false,
        current_period_end: periodEnd,
        items: { data: [{ price: { product } }] }
      }
    }
  };
}

test("Webhook-Signatur: gueltig, manipuliert, veraltet, fehlend", () => {
  const rawBody = JSON.stringify({ hello: "stripe" });
  assert.equal(verifyStripeSignature({ rawBody, signatureHeader: sign(rawBody), secret: SECRET }).ok, true);
  assert.equal(verifyStripeSignature({ rawBody: rawBody + "x", signatureHeader: sign(rawBody), secret: SECRET }).ok, false);
  assert.equal(verifyStripeSignature({ rawBody, signatureHeader: sign(rawBody, { secret: "whsec_other" }), secret: SECRET }).ok, false);
  const old = verifyStripeSignature({
    rawBody,
    signatureHeader: sign(rawBody, { timestamp: 1_000 }),
    secret: SECRET,
    nowSeconds: 10_000
  });
  assert.deepEqual(old, { ok: false, reason: "timestamp_outside_tolerance" });
  assert.equal(verifyStripeSignature({ rawBody, signatureHeader: "", secret: SECRET }).ok, false);
  assert.equal(verifyStripeSignature({ rawBody, signatureHeader: sign(rawBody), secret: "" }).ok, false);
});

test("Produkt->Plan-Mapping deckt Plus/Pro/Max aus Schritt 3a ab", () => {
  assert.deepEqual(PLAN_BY_STRIPE_PRODUCT, {
    prod_UxSGVIRDGNdHaI: "plus",
    prod_UxSItpgmwcvKRg: "pro",
    prod_UxSJBDqMn7QUTM: "max"
  });
});

test("Eventfolge Checkout -> Subscription ergibt aktiven Plan", async () => {
  __clearBillingMemoryStoreForTests();
  assert.equal((await applyStripeEvent(checkoutEvent(), EMPTY_ENV)).handled, true);
  assert.equal((await applyStripeEvent(subscriptionEvent(), EMPTY_ENV)).handled, true);
  const status = await resolveSubscriptionStatus(REF, EMPTY_ENV);
  assert.equal(status.plan, "plus");
  assert.equal(status.status, "active");
  assert.equal(status.cancelAtPeriodEnd, false);
});

test("Reihenfolge-tolerant: Subscription-Event VOR Checkout-Event", async () => {
  __clearBillingMemoryStoreForTests();
  await applyStripeEvent(subscriptionEvent({ product: "prod_UxSItpgmwcvKRg" }), EMPTY_ENV);
  await applyStripeEvent(checkoutEvent(), EMPTY_ENV);
  const status = await resolveSubscriptionStatus(REF, EMPTY_ENV);
  assert.equal(status.plan, "pro");
  assert.equal(status.status, "active");
});

test("Kuendigung: deleted-Event setzt Plan auf free zurueck; alte Events werden verworfen", async () => {
  __clearBillingMemoryStoreForTests();
  await applyStripeEvent(checkoutEvent(), EMPTY_ENV);
  await applyStripeEvent(subscriptionEvent(), EMPTY_ENV);
  await applyStripeEvent(subscriptionEvent({ type: "customer.subscription.deleted", created: 1_753_500_200 }), EMPTY_ENV);
  assert.equal((await resolveSubscriptionStatus(REF, EMPTY_ENV)).plan, "free");
  // veraltetes "active"-Event (aelter als das deleted) darf den Zustand nicht zuruedrehen
  const stale = await applyStripeEvent(subscriptionEvent({ created: 1_753_500_150 }), EMPTY_ENV);
  assert.deepEqual(stale, { handled: false, action: "ignored_stale_event" });
  assert.equal((await resolveSubscriptionStatus(REF, EMPTY_ENV)).plan, "free");
});

test("Checkout ohne client_reference_id oder ohne Kunde wird ignoriert (kein Crash)", async () => {
  __clearBillingMemoryStoreForTests();
  const noRef = checkoutEvent({ ref: "" });
  assert.equal((await applyStripeEvent(noRef, EMPTY_ENV)).handled, false);
  const badCustomer = checkoutEvent({ customer: "not-a-customer" });
  assert.equal((await applyStripeEvent(badCustomer, EMPTY_ENV)).handled, false);
  assert.equal((await applyStripeEvent({ type: "invoice.paid" }, EMPTY_ENV)).handled, false);
});

function fakeRequest({ method = "POST", body = "", headers = {} } = {}) {
  const listeners = {};
  const req = {
    method,
    headers,
    on(event, handler) {
      listeners[event] = handler;
      if (event === "end") {
        queueMicrotask(() => {
          if (body && listeners.data) listeners.data(body);
          listeners.end();
        });
      }
      return req;
    }
  };
  return req;
}

function fakeResponse() {
  const out = { status: 0, payload: null, headers: {} };
  return {
    out,
    setHeader(name, value) { out.headers[name] = value; },
    writeHead(status) { out.status = status; },
    end(text) { out.payload = text ? JSON.parse(text) : null; }
  };
}

function makeHandlers({ env = EMPTY_ENV, user = null } = {}) {
  return createBillingHandlers({
    env,
    readSession: () => user,
    json: (res, status, payload) => { res.out.status = status; res.out.payload = payload; }
  });
}

test("Webhook-Route: fail-closed 503 ohne Secret, 400 bei falscher Signatur, 200 bei gueltiger", async () => {
  __clearBillingMemoryStoreForTests();
  const url = { pathname: "/api/billing/stripe/webhook" };

  const noSecret = fakeResponse();
  await makeHandlers()(fakeRequest(), noSecret, url);
  assert.equal(noSecret.out.status, 503);

  const env = { STRIPE_WEBHOOK_SECRET: SECRET };
  const rawBody = JSON.stringify(checkoutEvent());
  const badSig = fakeResponse();
  await makeHandlers({ env })(fakeRequest({ body: rawBody, headers: { "stripe-signature": "t=1,v1=" + "0".repeat(64) } }), badSig, url);
  assert.equal(badSig.out.status, 400);

  const okRes = fakeResponse();
  await makeHandlers({ env })(fakeRequest({ body: rawBody, headers: { "stripe-signature": sign(rawBody) } }), okRes, url);
  assert.equal(okRes.out.status, 200);
  assert.equal(okRes.out.payload.received, true);
  assert.equal(okRes.out.payload.action, "checkout_linked");
});

test("Status-Route: 401 ohne Session, sonst Plan + checkoutRef fuer Zahlungslinks", async () => {
  __clearBillingMemoryStoreForTests();
  const url = { pathname: "/api/billing/status" };

  const anon = fakeResponse();
  await makeHandlers()(fakeRequest({ method: "GET" }), anon, url);
  assert.equal(anon.out.status, 401);

  await applyStripeEvent(checkoutEvent(), EMPTY_ENV);
  await applyStripeEvent(subscriptionEvent({ product: "prod_UxSJBDqMn7QUTM" }), EMPTY_ENV);
  const authed = fakeResponse();
  await makeHandlers({ user: { email: "abo-tester@example.com", name: "Abo Tester" } })(
    fakeRequest({ method: "GET" }), authed, url
  );
  assert.equal(authed.out.status, 200);
  assert.equal(authed.out.payload.plan, "max");
  assert.equal(authed.out.payload.checkoutRef, REF);
  assert.equal(authed.out.payload.livemode, false);

  const unrouted = await makeHandlers()(fakeRequest({ method: "GET" }), fakeResponse(), { pathname: "/api/billing/unbekannt" });
  assert.equal(unrouted, false);
});

// smejj.com control-server — Billing-Routen (Single Responsibility: HTTP-Schicht
// fuer Stripe-Webhook + Abo-Status; Logik liegt in ../billing/*).
//
// POST /api/billing/stripe/webhook  — oeffentlich (Stripe ruft ohne Cookie/Origin),
//   abgesichert ueber die Webhook-Signatur. Fail-closed: ohne konfiguriertes
//   STRIPE_WEBHOOK_SECRET antwortet die Route 503 und verarbeitet nichts.
// GET  /api/billing/status          — nur mit gueltiger Session; liefert den
//   Abo-Plan des angemeldeten Nutzers plus checkoutRef (sha256 der E-Mail) fuer
//   client_reference_id an den Stripe-Zahlungslinks.
import { verifyStripeSignature } from "../billing/stripeWebhookVerify.js";
import { applyStripeEvent } from "../billing/stripeEventApply.js";
import { resolveSubscriptionStatus } from "../billing/subscriptionStore.js";
import { emailKey, normalizeEmail } from "../auth/emailUserStore.js";
import { emailSessionStillValid } from "./emailAuthRoutes.js";
import { privateJson, readRawBody } from "../http/respond.js";

export function createBillingHandlers({ env = process.env, readSession, json }) {
  async function handleStripeWebhook(req, res) {
    const secret = String(env.STRIPE_WEBHOOK_SECRET || "");
    if (!secret) return json(res, 503, { ok: false, error: "billing_webhook_not_configured" });
    const rawBody = await readRawBody(req);
    const verdict = verifyStripeSignature({
      rawBody,
      signatureHeader: req.headers["stripe-signature"],
      secret
    });
    if (!verdict.ok) return json(res, 400, { ok: false, error: verdict.reason });
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json(res, 400, { ok: false, error: "invalid_json" });
    }
    // Storage-Fehler absichtlich NICHT abfangen: 500 laesst Stripe erneut zustellen.
    const result = await applyStripeEvent(event, env);
    return json(res, 200, { received: true, action: result.action });
  }

  async function handleBillingStatus(req, res) {
    const user = readSession(req);
    if (!user || !(await emailSessionStillValid(user, env))) {
      return privateJson(res, 401, { ok: false, error: "authentication_required" });
    }
    const email = normalizeEmail(user.email);
    if (!email) return privateJson(res, 400, { ok: false, error: "session_without_email" });
    const checkoutRef = emailKey(email);
    try {
      const status = await resolveSubscriptionStatus(checkoutRef, env);
      return privateJson(res, 200, { ok: true, checkoutRef, ...status });
    } catch {
      // fail-closed: Storage-Stoerung nie als "kein Abo" ausgeben
      return privateJson(res, 503, { ok: false, error: "billing_status_unavailable" });
    }
  }

  return async function routeBilling(req, res, url) {
    if (req.method === "POST" && url.pathname === "/api/billing/stripe/webhook") {
      await handleStripeWebhook(req, res);
      return true;
    }
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/api/billing/status") {
      await handleBillingStatus(req, res);
      return true;
    }
    return false;
  };
}

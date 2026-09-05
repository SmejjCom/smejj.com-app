// smejj.com control-server — Billing-Routen (Single Responsibility: HTTP-Schicht
// fuer Stripe-Webhook + Abo-Status; Logik liegt in ../billing/*).
//
// POST /api/billing/stripe/webhook  — oeffentlich (Stripe ruft ohne Cookie/Origin),
//   abgesichert ueber die Webhook-Signatur. Fail-closed: ohne konfiguriertes
//   STRIPE_WEBHOOK_SECRET antwortet die Route 503 und verarbeitet nichts.
// GET  /api/billing/status          — nur mit gueltiger Session; liefert den
//   Abo-Plan des angemeldeten Nutzers plus checkoutRef (sha256 der E-Mail) fuer
//   client_reference_id an den Stripe-Zahlungslinks.
// POST /api/billing/portal          — nur mit gueltiger Session; erzeugt eine
//   Stripe-Kundenportal-Sitzung (verwalten, Plan wechseln, kuendigen,
//   Rechnungen) und liefert deren URL. Braucht STRIPE_SECRET_KEY; ohne ihn
//   ehrlich 503, das Frontend faellt dann auf den Portal-Login-Link zurueck.
import { verifyStripeSignature } from "../billing/stripeWebhookVerify.js";
import { applyStripeEvent } from "../billing/stripeEventApply.js";
import {
  getRefRecord,
  periodEndeAus,
  planFromStripeItem,
  putCustomerRecord,
  putRefRecord,
  resolveSubscriptionStatus
} from "../billing/subscriptionStore.js";
import { emailKey, normalizeEmail } from "../auth/emailUserStore.js";
import { emailSessionStillValid } from "./emailAuthRoutes.js";
import { privateJson, readRawBody } from "../http/respond.js";

export function createBillingHandlers({ env = process.env, readSession, json, fetchImpl = fetch }) {
  async function handleStripeWebhook(req, res) {
    // ZWEI EMPFAENGER, ZWEI GEHEIMNISSE (2026-09-05): Stripe vergibt je
    // Empfaenger ein eigenes Signatur-Geheimnis. Seit dem Zweitweg ueber die
    // eigene Domain (api.smejj.com neben smejj-control.zeabur.app) trifft
    // dasselbe Ereignis auf DIESEN Endpunkt mit zwei verschiedenen
    // Signaturen — je nachdem, welcher Weg es gebracht hat.
    //
    // Beide werden geprueft, nacheinander, mit derselben strengen Pruefung.
    // Das schwaecht nichts ab: ein Ereignis muss weiterhin mit EINEM gueltigen
    // Geheimnis signiert sein. Es kennt nur zwei gueltige statt einem.
    //
    // Fehlt das zweite Geheimnis, laeuft der Hauptweg unveraendert weiter —
    // Ereignisse vom Zweitweg werden dann abgelehnt, nicht durchgewinkt.
    const geheimnisse = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_ZWEITWEG]
      .map((s) => String(s || "").trim()).filter(Boolean);
    if (!geheimnisse.length) return json(res, 503, { ok: false, error: "billing_webhook_not_configured" });
    const rawBody = await readRawBody(req);
    let verdict = { ok: false, reason: "signature_header_missing" };
    for (const secret of geheimnisse) {
      verdict = verifyStripeSignature({ rawBody, signatureHeader: req.headers["stripe-signature"], secret });
      if (verdict.ok) break;
    }
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
      let status = await resolveSubscriptionStatus(checkoutRef, env);
      if (status.plan === "free") status = await heileFehlendeZuordnung(email, checkoutRef, status, env);
      return privateJson(res, 200, { ok: true, checkoutRef, ...status });
    } catch {
      // fail-closed: Storage-Stoerung nie als "kein Abo" ausgeben
      return privateJson(res, 503, { ok: false, error: "billing_status_unavailable" });
    }
  }

  // Selbstheilung (Befund 2026-08-14): Das erste echte Abo lag im Speicher und
  // der Kunde sah trotzdem "Free" — weil die Zuordnung ueber sha256(E-Mail)
  // laeuft und die Kennung beim Kauf verloren gegangen war. Das ist kein
  // Einzelfall, sondern der Normalfall bei Zahlungslinks: wer den Link oeffnet,
  // bevor der Abo-Status geladen ist, kauft ohne client_reference_id.
  //
  // Statt darauf zu warten, dass jemand es meldet, fragt der Server hier bei
  // Stripe nach: Gibt es einen Kunden mit GENAU dieser Adresse und einem
  // laufenden Abo? Verglichen wird die vom Login bestaetigte Adresse mit der
  // bei Stripe hinterlegten — beide muessen uebereinstimmen. Damit kann sich
  // niemand ein fremdes Abo aneignen, indem er eine Adresse behauptet.
  //
  // Ohne STRIPE_SECRET_KEY passiert hier nichts; der Status bleibt "free".
  async function heileFehlendeZuordnung(email, checkoutRef, status, umgebung) {
    const schluessel = String(umgebung.STRIPE_SECRET_KEY || "");
    if (!schluessel) return status;
    try {
      const suche = await fetchImpl(
        `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=10`,
        { headers: { Authorization: `Bearer ${schluessel}` }, signal: AbortSignal.timeout(10_000) }
      );
      if (!suche.ok) return status;
      const kunden = (await suche.json())?.data || [];
      for (const kunde of kunden) {
        if (normalizeEmail(kunde?.email) !== email) continue; // exakte Adresse, nichts Aehnliches
        const abos = await fetchImpl(
          `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(kunde.id)}&status=all&limit=10`,
          { headers: { Authorization: `Bearer ${schluessel}` }, signal: AbortSignal.timeout(10_000) }
        );
        if (!abos.ok) continue;
        const laufend = ((await abos.json())?.data || [])
          .find((abo) => ["active", "trialing", "past_due"].includes(String(abo.status)));
        if (!laufend) continue;
        const posten = Array.isArray(laufend.items?.data) ? laufend.items.data[0] : null;
        await putRefRecord(checkoutRef, {
          customerId: kunde.id,
          subscriptionId: laufend.id,
          livemode: Boolean(laufend.livemode)
        }, umgebung);
        await putCustomerRecord(kunde.id, {
          ref: checkoutRef,
          subscriptionId: laufend.id,
          plan: planFromStripeItem(posten),
          status: String(laufend.status),
          periodEnd: periodEndeAus(laufend),
          cancelAtPeriodEnd: Boolean(laufend.cancel_at_period_end),
          livemode: Boolean(laufend.livemode)
        }, umgebung);
        return resolveSubscriptionStatus(checkoutRef, umgebung);
      }
    } catch { /* Stripe still: der Status bleibt, wie er war */ }
    return status;
  }

  async function handleBillingPortal(req, res) {
    const user = readSession(req);
    if (!user || !(await emailSessionStillValid(user, env))) {
      return privateJson(res, 401, { ok: false, error: "authentication_required" });
    }
    const email = normalizeEmail(user.email);
    if (!email) return privateJson(res, 400, { ok: false, error: "session_without_email" });
    const secretKey = String(env.STRIPE_SECRET_KEY || "");
    if (!secretKey) return privateJson(res, 503, { ok: false, error: "billing_portal_not_configured" });
    let refRecord;
    try {
      refRecord = await getRefRecord(emailKey(email), env);
    } catch {
      return privateJson(res, 503, { ok: false, error: "billing_status_unavailable" });
    }
    const customerId = refRecord?.customerId;
    if (!customerId) return privateJson(res, 404, { ok: false, error: "billing_no_subscription" });
    const returnUrl = `${String(env.SMEJJ_APP_ORIGIN || "https://smejj.com").replace(/\/+$/, "")}/`;
    try {
      const antwort = await fetchImpl("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ customer: customerId, return_url: returnUrl }).toString(),
        signal: AbortSignal.timeout(15_000)
      });
      const data = await antwort.json().catch(() => ({}));
      if (!antwort.ok || !data.url) return privateJson(res, 502, { ok: false, error: "billing_portal_failed" });
      return privateJson(res, 200, { ok: true, url: data.url });
    } catch {
      return privateJson(res, 502, { ok: false, error: "billing_portal_failed" });
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
    if (req.method === "POST" && url.pathname === "/api/billing/portal") {
      await handleBillingPortal(req, res);
      return true;
    }
    return false;
  };
}

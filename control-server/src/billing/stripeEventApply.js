// smejj.com control-server — wendet verifizierte Stripe-Webhook-Events auf den
// Abo-Store an (Single Responsibility: Event -> Zustand; keine HTTP-Belange).
// Reihenfolge-tolerant: checkout.session.completed und customer.subscription.*
// duerfen in beliebiger Reihenfolge eintreffen, weil der Kunden-Datensatz und
// die Ref-Zuordnung getrennt gepflegt werden. Veraltete Subscription-Events
// (event.created aelter als der gespeicherte Stand) werden verworfen.
import {
  PLAN_BY_MONTHLY_AMOUNT,
  getCustomerRecord,
  isCheckoutRef,
  isStripeCustomerId,
  planFromStripeItem,
  putCustomerRecord,
  putRefRecord
} from "./subscriptionStore.js";
import { emailKey, normalizeEmail } from "../auth/emailUserStore.js";
import { sendAuthMail } from "../auth/mailer.js";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted"
]);

const PLAN_LABELS = Object.freeze({ plus: "smejj Plus", pro: "smejj Pro", max: "smejj Max" });

// Input: verifiziertes Stripe-Event (bereits geparst). Output:
// { handled: boolean, action: string } — unbekannte Events sind kein Fehler
// (Stripe erwartet 2xx), sie werden nur nicht angewendet.
// sendMail ist injizierbar (Tests); Standard ist der Auth-Mailer.
export async function applyStripeEvent(event, env = process.env, sendMail = sendAuthMail) {
  const type = String(event?.type || "");
  if (type === "checkout.session.completed") return applyCheckoutCompleted(event, env, sendMail);
  if (SUBSCRIPTION_EVENTS.has(type)) return applySubscriptionEvent(event, env);
  return { handled: false, action: "ignored_event_type" };
}

async function applyCheckoutCompleted(event, env, sendMail) {
  const session = event?.data?.object || {};
  if (session.mode !== "subscription") return { handled: false, action: "ignored_non_subscription_checkout" };
  const customerId = String(session.customer || "");
  if (!isStripeCustomerId(customerId)) return { handled: false, action: "ignored_missing_customer" };
  // Zuordnung zum Konto: bevorzugt client_reference_id (sha256 der E-Mail, vom
  // Frontend an den Zahlungslink gehaengt). Faellt sie weg — etwa weil der Link
  // vor dem Laden des Status geoeffnet wurde — traegt die von Stripe bestaetigte
  // Checkout-E-Mail dieselbe Information (Befund 2026-08-13: ohne diesen
  // Rueckfall blieb eine echte Zahlung fuer immer unzugeordnet).
  let ref = String(session.client_reference_id || "");
  if (!isCheckoutRef(ref)) {
    const email = normalizeEmail(session.customer_details?.email || session.customer_email || "");
    if (email) ref = emailKey(email);
  }
  if (!isCheckoutRef(ref)) return { handled: false, action: "ignored_missing_ref" };

  await putRefRecord(ref, {
    customerId,
    subscriptionId: session.subscription || null,
    livemode: Boolean(event.livemode)
  }, env);
  const existing = (await getCustomerRecord(customerId, env)) || {};
  await putCustomerRecord(customerId, {
    ...existing,
    ref,
    subscriptionId: session.subscription || existing.subscriptionId || null,
    livemode: Boolean(event.livemode)
  }, env);
  // Bestaetigung an den Kaeufer — nicht abgewartet: ob die Mail rausgeht, darf
  // die Webhook-Antwort an Stripe nicht verzoegern oder scheitern lassen.
  const empfaenger = String(session.customer_details?.email || session.customer_email || "").trim();
  if (empfaenger) {
    Promise.resolve(sendMail(bestaetigungsMail(session, empfaenger, event.livemode), env)).catch(() => {});
  }
  return { handled: true, action: "checkout_linked" };
}

// Kauf-Bestaetigung in Textform (§ 312f BGB verlangt eine Bestaetigung des
// Vertragsschlusses auf einem dauerhaften Datentraeger). Betrag aus der
// Checkout-Session; Planname ueber den Monatsbetrag (livemode-unabhaengig).
function bestaetigungsMail(session, empfaenger, livemode) {
  const cents = Number(session.amount_total || 0);
  const plan = PLAN_BY_MONTHLY_AMOUNT[cents] || null;
  const planName = PLAN_LABELS[plan] || "smejj.com Abo";
  const betrag = (cents / 100).toFixed(2).replace(".", ",");
  const testHinweis = livemode ? "" : "\n(Testmodus-Buchung — es wurde nichts abgebucht.)\n";
  return {
    to: empfaenger,
    subject: `Deine Bestätigung: ${planName} ist aktiv`,
    art: "abo-bestaetigung",
    text: `Danke für dein Vertrauen!

Dein Abo ${planName} (${betrag} € pro Monat inkl. USt.) ist jetzt aktiv.
${testHinweis}
Was jetzt gilt:
- Das Abo verlängert sich automatisch um jeweils einen Monat, bis du kündigst.
- Verwalten, Rechnungen einsehen, Plan wechseln oder kündigen kannst du
  jederzeit in der App unter Konto -> Abo & Zahlungen.
- Die Abrechnung übernimmt unser Zahlungsdienstleister Stripe; deine
  Kartendaten liegen ausschließlich dort.

Zur App: https://smejj.com

Dein smejj.com Team`
  };
}

async function applySubscriptionEvent(event, env) {
  const subscription = event?.data?.object || {};
  const customerId = String(subscription.customer || "");
  if (!isStripeCustomerId(customerId)) return { handled: false, action: "ignored_missing_customer" };

  const existing = (await getCustomerRecord(customerId, env)) || {};
  const eventCreated = Number(event?.created || 0);
  if (Number(existing.lastSubscriptionEventCreated || 0) > eventCreated) {
    return { handled: false, action: "ignored_stale_event" };
  }

  const item = Array.isArray(subscription.items?.data) ? subscription.items.data[0] : null;
  const status = event.type === "customer.subscription.deleted" ? "canceled" : String(subscription.status || "unknown");
  await putCustomerRecord(customerId, {
    ...existing,
    subscriptionId: subscription.id || existing.subscriptionId || null,
    plan: planFromStripeItem(item) || existing.plan || null,
    status,
    periodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : existing.periodEnd || null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    livemode: Boolean(event.livemode),
    lastSubscriptionEventCreated: eventCreated
  }, env);
  return { handled: true, action: "subscription_updated" };
}

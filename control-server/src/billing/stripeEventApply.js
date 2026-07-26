// smejj.com control-server — wendet verifizierte Stripe-Webhook-Events auf den
// Abo-Store an (Single Responsibility: Event -> Zustand; keine HTTP-Belange).
// Reihenfolge-tolerant: checkout.session.completed und customer.subscription.*
// duerfen in beliebiger Reihenfolge eintreffen, weil der Kunden-Datensatz und
// die Ref-Zuordnung getrennt gepflegt werden. Veraltete Subscription-Events
// (event.created aelter als der gespeicherte Stand) werden verworfen.
import {
  PLAN_BY_STRIPE_PRODUCT,
  getCustomerRecord,
  isCheckoutRef,
  isStripeCustomerId,
  putCustomerRecord,
  putRefRecord
} from "./subscriptionStore.js";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted"
]);

// Input: verifiziertes Stripe-Event (bereits geparst). Output:
// { handled: boolean, action: string } — unbekannte Events sind kein Fehler
// (Stripe erwartet 2xx), sie werden nur nicht angewendet.
export async function applyStripeEvent(event, env = process.env) {
  const type = String(event?.type || "");
  if (type === "checkout.session.completed") return applyCheckoutCompleted(event, env);
  if (SUBSCRIPTION_EVENTS.has(type)) return applySubscriptionEvent(event, env);
  return { handled: false, action: "ignored_event_type" };
}

async function applyCheckoutCompleted(event, env) {
  const session = event?.data?.object || {};
  if (session.mode !== "subscription") return { handled: false, action: "ignored_non_subscription_checkout" };
  const ref = String(session.client_reference_id || "");
  const customerId = String(session.customer || "");
  if (!isStripeCustomerId(customerId)) return { handled: false, action: "ignored_missing_customer" };
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
  return { handled: true, action: "checkout_linked" };
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
  const productId = String(item?.price?.product || "");
  const status = event.type === "customer.subscription.deleted" ? "canceled" : String(subscription.status || "unknown");
  await putCustomerRecord(customerId, {
    ...existing,
    subscriptionId: subscription.id || existing.subscriptionId || null,
    plan: PLAN_BY_STRIPE_PRODUCT[productId] || existing.plan || null,
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

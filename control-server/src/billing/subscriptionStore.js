// smejj.com control-server — Abo-Store (Single Responsibility: Ablage des Stripe-Abo-Zustands).
// Primaer IDrive e2 (Object Brain), Fallback In-Memory fuer lokale Entwicklung/Tests —
// gleiches Muster wie auth/emailUserStore.js.
// Ablageschema:
//   billing/refs/{checkoutRef}.json      -> { customerId, subscriptionId }  (checkoutRef = sha256(email))
//   billing/customers/{customerId}.json  -> { ref, plan, status, ... }
// Es werden keine Kartendaten und keine Klartext-E-Mails gespeichert.
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";

const memoryStore = new Map(); // key -> record (nur ohne IDrive-Konfiguration)

// Produkt -> Plan (Stripe-Testmodus, Capsule job_konto_glas_20260726 Schritt 3a).
export const PLAN_BY_STRIPE_PRODUCT = Object.freeze({
  prod_UxSGVIRDGNdHaI: "plus",
  prod_UxSItpgmwcvKRg: "pro",
  prod_UxSJBDqMn7QUTM: "max"
});

// Live- und Testmodus tragen VERSCHIEDENE Produkt-IDs (Befund 2026-08-13: die
// Zahlungslinks sind Live-Links, das Mapping oben kennt nur Testprodukte —
// eine echte Zahlung waere als plan null gespeichert und als "free" angezeigt
// worden). Der Monatsbetrag ist in beiden Modi gleich, darum entscheidet er
// als Rueckfallebene. Betraege in Cent, wie Stripe sie liefert.
export const PLAN_BY_MONTHLY_AMOUNT = Object.freeze({ 900: "plus", 1900: "pro", 3900: "max" });

// Ein Abo-Posten (subscription.items.data[0]) -> Planname oder null.
export function planFromStripeItem(item) {
  const productId = String(item?.price?.product || "");
  if (PLAN_BY_STRIPE_PRODUCT[productId]) return PLAN_BY_STRIPE_PRODUCT[productId];
  const amount = Number(item?.price?.unit_amount);
  return PLAN_BY_MONTHLY_AMOUNT[amount] || null;
}

// Ende der bezahlten Periode als ISO-Zeit (oder null). Stripe hat
// current_period_end mit der API-Fassung 2025-03-31 vom Abo auf den Abo-Posten
// verschoben; welche Fassung ein Konto sieht, haengt am Konto. Beide Orte
// lesen kostet nichts und ist der Unterschied zwischen "verlaengert sich am
// 13. September" und gar keinem Datum in der Anzeige.
export function periodEndeAus(subscription) {
  const posten = Array.isArray(subscription?.items?.data) ? subscription.items.data[0] : null;
  const sekunden = Number(subscription?.current_period_end || posten?.current_period_end || 0);
  return sekunden > 0 ? new Date(sekunden * 1000).toISOString() : null;
}

const PLAN_ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

export function isCheckoutRef(value) {
  return /^[0-9a-f]{64}$/.test(String(value || ""));
}

export function isStripeCustomerId(value) {
  return /^cus_[A-Za-z0-9]{1,64}$/.test(String(value || ""));
}

function refKey(ref) {
  if (!isCheckoutRef(ref)) throw new Error("billing_ref_invalid");
  return `billing/refs/${ref}.json`;
}

function customerKey(customerId) {
  if (!isStripeCustomerId(customerId)) throw new Error("billing_customer_id_invalid");
  return `billing/customers/${customerId}.json`;
}

async function readObject(key, env) {
  const cfg = idriveConfig(env);
  if (!cfg) return memoryStore.get(key) || null;
  try {
    const { body } = await signedS3Get({ ...cfg, key });
    return JSON.parse(body);
  } catch (error) {
    if (/40[34]|NoSuchKey|not found/i.test(String(error?.message || error))) return null;
    throw error; // fail-closed: Storage-Stoerung nicht als "kein Abo" werten
  }
}

async function writeObject(key, record, env) {
  record.updatedAt = new Date().toISOString();
  const cfg = idriveConfig(env);
  if (!cfg) { memoryStore.set(key, record); return record; }
  await signedS3Put({
    ...cfg,
    key,
    body: JSON.stringify(record, null, 2),
    contentType: "application/json; charset=utf-8"
  });
  return record;
}

export async function getRefRecord(ref, env = process.env) {
  return readObject(refKey(ref), env);
}

export async function putRefRecord(ref, record, env = process.env) {
  return writeObject(refKey(ref), { ...record, ref }, env);
}

export async function getCustomerRecord(customerId, env = process.env) {
  return readObject(customerKey(customerId), env);
}

export async function putCustomerRecord(customerId, record, env = process.env) {
  return writeObject(customerKey(customerId), { ...record, customerId }, env);
}

// Aufloesung fuer den Status-Endpunkt: checkoutRef -> Kunde -> Planstatus.
// Liefert immer ein vollstaendiges, anzeigefertiges Objekt (plan "free", wenn
// kein aktives Abo). Storage-Fehler werfen (Aufrufer antwortet fail-closed 503).
export async function resolveSubscriptionStatus(ref, env = process.env) {
  const refRecord = await getRefRecord(ref, env);
  const customerId = refRecord?.customerId;
  const customer = customerId && isStripeCustomerId(customerId)
    ? await getCustomerRecord(customerId, env)
    : null;
  const plan = customer && PLAN_ACTIVE_STATUSES.has(customer.status) ? customer.plan || "free" : "free";
  return {
    plan,
    status: customer?.status || "none",
    subscriptionId: customer?.subscriptionId || null,
    periodEnd: customer?.periodEnd || null,
    cancelAtPeriodEnd: Boolean(customer?.cancelAtPeriodEnd),
    livemode: Boolean(customer?.livemode)
  };
}

export function __clearBillingMemoryStoreForTests() {
  memoryStore.clear();
}

// smejj.com — Abschluss Schritt 3b (Abo-Webhook) in EINEM Lauf, Betreiber-gestartet.
//
// Voraussetzung: einmalig `stripe login` (Geraete-Pairing im Browser bestaetigen).
// Der Stripe-Schluessel wird aus ~/.config/stripe/config.toml gelesen und NUR
// innerhalb dieses Prozesses verwendet — er wird niemals ausgegeben. Auch das
// Webhook-Signatur-Secret (whsec_...) fliesst direkt Stripe -> Salad-Env und
// erscheint nirgends im Log (Muster: upload_control_release_to_idrive.mjs).
//
// Ablauf (idempotent, fail-closed, bricht bei jedem Fehler ab):
//   1. Release-Artefakt nach IDrive e2 hochladen (deployments/control/..., immutable)
//   2. Stripe-Webhook-Endpunkt fuer den Control-Server anlegen (alten gleicher URL ersetzen)
//   3. Salad smejj-control: ARTIFACT_KEY + SHA256 + STRIPE_WEBHOOK_SECRET in einem
//      einzigen Update setzen (ein Neustart, kein Zwischenzustand)
//   4. Warten bis /api/health ok UND der Webhook unsignierte POSTs mit 400 ablehnt
//      (400 = Secret aktiv; 503 waere "nicht konfiguriert")
//   5. E2E-Probe: synthetisches, korrekt SIGNIERTES Eventpaar (Checkout+Abo) an den
//      Live-Webhook senden und die Ablage auf IDrive e2 verifizieren (Testkunde
//      cus_smejjE2Eprobe0001, kollidiert mit keinem echten Nutzer)
//
// Start:  CONFIRM_BILLING_3B=YES node scripts/deploy/complete_billing_3b.mjs
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { uploadControlRelease } from "./upload_control_release_to_idrive.mjs";
import { signedS3Get } from "../../control-server/src/storage/s3Signer.js";

const CONTROL_ORIGIN = "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud";
const WEBHOOK_URL = `${CONTROL_ORIGIN}/api/billing/stripe/webhook`;
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted"
];
const SALAD_GROUP = "smejj-control";
const ARTIFACT_FILE = process.env.SMEJJ_CONTROL_RELEASE_FILE
  || "/private/tmp/claude-501/-Users-alanbest-Library-CloudStorage-GoogleDrive-smejjcom-gmail-com--shortcut-targets-by-id-1FZNCd1vuQbdTkRgF0Vtz8htM8e5JhPbY---smejj-com-info-smejj-com-App/0b89e0fe-ff28-458f-947f-ce775f3463a2/scratchpad/smejj-control-abo-3b-20260726.tar.gz";
const ARTIFACT_KEY = "deployments/control/smejj-control-abo-3b-20260726.tar.gz";
const ARTIFACT_SHA256 = "1cadbcb6072a62c8fd0ea2f9cbed4047c24ade1b26c20c485bd123511e89b167";
const E2E_CUSTOMER = "cus_smejjE2Eprobe0001";
const E2E_REF = crypto.createHash("sha256").update("e2e-probe@smejj.internal").digest("hex");

function fail(message) { console.error(`FEHLER: ${message}`); process.exit(1); }

function readStripeKey() {
  const configPath = path.join(os.homedir(), ".config", "stripe", "config.toml");
  let raw = "";
  try { raw = readFileSync(configPath, "utf8"); } catch {
    fail("Stripe CLI nicht angemeldet. Bitte zuerst ausfuehren: stripe login (Bestaetigung im Browser).");
  }
  // Testmodus-Schluessel bevorzugen; naive TOML-Suche reicht fuer die CLI-Datei.
  const match = raw.match(/test_mode_api_key\s*=\s*["']([^"']+)["']/) || raw.match(/api_key\s*=\s*["']([^"']+)["']/);
  if (!match) fail("Kein Test-API-Schluessel in der Stripe-CLI-Konfiguration gefunden. Bitte `stripe login` erneut ausfuehren.");
  return match[1];
}

async function stripeApi(key, method, apiPath, form) {
  const response = await fetch(`https://api.stripe.com${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: form ? new URLSearchParams(form).toString() : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(`Stripe API ${method} ${apiPath} -> ${response.status}: ${data?.error?.message || "unbekannt"}`);
  return data;
}

async function saladApi(method, apiPath, body) {
  const key = process.env.SALAD_API_KEY;
  const response = await fetch(`https://api.salad.com/api/public${apiPath}`, {
    method,
    headers: {
      "Salad-Api-Key": key,
      ...(body ? { "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) fail(`Salad API ${method} ${apiPath} -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.status === 204 ? {} : response.json();
}

function signStripePayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

async function postWebhook(rawBody, signatureHeader) {
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(signatureHeader ? { "Stripe-Signature": signatureHeader } : {}) },
    body: rawBody
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function main() {
  if (process.env.CONFIRM_BILLING_3B !== "YES") {
    fail("Sicherung: CONFIRM_BILLING_3B=YES erforderlich (schriftliche Betreiber-Freigabe fuer diesen Lauf).");
  }
  loadSecureLocalEnv();
  if (!process.env.SALAD_API_KEY || !process.env.SALAD_ORGANIZATION_NAME || !process.env.SALAD_PROJECT_NAME) {
    fail("Salad-Zugaenge fehlen in ~/.config/smejj.com/env.local");
  }
  const org = process.env.SALAD_ORGANIZATION_NAME;
  const project = process.env.SALAD_PROJECT_NAME;
  const stripeKey = readStripeKey();
  if (!/^rk_test_|^sk_test_/.test(stripeKey)) {
    fail("Der Stripe-CLI-Schluessel ist KEIN Testmodus-Schluessel — Abbruch (Livemodus wird hier nie angefasst).");
  }

  // 1) Artefakt hochladen (immutable; identischer Re-Run gilt als Erfolg)
  console.log("1/5 Artefakt-Upload nach IDrive e2 ...");
  try {
    const upload = await uploadControlRelease({
      filePath: ARTIFACT_FILE,
      key: ARTIFACT_KEY,
      expectedSha256: ARTIFACT_SHA256,
      config: {
        endpoint: process.env.IDRIVE_E2_ENDPOINT,
        region: process.env.IDRIVE_E2_REGION || "us-west-2",
        accessKey: process.env.IDRIVE_E2_ACCESS_KEY,
        secretKey: process.env.IDRIVE_E2_SECRET_KEY,
        bucket: "smejj-model-files"
      }
    });
    console.log(`   ok — ${upload.bytes} Bytes, sha ${upload.sha256.slice(0, 12)}…`);
  } catch (error) {
    if (/412|PreconditionFailed|precondition/i.test(String(error?.message || error))) {
      console.log("   Artefakt liegt bereits (immutable) — ok.");
    } else { throw error; }
  }

  // 2) Webhook-Endpunkt anlegen (bestehenden mit gleicher URL ersetzen -> frisches Secret)
  console.log("2/5 Stripe-Webhook-Endpunkt ...");
  const existing = await stripeApi(stripeKey, "GET", "/v1/webhook_endpoints?limit=100");
  for (const endpoint of existing.data || []) {
    if (endpoint.url === WEBHOOK_URL) {
      await stripeApi(stripeKey, "DELETE", `/v1/webhook_endpoints/${endpoint.id}`);
      console.log(`   alter Endpunkt ${endpoint.id} ersetzt`);
    }
  }
  const createForm = { url: WEBHOOK_URL, description: "smejj.com Abo-Status (Schritt 3b, Testmodus)" };
  WEBHOOK_EVENTS.forEach((event, index) => { createForm[`enabled_events[${index}]`] = event; });
  const endpoint = await stripeApi(stripeKey, "POST", "/v1/webhook_endpoints", createForm);
  const webhookSecret = endpoint.secret;
  if (!webhookSecret || !webhookSecret.startsWith("whsec_")) fail("Stripe lieferte kein Webhook-Secret.");
  console.log(`   ok — ${endpoint.id} (${endpoint.status}), Events: ${WEBHOOK_EVENTS.length}`);

  // 3) Salad-Env in EINEM Update: Artefakt + Secret (ein Neustart)
  console.log("3/5 Salad smejj-control aktualisieren (ein Neustart) ...");
  const group = await saladApi("GET", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`);
  const mergedEnv = {
    ...(group?.container?.environment_variables || {}),
    SMEJJ_CONTROL_ARTIFACT_KEY: ARTIFACT_KEY,
    SMEJJ_CONTROL_ARTIFACT_SHA256: ARTIFACT_SHA256,
    STRIPE_WEBHOOK_SECRET: webhookSecret
  };
  await saladApi("PATCH", `/organizations/${org}/projects/${project}/containers/${SALAD_GROUP}`, {
    container: { environment_variables: mergedEnv }
  });
  console.log("   ok — Env gesetzt, Rollout laeuft");

  // 4) Warten: health ok UND Webhook lehnt unsignierte POSTs mit 400 ab
  console.log("4/5 Warten auf neuen Stand (bis ~10 Min) ...");
  const deadline = Date.now() + 10 * 60 * 1000;
  let live = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    try {
      const health = await fetch(`${CONTROL_ORIGIN}/api/health`, { signal: AbortSignal.timeout(10000) });
      if (!health.ok) continue;
      const probe = await postWebhook(JSON.stringify({ probe: true }), "");
      process.stdout.write(`   health ok, webhook ${probe.status}\n`);
      if (probe.status === 400) { live = true; break; } // 503 = Secret noch nicht aktiv
    } catch { /* Neustartphase */ }
  }
  if (!live) fail("Neuer Stand nicht bestaetigt (Webhook antwortet nicht mit 400). Salad-Logs pruefen.");

  // 5) E2E-Probe mit korrekt signierten synthetischen Events
  console.log("5/5 E2E-Probe (signierte Events, Testkunde) ...");
  const checkoutEvent = JSON.stringify({
    id: "evt_smejj_e2e_checkout", type: "checkout.session.completed", created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { mode: "subscription", client_reference_id: E2E_REF, customer: E2E_CUSTOMER, subscription: "sub_smejjE2Eprobe" } }
  });
  const first = await postWebhook(checkoutEvent, signStripePayload(checkoutEvent, webhookSecret));
  if (first.status !== 200 || first.body.action !== "checkout_linked") fail(`E2E Checkout-Event: ${first.status} ${JSON.stringify(first.body)}`);
  const subscriptionEvent = JSON.stringify({
    id: "evt_smejj_e2e_sub", type: "customer.subscription.updated", created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { id: "sub_smejjE2Eprobe", customer: E2E_CUSTOMER, status: "active", cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      items: { data: [{ price: { product: "prod_UxSGVIRDGNdHaI" } }] } } }
  });
  const second = await postWebhook(subscriptionEvent, signStripePayload(subscriptionEvent, webhookSecret));
  if (second.status !== 200 || second.body.action !== "subscription_updated") fail(`E2E Abo-Event: ${second.status} ${JSON.stringify(second.body)}`);

  // Ablage direkt auf IDrive e2 verifizieren (Bucket des Servers aus der Salad-Env)
  const serverBucket = mergedEnv.IDRIVE_E2_BUCKET;
  const stored = await signedS3Get({
    endpoint: process.env.IDRIVE_E2_ENDPOINT, region: process.env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: process.env.IDRIVE_E2_ACCESS_KEY, secretKey: process.env.IDRIVE_E2_SECRET_KEY,
    bucket: serverBucket, key: `billing/customers/${E2E_CUSTOMER}.json`
  });
  const record = JSON.parse(stored.body);
  if (record.plan !== "plus" || record.status !== "active") fail(`E2E Ablage unerwartet: ${JSON.stringify({ plan: record.plan, status: record.status })}`);
  console.log("   ok — Webhook verifiziert Signatur, verarbeitet Events, speichert auf IDrive e2.");
  console.log("\nFERTIG: Schritt 3b ist live (Testmodus). Naechster Schritt: Frontend-Deploy + Konto-Anzeige testen.");
}

await main();

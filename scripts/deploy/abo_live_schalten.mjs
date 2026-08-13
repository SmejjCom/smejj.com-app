#!/usr/bin/env node
// smejj.com — Abo-Zahlungen LIVE verdrahten, in EINEM Betreiber-Lauf.
//
// Befund 2026-08-13: Ein Kunde hat ein echtes Abo bezahlt, aber der Live-Server
// kannte keine einzige Zahlung. Drei Wurzeln, alle hier behoben:
//   1. STRIPE_WEBHOOK_SECRET fehlt auf smejj-control (Zeabur) — der Webhook
//      antwortete 503 und verarbeitete NICHTS.
//   2. Der Webhook-Endpunkt bei Stripe (falls vorhanden) zeigt auf den alten
//      Salad-Server bzw. den Testmodus.
//   3. Bereits geleistete Zahlungen kommen per Webhook nie nach — sie muessen
//      einmalig aus Stripe in den Abo-Store uebertragen werden (Backfill).
//
// Voraussetzung: einmalig `stripe login` (Geraete-Pairing im Browser). Der
// Schluessel wird aus ~/.config/stripe/config.toml gelesen und NIEMALS
// ausgegeben — Geheimwerte wandern ausschliesslich per Zwischenablage (pbcopy)
// zum Einfuegen in Zeabur.
//
// Ablauf (idempotent, fail-closed):
//   1. Live-Schluessel pruefen
//   2. Stripe-Webhook-Endpunkt fuer https://smejj-control.zeabur.app anlegen
//      (bestehende Endpunkte mit gleicher URL ersetzen -> frisches Secret)
//   3. Zahlungslinks: nach der Zahlung zu https://smejj.com/danke-abo.html
//      zuruueckleiten (Bestaetigungsseite statt Stripe-Standardseite)
//   4. Backfill: alle Live-Abos aus Stripe in den Abo-Store (IDrive e2)
//   5. Kontrolle am Live-Server (/api/admin/geld/abos)
//   6. Zwischenablage-Schritte: STRIPE_WEBHOOK_SECRET und STRIPE_SECRET_KEY in
//      Zeabur (Service smejj-control -> Variables) einfuegen; danach misst das
//      Skript, bis der Webhook unsignierte POSTs mit 400 ablehnt (= Secret aktiv).
//
// Start:  CONFIRM_ABO_LIVE=YES node scripts/deploy/abo_live_schalten.mjs
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { planFromStripeItem, putCustomerRecord, putRefRecord } from "../../control-server/src/billing/subscriptionStore.js";
import { emailKey, normalizeEmail } from "../../control-server/src/auth/emailUserStore.js";

const CONTROL_ORIGIN = "https://smejj-control.zeabur.app";
const WEBHOOK_URL = `${CONTROL_ORIGIN}/api/billing/stripe/webhook`;
const DANKE_URL = "https://smejj.com/danke-abo.html";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted"
];
// Muss zu public/account-privacy.js STRIPE_PLAN_LINKS passen.
const PLAN_LINK_URLS = new Set([
  "https://buy.stripe.com/5kQaEZ2Cic9C5egbiIfIs00",
  "https://buy.stripe.com/28E6oJ2Ci4HabCE72sfIs01",
  "https://buy.stripe.com/14AdRb7WC5Le6ik2McfIs02"
]);

function fail(message) { console.error(`FEHLER: ${message}`); process.exit(1); }

function fingerabdruck(wert) {
  if (!wert) return "(leer)";
  return `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`;
}

function readStripeLiveKey() {
  const configPath = path.join(os.homedir(), ".config", "stripe", "config.toml");
  let raw = "";
  try { raw = readFileSync(configPath, "utf8"); } catch {
    fail("Stripe CLI nicht angemeldet. Bitte zuerst im Terminal ausfuehren: stripe login  (Bestaetigung im Browser), dann dieses Skript erneut starten.");
  }
  const kandidaten = [];
  for (const muster of [/live_mode_api_key\s*=\s*["']([^"']+)["']/g, /api_key\s*=\s*["']([^"']+)["']/g]) {
    for (const treffer of raw.matchAll(muster)) kandidaten.push(treffer[1]);
  }
  const live = kandidaten.find((k) => /^(sk|rk)_live_/.test(k));
  if (!live) fail("Kein LIVE-Schluessel in der Stripe-CLI-Konfiguration. Bitte `stripe login` (nicht im Testmodus) ausfuehren.");
  return live;
}

async function stripeApi(key, method, apiPath, form) {
  const response = await fetch(`https://api.stripe.com${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(`Stripe API ${method} ${apiPath} -> ${response.status}: ${data?.error?.message || "unbekannt"}`);
  return data;
}

function inZwischenablage(wert) {
  execFileSync("pbcopy", [], { input: wert });
}

function frage(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((weiter) => rl.question(text, (antwort) => { rl.close(); weiter(antwort); }));
}

async function webhookProbe() {
  try {
    const antwort = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15_000)
    });
    return antwort.status;
  } catch { return 0; }
}

async function main() {
  if (process.env.CONFIRM_ABO_LIVE !== "YES") {
    fail("Sicherung: CONFIRM_ABO_LIVE=YES erforderlich (Betreiber-Start, kein Automatik-Lauf).");
  }
  loadSecureLocalEnv();
  for (const name of ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"]) {
    if (!process.env[name]) fail(`${name} fehlt in ~/.config/smejj.com/env.local — Backfill braucht den Abo-Store.`);
  }
  const stripeKey = readStripeLiveKey();
  console.log(`1/6 Live-Schluessel gefunden (${fingerabdruck(stripeKey)}).`);

  // 2) Webhook-Endpunkt: gleiche URL ersetzen -> frisches, bekanntes Secret
  console.log("2/6 Stripe-Webhook-Endpunkt fuer den Zeabur-Server ...");
  const vorhandene = await stripeApi(stripeKey, "GET", "/v1/webhook_endpoints?limit=100");
  for (const endpunkt of vorhandene.data || []) {
    if (endpunkt.url === WEBHOOK_URL) {
      await stripeApi(stripeKey, "DELETE", `/v1/webhook_endpoints/${endpunkt.id}`);
      console.log(`   alten Endpunkt ${endpunkt.id} ersetzt.`);
    } else {
      console.log(`   Hinweis: weiterer Endpunkt bleibt unangetastet: ${endpunkt.url}`);
    }
  }
  const form = { url: WEBHOOK_URL, description: "smejj-control (Zeabur) Abo-Webhook" };
  WEBHOOK_EVENTS.forEach((ereignis, i) => { form[`enabled_events[${i}]`] = ereignis; });
  const webhook = await stripeApi(stripeKey, "POST", "/v1/webhook_endpoints", form);
  const webhookSecret = String(webhook.secret || "");
  if (!webhookSecret.startsWith("whsec_")) fail("Stripe lieferte kein Webhook-Secret zurueck.");
  console.log(`   ok — Endpunkt ${webhook.id} zeigt auf ${WEBHOOK_URL}`);

  // 3) Zahlungslinks: Ruecksprung auf die Bestaetigungsseite
  console.log("3/6 Zahlungslinks auf die Dankeseite umleiten ...");
  const links = await stripeApi(stripeKey, "GET", "/v1/payment_links?limit=100");
  let umgeleitet = 0;
  for (const link of links.data || []) {
    if (!PLAN_LINK_URLS.has(link.url)) continue;
    await stripeApi(stripeKey, "POST", `/v1/payment_links/${link.id}`, {
      "after_completion[type]": "redirect",
      "after_completion[redirect][url]": DANKE_URL
    });
    umgeleitet += 1;
  }
  console.log(`   ok — ${umgeleitet} von ${PLAN_LINK_URLS.size} Links leiten jetzt auf ${DANKE_URL}`);
  if (umgeleitet < PLAN_LINK_URLS.size) {
    console.log("   ACHTUNG: nicht alle drei Plan-Links gefunden — bitte im Stripe-Dashboard pruefen.");
  }

  // 4) Backfill: bereits geleistete Zahlungen in den Abo-Store
  console.log("4/6 Backfill bestehender Live-Abos in den Abo-Store ...");
  const abos = await stripeApi(stripeKey, "GET", "/v1/subscriptions?status=all&limit=100&expand[]=data.customer");
  const jetztSekunden = Math.floor(Date.now() / 1000);
  let uebertragen = 0;
  for (const abo of abos.data || []) {
    const kunde = abo.customer && typeof abo.customer === "object" ? abo.customer : null;
    const email = normalizeEmail(kunde?.email || "");
    const kundenId = String(kunde?.id || abo.customer || "");
    if (!email || !kundenId.startsWith("cus_")) {
      console.log(`   uebersprungen (keine E-Mail am Kunden): ${kundenId || "unbekannt"}`);
      continue;
    }
    const ref = emailKey(email);
    const posten = Array.isArray(abo.items?.data) ? abo.items.data[0] : null;
    await putRefRecord(ref, { customerId: kundenId, subscriptionId: abo.id, livemode: true }, process.env);
    await putCustomerRecord(kundenId, {
      ref,
      subscriptionId: abo.id,
      plan: planFromStripeItem(posten),
      status: String(abo.status || "unknown"),
      periodEnd: abo.current_period_end ? new Date(abo.current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: Boolean(abo.cancel_at_period_end),
      livemode: true,
      lastSubscriptionEventCreated: jetztSekunden
    }, process.env);
    uebertragen += 1;
    console.log(`   uebertragen: ${kundenId} (${String(abo.status)}, Plan ${planFromStripeItem(posten) || "unbekannt"})`);
  }
  console.log(`   ok — ${uebertragen} Abo(s) uebertragen.`);

  // 5) Kontrolle am Live-Server (rein lesend)
  console.log("5/6 Kontrolle am Live-Server ...");
  try {
    const token = execFileSync("node", ["scripts/verlauf/mint-eval-token.mjs"], { encoding: "utf8" }).trim();
    const kontrolle = await fetch(`${CONTROL_ORIGIN}/api/admin/geld/abos`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000)
    }).then((r) => r.json());
    console.log(`   Live-Server sieht jetzt: total=${kontrolle.total} zahlend=${kontrolle.zahlend}`);
    if (uebertragen > 0 && Number(kontrolle.total) === 0) {
      console.log("   ACHTUNG: Backfill geschrieben, aber der Server sieht nichts — vermutlich anderer IDRIVE_E2_BUCKET. Bitte melden.");
    }
  } catch {
    console.log("   (Kontrolle uebersprungen — Token-Minten nicht moeglich; kein Fehler fuer den Lauf.)");
  }

  // 6) Secrets nach Zeabur — nur per Zwischenablage, nie im Log
  console.log("6/6 Zwei Werte in Zeabur eintragen (Service smejj-control -> Variables):");
  inZwischenablage(webhookSecret);
  await frage(`   a) STRIPE_WEBHOOK_SECRET liegt in der Zwischenablage (${fingerabdruck(webhookSecret)}).\n      In Zeabur als Variable STRIPE_WEBHOOK_SECRET einfuegen, speichern — dann hier Enter druecken ...`);
  inZwischenablage(stripeKey);
  await frage(`   b) STRIPE_SECRET_KEY liegt jetzt in der Zwischenablage (${fingerabdruck(stripeKey)}).\n      In Zeabur als Variable STRIPE_SECRET_KEY einfuegen, speichern — dann hier Enter druecken ...`);
  inZwischenablage("");

  console.log("   Warte auf den Neustart des Servers (misst, bis der Webhook 400 statt 503 antwortet) ...");
  const start = Date.now();
  let status = 0;
  while (Date.now() - start < 10 * 60 * 1000) {
    status = await webhookProbe();
    if (status === 400) break;
    await new Promise((weiter) => setTimeout(weiter, 15_000));
  }
  if (status === 400) {
    console.log("FERTIG: Webhook aktiv (400 fuer unsignierte POSTs = Signaturpruefung an). Abo-Zahlungen sind jetzt live verdrahtet.");
  } else {
    console.log(`OFFEN: Webhook antwortet noch ${status || "gar nicht"} — Zeabur-Neustart abwarten oder Variablen pruefen, dann erneut messen.`);
  }
}

main().catch((fehler) => fail(String(fehler?.message || fehler)));

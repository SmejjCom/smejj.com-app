// smejj.com — Guthaben und Ereignisprotokoll der oeffentlichen API.
//
// Bauart wie bei OpenAI und Anthropic: PREPAID. Der Kunde laedt Guthaben auf,
// jede Anfrage bucht ihre Kosten ab, bei 0 antwortet die API mit 402. Kein
// Kunde kann uns so eine offene Rechnung hinterlassen, und wir brauchen
// weder Mahnwesen noch Bonitaetspruefung.
//
// Zwei Objektarten auf IDrive e2 (Hauptspeicher, siehe Master-Prompt):
//   api-billing/konten/<kontoId>.json          Guthaben + Summen (klein, oft gelesen)
//   api-billing/ereignisse/<kontoId>/<tag>/<anfrageId>.json   EIN Objekt je Anfrage
//   api-billing/aufladungen/<stripeSessionId>.json   Idempotenz: jede Zahlung zaehlt EINMAL
//
// Das Ereignisprotokoll ist die Buchhaltung. Der Tageszaehler in
// publicApiUsage.js (Aggregat, 30-s-Sicherung) ist nur eine Anzeige — fuer
// Geld reicht er nicht, weil ein Neustart Zaehlung verliert. Hier wird jede
// Anfrage einzeln und sofort geschrieben.
//
// Bekannte Grenze: Das Konto-Objekt wird gelesen, geaendert, geschrieben.
// Zwei Instanzen koennten sich eine Abbuchung ueberschreiben. Solange eine
// Instanz laeuft, ist das exakt; bei mehreren wird aus dem Ereignisprotokoll
// nachgerechnet (scripts/diagnose/api-abrechnung-nachrechnen.mjs, offen).
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";
import { kostenMikro, usdZuMikro } from "./publicApiPreise.js";

const memoryStore = new Map();
const STARTGUTHABEN_USD_VOREINSTELLUNG = 1; // damit die erste Anfrage nicht an 0 scheitert

// ---- Konto -------------------------------------------------------------------

export async function leseKonto(kontoId, env = process.env) {
  const id = sichereKontoId(kontoId);
  if (!id) throw new Error("api_billing_konto_invalid");
  const gespeichert = await lies(`api-billing/konten/${id}.json`, env);
  if (gespeichert) return gespeichert;
  // Neues Konto: Startguthaben einmalig gutschreiben und SOFORT festhalten —
  // sonst bekaeme jeder Neustart-Lauf das Startguthaben erneut.
  const konto = {
    kontoId: id,
    guthabenMikro: usdZuMikro(startguthabenUsd(env)),
    aufgeladenMikro: 0,
    verbrauchtMikro: 0,
    anfragen: 0,
    angelegtAm: new Date().toISOString()
  };
  await schreibe(`api-billing/konten/${id}.json`, konto, env);
  return konto;
}

/** Darf diese Anfrage starten? Guthaben > 0 reicht — die Kosten kennt man erst danach. */
export async function darfAnfragen(kontoId, env = process.env) {
  const konto = await leseKonto(kontoId, env);
  return { ok: konto.guthabenMikro > 0, guthabenMikro: konto.guthabenMikro };
}

/**
 * Bucht eine beantwortete Anfrage: Ereignis schreiben, Konto belasten.
 * Wirft nie nach aussen — die Antwort ist zu diesem Zeitpunkt beim Kunden.
 * Ein Schreibfehler landet im Log und im Rueckgabewert, nicht beim Kunden.
 */
export async function bucheAnfrage(kontoId, {
  anfrageId, keyId = "", modell, promptTokens = 0, completionTokens = 0, gemessen = true, env = process.env, jetzt = () => new Date()
} = {}) {
  const id = sichereKontoId(kontoId);
  if (!id) return { ok: false, grund: "api_billing_konto_invalid" };
  const kosten = kostenMikro(modell, promptTokens, completionTokens);
  const zeit = jetzt();
  const ereignis = {
    anfrageId: String(anfrageId || "").slice(0, 64),
    kontoId: id,
    keyId: String(keyId || "").slice(0, 40),
    modell: String(modell || "").slice(0, 40),
    promptTokens: Math.max(0, Math.floor(Number(promptTokens) || 0)),
    completionTokens: Math.max(0, Math.floor(Number(completionTokens) || 0)),
    gemessen: gemessen === true,
    kostenMikro: kosten,
    zeitpunkt: zeit.toISOString()
  };
  try {
    const tag = zeit.toISOString().slice(0, 10);
    await schreibe(`api-billing/ereignisse/${id}/${tag}/${ereignis.anfrageId || zeit.getTime()}.json`, ereignis, env);
    const konto = await leseKonto(id, env);
    konto.guthabenMikro -= kosten; // darf unter 0 fallen: die letzte Anfrage war schon unterwegs
    konto.verbrauchtMikro += kosten;
    konto.anfragen += 1;
    konto.zuletztAm = ereignis.zeitpunkt;
    await schreibe(`api-billing/konten/${id}.json`, konto, env);
    return { ok: true, kostenMikro: kosten, guthabenMikro: konto.guthabenMikro };
  } catch (error) {
    console.error(`[public-api] Buchung fehlgeschlagen (${id}, ${ereignis.anfrageId}):`, String(error?.message || error).slice(0, 200));
    return { ok: false, grund: "api_billing_write_failed", kostenMikro: kosten };
  }
}

// ---- Aufladen (Stripe Checkout, Einmalzahlung) --------------------------------

export const AUFLADE_BETRAEGE_USD = Object.freeze([10, 25, 50, 100]);

/**
 * Erzeugt eine Stripe-Checkout-Sitzung fuer eine Einmalzahlung. Kein Produkt
 * im Stripe-Dashboard noetig: price_data beschreibt den Posten inline.
 * Die Zuordnung zum Konto reist in metadata — das Webhook-Ereignis traegt sie
 * zurueck, darum braucht es weder client_reference_id noch E-Mail-Abgleich.
 */
export async function erzeugeAufladung(kontoId, betragUsd, { env = process.env, fetchImpl = fetch, email = "" } = {}) {
  const id = sichereKontoId(kontoId);
  if (!id) throw fehler(400, "api_billing_konto_invalid");
  if (!AUFLADE_BETRAEGE_USD.includes(Number(betragUsd))) throw fehler(400, "api_billing_betrag_invalid");
  const schluessel = String(env.STRIPE_SECRET_KEY || "");
  if (!schluessel) throw fehler(503, "billing_not_configured");
  const origin = String(env.SMEJJ_APP_ORIGIN || "https://smejj.com").replace(/\/+$/, "");
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(Number(betragUsd) * 100),
    "line_items[0][price_data][product_data][name]": `smejj.com API-Guthaben ${Number(betragUsd)} USD`,
    "metadata[zweck]": "api-guthaben",
    "metadata[kontoId]": id,
    "metadata[betragUsd]": String(Number(betragUsd)),
    success_url: `${origin}/entwickler.html?aufgeladen=1`,
    cancel_url: `${origin}/entwickler.html?aufgeladen=0`,
    ...(email ? { customer_email: email } : {})
  });
  const antwort = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${schluessel}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000)
  });
  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok || !daten.url) throw fehler(502, "billing_checkout_failed");
  return { url: daten.url, sessionId: String(daten.id || "") };
}

/**
 * Webhook-Seite: checkout.session.completed mit metadata.zweck=api-guthaben.
 * Idempotent ueber die Session-ID — Stripe stellt Ereignisse mehrfach zu.
 * Gutgeschrieben wird amount_total (was wirklich bezahlt wurde), nicht der
 * angefragte Betrag.
 */
export async function verbucheAufladung(session, env = process.env) {
  const sessionId = String(session?.id || "");
  const kontoId = sichereKontoId(session?.metadata?.kontoId);
  if (!/^cs_[A-Za-z0-9_]{8,}$/.test(sessionId) || !kontoId) return { handled: false, action: "ignored_invalid_topup" };
  if (String(session.payment_status || "") !== "paid") return { handled: false, action: "ignored_unpaid_topup" };
  const marke = `api-billing/aufladungen/${sessionId}.json`;
  if (await lies(marke, env)) return { handled: true, action: "topup_already_applied" };
  const cents = Math.max(0, Math.floor(Number(session.amount_total || 0)));
  const mikro = cents * 10_000; // Cent -> Mikro-USD
  const konto = await leseKonto(kontoId, env);
  konto.guthabenMikro += mikro;
  konto.aufgeladenMikro += mikro;
  konto.zuletztAufgeladenAm = new Date().toISOString();
  await schreibe(`api-billing/konten/${kontoId}.json`, konto, env);
  await schreibe(marke, { sessionId, kontoId, cents, livemode: Boolean(session.livemode), verbuchtAm: konto.zuletztAufgeladenAm }, env);
  return { handled: true, action: "topup_applied", kontoId, cents };
}

export function __leereLedgerSpeicher() {
  memoryStore.clear();
}

// ---- Speicher ----------------------------------------------------------------

async function lies(key, env) {
  const cfg = idriveConfig(env);
  if (!cfg) return memoryStore.get(key) || null;
  const ergebnis = await signedS3Get({ ...cfg, key, allowNotFound: true });
  if (!ergebnis.ok && ergebnis.status === 404) return null;
  if (!ergebnis.ok) throw new Error(`api_billing_read_failed_${ergebnis.status}`);
  return JSON.parse(ergebnis.body);
}

async function schreibe(key, record, env) {
  record.aktualisiertAm = new Date().toISOString();
  const cfg = idriveConfig(env);
  if (!cfg) { memoryStore.set(key, record); return record; }
  await signedS3Put({ ...cfg, key, body: `${JSON.stringify(record)}\n`, contentType: "application/json; charset=utf-8" });
  return record;
}

function idriveConfig(env) {
  const { IDRIVE_E2_ENDPOINT: endpoint, IDRIVE_E2_ACCESS_KEY: accessKey, IDRIVE_E2_SECRET_KEY: secretKey, IDRIVE_E2_BUCKET: bucket } = env;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function startguthabenUsd(env) {
  const wert = Number(env.SMEJJ_PUBLIC_API_STARTGUTHABEN_USD);
  return Number.isFinite(wert) && wert >= 0 ? wert : STARTGUTHABEN_USD_VOREINSTELLUNG;
}

function sichereKontoId(wert) {
  const text = String(wert || "").trim();
  return /^user_[a-f0-9]{8}$/.test(text) ? text : "";
}

function fehler(status, code) {
  const e = new Error(code);
  e.status = status;
  return e;
}

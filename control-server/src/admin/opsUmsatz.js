// smejj.com — Modul E, Teil 2: "Abos & Umsatz" (Design-Vorschlag "Adminbereich",
// Seite "Was hereinkommt, was rausgeht, und wo Konten abspringen", 2026-08-23).
//
// Vier Zahlen oben — und jede sagt, woher sie kommt:
//   1. Monatlich wiederkehrend: bei Stripe GEMESSEN (aktive Abos, Betrag je
//      Monat). Ist Stripe nicht erreichbar, steht "geschaetzt aus Planpreisen"
//      daneben — nie eine glatte Zahl ohne Herkunft.
//   2. Aufladungen: echte Stripe-Zahlungen der oeffentlichen API (Modul G).
//   3. Kosten Betrieb: feste Positionen aus der Kostenpolitik (Zitat) plus
//      Modellkosten aus dem Token-Messer — die zaehlen SEIT DEM NEUSTART.
//   4. Bleibt uebrig: nur, was sich aus 1-3 ehrlich rechnen laesst; die
//      Modellkosten sind nicht auf den Monat hochgerechnet, das steht dran.
//
// Was hier NICHT erfunden wird: Punkte je Plan, Marge je Plan, Absprung-
// gruende. Das wird nicht erfasst — und steht als Luecke auf der Seite.
import { abrechnungUebersicht } from "./opsAbrechnung.js";
import { apiUebersicht } from "./opsApi.js";
import { bericht as verbrauchsBericht } from "../llm/tokenMesser.js";
import { FESTE_POSITIONEN } from "./opsKosten.js";
import { PLAN_BY_MONTHLY_AMOUNT } from "../billing/subscriptionStore.js";

const ZEIT_MS = 10_000;

/** Planname -> Monatspreis in Cent (aus der Stripe-Zuordnung, nicht geraten). */
const PREIS_CENT_JE_PLAN = Object.freeze(
  Object.fromEntries(Object.entries(PLAN_BY_MONTHLY_AMOUNT).map(([cent, plan]) => [plan, Number(cent)]))
);

function monatsbetragCent(item) {
  const preis = item?.price || {};
  const betrag = Number(preis.unit_amount || 0) * Number(item?.quantity || 1);
  const intervall = preis.recurring?.interval || "month";
  const n = Number(preis.recurring?.interval_count || 1);
  if (intervall === "year") return betrag / (12 * n);
  if (intervall === "week") return (betrag * 52) / (12 * n);
  if (intervall === "day") return (betrag * 365) / (12 * n);
  return betrag / n;
}

async function stripeLesen(pfad, env, fetchImpl) {
  const schluessel = String(env.STRIPE_SECRET_KEY || "");
  if (!schluessel) return { ok: false, grund: "STRIPE_SECRET_KEY nicht gesetzt" };
  try {
    const antwort = await fetchImpl("https://api.stripe.com/v1/" + pfad, {
      headers: { Authorization: `Bearer ${schluessel}` },
      signal: AbortSignal.timeout(ZEIT_MS)
    });
    if (!antwort.ok) return { ok: false, grund: "Stripe antwortet HTTP " + antwort.status };
    return { ok: true, daten: await antwort.json() };
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.message || fehler).slice(0, 80) };
  }
}

/** MRR bei Stripe: aktive Abos, je Posten auf den Monat gerechnet. */
export async function mrrBeiStripe({ env = process.env, fetchImpl = fetch } = {}) {
  const antwort = await stripeLesen("subscriptions?status=active&limit=100", env, fetchImpl);
  if (!antwort.ok) return { gemessen: false, grund: antwort.grund, cent: 0, abos: 0, waehrung: null, test: 0 };
  let cent = 0, abos = 0, test = 0;
  let waehrung = null;
  for (const abo of antwort.daten?.data || []) {
    if (abo.livemode === false) { test += 1; continue; }
    abos += 1;
    for (const item of abo.items?.data || []) {
      cent += monatsbetragCent(item);
      waehrung = waehrung || item?.price?.currency || null;
    }
  }
  return { gemessen: true, cent: Math.round(cent), abos, waehrung, test, mehr: antwort.daten?.has_more === true };
}

/** Offene Rechnungen bei Stripe (Zahlung fehlgeschlagen oder noch nicht bezahlt). */
export async function offeneRechnungen({ env = process.env, fetchImpl = fetch } = {}) {
  const antwort = await stripeLesen("invoices?status=open&limit=100", env, fetchImpl);
  if (!antwort.ok) return { gemessen: false, grund: antwort.grund, anzahl: 0, cent: 0 };
  const liste = (antwort.daten?.data || []).filter((r) => r.livemode !== false);
  return { gemessen: true, anzahl: liste.length, cent: liste.reduce((n, r) => n + Number(r.amount_due || 0), 0) };
}

function geschaetztAusPlaenen(abrechnung) {
  let cent = 0, ohnePreis = 0;
  for (const abo of abrechnung?.abos || []) {
    if (!["active", "trialing"].includes(abo.zustand) || abo.livemodus === false) continue;
    const preis = PREIS_CENT_JE_PLAN[abo.plan];
    if (preis) cent += preis; else ohnePreis += 1;
  }
  return { cent, ohnePreis };
}

function jePlan(abrechnung) {
  return (abrechnung?.nachPlan || []).map((p) => {
    const preis = PREIS_CENT_JE_PLAN[p.plan] || null;
    return {
      plan: p.plan, konten: p.gesamt, zahlend: p.zahlend,
      preisCent: preis,
      umsatzCentProMonat: preis ? preis * p.zahlend : null,
      punkteVerbraucht: null, margeCent: null
    };
  });
}

function modellkostenSeitNeustart(bericht) {
  let usd = 0, anfragen = 0, ohnePreis = 0;
  for (const t of bericht?.tage || []) {
    anfragen += t.anfragen || 0;
    if (t.kostenUsd === null || t.kostenUsd === undefined) ohnePreis += 1; else usd += t.kostenUsd;
  }
  return { usd: Math.round(usd * 100) / 100, anfragen, tageOhnePreis: ohnePreis, seit: bericht?.erstelltAm || null };
}

export async function umsatzUebersicht({
  env = process.env, fetchImpl = fetch, jetztMs = Date.now(),
  leseAbrechnung = abrechnungUebersicht, leseApi = apiUebersicht, leseVerbrauch = verbrauchsBericht,
  leseMrr = mrrBeiStripe, leseRechnungen = offeneRechnungen, startzeitMs = null
} = {}) {
  const abrechnung = await leseAbrechnung({ env, fetchImpl, jetztMs });
  let api = { ok: false };
  try { api = await leseApi({ env, fetchImpl, jetztMs }); } catch (fehler) { api = { ok: false, error: String(fehler?.message || fehler).slice(0, 80) }; }
  let verbrauch = {};
  try { verbrauch = leseVerbrauch({}); } catch { verbrauch = {}; }
  const [mrr, rechnungen] = await Promise.all([leseMrr({ env, fetchImpl }), leseRechnungen({ env, fetchImpl })]);

  const schaetzung = geschaetztAusPlaenen(abrechnung);
  const mrrCent = mrr.gemessen ? mrr.cent : schaetzung.cent;
  const festeUsd = FESTE_POSITIONEN.filter((p) => typeof p.betragUsdProMonat === "number").reduce((n, p) => n + p.betragUsdProMonat, 0);
  const modelle = modellkostenSeitNeustart(verbrauch);
  const aufladungen30Usd = api.ok ? (api.tage30?.umsatzUsd || 0) : null;
  const eingezahltUsd = api.ok ? (api.eingezahltUsd || 0) : null;

  // "Bleibt uebrig": nur die Monatsgroessen gegeneinander. Modellkosten sind
  // eine Seit-Neustart-Zahl und stehen getrennt — wer sie hier abzoege, rechnete
  // Tage gegen Monate.
  const bleibtUebrigUsdVorModellen = (mrrCent / 100) + (aufladungen30Usd || 0) - festeUsd;

  const laeuftAus = (abrechnung?.abos || []).filter((a) => a.kuendigtZumPeriodenende).map((a) => ({
    konto: a.konto || null, zahlendeAdresse: a.zahlendeAdresse || a.paidEmail || null, plan: a.plan, laufzeitEndeAm: a.laufzeitEndeAm, tageBisEnde: a.tageBisEnde
  }));

  return {
    ...abrechnung,
    umsatz: {
      gemessenAm: new Date(jetztMs).toISOString(),
      mrr: {
        cent: mrrCent, waehrung: mrr.waehrung || "eur",
        quelle: mrr.gemessen ? "Stripe (aktive Abos, je Posten auf den Monat gerechnet)" : "geschaetzt aus Planpreisen der lokalen Abo-Datensaetze — " + (mrr.grund || "Stripe nicht lesbar"),
        gemessen: mrr.gemessen, abos: mrr.gemessen ? mrr.abos : (abrechnung?.zahlend || 0), testAbos: mrr.test || 0,
        ohnePreis: schaetzung.ohnePreis, abgeschnitten: mrr.mehr === true
      },
      aufladungen: { erreichbar: api.ok === true, grund: api.error || null, umsatz30Usd: aufladungen30Usd, eingezahltUsd, guthabenUsd: api.ok ? (api.guthabenGesamtUsd || 0) : null },
      kosten: {
        festeUsdProMonat: festeUsd,
        festePositionen: FESTE_POSITIONEN.map((p) => ({ dienst: p.dienst, betragUsdProMonat: p.betragUsdProMonat, modell: p.modell })),
        modelleSeitNeustart: { ...modelle, seitStart: Number.isFinite(startzeitMs) ? new Date(startzeitMs).toISOString() : null }
      },
      bleibtUebrigUsdVorModellen: Math.round(bleibtUebrigUsdVorModellen * 100) / 100,
      jePlan: jePlan(abrechnung),
      abspruenge: { laeuftAus, anzahl: laeuftAus.length, gruendeErfasst: false },
      zahlung: {
        webhookGeheimnisGesetzt: Boolean(String(env.STRIPE_WEBHOOK_SECRET || "").trim()),
        schluesselGesetzt: Boolean(String(env.STRIPE_SECRET_KEY || "").trim()),
        stripeErreichbar: mrr.gemessen,
        offeneRechnungen: rechnungen,
        handlungsbedarf: abrechnung?.handlungsbedarf || 0
      },
      nichtErfasst: [
        { was: "Punkte je Plan", warum: "Es gibt keine Erfassung, die Verbrauch einem Plan zurechnet — darum keine Marge je Plan, statt einer geratenen." },
        { was: "Absprung-Gruende", warum: "Stripe-Kuendigungen kommen ohne Grund an; gefragt wird der Kunde nicht. Gezaehlt wird nur, wer zum Periodenende auslaeuft." },
        { was: "Modellkosten je Monat", warum: "Der Token-Messer zaehlt seit dem letzten Neustart; ein Monatswert waere hochgerechnet." }
      ]
    }
  };
}

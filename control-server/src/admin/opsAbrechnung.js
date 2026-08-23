// smejj.com — Modul E: Abrechnung und Abos (Single Responsibility: Betreiber-Sicht).
//
// ZAHLUNGSAUSFAELLE SIND EINE LISTE ZUM ABARBEITEN, KEIN EINTRAG IM LOG.
//
// Deshalb steht "past_due" hier oben und traegt einen Hinweis, was zu tun ist —
// statt als eine Zeile unter vielen zu verschwinden. Ein Abo, das seit Wochen
// nicht bezahlt ist, faellt sonst niemandem auf, bis der Nutzer sich meldet.
//
// Der Kunden-Datensatz kennt die E-Mail NICHT: er verweist ueber `ref`, und
// `ref` ist sha256 der Adresse. Das ist Absicht — die Abrechnung braucht keine
// Klartext-Adresse. Fuer die Anzeige wird der Weg rueckwaerts ueber den
// Nutzer-Index gegangen: jede bekannte Adresse einmal hashen und vergleichen.
// Bleibt eine Zuordnung offen, steht die Kunden-Kennung da — nie eine geratene
// Adresse.
//
// Was hier NICHT steht: Betraege, Zahlungsmittel, Rechnungen. Die liegen bei
// Stripe und gehoeren dorthin. Dieses Modul zeigt den Vorgangs-Zustand, damit
// eine Betreiberin weiss, wo sie eingreifen muss.
import { signedS3Get, signedS3List, parseS3ListPage } from "../storage/s3Signer.js";
import { emailKey } from "../auth/emailUserStore.js";
import { readUserIndex } from "./userIndex.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

const PRAEFIX = "billing/customers/";
const MAX_EINTRAEGE = 300;

// Was Stripe an Zustaenden liefert, in der Sprache einer Betreiberin — und mit
// der Dringlichkeit, die der Zustand tatsaechlich hat.
const ZUSTAENDE = Object.freeze({
  past_due: { rang: 0, dringlichkeit: "hoch", klartext: "Zahlung offen", tun: "Nutzer ansprechen; Stripe versucht weiter einzuziehen." },
  unpaid: { rang: 0, dringlichkeit: "hoch", klartext: "unbezahlt", tun: "Einzug endgueltig gescheitert — Zugang pruefen." },
  incomplete_expired: { rang: 1, dringlichkeit: "mittel", klartext: "Anmeldung abgebrochen", tun: "Kein Abo zustande gekommen." },
  incomplete: { rang: 1, dringlichkeit: "mittel", klartext: "Anmeldung unvollstaendig", tun: "Wartet auf die erste Zahlung." },
  paused: { rang: 2, dringlichkeit: "mittel", klartext: "pausiert", tun: "" },
  trialing: { rang: 3, dringlichkeit: "niedrig", klartext: "Testphase", tun: "" },
  active: { rang: 4, dringlichkeit: "keine", klartext: "aktiv", tun: "" },
  canceled: { rang: 5, dringlichkeit: "keine", klartext: "gekuendigt", tun: "" }
});

export async function abrechnungUebersicht({
  env = process.env,
  fetchImpl = fetch,
  jetztMs = Date.now(),
  leseIndex = readUserIndex
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", abos: [] };

  let liste;
  try {
    liste = await signedS3List({ ...cfg, prefix: PRAEFIX, fetchImpl });
  } catch (error) {
    return { ok: false, error: String(error?.message || "listing_fehlgeschlagen").slice(0, 160), abos: [] };
  }
  if (!liste.response?.ok) return { ok: false, error: `listing_http_${liste.response?.status}`, abos: [] };

  const seite = parseS3ListPage(liste.body);
  const dateien = (seite.keys || []).filter((k) => k.endsWith(".json")).slice(0, MAX_EINTRAEGE);

  const [datensaetze, adressen] = await Promise.all([
    mapMitGrenze(dateien, (key) => leseKunde(cfg, key, fetchImpl), 8),
    refAdressen(leseIndex, env)
  ]);

  const abos = datensaetze.filter(Boolean).map((k) => aufbereiten(k, adressen, jetztMs)).sort(sortiere);
  await ergaenzeZahlendeAdressen(abos, env, fetchImpl);
  const handlungsbedarf = abos.filter((a) => a.dringlichkeit === "hoch");

  return {
    ok: true,
    total: abos.length,
    abgeschnitten: (seite.keys || []).length > MAX_EINTRAEGE,
    zahlend: abos.filter((a) => ["active", "trialing"].includes(a.zustand)).length,
    handlungsbedarf: handlungsbedarf.length,
    gekuendigtZumPeriodenende: abos.filter((a) => a.kuendigtZumPeriodenende).length,
    nachPlan: nachPlan(abos),
    // Testdaten und echte Vorgaenge nebeneinander waeren eine Falle: eine
    // Betreiberin wuerde Testabos fuer Umsatz halten.
    testmodus: abos.filter((a) => a.livemodus === false).length,
    abos,
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: "Zustaende und Fristen kommen aus den Stripe-Ereignissen, die smejj.com "
      + "verarbeitet hat. Betraege, Zahlungsmittel und Rechnungen liegen bei Stripe "
      + "und werden hier bewusst nicht gespiegelt."
  };
}

async function leseKunde(cfg, key, fetchImpl) {
  try {
    const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
    if (!antwort.ok) return null;
    const datensatz = JSON.parse(antwort.body);
    return { ...datensatz, kundenId: key.slice(PRAEFIX.length).replace(/\.json$/, "") };
  } catch {
    return null;
  }
}

function aufbereiten(k, adressen, jetztMs) {
  const zustand = String(k.status || "unknown");
  const beschreibung = ZUSTAENDE[zustand] || { rang: 6, dringlichkeit: "unbekannt", klartext: zustand, tun: "" };
  const endeMs = k.periodEnd ? Date.parse(k.periodEnd) : NaN;
  return {
    kundenId: k.kundenId,
    konto: adressen.get(String(k.ref || "")) || null,
    ref: String(k.ref || ""),
    plan: k.plan || null,
    zustand,
    klartext: beschreibung.klartext,
    dringlichkeit: beschreibung.dringlichkeit,
    naechsterSchritt: beschreibung.tun || null,
    laufzeitEndeAm: k.periodEnd || null,
    tageBisEnde: Number.isFinite(endeMs) ? Math.ceil((endeMs - jetztMs) / 86_400_000) : null,
    kuendigtZumPeriodenende: k.cancelAtPeriodEnd === true,
    livemodus: typeof k.livemode === "boolean" ? k.livemode : null,
    abonnementId: k.subscriptionId || null,
    // Bestaetigte Kaufadresse aus dem Checkout — die Spalte "bezahlt als" der
    // Nutzer-Lage. Nur Anzeige, nie mit der Konto-Adresse verwechseln.
    paidEmail: k.paidEmail || null
  };
}

// EIN "konto: null" ist die teuerste Zeile dieser Uebersicht: der Kunde hat
// bezahlt und sieht in der App trotzdem "Free" (erlebt am 2026-08-14 mit dem
// ersten echten Abo). Der Grund ist immer derselbe — die Adresse, mit der bei
// Stripe bezahlt wurde, gehoert zu keinem Konto hier.
//
// Ohne diese Zeile weiss eine Betreiberin nur DASS etwas klemmt, nicht WEN sie
// anschreiben soll. Darum wird die zahlende Adresse live bei Stripe geholt —
// nur fuer die offenen Faelle, nur zur Anzeige, und NICHT gespeichert (der
// Kunden-Datensatz bleibt bewusst ohne Klartext-Adresse).
async function ergaenzeZahlendeAdressen(abos, env, fetchImpl) {
  const offen = abos.filter((a) => !a.konto && a.kundenId);
  const schluessel = String(env.STRIPE_SECRET_KEY || "");
  if (!offen.length || !schluessel) return;
  await mapMitGrenze(offen, async (abo) => {
    try {
      const antwort = await fetchImpl(`https://api.stripe.com/v1/customers/${abo.kundenId}`, {
        headers: { Authorization: `Bearer ${schluessel}` },
        signal: AbortSignal.timeout(10_000)
      });
      if (!antwort.ok) return;
      const kunde = await antwort.json();
      abo.zahlendeAdresse = kunde?.email || null;
      abo.naechsterSchritt = abo.zahlendeAdresse
        ? `Bezahlt als ${abo.zahlendeAdresse} — mit dieser Adresse anmelden, oder das Abo auf die Konto-Adresse umhaengen.`
        : abo.naechsterSchritt;
      abo.dringlichkeit = "hoch";
    } catch { /* Stripe still — die Uebersicht bleibt trotzdem brauchbar */ }
  }, 4);
}

/** sha256(E-Mail) -> E-Mail. Ein Index-Aufruf, nicht einer je Kunde. */
async function refAdressen(leseIndex, env) {
  try {
    const index = await leseIndex({ env });
    if (!index?.ok) return new Map();
    const karte = new Map();
    for (const eintrag of index.entries || []) {
      const email = String(eintrag.email || "");
      if (email) karte.set(emailKey(email), email);
    }
    return karte;
  } catch {
    return new Map();
  }
}

function sortiere(a, b) {
  const rang = (x) => (ZUSTAENDE[x.zustand]?.rang ?? 6);
  const unterschied = rang(a) - rang(b);
  if (unterschied !== 0) return unterschied;
  return String(a.konto || a.kundenId).localeCompare(String(b.konto || b.kundenId));
}

function nachPlan(abos) {
  const karte = new Map();
  for (const a of abos) {
    const schluessel = a.plan || "ohne Plan";
    const eintrag = karte.get(schluessel) || { plan: schluessel, gesamt: 0, zahlend: 0 };
    eintrag.gesamt += 1;
    if (["active", "trialing"].includes(a.zustand)) eintrag.zahlend += 1;
    karte.set(schluessel, eintrag);
  }
  return [...karte.values()].sort((x, y) => y.gesamt - x.gesamt);
}

function idriveConfig(env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

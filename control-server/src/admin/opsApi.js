// smejj.com — Modul G: die oeffentliche API aus Betreibersicht.
//
// Die vier Fragen, die eine Betreiberin stellt (so halten es OpenAI, Anthropic
// und DeepSeek in ihren Konsolen):
//   1. Wie viele Konten nutzen die API, wie viele Schluessel sind aktiv?
//   2. Was wurde verbraucht — Anfragen, Token, Umsatz — heute, 7 Tage, 30 Tage?
//   3. Wer ist das, je Kunde: Guthaben, Aufladungen, Verbrauch je Modell?
//   4. Wo muss ich hinsehen — Guthaben fast leer, Testzahlungen, Ausreisser?
//
// Datenquelle ist das Ereignisprotokoll der API (publicApiLedger.js): EIN
// Objekt je Anfrage unter api-billing/ereignisse/<konto>/<tag>/. Nicht der
// Tageszaehler — der ist eine Anzeige und verliert bei Neustart Zaehlung.
//
// Was hier BEWUSST NICHT steht: der Einkaufspreis je Modell. Die Registry
// fuehrt Faehigkeiten, keine Preise (siehe opsKosten.js). Eine "Marge", die
// aus einem geratenen Einkauf entstuende, waere die gefaehrlichste Zahl der
// Seite. Sie steht als Luecke drin, nicht als Null.
import { signedS3Get, signedS3List, parseS3ListPage } from "../storage/s3Signer.js";
import { readUserIndex } from "./userIndex.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";
import { getProviderCredential } from "../providers/providerCredentialVault.js";
import { mikroZuUsd, preislistePayload } from "../publicapi/publicApiPreise.js";

const KONTEN = "api-billing/konten/";
const EREIGNISSE = "api-billing/ereignisse/";
const AUFLADUNGEN = "api-billing/aufladungen/";
const MAX_KONTEN = 500;
const TAGE = 30;
const GUTHABEN_ALARM_USD = 1;

export async function apiUebersicht({
  env = process.env,
  fetchImpl = fetch,
  jetztMs = Date.now(),
  leseIndex = readUserIndex,
  speicher = null,
  leseSchluesselIndex = (kontoId) => getProviderCredential(kontoId, "smejj-api-index", env).catch(() => null)
} = {}) {
  const s = speicher || s3Speicher(env, fetchImpl);
  if (!s) return { ok: false, error: "speicher_nicht_eingerichtet", konten: [] };

  let kontoSchluessel;
  try {
    kontoSchluessel = (await s.liste(KONTEN)).filter((k) => k.endsWith(".json")).slice(0, MAX_KONTEN);
  } catch (error) {
    return { ok: false, error: String(error?.message || "listing_fehlgeschlagen").slice(0, 160), konten: [] };
  }

  const tage = tagesliste(jetztMs, TAGE);
  const [kontenRoh, adressen, aufladungen] = await Promise.all([
    mapMitGrenze(kontoSchluessel, (key) => s.lies(key), 8),
    kontoAdressen(leseIndex, env),
    leseAufladungen(s)
  ]);

  const konten = await mapMitGrenze(kontenRoh.filter(Boolean), async (konto) => {
    const [ereignisse, schluesselIndex] = await Promise.all([
      leseEreignisse(s, konto.kontoId, tage),
      leseSchluesselIndex(konto.kontoId)
    ]);
    return aufbereiten(konto, ereignisse, schluesselIndex, adressen, aufladungen, jetztMs);
  }, 4);

  konten.sort((a, b) => b.umsatz30Usd - a.umsatz30Usd || b.anfragen30 - a.anfragen30);
  const summen = (feld) => konten.reduce((n, k) => n + (k[feld] || 0), 0);
  const alarme = konten.filter((k) => k.alarm);

  return {
    ok: true,
    gemessenAm: new Date(jetztMs).toISOString(),
    kontenMitApi: konten.length,
    kontenMitAktivemSchluessel: konten.filter((k) => k.aktiveSchluessel > 0).length,
    aktiveSchluessel: summen("aktiveSchluessel"),
    heute: { anfragen: summen("anfragenHeute"), tokens: summen("tokensHeute"), umsatzUsd: runde(summen("umsatzHeuteUsd")) },
    tage7: { anfragen: summen("anfragen7"), tokens: summen("tokens7"), umsatzUsd: runde(summen("umsatz7Usd")) },
    tage30: { anfragen: summen("anfragen30"), tokens: summen("tokens30"), umsatzUsd: runde(summen("umsatz30Usd")) },
    eingezahltUsd: runde(aufladungen.filter((a) => a.livemode !== false).reduce((n, a) => n + a.cents / 100, 0)),
    eingezahltTestUsd: runde(aufladungen.filter((a) => a.livemode === false).reduce((n, a) => n + a.cents / 100, 0)),
    guthabenGesamtUsd: runde(summen("guthabenUsd")),
    nachModell: nachModell(konten),
    alarme: alarme.length,
    konten,
    preise: preislistePayload(),
    nichtErfasst: [
      { was: "Einkaufspreis je Modell", warum: "Die Registry fuehrt Faehigkeiten, keine Preise — darum keine Marge, statt einer geratenen." },
      { was: "Fehlerrate je Konto", warum: "Gebucht werden beantwortete Anfragen; abgewiesene (401/402/429) stehen nur im Serverlog." }
    ],
    hinweis: "Umsatz = gebuchte Anfragen zu Listenpreis (USD). Eingezahlt = echte Stripe-Zahlungen. "
      + "Startguthaben ist geschenkt und zaehlt nicht als Umsatz."
  };
}

// ---- Aufbereitung ------------------------------------------------------------

function aufbereiten(konto, ereignisse, schluesselIndex, adressen, aufladungen, jetztMs) {
  const heute = tag(jetztMs);
  const grenze7 = tag(jetztMs - 6 * 86_400_000);
  const inFenster = (e, von) => e.tag >= von;
  const fenster = (liste) => ({
    anfragen: liste.length,
    tokens: liste.reduce((n, e) => n + e.promptTokens + e.completionTokens, 0),
    // Erst in Mikro summieren, dann EINMAL umrechnen — je Anfrage gerundet
    // addieren sich Rundungsfehler zu falschen Cents.
    umsatzUsd: runde(mikroZuUsd(liste.reduce((n, e) => n + e.kostenMikro, 0)))
  });
  const h = fenster(ereignisse.filter((e) => e.tag === heute));
  const t7 = fenster(ereignisse.filter((e) => inFenster(e, grenze7)));
  const t30 = fenster(ereignisse);

  const schluessel = Array.isArray(schluesselIndex?.schluessel) ? schluesselIndex.schluessel : [];
  const aktive = schluessel.filter((k) => !k.widerrufenAm);
  const guthabenUsd = mikroZuUsd(konto.guthabenMikro);
  const eigene = aufladungen.filter((a) => a.kontoId === konto.kontoId);
  const letzteAnfrage = ereignisse.map((e) => e.zeitpunkt).sort().pop() || konto.zuletztAm || null;

  const alarm = guthabenUsd < GUTHABEN_ALARM_USD && (t30.anfragen > 0 || aktive.length > 0)
    ? `Guthaben ${guthabenUsd.toFixed(2)} USD — bei 0 bekommt dieser Kunde 402.`
    : eigene.some((a) => a.livemode === false) ? "Testzahlung im Konto — nicht als Umsatz werten." : null;

  return {
    kontoId: konto.kontoId,
    konto: adressen.get(konto.kontoId) || null,
    guthabenUsd: runde(guthabenUsd),
    aufgeladenUsd: runde(mikroZuUsd(konto.aufgeladenMikro)),
    verbrauchtUsd: runde(mikroZuUsd(konto.verbrauchtMikro)),
    anfragenGesamt: Number(konto.anfragen) || 0,
    aktiveSchluessel: aktive.length,
    widerrufeneSchluessel: schluessel.length - aktive.length,
    schluessel: schluessel.map((k) => ({ name: k.name, letzte4: k.letzte4, erstelltAm: k.erstelltAm, widerrufenAm: k.widerrufenAm || null })),
    anfragenHeute: h.anfragen, tokensHeute: h.tokens, umsatzHeuteUsd: h.umsatzUsd,
    anfragen7: t7.anfragen, tokens7: t7.tokens, umsatz7Usd: t7.umsatzUsd,
    anfragen30: t30.anfragen, tokens30: t30.tokens, umsatz30Usd: t30.umsatzUsd,
    nachModell: nachModellEinzeln(ereignisse),
    aufladungen: eigene.map((a) => ({ betragUsd: a.cents / 100, livemode: a.livemode, am: a.verbuchtAm })),
    letzteAnfrageAm: letzteAnfrage,
    angelegtAm: konto.angelegtAm || null,
    alarm
  };
}

function nachModellEinzeln(ereignisse) {
  const karte = new Map();
  for (const e of ereignisse) {
    const eintrag = karte.get(e.modell) || { modell: e.modell, anfragen: 0, tokens: 0, kostenMikro: 0 };
    eintrag.anfragen += 1;
    eintrag.tokens += e.promptTokens + e.completionTokens;
    eintrag.kostenMikro += e.kostenMikro;
    karte.set(e.modell, eintrag);
  }
  return [...karte.values()].map(({ kostenMikro, ...m }) => ({ ...m, umsatzUsd: runde(mikroZuUsd(kostenMikro)) })).sort((a, b) => b.umsatzUsd - a.umsatzUsd);
}

function nachModell(konten) {
  const karte = new Map();
  for (const k of konten) for (const m of k.nachModell) {
    const eintrag = karte.get(m.modell) || { modell: m.modell, anfragen: 0, tokens: 0, umsatzUsd: 0, konten: 0 };
    eintrag.anfragen += m.anfragen; eintrag.tokens += m.tokens; eintrag.umsatzUsd += m.umsatzUsd; eintrag.konten += 1;
    karte.set(m.modell, eintrag);
  }
  return [...karte.values()].map((m) => ({ ...m, umsatzUsd: runde(m.umsatzUsd) })).sort((a, b) => b.umsatzUsd - a.umsatzUsd);
}

// ---- Lesen -------------------------------------------------------------------

async function leseEreignisse(s, kontoId, tage) {
  // Ein Listing je Tag und Konto — bewusst begrenzt (30 Tage). Ein Listing
  // ueber das ganze Konto wuerde mit der Zeit jede Seite tausende Objekte
  // durchblaettern.
  const listen = await mapMitGrenze(tage, (t) => s.liste(`${EREIGNISSE}${kontoId}/${t}/`).catch(() => []), 6);
  const schluessel = listen.flat().filter((k) => k.endsWith(".json"));
  const ereignisse = await mapMitGrenze(schluessel, (key) => s.lies(key).catch(() => null), 12);
  return ereignisse.filter(Boolean).map((e) => ({
    tag: String(e.zeitpunkt || "").slice(0, 10),
    zeitpunkt: String(e.zeitpunkt || ""),
    modell: String(e.modell || "?"),
    promptTokens: Number(e.promptTokens) || 0,
    completionTokens: Number(e.completionTokens) || 0,
    kostenMikro: Number(e.kostenMikro) || 0
  }));
}

async function leseAufladungen(s) {
  try {
    const keys = (await s.liste(AUFLADUNGEN)).filter((k) => k.endsWith(".json")).slice(0, 2000);
    const daten = await mapMitGrenze(keys, (key) => s.lies(key).catch(() => null), 8);
    return daten.filter(Boolean).map((a) => ({
      kontoId: String(a.kontoId || ""), cents: Number(a.cents) || 0,
      livemode: typeof a.livemode === "boolean" ? a.livemode : null, verbuchtAm: a.verbuchtAm || null
    }));
  } catch {
    return [];
  }
}

/** kontoId (user_xxxxxxxx) -> E-Mail. Dieselbe Ableitung wie beim Anmelden. */
async function kontoAdressen(leseIndex, env) {
  try {
    const index = await leseIndex({ env });
    if (!index?.ok) return new Map();
    const karte = new Map();
    for (const eintrag of index.entries || []) {
      const email = String(eintrag.email || "");
      if (!email) continue;
      // Die Sitzung traegt je nach Anmeldeweg userId, sub oder nur die E-Mail —
      // darum alle drei Ableitungen eintragen.
      for (const quelle of [{ userId: eintrag.userId }, { sub: eintrag.userId }, { email }]) {
        const id = authenticatedUserId(quelle);
        if (id) karte.set(id, email);
      }
    }
    return karte;
  } catch {
    return new Map();
  }
}

function s3Speicher(env, fetchImpl) {
  const cfg = idriveConfig(env);
  if (!cfg) return null;
  return {
    async liste(prefix) {
      const keys = [];
      let token = null;
      for (let seite = 0; seite < 5; seite += 1) {
        const ergebnis = await signedS3List({ ...cfg, prefix, continuationToken: token, fetchImpl });
        if (!ergebnis.response?.ok) throw new Error(`listing_http_${ergebnis.response?.status}`);
        const s = parseS3ListPage(ergebnis.body);
        keys.push(...(s.keys || []));
        token = s.nextContinuationToken || s.continuationToken || null;
        if (!token) break;
      }
      return keys;
    },
    async lies(key) {
      const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
      return antwort.ok ? JSON.parse(antwort.body) : null;
    }
  };
}

function idriveConfig(env) {
  const { IDRIVE_E2_ENDPOINT: endpoint, IDRIVE_E2_ACCESS_KEY: accessKey, IDRIVE_E2_SECRET_KEY: secretKey, IDRIVE_E2_BUCKET: bucket } = env;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function tagesliste(jetztMs, anzahl) {
  return Array.from({ length: anzahl }, (_, i) => tag(jetztMs - i * 86_400_000));
}

function tag(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function runde(usd) {
  return Math.round((Number(usd) || 0) * 10_000) / 10_000;
}

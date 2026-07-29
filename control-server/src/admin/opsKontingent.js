// smejj.com — Speicher-Kontingent auf IDrive e2 (Single Responsibility: wie voll ist es).
//
// WARUM ES DIESES MODUL GIBT
//
// IDrive e2 blockiert nicht, wenn das Kontingent voll ist. Es nimmt weiter an
// und rechnet ab: 0,006 USD je GB und Monat (Preis-FAQ des Anbieters,
// nachgesehen am 2026-07-28). Ein einziger Modell-Upload kann das Kontingent
// reissen, ohne dass irgendwo eine Warnung erscheint — genau der
// "Auto-Billing-Fallback", den die eigene Kostenpolitik verbietet.
//
// Dieses Modul misst die Belegung und vergleicht sie mit dem gebuchten Paket.
// Es ist die Grundlage fuer zwei Dinge: die Anzeige im Adminbereich und die
// Sperre vor grossen Uploads (scripts/deploy/idrive-quota-guard.mjs).
//
// EHRLICHKEIT VOR VOLLSTAENDIGKEIT: Ein Zugangsschluessel sieht unter Umstaenden
// nicht alle Eimer, und eine Zaehlung kann abgeschnitten werden. Beides wird
// gemeldet, und die Summe traegt dann ausdruecklich "mindestens". Eine Zahl, die
// zu niedrig ist und sich fuer vollstaendig ausgibt, waere hier besonders
// gefaehrlich: sie beruhigt genau dann, wenn es eng wird.
import { signedS3List } from "../storage/s3Signer.js";

// Aus der Preis-FAQ von IDrive e2, nachgesehen am 2026-07-28. Zitat, keine Messung.
export const MEHRKOSTEN_USD_PRO_GB_MONAT = 0.006;

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;
// IDrive rechnet in Binaerpraefixen und beschriftet sie als TB: 1258,20 GiB
// erscheinen im Portal als "1,23 TB". Deshalb hier ebenfalls binaer.
const STANDARD_PAKET_TIB = 2;

// Obergrenzen, damit die Messung nie teuer wird. Ein Eimer mit sehr vielen
// Objekten wird abgeschnitten — und sagt das.
const MAX_SEITEN_JE_EIMER = 200;
const CACHE_MS = 10 * 60 * 1000;

let cache = null;

export function planBytes(env = process.env) {
  const tib = Number(env.SMEJJ_IDRIVE_PLAN_TIB);
  return (Number.isFinite(tib) && tib > 0 ? tib : STANDARD_PAKET_TIB) * TIB;
}

/** Schwelle, ab der ein Upload verweigert wird. Voreinstellung: 95 % des Pakets. */
export function grenzeProzent(env = process.env) {
  const wert = Number(env.SMEJJ_IDRIVE_GRENZE_PROZENT);
  return Number.isFinite(wert) && wert > 0 && wert <= 100 ? wert : 95;
}

export async function kontingentUebersicht({
  env = process.env,
  fetchImpl = fetch,
  jetztMs = Date.now(),
  frisch = false
} = {}) {
  if (!frisch && cache && jetztMs - cache.atMs < CACHE_MS) {
    return { ...cache.wert, ausCache: true, alterSekunden: Math.round((jetztMs - cache.atMs) / 1000) };
  }

  const zugang = idriveZugang(env);
  if (!zugang) return { ok: false, error: "speicher_nicht_eingerichtet", eimer: [] };

  let namen;
  try {
    namen = await eimerNamen(zugang, fetchImpl);
  } catch (error) {
    return { ok: false, error: String(error?.message || "eimer_nicht_lesbar").slice(0, 160), eimer: [] };
  }

  const eimer = [];
  for (const name of namen) eimer.push(await zaehleEimer(zugang, name, fetchImpl));

  const lesbar = eimer.filter((e) => e.erreichbar);
  const bytesGesamt = lesbar.reduce((s, e) => s + e.bytes, 0);
  const objekteGesamt = lesbar.reduce((s, e) => s + e.objekte, 0);
  const vollstaendig = eimer.every((e) => e.erreichbar && !e.abgeschnitten);

  const wert = {
    ok: true,
    ...bewerte({ bytesGesamt, paketBytes: planBytes(env) }),
    objekteGesamt,
    eimer,
    vollstaendig,
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: vollstaendig
      ? "Alle sichtbaren Eimer vollstaendig gezaehlt."
      : "Mindestwert: mindestens ein Eimer war nicht lesbar oder wurde abgeschnitten. "
        + "Die tatsaechliche Belegung liegt hoeher.",
    quelle: `Mehrkosten ${MEHRKOSTEN_USD_PRO_GB_MONAT} USD/GB/Monat laut Preis-FAQ von IDrive e2 `
      + "(nachgesehen 2026-07-28). Zitat, keine Messung."
  };
  cache = { atMs: jetztMs, wert };
  return { ...wert, ausCache: false, alterSekunden: 0 };
}

/**
 * Bewertet eine Belegung gegen das Paket. Rein rechnend, damit die Sperre
 * dieselbe Bewertung nutzen kann wie die Anzeige — zwei Rechenwege waeren zwei
 * Wahrheiten.
 * @param {number} geplantBytes zusaetzlich vorgesehene Bytes (fuer die Sperre)
 */
export function bewerte({ bytesGesamt, paketBytes, geplantBytes = 0 }) {
  const belegt = Math.max(0, Number(bytesGesamt) || 0);
  const paket = Math.max(1, Number(paketBytes) || 1);
  const nachher = belegt + Math.max(0, Number(geplantBytes) || 0);
  const auslastung = (nachher / paket) * 100;
  const ueberschreitungBytes = Math.max(0, nachher - paket);

  return {
    bytesGesamt: belegt,
    bytesNachVorhaben: nachher,
    paketBytes: paket,
    freiBytes: Math.max(0, paket - nachher),
    auslastungProzent: Math.round(auslastung * 10) / 10,
    ampel: auslastung >= 100 ? "ueberschritten" : auslastung >= 95 ? "kritisch" : auslastung >= 80 ? "warnung" : "ok",
    ueberschreitungBytes,
    // Nur wenn tatsaechlich ueberschritten. Sonst stuende dort eine 0,00 USD,
    // die wie eine Zusage aussieht.
    mehrkostenUsdProMonat: ueberschreitungBytes > 0
      ? Math.round((ueberschreitungBytes / GIB) * MEHRKOSTEN_USD_PRO_GB_MONAT * 100) / 100
      : null
  };
}

async function eimerNamen(zugang, fetchImpl) {
  // Leerer Bucket-Name ergibt GET / — die Eimerliste. Der Schluessel sieht dabei
  // nur, wofuer er berechtigt ist; das ist kein Fehler, sondern eine Grenze.
  const antwort = await signedS3List({ ...zugang, bucket: "", prefix: "", fetchImpl });
  if (!antwort.response?.ok) throw new Error(`eimerliste_http_${antwort.response?.status}`);
  const treffer = String(antwort.body).match(/<Name>([^<]+)<\/Name>/g) || [];
  return [...new Set(treffer.map((t) => t.replace(/<\/?Name>/g, "")))].sort();
}

async function zaehleEimer(zugang, name, fetchImpl) {
  let token = null;
  let seiten = 0;
  let objekte = 0;
  let bytes = 0;
  let neuestes = "";
  try {
    do {
      const antwort = await signedS3List({ ...zugang, bucket: name, prefix: "", continuationToken: token, fetchImpl });
      if (!antwort.response?.ok) {
        return { name, erreichbar: false, grund: `HTTP ${antwort.response?.status}`, objekte: 0, bytes: 0 };
      }
      const text = String(antwort.body);
      for (const block of text.match(/<Contents>[\s\S]*?<\/Contents>/g) || []) {
        objekte += 1;
        bytes += Number((block.match(/<Size>(\d+)<\/Size>/) || [])[1] || 0);
        const geaendert = (block.match(/<LastModified>([^<]+)<\/LastModified>/) || [])[1] || "";
        if (geaendert > neuestes) neuestes = geaendert;
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(text)
        ? (text.match(/<NextContinuationToken>([^<]+)</) || [])[1] || null
        : null;
      seiten += 1;
    } while (token && seiten < MAX_SEITEN_JE_EIMER);
  } catch (error) {
    return { name, erreichbar: false, grund: String(error?.message || "fehler").slice(0, 120), objekte: 0, bytes: 0 };
  }
  return {
    name,
    erreichbar: true,
    objekte,
    bytes,
    abgeschnitten: Boolean(token),
    zuletztGeaendertAm: neuestes || null
  };
}

function idriveZugang(env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey) return null;
  return { endpoint, accessKey, secretKey, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

export function __leereKontingentCache() { cache = null; }

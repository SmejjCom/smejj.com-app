// smejj.com — Modul J: Schluessel und Geheimnisse (Single Responsibility: Betreiber-Sicht).
//
// DER WERT EINES SCHLUESSELS VERLAESST DIESES MODUL NIE.
//
// Die Huelle auf IDrive e2 traegt schon unverschluesselt, wem der Schluessel
// gehoert und zu welchem Anbieter er passt. Ob er noch gilt und woran man ihn
// erkennt, steht dagegen im verschluesselten Teil — dafuer muss entschluesselt
// werden. Das tut der Control-Server bei jeder Chat-Anfrage ohnehin; neu ist
// hier nur die Anzeige.
//
// Deshalb wird nach dem Entschluesseln NICHT das Objekt durchgereicht, sondern
// ein neues gebaut, Feld fuer Feld. Kein Spread, kein "alles ausser". Ein
// Spread nimmt kuenftige Felder stillschweigend mit — und das kuenftige Feld
// ist irgendwann der Schluessel selbst.
//
// Faellt die Entschluesselung aus, bleibt die Zeile trotzdem stehen, nur mit
// weniger Angaben. Weniger zu wissen ist hier immer besser als zu raten.
import { signedS3Get, signedS3List, parseS3ListPage } from "../storage/s3Signer.js";
import { decryptProviderCredential, providerCredentialEncryptionConfig } from "../providers/providerCredentialVault.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";
import { readUserIndex } from "./userIndex.js";

const PRAEFIX = "auth/provider-credentials/";
// Mehr als das sind keine Betreiberdaten mehr, sondern ein Datenexport.
const MAX_EINTRAEGE = 200;

export async function schluesselUebersicht({
  env = process.env,
  fetchImpl = fetch,
  jetztMs = Date.now(),
  leseIndex = readUserIndex
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", schluessel: [] };

  let listenAntwort;
  try {
    listenAntwort = await signedS3List({ ...cfg, prefix: PRAEFIX, fetchImpl });
  } catch (error) {
    return { ok: false, error: String(error?.message || "listing_fehlgeschlagen").slice(0, 160), schluessel: [] };
  }
  if (!listenAntwort.response?.ok) {
    return { ok: false, error: `listing_http_${listenAntwort.response?.status}`, schluessel: [] };
  }

  const seite = parseS3ListPage(listenAntwort.body);
  const schluesselDateien = (seite.keys || []).filter((k) => k.endsWith(".json.enc")).slice(0, MAX_EINTRAEGE);
  const config = sichereKonfiguration(env);

  const eintraege = await mapMitGrenze(
    schluesselDateien,
    (key) => leseEintrag(cfg, key, config, fetchImpl),
    8
  );
  // Die Huelle traegt die Konto-KENNUNG, nicht die Adresse. Eine Liste aus
  // "u_a1b2c3" ist fuer einen Menschen unbrauchbar; ein Aufruf des Index
  // (30 s zwischengespeichert) macht daraus einen lesbaren Namen. Bleibt der
  // Index stumm, steht die Kennung da — kein Grund, die Ansicht zu verweigern.
  const adressen = await kontoAdressen(leseIndex, env);
  const fertig = eintraege.filter(Boolean).map((e) => ({
    ...e,
    konto: adressen.get(e.kontoId) || null
  }));

  return {
    ok: true,
    total: fertig.length,
    abgeschnitten: (seite.keys || []).length > MAX_EINTRAEGE,
    aktiv: fertig.filter((e) => e.aktiv === true).length,
    widerrufen: fertig.filter((e) => e.aktiv === false).length,
    unlesbar: fertig.filter((e) => e.aktiv === null).length,
    entschluesselungMoeglich: config.ready === true,
    schluessel: fertig.sort(sortiere),
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: "Angezeigt werden ausschliesslich Merkmale: Anbieter, Konto, Zustand und die "
      + "letzten vier Zeichen. Der Wert eines Schluessels wird nie ausgegeben — auch nicht dem Owner."
  };
}

async function leseEintrag(cfg, key, config, fetchImpl) {
  let huelle;
  try {
    const antwort = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
    if (!antwort.ok) return null;
    huelle = JSON.parse(antwort.body);
  } catch {
    return null;
  }

  // Aus der Huelle, ohne jede Entschluesselung.
  const grund = {
    anbieter: String(huelle?.providerId || "unbekannt"),
    kontoId: String(huelle?.subjectId || ""),
    verfahren: String(huelle?.algorithm || ""),
    schluesselgeneration: String(huelle?.keyId || ""),
    ablage: key
  };

  if (!config.ready) return { ...grund, aktiv: null, letzteVier: null, modell: null, geaendertAm: null };

  try {
    const datensatz = decryptProviderCredential(huelle, config);
    // Feld fuer Feld neu gebaut. Nie ein Spread des entschluesselten Datensatzes.
    return {
      ...grund,
      aktiv: datensatz?.enabled === true,
      letzteVier: kurz(datensatz?.keyLast4),
      modell: String(datensatz?.selectedModel || "").slice(0, 60) || null,
      geaendertAm: typeof datensatz?.updatedAt === "string" ? datensatz.updatedAt : null
    };
  } catch {
    // Falsche Schluesselgeneration oder beschaedigte Huelle: die Zeile bleibt,
    // der Zustand ist unbekannt. Das ist selbst eine Information.
    return { ...grund, aktiv: null, letzteVier: null, modell: null, geaendertAm: null };
  }
}

/** Hoechstens vier Zeichen, und auch die nur, wenn es wirklich vier sind. */
function kurz(wert) {
  const text = String(wert || "").trim();
  if (!text) return null;
  return text.slice(-4);
}

function sortiere(a, b) {
  // Unlesbare zuerst (etwas stimmt nicht), dann aktive, dann widerrufene.
  const rang = (e) => (e.aktiv === null ? 0 : e.aktiv ? 1 : 2);
  const unterschied = rang(a) - rang(b);
  if (unterschied !== 0) return unterschied;
  return String(a.konto || a.kontoId || "").localeCompare(String(b.konto || b.kontoId || ""));
}

/** Kennung -> Adresse. Ein Aufruf, nicht einer je Schluessel. */
async function kontoAdressen(leseIndex, env) {
  try {
    const index = await leseIndex({ env });
    if (!index?.ok) return new Map();
    return new Map((index.entries || []).map((e) => [String(e.userId || ""), String(e.email || "")]));
  } catch {
    return new Map();
  }
}

function sichereKonfiguration(env) {
  try {
    return providerCredentialEncryptionConfig(env);
  } catch {
    return { ready: false };
  }
}

function idriveConfig(env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

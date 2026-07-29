// smejj.com — Zustellprotokoll fuer Auth-E-Mails (Single Responsibility: was ging raus).
//
// Freigabe des Betreibers vom 2026-07-29: "Ich gebe frei, das Ergebnis jedes
// Mailversands auf IDrive e2 zu speichern: Empfaengeradresse, Zeitpunkt, Erfolg
// oder Fehlergrund. Aufbewahrung 90 Tage, danach automatische Loeschung."
//
// WARUM ES DAS BRAUCHT
//
// `sendAuthMail` wusste das Ergebnis immer — nur hat es niemand aufgeschrieben.
// Modul V konnte deshalb bisher nur raten ("so viele Konten haengen
// unbestaetigt"), statt zu antworten ("diese Mail ging am 29.07. um 12:04 raus"
// oder "sie wurde vom Server abgewiesen, Grund X").
//
// ZWEI REGELN, die dieses Modul traegt:
//
//   1. EIN FEHLSCHLAG BEIM PROTOKOLLIEREN DARF NIE EINE MAIL VERHINDERN.
//      Das Protokoll ist ein Nachweis, keine Voraussetzung. Faellt IDrive e2
//      aus, wird trotzdem verschickt — die Registrierung einer Nutzerin haengt
//      nicht daran, dass ein Logeintrag gelingt. Hier ist fail-open richtig,
//      und zwar als bewusste Ausnahme von der sonstigen Regel.
//   2. DER MAILTEXT WIRD NICHT GESPEICHERT. Betreff ja (er ist fest und sagt,
//      worum es ging), Inhalt nein — dort steht der Anmeldelink.
//
// Ablage: mail/zustellung/JJJJ/MM/TT/<id>.json — nach Tag gegliedert, damit das
// Aufraeumen ganze Tagesordner betrifft und nie einzeln suchen muss.
import crypto from "node:crypto";
import { signedS3Delete, signedS3Get, signedS3List, signedS3Put, parseS3ListPage } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

const PRAEFIX = "mail/zustellung";
export const AUFBEWAHRUNG_TAGE = 90;
const TAG_MS = 24 * 60 * 60 * 1000;
const MAX_SEITEN = 20;

/**
 * Haelt einen Versand fest. Wirft NIE — der Aufrufer soll sich auf das
 * Verschicken konzentrieren, nicht auf das Protokoll.
 * @returns {Promise<{ok: boolean, key?: string, grund?: string}>}
 */
export async function protokolliereVersand({
  to, subject, sent, reason = "", art = ""
}, { env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, grund: "speicher_nicht_eingerichtet" };

  const zeit = new Date(jetztMs);
  const eintrag = {
    id: `mail_${crypto.randomUUID()}`,
    am: zeit.toISOString(),
    empfaenger: String(to || "").trim().toLowerCase().slice(0, 200),
    // Der Betreff ist fester Text aus dem Code und sagt, worum es ging.
    betreff: String(subject || "").slice(0, 200),
    art: String(art || "").slice(0, 40) || null,
    zugestellt: sent === true,
    // Nur der Grund, nie der Mailtext — dort steht der Anmeldelink.
    grund: sent === true ? null : String(reason || "unbekannt").slice(0, 200)
  };

  try {
    const key = `${PRAEFIX}/${schluesselTag(zeit)}/${eintrag.id}.json`;
    await signedS3Put({
      ...cfg,
      key,
      body: `${JSON.stringify(eintrag, null, 2)}\n`,
      contentType: "application/json; charset=utf-8",
      fetchImpl
    });
    return { ok: true, key };
  } catch (error) {
    // Bewusst geschluckt: siehe Regel 1 im Kopf dieser Datei.
    return { ok: false, grund: String(error?.message || "schreiben_fehlgeschlagen").slice(0, 160) };
  }
}

/** Liest die Eintraege der letzten Tage, juengste zuerst. */
export async function leseZustellungen({
  env = process.env, fetchImpl = fetch, jetztMs = Date.now(), tage = 14, limit = 100
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", eintraege: [] };

  const spanne = Math.max(1, Math.min(AUFBEWAHRUNG_TAGE, Number(tage) || 14));
  const praefixe = [];
  for (let i = 0; i < spanne; i += 1) {
    praefixe.push(`${PRAEFIX}/${schluesselTag(new Date(jetztMs - i * TAG_MS))}/`);
  }

  const seiten = await mapMitGrenze(praefixe, (p) => listeSchluessel(cfg, p, fetchImpl), 6);
  const schluessel = seiten.filter(Boolean).flat().sort().reverse().slice(0, Math.min(200, limit));

  const eintraege = (await mapMitGrenze(schluessel, (k) => leseEintrag(cfg, k, fetchImpl), 8))
    .filter(Boolean)
    .sort((a, b) => String(b.am).localeCompare(String(a.am)));

  return {
    ok: true,
    eintraege,
    total: eintraege.length,
    zeitraumTage: spanne,
    zugestellt: eintraege.filter((e) => e.zugestellt).length,
    fehlgeschlagen: eintraege.filter((e) => !e.zugestellt).length,
    aufbewahrungTage: AUFBEWAHRUNG_TAGE
  };
}

/**
 * Loescht Eintraege, die aelter als die Aufbewahrungsfrist sind.
 * Der Betreiber hat genau das freigegeben — und nur das: geloescht wird
 * ausschliesslich unterhalb von `mail/zustellung/` und nur, was zu alt ist.
 */
export async function raeumeAuf({
  env = process.env, fetchImpl = fetch, jetztMs = Date.now(), maxLoeschungen = 500
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet", geloescht: 0 };

  const grenze = schluesselTag(new Date(jetztMs - AUFBEWAHRUNG_TAGE * TAG_MS));
  let token = null;
  let seiten = 0;
  const zuAlt = [];
  try {
    do {
      const { response, body } = await signedS3List({ ...cfg, prefix: `${PRAEFIX}/`, continuationToken: token, fetchImpl });
      if (!response.ok) return { ok: false, error: `listing_http_${response.status}`, geloescht: 0 };
      for (const key of (parseS3ListPage(body).keys || [])) {
        const tag = tagAusSchluessel(key);
        // Nur was ZWEIFELSFREI zu alt ist. Ein Schluessel ohne erkennbares
        // Datum wird nie geloescht — im Zweifel bleibt er stehen.
        if (tag && tag < grenze) zuAlt.push(key);
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(String(body))
        ? (String(body).match(/<NextContinuationToken>([^<]+)</) || [])[1] || null
        : null;
      seiten += 1;
    } while (token && seiten < MAX_SEITEN);
  } catch (error) {
    return { ok: false, error: String(error?.message || "listing_fehlgeschlagen").slice(0, 160), geloescht: 0 };
  }

  const auswahl = zuAlt.slice(0, maxLoeschungen);
  const ergebnisse = await mapMitGrenze(auswahl, async (key) => {
    // Zweite Sicherung, direkt vor dem Loeschen. Die erste (Datum zu alt) sagt
    // WANN, diese sagt WO. Der Signierer selbst kennt keine Regeln — die
    // Freigabe des Betreibers gilt nur fuer diesen einen Bereich.
    if (!darfGeloeschtWerden(key)) return false;
    try {
      await signedS3Delete({ ...cfg, key, fetchImpl });
      return true;
    } catch {
      return false;
    }
  }, 6);

  return {
    ok: true,
    geloescht: ergebnisse.filter(Boolean).length,
    gefunden: zuAlt.length,
    grenzeTag: grenze,
    aufbewahrungTage: AUFBEWAHRUNG_TAGE,
    unvollstaendig: zuAlt.length > auswahl.length || Boolean(token)
  };
}

async function listeSchluessel(cfg, prefix, fetchImpl) {
  try {
    const { response, body } = await signedS3List({ ...cfg, prefix, fetchImpl });
    if (!response.ok) return [];
    return (parseS3ListPage(body).keys || []).filter((k) => k.endsWith(".json"));
  } catch {
    return [];
  }
}

async function leseEintrag(cfg, key, fetchImpl) {
  try {
    const ergebnis = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
    if (!ergebnis.ok || !ergebnis.body) return null;
    return JSON.parse(ergebnis.body);
  } catch {
    return null;
  }
}

function schluesselTag(datum) {
  const j = datum.getUTCFullYear();
  const m = String(datum.getUTCMonth() + 1).padStart(2, "0");
  const t = String(datum.getUTCDate()).padStart(2, "0");
  return `${j}/${m}/${t}`;
}

/**
 * Der einzige Ort, an dem entschieden wird, ob ein Objekt geloescht werden
 * darf. Erlaubt ist ausschliesslich das Zustellprotokoll — und dort nur
 * Tagesordner, keine anderen Formen.
 *
 * Bewusst als eigene, exportierte Funktion: so laesst sie sich einzeln testen,
 * und ein kuenftiger Aufrufer sieht sofort, dass es sie gibt.
 */
export function darfGeloeschtWerden(key) {
  return /^mail\/zustellung\/\d{4}\/\d{2}\/\d{2}\/mail_[a-f0-9-]{36}\.json$/.test(String(key || ""));
}

function tagAusSchluessel(key) {
  const treffer = String(key).match(/^mail\/zustellung\/(\d{4}\/\d{2}\/\d{2})\//);
  return treffer ? treffer[1] : null;
}

function idriveConfig(env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

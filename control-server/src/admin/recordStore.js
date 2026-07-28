// smejj.com — Datensatz-Speicher fuer den Adminbereich (Single Responsibility: Ablage).
//
// Vier Module der Stufe 4 brauchen dasselbe: JSON-Datensaetze unter einem
// Praefix auf IDrive e2 ablegen, einzeln lesen, auflisten — mit Memory-Rueckfall
// fuer Entwicklung und Tests. Viermal derselbe Code waere viermal dieselbe
// Gelegenheit, einen Fehler zu machen.
//
// Zwei Dinge, die hier bereits richtig sind und deshalb nirgends mehr falsch
// gemacht werden koennen:
//   - Das Auflisten holt die Objekte begrenzt nebenlaeufig (parallelFetch),
//     nicht in einer Schleife. Das war der Latenzfehler aus Stufe 3.
//   - Ein unlesbarer Datensatz faellt weg, statt die ganze Liste zu kippen.
//
// Was hier NICHT passiert: Fachlogik. Der Speicher weiss nicht, was ein
// Feature-Flag oder eine Betroffenenanfrage ist — das wissen die Module.
import crypto from "node:crypto";
import { parseS3ListPage, signedS3Get, signedS3List, signedS3Put } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

const MAX_DATENSAETZE = 500;
// Wie lange ein frisch geschriebener Datensatz aus dem Prozess ergaenzt wird.
// Live gemessen (28.07.2026): IDrive e2 braucht nach dem Schreiben bis zu einer
// Minute, bis das Objekt in der LIST-Antwort auftaucht. Das Objekt selbst ist
// sofort da — nur der Index hinkt. Zehn Minuten sind grosszuegig gewaehlt; wer
// laenger braucht, hat ein anderes Problem.
const FRISCH_MS = 10 * 60 * 1000;
const MAX_FRISCH = 200;

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

/** Kurze, gut lesbare Kennung mit sprechendem Praefix. */
export function neueKennung(praefix) {
  return `${praefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

/**
 * Erzeugt einen Speicher fuer einen Praefix.
 *
 * @param {string} praefix z. B. "admin/flags"
 * @param {object} [optionen]
 * @param {number} [optionen.maximal] Obergrenze fuer das Auflisten
 * @returns {{lies, schreib, liste, __leeren}}
 */
export function createRecordStore(praefix, { maximal = MAX_DATENSAETZE } = {}) {
  const pfad = String(praefix || "").replace(/\/+$/, "");
  if (!pfad) throw new Error("record_store_prefix_required");
  const memory = new Map();
  // Was dieser Prozess gerade geschrieben hat. Nicht als Zwischenspeicher
  // gedacht — nur als Ausgleich fuer den nachhinkenden LIST-Index. Ein Eintrag
  // hier ersetzt nie einen gelesenen, er ergaenzt nur einen fehlenden.
  const frisch = new Map();
  const schluessel = (id) => `${pfad}/${id}.json`;

  function merkeFrisch(datensatz, nowMs) {
    frisch.set(datensatz.id, { datensatz, at: nowMs });
    if (frisch.size <= MAX_FRISCH) return;
    // Aeltesten zuerst raus: Map behaelt die Einfuegereihenfolge.
    for (const key of frisch.keys()) {
      frisch.delete(key);
      if (frisch.size <= MAX_FRISCH) break;
    }
  }

  function frischeErgaenzen(gelesen, nowMs) {
    const bekannt = new Set(gelesen.map((d) => d?.id).filter(Boolean));
    const ergaenzt = [...gelesen];
    for (const [id, eintrag] of [...frisch.entries()]) {
      if (nowMs - eintrag.at > FRISCH_MS) { frisch.delete(id); continue; }
      if (!bekannt.has(id)) ergaenzt.push(eintrag.datensatz);
    }
    return ergaenzt;
  }

  async function lies(id, { env = process.env, fetchImpl = fetch } = {}) {
    const kennung = String(id || "");
    if (!kennung) return null;
    const cfg = idriveConfig(env);
    if (!cfg) return memory.get(kennung) || null;
    try {
      const ergebnis = await signedS3Get({ ...cfg, key: schluessel(kennung), allowNotFound: true, fetchImpl });
      if (!ergebnis.ok || !ergebnis.body) return null;
      return JSON.parse(ergebnis.body);
    } catch {
      return null;
    }
  }

  async function schreib(datensatz, { env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
    if (!datensatz?.id) throw new Error("record_store_id_required");
    const cfg = idriveConfig(env);
    if (!cfg) { memory.set(datensatz.id, datensatz); return datensatz; }
    await signedS3Put({
      ...cfg,
      key: schluessel(datensatz.id),
      body: JSON.stringify(datensatz, null, 2),
      contentType: "application/json; charset=utf-8",
      fetchImpl
    });
    merkeFrisch(datensatz, nowMs);
    return datensatz;
  }

  /**
   * Alle Datensaetze, neueste zuerst (nach `createdAt`).
   * @param {Function} [optionen.aufbereiten] wird auf jeden Datensatz angewandt
   *   (z. B. um einen berechneten Zustand zu ergaenzen)
   */
  async function liste({
    env = process.env, fetchImpl = fetch, aufbereiten = null, limit = maximal, nowMs = Date.now()
  } = {}) {
    const gedeckelt = Math.min(maximal, Math.max(1, Number(limit) || maximal));
    const cfg = idriveConfig(env);

    let alle = [];
    if (!cfg) {
      alle = [...memory.values()];
    } else {
      const schluesselListe = [];
      let continuationToken = null;
      do {
        const { response, body } = await signedS3List({ ...cfg, prefix: `${pfad}/`, continuationToken, fetchImpl });
        if (!response.ok) return { ok: false, error: "record_store_list_failed", datensaetze: [], total: 0 };
        const seite = parseS3ListPage(body);
        for (const key of seite.keys) if (key.endsWith(".json")) schluesselListe.push(key);
        continuationToken = seite.isTruncated ? seite.nextContinuationToken : null;
      } while (continuationToken && schluesselListe.length < maximal);

      const geladen = await mapMitGrenze(schluesselListe.slice(0, maximal), async (key) => {
        const ergebnis = await signedS3Get({ ...cfg, key, allowNotFound: true, fetchImpl });
        return ergebnis.ok && ergebnis.body ? JSON.parse(ergebnis.body) : null;
      });
      // Erst hier ergaenzen, nicht im Memory-Zweig: dort ist ohnehin alles da.
      alle = frischeErgaenzen(geladen.filter(Boolean), nowMs);
    }

    const fertig = alle
      .map((datensatz) => (typeof aufbereiten === "function" ? aufbereiten(datensatz) : datensatz))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return { ok: true, datensaetze: fertig.slice(0, gedeckelt), total: fertig.length };
  }

  function __leeren() { memory.clear(); frisch.clear(); }

  return { lies, schreib, liste, __leeren, praefix: pfad };
}

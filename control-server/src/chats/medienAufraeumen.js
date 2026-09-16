// smejj.com — Medien aufraeumen, die kein Chat mehr braucht.
//
// WARUM (Betreiber-Auftrag 2026-09-17, Punkt 13): "Beim Loeschen einer
// Chat-Nachricht bzw. eines Mediums muessen Datenbank und Storage sauber
// synchron bleiben. Keine verwaisten Dateien." Bis dahin loeschte NICHTS ein
// Medium: ein endgueltig geloeschter Chat wurde zum Grabstein, seine Bilder
// lagen weiter im Eimer.
//
// Warum nicht einfach beim Chat-Loeschen die Bilder des Chats mitloeschen: die
// Kennung ist der Inhalts-Hash. Dasselbe Bild in zwei Chats (Abzweigen,
// Weiterleiten, zweimal erzeugt) liegt EINMAL im Eimer. Geloescht werden darf
// ein Medium also nur, wenn KEIN Chat des Kontos es mehr erwaehnt — auch keiner
// im Papierkorb, denn der laesst sich wiederherstellen.
//
// FAIL-CLOSED, weil hier Nutzerdaten verschwinden:
//   - Gelingt das Lesen auch nur EINES Chats nicht, wird nichts geloescht.
//   - Ist die Chat-Liste abgeschnitten (mehr Dateien als eine Listenseite),
//     wird nichts geloescht.
//   - Frisch hochgeladene Medien (juenger als SCHONFRIST_NEU_MS) bleiben: der
//     Chat, der sie erwaehnt, ist vielleicht noch unterwegs.
//   - Verwaiste Medien OHNE konkreten Anlass (Nachricht entfernt, Chat nie
//     angekommen) bleiben SCHONFRIST_WAISE_MS liegen — ein Geraet, das lange
//     offline war, soll seine Bilder beim naechsten Abgleich noch finden.
//   - Hoechstens MAX_LOESCHUNGEN je Lauf.
import { signedS3Get, signedS3List, parseS3ListPage } from "../storage/s3Signer.js";
import { idriveConfig, PRAEFIX as CHAT_PRAEFIX } from "./chatSyncStore.js";
import { istIndexSchluessel } from "./chatIndex.js";
import { ALLE_TYPEN, MEDIEN_PRAEFIX, VORSCHAU_ENDUNG, kennungGueltig, kontoGueltig, loescheMedium } from "./medienStore.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

export const SCHONFRIST_NEU_MS = 10 * 60 * 1000;
export const SCHONFRIST_WAISE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_LOESCHUNGEN = 200;
const TIMEOUT_MS = 5000;
const ENDUNGEN = Object.values(ALLE_TYPEN).join("|");

/** Alle Medien-Kennungen, die in einem Stueck Text/JSON vorkommen. */
export function kennungenIn(text) {
  const treffer = String(text || "").matchAll(new RegExp(`(?<![a-f0-9])([a-f0-9]{40}\\.(?:${ENDUNGEN}))(?![a-z0-9])`, "g"));
  return new Set([...treffer].map((t) => t[1]).filter(kennungGueltig));
}

/**
 * Welche Medien darf der Lauf loeschen? Rein — die Tests pruefen hier jede
 * Schutzregel ohne Ablage.
 *
 * @param {object} p
 * @param {Array<{id: string, zeitMs: number, bytes: number}>} p.medien  Objekte im Eimer
 * @param {Set<string>} p.benutzt  Kennungen, die ein Chat erwaehnt
 * @param {Set<string>} p.anlass   Kennungen aus einem gerade geloeschten Chat
 */
export function waehleLoeschbare({ medien, benutzt, anlass = new Set(), jetztMs = Date.now() }) {
  const ergebnis = [];
  for (const medium of medien) {
    if (!kennungGueltig(medium.id) || benutzt.has(medium.id)) continue;
    if (medium.bytes === 0) continue; // schon geleert
    const alter = jetztMs - (medium.zeitMs || jetztMs);
    const frist = anlass.has(medium.id) ? SCHONFRIST_NEU_MS : SCHONFRIST_WAISE_MS;
    if (!medium.zeitMs || alter < frist) continue;
    ergebnis.push(medium.id);
    if (ergebnis.length >= MAX_LOESCHUNGEN) break;
  }
  return ergebnis;
}

function listenEintraege(xml) {
  return [...String(xml || "").matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((block) => {
    const key = (block[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || "";
    const zeit = (block[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1] || "";
    const groesse = (block[1].match(/<Size>(\d+)<\/Size>/) || [])[1];
    return { key, zeitMs: Date.parse(zeit.trim()) || 0, bytes: groesse === undefined ? -1 : Number(groesse) };
  });
}

async function listeVollstaendig({ cfg, prefix, fetchImpl }) {
  const eintraege = [];
  let weiter = null;
  for (let seite = 0; seite < 20; seite += 1) {
    const { response, body } = await signedS3List({ ...cfg, prefix, continuationToken: weiter, fetchImpl, timeoutMs: TIMEOUT_MS });
    if (!response?.ok) throw new Error("liste_fehlgeschlagen");
    eintraege.push(...listenEintraege(body));
    const info = parseS3ListPage(body);
    if (info.isTruncated !== true) return eintraege;
    weiter = info.nextContinuationToken;
    if (!weiter) throw new Error("liste_unvollstaendig");
  }
  throw new Error("liste_zu_lang");
}

/**
 * Ein Lauf fuer EIN Konto.
 * @returns {Promise<{ok: boolean, geloescht: string[], error?: string}>}
 */
export async function raeumeKontoAuf({ kontoId, anlass = new Set(), env = process.env, fetchImpl = fetch, jetztMs = Date.now(), teilen = null }) {
  if (!kontoGueltig(kontoId)) return { ok: false, geloescht: [], error: "konto_ungueltig" };
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, geloescht: [], error: "ablage_nicht_konfiguriert" };
  try {
    const medienObjekte = await listeVollstaendig({ cfg, prefix: `${MEDIEN_PRAEFIX}/${kontoId}/`, fetchImpl });
    const medien = medienObjekte
      .map((o) => ({ ...o, id: o.key.slice(`${MEDIEN_PRAEFIX}/${kontoId}/`.length) }))
      .filter((o) => !o.id.endsWith(VORSCHAU_ENDUNG) && kennungGueltig(o.id));
    if (!medien.length) return { ok: true, geloescht: [] };

    const chatObjekte = (await listeVollstaendig({ cfg, prefix: `${CHAT_PRAEFIX}/${kontoId}/`, fetchImpl }))
      .filter((o) => o.key && !istIndexSchluessel(o.key));
    const benutzt = new Set();
    const texte = await mapMitGrenze(chatObjekte, async (objekt) => {
      const antwort = await signedS3Get({ ...cfg, key: objekt.key, allowNotFound: true, fetchImpl, timeoutMs: TIMEOUT_MS });
      // 404 zwischen Liste und Lesen = gerade geloescht; alles andere unklar.
      if (!antwort?.ok && antwort?.status !== 404) throw new Error("chat_unlesbar");
      return antwort?.body || "";
    });
    // mapMitGrenze liefert bei einem Fehler null an der Stelle — dann ist die
    // Sicht unvollstaendig, und ein unvollstaendiges Bild darf nichts loeschen.
    if (texte.some((text) => text === null)) return { ok: false, geloescht: [], error: "chats_unvollstaendig" };
    for (const text of texte) for (const id of kennungenIn(text)) benutzt.add(id);

    const loeschbar = waehleLoeschbare({ medien, benutzt, anlass, jetztMs });
    const geloescht = [];
    for (const id of loeschbar) {
      const ergebnis = await loescheMedium({ id, kontoId, env, fetchImpl });
      if (!ergebnis.ok) continue;
      geloescht.push(id);
      if (teilen) await teilen.widerrufeFuerMedium({ kontoId, id }).catch(() => {});
    }
    return { ok: true, geloescht };
  } catch (fehler) {
    return { ok: false, geloescht: [], error: String(fehler?.message || "aufraeumen_fehlgeschlagen").slice(0, 120) };
  }
}

/**
 * Planer: sammelt Anlaesse je Konto und startet den Lauf entprellt (mehrere
 * Loeschungen hintereinander = ein Lauf). Ausserdem hoechstens ein Waisen-Lauf
 * je Konto am Tag, angestossen von normaler Medien-Nutzung.
 */
export function createMedienAufraeumer({ env = process.env, fetchImpl = fetch, teilen = null, verzoegerungMs = 5000, protokoll = () => {} } = {}) {
  const wartend = new Map();
  const laufend = new Set();
  const letzterTageslauf = new Map();

  function plane(kontoId, anlassIds = []) {
    if (!kontoGueltig(kontoId)) return;
    const eintrag = wartend.get(kontoId) || { anlass: new Set(), timer: null };
    for (const id of anlassIds) if (kennungGueltig(id)) eintrag.anlass.add(id);
    if (eintrag.timer) clearTimeout(eintrag.timer);
    eintrag.timer = setTimeout(() => starte(kontoId), verzoegerungMs);
    eintrag.timer.unref?.();
    wartend.set(kontoId, eintrag);
  }

  async function starte(kontoId) {
    if (laufend.has(kontoId)) { plane(kontoId); return; }
    const eintrag = wartend.get(kontoId);
    wartend.delete(kontoId);
    laufend.add(kontoId);
    try {
      const ergebnis = await raeumeKontoAuf({ kontoId, anlass: eintrag?.anlass || new Set(), env, fetchImpl, teilen });
      protokoll({ art: "medien_aufraeumen", ok: ergebnis.ok, geloescht: ergebnis.geloescht.length, fehler: ergebnis.error || "" });
    } finally {
      laufend.delete(kontoId);
    }
  }

  function taeglich(kontoId, jetztMs = Date.now()) {
    if (!kontoGueltig(kontoId)) return;
    const zuletzt = letzterTageslauf.get(kontoId) || 0;
    if (jetztMs - zuletzt < 24 * 60 * 60 * 1000) return;
    letzterTageslauf.set(kontoId, jetztMs);
    if (letzterTageslauf.size > 10_000) letzterTageslauf.delete(letzterTageslauf.keys().next().value);
    plane(kontoId);
  }

  return { plane, taeglich };
}

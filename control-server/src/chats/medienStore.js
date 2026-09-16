// smejj.com — Medien-Ablage fuer den Chat-Verlauf.
//
// WARUM ES DIESE DATEI GIBT (gemessen 2026-08-14): Erzeugte Bilder und Videos
// haben kein einziges Neuladen ueberlebt — auf ZWEI verschiedenen Wegen, beide
// fuer den Nutzer unsichtbar:
//
//   1. VIDEO: chat-markdown.js ersetzt die `data:`-Adresse durch eine
//      `blob:`-Adresse, damit der Player sie abspielen kann. chat-store.js
//      speichert danach `node.innerHTML` — also nur noch den blob-Zeiger. Der
//      lebt genau so lange wie der Tab. Im Konto lagen vier solcher Leichen,
//      jede mit einem `html`-Feld unter 1 KB: die 0,57 MB Videodaten waren nie
//      gespeichert worden.
//   2. BILD: Ein erzeugtes Bild ist als data:-URL ~585 KB. chatSyncStore
//      deckelt einen Chat auf MAX_CHAT_BYTES = 512 KB und weist bei
//      Ueberschreitung den GANZEN Chat ab ("chat_zu_gross"). Jeder Chat mit
//      Bild lag damit rechnerisch ueber der Grenze — und chat-sync.js prueft
//      nur auf Status 503, ein 400 fiel still durch. Die Unterhaltung erreichte
//      den Server nie.
//
// Beleg fuer beides: das groesste `html`-Feld ueber alle 125 gespeicherten
// Nachrichten war 7 KB. Es ist nie ein Medium im Verlauf gelandet.
//
// Die Loesung ist dieselbe wie bei allen grossen Anbietern: Das Medium wandert
// NICHT im Chat-JSON mit, sondern liegt als eigenes Objekt daneben; im Chat
// steht nur eine kurze Adresse. Damit bleibt der 512-KB-Deckel sinnvoll (er
// schuetzt vor Endlos-Verlaeufen, nicht vor Bildern) und ein Medium ueberlebt
// jedes Neuladen und jeden Geraetewechsel.
//
// Grundsaetze — dieselben wie in chatSyncStore.js, damit hier keine zweite
// Sicherheitsauffassung entsteht:
//   - FAIL-CLOSED UND AUS: ohne SMEJJ_CHAT_SYNC_ENABLED passiert nichts.
//   - DER SERVER GLAUBT DEM CLIENT NICHT: die Kontokennung kommt aus der
//     geprueften Sitzung, nie aus dem Datensatz. Ein Medium liegt unter seinem
//     Konto und ist von fremden Konten nicht adressierbar.
//   - GRENZEN VOR SPEICHERPLATZ: Typ- und Groessenschranke, sonst laedt jemand
//     beliebige Dateien in den Eimer.
//
// MEDIEN-SYSTEM 2026-09-17 (Betreiber-Auftrag "gesamtes Medien-System
// professionell", alle Rechte A–Z): Die Ablage prueft jetzt auch den INHALT
// (Dateikennung) statt nur die Typangabe des Browsers, nimmt Dateien roh statt
// als base64-JSON an (die JSON-Grenze von 1 MB liess real nur ~730 KB durch,
// obwohl hier 8 MB versprochen waren), liefert Teilstuecke fuer Video/Audio
// (Range) und kann ein Medium wieder loeschen.

import crypto from "node:crypto";
import { signedS3Delete, signedS3Get, signedS3Put } from "../storage/s3Signer.js";
import { idriveConfig, kontoKennung, syncAktiv } from "./chatSyncStore.js";

export const MEDIEN_PRAEFIX = "chat-medien";

// 8 MB je Medium auf dem ALTEN Weg (data:-URL im JSON). Gemessen liegen
// erzeugte Bilder bei ~0,6 MB und Videos bei ~0,6 MB.
export const MAX_MEDIUM_BYTES = 8 * 1024 * 1024;

// 25 MB je Datei auf dem ROHEN Weg (POST mit Content-Type = Medientyp). Der
// Server haelt eine Datei beim Lesen einmal im Speicher — 25 MB bei 120
// Uploads je Stunde je Konto ist fuer 8 GB unkritisch.
export const MAX_DATEI_BYTES = 25 * 1024 * 1024;

// Medien-Abrufe duerfen laenger dauern als die kleinen Steuerobjekte (2,5 s):
// 25 MB zum Objektspeicher brauchen auch bei gutem Netz mehrere Sekunden.
export const MEDIEN_TIMEOUT_MS = 60_000;

// Nur was der Chat selbst erzeugt oder anzeigt. Bewusst eine Positivliste:
// eine Verbotsliste waere ein Einfallstor fuer alles Neue.
export const ERLAUBTE_TYPEN = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm"
});

// Dateien, die als Anhang abgelegt, aber NIE als Teil einer data:-URL in den
// Chat gerendert werden. Getrennt gehalten, weil die Rettung im Client genau
// die Familien von ERLAUBTE_TYPEN spiegelt. SVG und HTML fehlen mit Absicht:
// beide koennen Skripte tragen.
export const ANHANG_TYPEN = Object.freeze({
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "weba",
  "application/pdf": "pdf"
});

export const ALLE_TYPEN = Object.freeze({ ...ERLAUBTE_TYPEN, ...ANHANG_TYPEN });
const KENNUNG_MUSTER = new RegExp(`^[a-f0-9]{40}\\.(${Object.values(ALLE_TYPEN).join("|")})$`);

/** Medientyp zu einer Kennung — immer aus der Positivliste, nie aus der Anfrage. */
export function typFuerKennung(id) {
  const endung = String(id || "").split(".").pop();
  return Object.keys(ALLE_TYPEN).find((typ) => ALLE_TYPEN[typ] === endung) || "application/octet-stream";
}

/**
 * Passt der INHALT zum angegebenen Typ? Der Browser (und ein Angreifer) kann
 * jeden Content-Type behaupten — eine HTML-Datei als "image/png" waere sonst
 * im Eimer. Geprueft wird die Dateikennung am Anfang der Datei.
 */
export function inhaltPasstZuTyp(daten, mime) {
  const b = Buffer.isBuffer(daten) ? daten : Buffer.alloc(0);
  const ab = (offset, ...bytes) => bytes.every((wert, i) => b[offset + i] === wert);
  const text = (offset, zeichen) => b.subarray(offset, offset + zeichen.length).toString("latin1") === zeichen;
  switch (mime) {
    case "image/png": return ab(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg": return ab(0, 0xff, 0xd8, 0xff);
    case "image/webp": return text(0, "RIFF") && text(8, "WEBP");
    case "image/gif": return text(0, "GIF87a") || text(0, "GIF89a");
    case "video/mp4":
    case "audio/mp4": return text(4, "ftyp");
    case "video/webm":
    case "audio/webm": return ab(0, 0x1a, 0x45, 0xdf, 0xa3);
    case "audio/mpeg": return text(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "audio/ogg": return text(0, "OggS");
    case "audio/wav": return text(0, "RIFF") && text(8, "WAVE");
    case "application/pdf": return text(0, "%PDF-");
    default: return false;
  }
}

/**
 * Zerlegt eine data:-URL in Typ und Rohdaten.
 *
 * Rein und ohne Seiteneffekt, damit der Test sie ohne Ablage pruefen kann.
 * Fail-closed: alles, was nicht genau passt, ist ungueltig — lieber ein
 * abgelehntes Medium als ein unbekanntes Format im Eimer.
 *
 * @param {string} dataUrl
 * @returns {{ok: true, mime: string, endung: string, daten: Buffer} | {ok: false, error: string}}
 */
export function leseDataUrl(dataUrl) {
  const roh = String(dataUrl || "");
  const treffer = roh.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!treffer) return { ok: false, error: "kein_data_url" };
  const mime = treffer[1].toLowerCase();
  const endung = ERLAUBTE_TYPEN[mime];
  if (!endung) return { ok: false, error: "typ_nicht_erlaubt" };
  let daten;
  try {
    daten = Buffer.from(treffer[2], "base64");
  } catch {
    return { ok: false, error: "base64_kaputt" };
  }
  if (daten.length === 0) return { ok: false, error: "leer" };
  if (daten.length > MAX_MEDIUM_BYTES) return { ok: false, error: "zu_gross" };
  return { ok: true, mime, endung, daten };
}

/**
 * Prueft eine ROH hochgeladene Datei (neuer Weg). Typ aus der Positivliste,
 * Groesse, und der Inhalt muss zum Typ passen.
 */
export function pruefeRohdatei(daten, contentType) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  const endung = ALLE_TYPEN[mime];
  if (!endung) return { ok: false, error: "typ_nicht_erlaubt" };
  if (!Buffer.isBuffer(daten) || daten.length === 0) return { ok: false, error: "leer" };
  if (daten.length > MAX_DATEI_BYTES) return { ok: false, error: "zu_gross" };
  if (!inhaltPasstZuTyp(daten, mime)) return { ok: false, error: "inhalt_passt_nicht_zum_typ" };
  return { ok: true, mime, endung, daten };
}

/**
 * Die Kennung ist der Inhalts-Hash. Das hat zwei Vorteile, die beide zaehlen:
 * dasselbe Bild zweimal geschickt belegt den Platz nur einmal, und die Kennung
 * ist nicht erratbar (ein Konto kann fremde Medien nicht durchprobieren).
 */
export function medienKennung(daten, endung) {
  const hash = crypto.createHash("sha256").update(daten).digest("hex").slice(0, 40);
  return `${hash}.${endung}`;
}

/** Nur Hexziffern und eine bekannte Endung — sonst kein Schluesselbau. */
export function kennungGueltig(id) {
  return KENNUNG_MUSTER.test(String(id || ""));
}

/** Konto-Kennungen, wie kontoKennung() sie baut — nichts anderes wird zum Pfad. */
export function kontoGueltig(kontoId) {
  return /^user_[a-f0-9]{32}$/.test(String(kontoId || ""));
}

// Die verkleinerte Anzeige-Fassung eines Bildes (WebP, im Browser erzeugt).
export const VORSCHAU_ENDUNG = ".vorschau.webp";

export function medienSchluessel(kontoId, id, { vorschau = false } = {}) {
  if (!kontoGueltig(kontoId) || !kennungGueltig(id)) throw new Error("medien_schluessel_ungueltig");
  return `${MEDIEN_PRAEFIX}/${kontoId}/${id}${vorschau ? VORSCHAU_ENDUNG : ""}`;
}

async function schreibe({ kontoId, id, daten, mime, vorschau = false, env, fetchImpl }) {
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  try {
    await signedS3Put({
      ...cfg,
      key: medienSchluessel(kontoId, id, { vorschau }),
      body: daten,
      contentType: mime,
      fetchImpl,
      timeoutMs: MEDIEN_TIMEOUT_MS
    });
  } catch (fehler) {
    return { ok: false, error: String(fehler?.message || "schreiben_fehlgeschlagen").slice(0, 160) };
  }
  return { ok: true };
}

/**
 * Legt ein Medium ab und gibt seine Kennung zurueck (alter Weg: data:-URL).
 *
 * @returns {Promise<{ok: true, id: string, mime: string, bytes: number} | {ok: false, error: string}>}
 */
export async function speichereMedium({ dataUrl, kontoId, env = process.env, fetchImpl = fetch }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  if (!kontoId) return { ok: false, error: "konto_fehlt" };
  const gelesen = leseDataUrl(dataUrl);
  if (!gelesen.ok) return gelesen;
  if (!inhaltPasstZuTyp(gelesen.daten, gelesen.mime)) return { ok: false, error: "inhalt_passt_nicht_zum_typ" };
  return speichereGeprueft({ geprueft: gelesen, kontoId, env, fetchImpl });
}

/** Neuer Weg: rohe Bytes mit Content-Type. */
export async function speichereRohdatei({ daten, contentType, kontoId, env = process.env, fetchImpl = fetch }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  if (!kontoId) return { ok: false, error: "konto_fehlt" };
  const geprueft = pruefeRohdatei(daten, contentType);
  if (!geprueft.ok) return geprueft;
  return speichereGeprueft({ geprueft, kontoId, env, fetchImpl });
}

async function speichereGeprueft({ geprueft, kontoId, env, fetchImpl }) {
  if (!kontoGueltig(kontoId)) return { ok: false, error: "konto_fehlt" };
  const id = medienKennung(geprueft.daten, geprueft.endung);
  const geschrieben = await schreibe({ kontoId, id, daten: geprueft.daten, mime: geprueft.mime, env, fetchImpl });
  if (!geschrieben.ok) return geschrieben;
  return { ok: true, id, mime: geprueft.mime, bytes: geprueft.daten.length };
}

/**
 * Legt die verkleinerte WebP-Anzeigefassung eines EIGENEN Bildes ab. Das
 * Original muss im Konto existieren — sonst koennte man beliebige Dateien
 * unter fremd klingenden Namen ablegen.
 */
export async function speichereVorschau({ id, daten, kontoId, env = process.env, fetchImpl = fetch }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  if (!kontoGueltig(kontoId)) return { ok: false, error: "konto_fehlt" };
  if (!kennungGueltig(id) || !typFuerKennung(id).startsWith("image/")) return { ok: false, error: "kennung_ungueltig" };
  const geprueft = pruefeRohdatei(daten, "image/webp");
  if (!geprueft.ok) return geprueft;
  if (geprueft.daten.length > 2 * 1024 * 1024) return { ok: false, error: "zu_gross" };
  const original = await ladeMedium({ id, kontoId, env, fetchImpl, range: "bytes=0-0" });
  if (!original.ok) return { ok: false, error: "nicht_gefunden" };
  const geschrieben = await schreibe({ kontoId, id, daten: geprueft.daten, mime: "image/webp", vorschau: true, env, fetchImpl });
  return geschrieben.ok ? { ok: true, id, bytes: geprueft.daten.length } : geschrieben;
}

/**
 * Holt ein Medium des EIGENEN Kontos zurueck — ganz oder als Teilstueck.
 *
 * `vorschau`: erst die WebP-Anzeigefassung versuchen, sonst das Original.
 * `range`: ein "bytes=a-b"-Kopf; die Antwort traegt dann status 206.
 *
 * @returns {Promise<{ok: true, daten: Buffer, mime: string, status: number, contentRange: string} | {ok: false, error: string}>}
 */
export async function ladeMedium({ id, kontoId, env = process.env, fetchImpl = fetch, range = "", vorschau = false }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  if (!kontoId) return { ok: false, error: "konto_fehlt" };
  if (!kennungGueltig(id) || !kontoGueltig(kontoId)) return { ok: false, error: "kennung_ungueltig" };
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  const bereich = bereichGueltig(range) ? range : "";
  if (vorschau && typFuerKennung(id).startsWith("image/")) {
    const klein = await holeObjekt({ cfg, key: medienSchluessel(kontoId, id, { vorschau: true }), range: bereich, fetchImpl });
    if (klein.ok) return { ...klein, mime: "image/webp", vorschau: true };
  }
  const gross = await holeObjekt({ cfg, key: medienSchluessel(kontoId, id), range: bereich, fetchImpl });
  return gross.ok ? { ...gross, mime: typFuerKennung(id) } : gross;
}

/** Nur ein einzelner, einfacher Bereich — Mehrfachbereiche braucht kein Player. */
export function bereichGueltig(range) {
  return /^bytes=(\d{1,12})-(\d{0,12})$|^bytes=-(\d{1,12})$/.test(String(range || ""));
}

async function holeObjekt({ cfg, key, range, fetchImpl }) {
  try {
    // responseType "buffer" ist Pflicht: die Voreinstellung ist "text" und
    // wuerde die Bytes durch UTF-8 jagen — ein PNG kaeme kaputt zurueck.
    // allowNotFound, damit ein fehlendes Medium eine saubere Antwort gibt
    // statt einer Ausnahme (der Nutzer soll "nicht gefunden" sehen, nicht 503).
    const antwort = await signedS3Get({
      ...cfg, key, fetchImpl, timeoutMs: MEDIEN_TIMEOUT_MS, responseType: "buffer", allowNotFound: true, range
    });
    if (!antwort?.ok) return { ok: false, error: "nicht_gefunden" };
    // Ein geloeschtes Medium kann als leeres Objekt zurueckbleiben, falls der
    // Schluessel nicht loeschen darf (siehe loescheMedium) — das ist "weg".
    if (!antwort.body?.length) return { ok: false, error: "nicht_gefunden" };
    return { ok: true, daten: antwort.body, status: antwort.status === 206 ? 206 : 200, contentRange: antwort.contentRange || "" };
  } catch (fehler) {
    const text = String(fehler?.message || "");
    // 416: Bereich ausserhalb — bei einem geleerten Objekt heisst das "weg".
    if (/: 416\b/.test(text)) return { ok: false, error: range === "bytes=0-0" ? "nicht_gefunden" : "bereich_ungueltig" };
    return { ok: false, error: text.slice(0, 160) || "lesen_fehlgeschlagen" };
  }
}

/**
 * Loescht ein Medium (Original und Anzeigefassung).
 *
 * FREIGABE: Betreiber-Auftrag 2026-09-17, Punkt 13 — "Beim Loeschen einer
 * Chat-Nachricht bzw. eines Mediums muessen Datenbank und Storage sauber
 * synchron bleiben. Keine verwaisten Dateien." Geloescht wird fail-closed nur
 * ein Schluessel, den medienSchluessel() aus gepruefter Konto- und
 * Medienkennung baut: `chat-medien/user_<32 hex>/<40 hex>.<endung>`.
 *
 * Der e2-Schluessel des Control-Servers durfte am 13.08. nicht loeschen
 * (DELETE → 403). Dann wird das Objekt stattdessen mit 0 Bytes ueberschrieben:
 * der Inhalt ist weg, und holeObjekt() behandelt es als "nicht gefunden".
 */
export async function loescheMedium({ id, kontoId, env = process.env, fetchImpl = fetch }) {
  if (!kennungGueltig(id) || !kontoGueltig(kontoId)) return { ok: false, error: "kennung_ungueltig" };
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  const wege = [];
  for (const vorschau of [false, true]) {
    const key = medienSchluessel(kontoId, id, { vorschau });
    try {
      await signedS3Delete({ ...cfg, key, fetchImpl, timeoutMs: MEDIEN_TIMEOUT_MS });
      wege.push("geloescht");
    } catch {
      try {
        await signedS3Put({ ...cfg, key, body: Buffer.alloc(0), contentType: "application/octet-stream", fetchImpl, timeoutMs: MEDIEN_TIMEOUT_MS });
        wege.push("geleert");
      } catch (fehler) {
        return { ok: false, error: String(fehler?.message || "loeschen_fehlgeschlagen").slice(0, 160) };
      }
    }
  }
  return { ok: true, id, wege };
}

// Durchgereicht, damit die Route EINE Quelle hat und nicht zwei Module nach
// denselben Grundlagen fragen muss. (Fehlte beim ersten Bau: der Server startete
// gar nicht mehr — "does not provide an export named 'syncAktiv'". Die Suite
// fing es, drei Server-Tests wurden rot.)
export { kontoKennung, syncAktiv, idriveConfig };

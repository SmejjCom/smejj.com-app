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

import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";
import { idriveConfig, kontoKennung, syncAktiv, S3_TIMEOUT_MS } from "./chatSyncStore.js";

export const MEDIEN_PRAEFIX = "chat-medien";

// 8 MB je Medium. Gemessen liegen erzeugte Bilder bei ~0,6 MB und Videos bei
// ~0,6 MB; die Grenze laesst Luft fuer laengere Videos, ohne dass ein einzelner
// Aufruf den Eimer fuellen kann.
export const MAX_MEDIUM_BYTES = 8 * 1024 * 1024;

// Nur was der Chat selbst erzeugt oder anzeigt. Bewusst eine Positivliste:
// eine Verbotsliste waere ein Einfallstor fuer alles Neue.
export const ERLAUBTE_TYPEN = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm"
});

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
  return /^[a-f0-9]{40}\.(png|jpg|webp|mp4|webm)$/.test(String(id || ""));
}

function schluessel(kontoId, id) {
  return `${MEDIEN_PRAEFIX}/${kontoId}/${id}`;
}

/**
 * Legt ein Medium ab und gibt seine Kennung zurueck.
 *
 * @returns {Promise<{ok: true, id: string, mime: string, bytes: number} | {ok: false, error: string}>}
 */
export async function speichereMedium({ dataUrl, kontoId, env = process.env, fetchImpl = fetch }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  if (!kontoId) return { ok: false, error: "konto_fehlt" };
  const gelesen = leseDataUrl(dataUrl);
  if (!gelesen.ok) return gelesen;
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  const id = medienKennung(gelesen.daten, gelesen.endung);
  try {
    await signedS3Put({
      ...cfg,
      key: schluessel(kontoId, id),
      body: gelesen.daten,
      contentType: gelesen.mime,
      fetchImpl,
      timeoutMs: S3_TIMEOUT_MS
    });
  } catch (fehler) {
    return { ok: false, error: String(fehler?.message || "schreiben_fehlgeschlagen").slice(0, 160) };
  }
  return { ok: true, id, mime: gelesen.mime, bytes: gelesen.daten.length };
}

/**
 * Holt ein Medium des EIGENEN Kontos zurueck.
 * @returns {Promise<{ok: true, daten: Buffer, mime: string} | {ok: false, error: string}>}
 */
export async function ladeMedium({ id, kontoId, env = process.env, fetchImpl = fetch }) {
  if (!syncAktiv(env)) return { ok: false, error: "sync_aus" };
  if (!kontoId) return { ok: false, error: "konto_fehlt" };
  if (!kennungGueltig(id)) return { ok: false, error: "kennung_ungueltig" };
  const cfg = idriveConfig(env);
  if (!cfg) return { ok: false, error: "ablage_nicht_konfiguriert" };
  const endung = String(id).split(".").pop();
  const mime = Object.keys(ERLAUBTE_TYPEN).find((typ) => ERLAUBTE_TYPEN[typ] === endung) || "application/octet-stream";
  try {
    // responseType "buffer" ist Pflicht: die Voreinstellung ist "text" und
    // wuerde die Bytes durch UTF-8 jagen — ein PNG kaeme kaputt zurueck.
    // allowNotFound, damit ein fehlendes Medium eine saubere Antwort gibt
    // statt einer Ausnahme (der Nutzer soll "nicht gefunden" sehen, nicht 503).
    const antwort = await signedS3Get({
      ...cfg,
      key: schluessel(kontoId, id),
      fetchImpl,
      timeoutMs: S3_TIMEOUT_MS,
      responseType: "buffer",
      allowNotFound: true
    });
    if (!antwort?.ok) return { ok: false, error: "nicht_gefunden" };
    return { ok: true, daten: antwort.body, mime };
  } catch (fehler) {
    return { ok: false, error: String(fehler?.message || "lesen_fehlgeschlagen").slice(0, 160) };
  }
}

// Durchgereicht, damit die Route EINE Quelle hat und nicht zwei Module nach
// denselben Grundlagen fragen muss. (Fehlte beim ersten Bau: der Server startete
// gar nicht mehr — "does not provide an export named 'syncAktiv'". Die Suite
// fing es, drei Server-Tests wurden rot.)
export { kontoKennung, syncAktiv, idriveConfig };

// smejj.com — bewusst erstellte Teilen-Links fuer ein einzelnes Medium.
//
// WARUM (Betreiber-Auftrag 2026-09-17): "Wenn ein Benutzer ausdruecklich ein
// Bild oder eine Datei ausserhalb von smejj.com teilen moechte, soll dafuer ein
// separater Share-Link erstellt werden." Bis dahin ging beim Teilen die INTERNE
// Adresse …/api/chat-medien?id=… nach draussen — fuer den Empfaenger nutzlos
// (401), fuer uns eine Preisgabe interner Pfade.
//
//   Medium → eigener Zufalls-Token → https://api.smejj.com/m/<token> → Pruefung
//
// Der Token ist KEIN abgeleiteter Wert, sondern Zufall (16 Zeichen aus 62 ≈ 95
// Bit): nicht erratbar, nicht aufzaehlbar, und er verraet weder Konto noch
// Medium. Alles, was er oeffnet, steht in einem eigenen Datensatz, der
// widerrufen, befristet und in der Nutzungszahl begrenzt werden kann.
//
// Ablage im Eimer:
//   chat-medien-teilen/<token>.json          ein Datensatz je Link
//   chat-medien-teilen/konto/<kontoId>.json  Liste der Links eines Kontos
import crypto from "node:crypto";
import { signedS3Get, signedS3Put } from "../storage/s3Signer.js";
import { idriveConfig } from "./chatSyncStore.js";
import { kennungGueltig, kontoGueltig, typFuerKennung } from "./medienStore.js";

export const TEILEN_PRAEFIX = "chat-medien-teilen";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const TOKEN_LAENGE = 16;
export const MAX_LINKS_JE_KONTO = 500;
export const ERLAUBTE_TAGE = Object.freeze([0, 1, 7, 30]); // 0 = ohne Ablauf
const TIMEOUT_MS = 5000;
const HALTEZEIT_MS = 30_000;

/** Zufalls-Token ohne Verzerrung (Verwerfen statt Modulo). */
export function neuerToken(zufall = crypto.randomBytes) {
  let token = "";
  while (token.length < TOKEN_LAENGE) {
    for (const byte of zufall(32)) {
      if (byte >= 248) continue; // 248 = 4 × 62: darueber waere die Verteilung schief
      token += ALPHABET[byte % 62];
      if (token.length === TOKEN_LAENGE) break;
    }
  }
  return token;
}

export function tokenGueltig(token) {
  return new RegExp(`^[A-Za-z0-9]{${TOKEN_LAENGE}}$`).test(String(token || ""));
}

function datensatzSchluessel(token) {
  if (!tokenGueltig(token)) throw new Error("token_ungueltig");
  return `${TEILEN_PRAEFIX}/${token}.json`;
}

function kontoSchluessel(kontoId) {
  if (!kontoGueltig(kontoId)) throw new Error("konto_ungueltig");
  return `${TEILEN_PRAEFIX}/konto/${kontoId}.json`;
}

/**
 * Ist der Link JETZT nutzbar? Rein, damit die Tests Ablauf, Widerruf und
 * Nutzungsgrenze ohne Ablage pruefen koennen.
 */
export function linkStatus(datensatz, jetztMs = Date.now()) {
  if (!datensatz || !tokenGueltig(datensatz.token) || !kennungGueltig(datensatz.id)) return "unbekannt";
  if (datensatz.widerrufenAm) return "widerrufen";
  if (datensatz.ablaufAm && Date.parse(datensatz.ablaufAm) <= jetztMs) return "abgelaufen";
  if (Number.isInteger(datensatz.maxAufrufe) && datensatz.aufrufe >= datensatz.maxAufrufe) return "aufgebraucht";
  return "aktiv";
}

/** Oeffentliche Sicht auf einen Link — ohne Konto, ohne Pfade. */
export function linkFuerBesitzer(datensatz, basis, jetztMs = Date.now()) {
  return {
    token: datensatz.token,
    url: `${basis}/m/${datensatz.token}`,
    id: datensatz.id,
    erstelltAm: datensatz.erstelltAm,
    ablaufAm: datensatz.ablaufAm || null,
    maxAufrufe: Number.isInteger(datensatz.maxAufrufe) ? datensatz.maxAufrufe : null,
    aufrufe: datensatz.aufrufe || 0,
    status: linkStatus(datensatz, jetztMs)
  };
}

export function teilenBasis(env = process.env) {
  const basis = String(env.SMEJJ_MEDIEN_TEILEN_BASIS || "https://api.smejj.com").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(basis) ? basis : "https://api.smejj.com";
}

export function createMedienTeilen({ env = process.env, fetchImpl = fetch, jetzt = () => Date.now() } = {}) {
  // Kurzer Haltespeicher: ein oft geoeffneter Link kostet nicht jedes Mal einen
  // Abruf. Widerruf und Zaehlen laufen auf DIESEM Prozess und leeren ihn sofort.
  const gehalten = new Map();
  // Nacheinander je Token: zwei gleichzeitige Aufrufe eines Einmal-Links
  // duerfen nicht beide durchkommen.
  const schlangen = new Map();

  function cfg() {
    const konfig = idriveConfig(env);
    if (!konfig) throw new Error("ablage_nicht_konfiguriert");
    return konfig;
  }

  async function nacheinander(schluessel, aufgabe) {
    const vorher = schlangen.get(schluessel) || Promise.resolve();
    const lauf = vorher.catch(() => {}).then(aufgabe);
    schlangen.set(schluessel, lauf);
    try { return await lauf; } finally { if (schlangen.get(schluessel) === lauf) schlangen.delete(schluessel); }
  }

  async function leseJson(key) {
    const antwort = await signedS3Get({ ...cfg(), key, allowNotFound: true, fetchImpl, timeoutMs: TIMEOUT_MS });
    if (!antwort?.ok || !antwort.body) return null;
    try { return JSON.parse(antwort.body); } catch { return null; }
  }

  async function schreibeJson(key, wert) {
    await signedS3Put({
      ...cfg(), key, body: `${JSON.stringify(wert)}\n`, contentType: "application/json; charset=utf-8", fetchImpl, timeoutMs: TIMEOUT_MS
    });
  }

  async function ladeDatensatz(token, { frisch = false } = {}) {
    const halt = gehalten.get(token);
    if (!frisch && halt && halt.bis > jetzt()) return halt.wert;
    const wert = await leseJson(datensatzSchluessel(token));
    gehalten.set(token, { wert, bis: jetzt() + HALTEZEIT_MS });
    if (gehalten.size > 2000) gehalten.delete(gehalten.keys().next().value);
    return wert;
  }

  async function kontoListeAendern(kontoId, aendern) {
    return nacheinander(`konto:${kontoId}`, async () => {
      const key = kontoSchluessel(kontoId);
      const liste = (await leseJson(key)) || { v: 1, tokens: [] };
      const tokens = Array.isArray(liste.tokens) ? liste.tokens.filter(tokenGueltig) : [];
      const neu = aendern(tokens);
      await schreibeJson(key, { v: 1, tokens: neu.slice(-MAX_LINKS_JE_KONTO) });
      return neu;
    });
  }

  async function erstelle({ kontoId, id, tage = 7, maxAufrufe = null }) {
    if (!kontoGueltig(kontoId) || !kennungGueltig(id)) return { ok: false, error: "kennung_ungueltig" };
    const tageZahl = Number(tage);
    if (!ERLAUBTE_TAGE.includes(tageZahl)) return { ok: false, error: "ablauf_ungueltig" };
    const grenze = maxAufrufe === null || maxAufrufe === undefined || maxAufrufe === "" ? null : Number(maxAufrufe);
    if (grenze !== null && !(Number.isInteger(grenze) && grenze >= 1 && grenze <= 1000)) return { ok: false, error: "grenze_ungueltig" };
    const jetztMs = jetzt();
    const token = neuerToken();
    const datensatz = {
      v: 1,
      token,
      kontoId,
      id,
      mime: typFuerKennung(id),
      erstelltAm: new Date(jetztMs).toISOString(),
      ablaufAm: tageZahl ? new Date(jetztMs + tageZahl * 86_400_000).toISOString() : null,
      maxAufrufe: grenze,
      aufrufe: 0,
      widerrufenAm: null
    };
    await schreibeJson(datensatzSchluessel(token), datensatz);
    await kontoListeAendern(kontoId, (tokens) => [...tokens, token]);
    gehalten.set(token, { wert: datensatz, bis: jetztMs + HALTEZEIT_MS });
    return { ok: true, link: linkFuerBesitzer(datensatz, teilenBasis(env), jetztMs) };
  }

  async function liste({ kontoId, id = "" }) {
    if (!kontoGueltig(kontoId)) return { ok: false, error: "konto_fehlt" };
    const key = kontoSchluessel(kontoId);
    const roh = (await leseJson(key)) || { tokens: [] };
    const tokens = (Array.isArray(roh.tokens) ? roh.tokens : []).filter(tokenGueltig).slice(-MAX_LINKS_JE_KONTO);
    const links = [];
    for (const token of tokens.reverse()) {
      const datensatz = await ladeDatensatz(token);
      // Fremde oder kaputte Datensaetze nie zeigen — die Liste ist nur ein Zeiger.
      if (!datensatz || datensatz.kontoId !== kontoId) continue;
      if (id && datensatz.id !== id) continue;
      links.push(linkFuerBesitzer(datensatz, teilenBasis(env), jetzt()));
      if (links.length >= 50) break;
    }
    return { ok: true, links };
  }

  async function widerrufe({ kontoId, token }) {
    if (!kontoGueltig(kontoId) || !tokenGueltig(token)) return { ok: false, error: "token_ungueltig" };
    return nacheinander(token, async () => {
      const datensatz = await ladeDatensatz(token, { frisch: true });
      // Fremder Link = "nicht gefunden", nicht "verboten": verraet nicht, dass es ihn gibt.
      if (!datensatz || datensatz.kontoId !== kontoId) return { ok: false, error: "nicht_gefunden" };
      if (!datensatz.widerrufenAm) {
        datensatz.widerrufenAm = new Date(jetzt()).toISOString();
        await schreibeJson(datensatzSchluessel(token), datensatz);
      }
      gehalten.set(token, { wert: datensatz, bis: jetzt() + HALTEZEIT_MS });
      return { ok: true, link: linkFuerBesitzer(datensatz, teilenBasis(env), jetzt()) };
    });
  }

  /** Alle Links eines Mediums widerrufen — beim Loeschen des Mediums. */
  async function widerrufeFuerMedium({ kontoId, id }) {
    const gefunden = await liste({ kontoId, id });
    if (!gefunden.ok) return gefunden;
    let anzahl = 0;
    for (const link of gefunden.links) {
      if (link.status === "widerrufen") continue;
      const ergebnis = await widerrufe({ kontoId, token: link.token });
      if (ergebnis.ok) anzahl += 1;
    }
    return { ok: true, widerrufen: anzahl };
  }

  /**
   * Oeffnet einen Link fuer einen Besucher. `zaehlen: false` fuer Vorschau-
   * Roboter und HEAD — sie sollen einen Einmal-Link nicht verbrauchen.
   * @returns {Promise<{ok: true, kontoId: string, id: string} | {ok: false, error: string}>}
   */
  async function oeffne({ token, zaehlen = true, nachlauf = false }) {
    if (!tokenGueltig(token)) return { ok: false, error: "nicht_gefunden" };
    const begrenzt = async () => {
      let datensatz = await ladeDatensatz(token);
      // Nur begrenzte Links muessen frisch gelesen werden — dort zaehlt jeder Aufruf.
      if (zaehlen && Number.isInteger(datensatz?.maxAufrufe)) datensatz = await ladeDatensatz(token, { frisch: true });
      const status = linkStatus(datensatz, jetzt());
      // Nachlauf: derselbe Besucher spult im gerade gezaehlten Video — das ist
      // kein neuer Aufruf, auch wenn der Link damit aufgebraucht ist.
      if (status !== "aktiv" && !(nachlauf && status === "aufgebraucht")) return { ok: false, error: status === "unbekannt" ? "nicht_gefunden" : status };
      if (zaehlen && !nachlauf && Number.isInteger(datensatz.maxAufrufe)) {
        datensatz.aufrufe = (datensatz.aufrufe || 0) + 1;
        await schreibeJson(datensatzSchluessel(token), datensatz);
        gehalten.set(token, { wert: datensatz, bis: jetzt() + HALTEZEIT_MS });
      }
      return { ok: true, kontoId: datensatz.kontoId, id: datensatz.id, begrenzt: Number.isInteger(datensatz.maxAufrufe) };
    };
    try {
      return await nacheinander(token, begrenzt);
    } catch {
      return { ok: false, error: "voruebergehend_nicht_verfuegbar" };
    }
  }

  return { erstelle, liste, widerrufe, widerrufeFuerMedium, oeffne };
}

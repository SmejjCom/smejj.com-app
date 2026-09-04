// smejj.com — Vom ADMIN ausgestellte API-Schluessel (smejj-adm-…).
//
// Betreiber-Beschluss 2026-09-03 (docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_
// 2026-09-03.md, Punkte 3-5): Der Betreiber gibt Dritten einen Schluessel mit
// waehlbarer Laufzeit — 30 Tage bis 30 Jahre oder unbefristet — ohne dass die
// Person ein smejj-Konto braucht. So halten es OpenRouter (Schluessel je
// Empfaenger mit Limit und Ablauf), OpenAI (Projekt-Schluessel) und Google
// (Schluessel mit Einschraenkungen): eine Ausgabe-Stelle, ein Praefix, das die
// Art verraet, Klartext genau einmal, alles im Audit-Log.
//
// Was hier ANDERS ist als bei Kundenschluesseln (publicApiKeys.js):
//   * EIN Index fuer alle Admins (subject "smejj-api-admin"), nicht je Konto:
//     jeder Owner/Admin sieht alle ausgestellten Schluessel, auch die seiner
//     Kollegin. Das ist gewollt — ein Schluessel, den nur eine Person kennt,
//     ist beim Wechsel dieser Person ein Blindgaenger.
//   * Der Rueckschlag ist DERSELBE wie fuer Kundenschluessel (provider
//     "smejj-api-lookup"): der Torwaechter an /v1 kennt genau einen Weg und
//     muss von Admin-Schluesseln nichts wissen. Verbraucht wird auf das Konto
//     des ausstellenden Admins (kontoId), die Nutzung steht je Schluessel.
//   * Die Kennung beginnt mit "adm_" — daran erkennt merkeBenutzung() in
//     publicApiKeys.js, dass die Nutzung hier gebucht wird, nicht im
//     Konto-Index.
//
// Was hier NICHT gespeichert wird: der Schluessel. Nur sein SHA-256-Abdruck.
import crypto from "node:crypto";
import { getProviderCredential, putProviderCredential } from "../providers/providerCredentialVault.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";
import { ADMIN_PRAEFIX, LAUFZEITEN, abdruckVon, baueSchluessel, istAbgelaufen, laeuftAbAus, __leerePruefCache } from "./publicApiKeys.js";

const INDEX_SUBJECT = "smejj-api-admin";
const INDEX_PROVIDER = "smejj-api-admin-index";
const LOOKUP_PROVIDER = "smejj-api-lookup";
// Mehr ausgestellte Schluessel sind kein Betreiber-Handgriff mehr, sondern ein Produkt.
const MAX_AUSGESTELLT = 200;
const NUTZUNG_SCHREIB_ABSTAND_MS = 60_000;
const nutzungPuffer = new Map();
const nutzungSchreibMarken = new Map();
// Monatsbudget (2026-09-04): Der Torwaechter fragt bei JEDER Anfrage eines
// adm_-Schluessels nach dem Stand. Ein S3-Lesevorgang je Anfrage waere teurer
// als die Anfrage — deshalb ein kurzer Cache, und der noch nicht geschriebene
// Puffer wird beim Pruefen dazugerechnet. Genauigkeit: der Deckel greift auf
// die Anfrage genau, nicht erst nach dem naechsten Schreibvorgang.
const BUDGET_CACHE_MS = 30_000;
const budgetCache = new Map(); // keyId -> { stand, gueltigBis }

/** Monat einer Zeit als "2026-09" — Budgets laufen je Kalendermonat (UTC). */
export function monatVon(zeit = new Date()) {
  return zeit.toISOString().slice(0, 7);
}

/** Token, die schon im Puffer liegen, aber noch nicht geschrieben sind. */
function pufferToken(keyId) {
  return Math.max(0, Math.floor(Number(nutzungPuffer.get(keyId)?.token) || 0));
}

/**
 * Darf dieser ausgestellte Schluessel noch? Ohne Budget immer ja.
 * @returns {Promise<{ok: boolean, budgetToken: number, verbrauchtToken: number, monat: string}>}
 */
export async function budgetStand(keyId, env = process.env, jetzt = () => new Date()) {
  const id = String(keyId || "");
  const monat = monatVon(jetzt());
  const zwischen = budgetCache.get(id);
  let stand = zwischen && zwischen.gueltigBis > jetzt().getTime() && zwischen.stand.monat === monat
    ? zwischen.stand
    : null;
  if (!stand) {
    const index = await leseIndex(env);
    const eintrag = index.schluessel.find((s) => s.id === id);
    const budgetToken = Math.max(0, Math.floor(Number(eintrag?.budgetToken) || 0));
    const gebucht = eintrag?.monat?.monat === monat ? Math.max(0, Math.floor(Number(eintrag.monat.token) || 0)) : 0;
    stand = { budgetToken, gebuchtToken: gebucht, monat };
    budgetCache.set(id, { stand, gueltigBis: jetzt().getTime() + BUDGET_CACHE_MS });
  }
  const verbrauchtToken = stand.gebuchtToken + pufferToken(id);
  return {
    ok: stand.budgetToken === 0 || verbrauchtToken < stand.budgetToken,
    budgetToken: stand.budgetToken,
    verbrauchtToken,
    monat
  };
}

/** Budget aendern (umkehrbar, deshalb kein Rotationszwang). 0 = kein Limit. */
export async function setzeBudget(keyId, budgetToken, env = process.env) {
  const index = await leseIndex(env);
  const eintrag = index.schluessel.find((s) => s.id === keyId);
  if (!eintrag) throw fehler(404, "api_key_not_found");
  if (eintrag.widerrufenAm) throw fehler(409, "api_key_revoked");
  eintrag.budgetToken = sicheresBudget(budgetToken);
  await schreibeIndex(index, env);
  budgetCache.delete(keyId);
  return maskiere(eintrag);
}

function sicheresBudget(wert) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl) || zahl < 0) {
    throw fehler(400, "api_key_budget_invalid");
  }
  // Ueber einer Milliarde Token im Monat ist kein Budget mehr, sondern ein Tippfehler.
  if (zahl > 1_000_000_000) throw fehler(400, "api_key_budget_invalid");
  return Math.floor(zahl);
}

/** Das API-Konto, auf das der Verbrauch laeuft — dieselbe Ableitung wie /api/developer/keys. */
export function kontoIdVon(actor) {
  return authenticatedUserId({ userId: actor?.userId, email: actor?.email });
}

export async function listeAusgestellt(env = process.env) {
  const index = await leseIndex(env);
  const schluessel = index.schluessel.map(maskiere);
  return {
    ok: true,
    total: schluessel.length,
    aktiv: schluessel.filter((s) => s.zustand === "aktiv").length,
    abgelaufen: schluessel.filter((s) => s.zustand === "abgelaufen").length,
    widerrufen: schluessel.filter((s) => s.zustand === "widerrufen").length,
    unbefristet: schluessel.filter((s) => s.zustand === "aktiv" && !s.laeuftAbAm).length,
    // Wieviele stehen gerade an ihrem Monatsdeckel? Das ist die Zahl, die der
    // Betreiber sehen will, bevor sich jemand ueber 429 beschwert.
    amDeckel: schluessel.filter((s) => s.zustand === "aktiv" && s.budgetToken > 0
      && s.monat.monat === monatVon() && s.monat.token >= s.budgetToken).length,
    laufzeiten: Object.keys(LAUFZEITEN),
    schluessel: schluessel.sort(sortiere),
    hinweis: "Der Wert eines Schluessels wird nie angezeigt — er erscheint genau einmal beim Ausstellen. "
      + "Verbrauch laeuft auf das Konto des ausstellenden Admins."
  };
}

/**
 * Stellt einen Schluessel aus. Wirft mit .status bei Eingabefehlern.
 * @returns {Promise<{klartext: string, schluessel: object}>}
 */
export async function stelleAus({ actor, ausgestelltFuer, laufzeit, notiz, budgetToken } = {}, env = process.env, jetztDatum = () => new Date()) {
  const kontoId = kontoIdVon(actor);
  if (!kontoId || !actor?.email) throw fehler(400, "admin_actor_required");
  const fuer = sichererText(ausgestelltFuer, 120);
  if (fuer.length < 2) throw fehler(400, "api_key_empfaenger_required");
  const bemerkung = sichererText(notiz, 200);
  const budget = sicheresBudget(budgetToken === undefined || budgetToken === null || budgetToken === "" ? 0 : budgetToken);
  // Laufzeit ist beim Ausstellen PFLICHT: hier gibt es kein Altverhalten, das
  // ein fehlendes Feld still zu "unbefristet" machen duerfte.
  if (laufzeit === undefined || laufzeit === null || String(laufzeit).trim() === "") throw fehler(400, "api_key_laufzeit_required");
  const ab = jetztDatum();
  const laeuftAbAm = laeuftAbAus(laufzeit, ab);

  const index = await leseIndex(env);
  if (index.schluessel.filter((s) => !s.widerrufenAm).length >= MAX_AUSGESTELLT) throw fehler(409, "api_key_limit_reached");

  const { klartext, abdruck, letzte4 } = baueSchluessel(crypto.randomBytes, ADMIN_PRAEFIX);
  const jetzt = ab.toISOString();
  const eintrag = {
    id: `adm_${crypto.randomBytes(6).toString("hex")}`,
    ausgestelltFuer: fuer,
    notiz: bemerkung,
    ausgestelltVon: String(actor.email).slice(0, 254),
    kontoId,
    abdruck,
    letzte4,
    erstelltAm: jetzt,
    laeuftAbAm,
    budgetToken: budget,
    monat: { monat: monatVon(ab), token: 0, anfragen: 0 },
    widerrufenAm: "",
    widerrufenVon: "",
    zuletztBenutztAm: ""
  };
  // Rueckschlag ZUERST (wie bei Kundenschluesseln): der Torwaechter muss den
  // Schluessel kennen, bevor irgendeine Liste ihn zeigt.
  await putProviderCredential(abdruck, LOOKUP_PROVIDER, {
    enabled: true,
    apiKey: "",
    kontoId,
    keyId: eintrag.id,
    art: "adm",
    erstelltAm: jetzt,
    laeuftAbAm,
    widerrufenAm: ""
  }, env);
  index.schluessel.push(eintrag);
  await schreibeIndex(index, env);
  return { klartext, schluessel: maskiere(eintrag) };
}

export async function widerrufeAusgestellt(keyId, actor, env = process.env, jetztDatum = () => new Date()) {
  const index = await leseIndex(env);
  const eintrag = index.schluessel.find((s) => s.id === keyId);
  if (!eintrag) throw fehler(404, "api_key_not_found");
  if (eintrag.widerrufenAm) return maskiere(eintrag);
  const jetzt = jetztDatum().toISOString();
  eintrag.widerrufenAm = jetzt;
  eintrag.widerrufenVon = String(actor?.email || "").slice(0, 254);
  await putProviderCredential(eintrag.abdruck, LOOKUP_PROVIDER, {
    enabled: false,
    apiKey: "",
    kontoId: eintrag.kontoId,
    keyId: eintrag.id,
    art: "adm",
    erstelltAm: eintrag.erstelltAm,
    laeuftAbAm: eintrag.laeuftAbAm || "",
    widerrufenAm: jetzt
  }, env);
  await schreibeIndex(index, env);
  __leerePruefCache();
  return maskiere(eintrag);
}

/** Nutzung je ausgestelltem Schluessel — gedrosselt wie bei Kundenschluesseln. Wirft nie. */
export async function merkeAdminBenutzung(keyId, { promptTokens = 0, completionTokens = 0 } = {}, env = process.env, jetzt = () => new Date()) {
  const id = String(keyId || "").slice(0, 40);
  if (!id) return;
  const token = Math.max(0, Math.floor(Number(promptTokens) || 0)) + Math.max(0, Math.floor(Number(completionTokens) || 0));
  const puffer = nutzungPuffer.get(id) || { anfragen: 0, token: 0 };
  puffer.anfragen += 1;
  puffer.token += token;
  nutzungPuffer.set(id, puffer);
  const marke = nutzungSchreibMarken.get(id) || 0;
  if (jetzt().getTime() - marke < NUTZUNG_SCHREIB_ABSTAND_MS) return;
  nutzungSchreibMarken.set(id, jetzt().getTime());
  const sprung = nutzungPuffer.get(id) || { anfragen: 0, token: 0 };
  nutzungPuffer.delete(id);
  try {
    const index = await leseIndex(env);
    const eintrag = index.schluessel.find((s) => s.id === id);
    if (!eintrag) return;
    eintrag.zuletztBenutztAm = jetzt().toISOString();
    eintrag.nutzung = eintrag.nutzung || { anfragen: 0, token: 0 };
    eintrag.nutzung.anfragen += sprung.anfragen;
    eintrag.nutzung.token += sprung.token;
    // Monatszaehler: beim Monatswechsel faengt er bei null an — ein Budget
    // gilt je Kalendermonat, nicht als Lebenszeit-Deckel.
    const monat = monatVon(jetzt());
    if (eintrag.monat?.monat !== monat) eintrag.monat = { monat, token: 0, anfragen: 0 };
    eintrag.monat.token += sprung.token;
    eintrag.monat.anfragen += sprung.anfragen;
    budgetCache.delete(id);
    await schreibeIndex(index, env);
  } catch (error) {
    console.error(`[public-api] Nutzung (adm) uebersprungen (${id}):`, String(error?.message || error).slice(0, 160));
  }
}

/** Nur fuer Tests. */
export function __leereAdminNutzungPuffer() {
  nutzungPuffer.clear();
  nutzungSchreibMarken.clear();
  budgetCache.clear();
}

// ---- Helfer ------------------------------------------------------------------

async function leseIndex(env) {
  const record = await getProviderCredential(INDEX_SUBJECT, INDEX_PROVIDER, env).catch(() => null);
  return { schluessel: Array.isArray(record?.schluessel) ? record.schluessel : [] };
}

async function schreibeIndex(index, env) {
  await putProviderCredential(INDEX_SUBJECT, INDEX_PROVIDER, {
    enabled: true,
    apiKey: "",
    schluessel: index.schluessel.slice(-MAX_AUSGESTELLT * 2),
    aktualisiertAm: new Date().toISOString()
  }, env);
}

function maskiere(e) {
  return {
    id: e.id,
    ausgestelltFuer: e.ausgestelltFuer,
    notiz: e.notiz || "",
    ausgestelltVon: e.ausgestelltVon || "",
    keyHint: `${ADMIN_PRAEFIX}••••${e.letzte4}`,
    erstelltAm: e.erstelltAm,
    laeuftAbAm: e.laeuftAbAm || "",
    budgetToken: Math.max(0, Math.floor(Number(e.budgetToken) || 0)),
    monat: {
      monat: String(e.monat?.monat || ""),
      token: Math.max(0, Math.floor(Number(e.monat?.token) || 0)),
      anfragen: Math.max(0, Math.floor(Number(e.monat?.anfragen) || 0))
    },
    widerrufenAm: e.widerrufenAm || "",
    widerrufenVon: e.widerrufenVon || "",
    zuletztBenutztAm: e.zuletztBenutztAm || "",
    nutzung: {
      anfragen: Math.max(0, Math.floor(Number(e.nutzung?.anfragen) || 0)),
      token: Math.max(0, Math.floor(Number(e.nutzung?.token) || 0))
    },
    zustand: e.widerrufenAm ? "widerrufen" : istAbgelaufen(e.laeuftAbAm) ? "abgelaufen" : "aktiv"
  };
}

function sortiere(a, b) {
  // Aktive zuerst, dann abgelaufene, dann widerrufene; innerhalb: neueste oben.
  const rang = (s) => (s.zustand === "aktiv" ? 0 : s.zustand === "abgelaufen" ? 1 : 2);
  const unterschied = rang(a) - rang(b);
  if (unterschied !== 0) return unterschied;
  return String(b.erstelltAm).localeCompare(String(a.erstelltAm));
}

function sichererText(wert, max) {
  const text = String(wert || "").trim().slice(0, max);
  return /[<>]/.test(text) ? "" : text;
}

function fehler(status, code) {
  const error = new Error(code);
  error.status = status;
  return error;
}

// abdruckVon wird hier nicht direkt gebraucht, aber bewusst importiert: wer
// diesen Speicher liest, soll an derselben Stelle sehen, dass nur Abdruecke
// abgelegt werden.
void abdruckVon;

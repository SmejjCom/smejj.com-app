// smejj.com — EIGENE API-Schluessel: das, was ein Kunde in ZCode, Cline oder
// Cursor eintraegt, um smejj als Modellanbieter zu benutzen.
//
// GEGENRICHTUNG zu control-server/src/routes/apiKeysRoutes.js. Dort kommen
// FREMDE Schluessel herein (BYOK: der Nutzer hinterlegt seinen OpenAI-Key).
// Hier geben WIR welche heraus. Die beiden Wege teilen sich absichtlich den
// Tresor (providerCredentialVault.js) — er verschluesselt bereits mit
// AES-256-GCM und liegt auf iDrive; ein zweiter Speicherweg waere ein zweiter
// Ort, an dem etwas schieflaufen kann.
//
// WAS HIER GESPEICHERT WIRD, IST NIE DER SCHLUESSEL. Abgelegt wird nur sein
// SHA-256-Abdruck. Der Klartext existiert genau einmal: in der Antwort auf
// POST /api/developer/keys. Wer spaeter unseren Speicher liest — oder eine
// Sicherung davon — kann damit keine einzige Anfrage stellen.
//
// Zwei Objekte je Schluessel, beide im Tresor:
//   (1) Konto-Index   subject=<kontoId>   provider="smejj-api-index"
//       Was der Besitzer sieht: Name, letzte 4 Zeichen, Datum, Zustand.
//   (2) Rueckschlag   subject=<abdruck>   provider="smejj-api-lookup"
//       Was der Torwaechter braucht: von welchem Konto ist dieser Abdruck?
//       Der Abdruck ist 64 Hex-Zeichen und damit eine gueltige subject-ID.
import crypto from "node:crypto";
import {
  getProviderCredential,
  putProviderCredential
} from "../providers/providerCredentialVault.js";

export const SCHLUESSEL_PRAEFIX = "smejj-live-";
// Vom Admin ausgestellte Schluessel (publicApiAdminKeys.js) tragen ein eigenes
// Praefix: jeder Log, jeder Waechter und der Secret-Scanner erkennen die Art
// am Anfang, ohne nachzuschlagen.
export const ADMIN_PRAEFIX = "smejj-adm-";
const INDEX_PROVIDER = "smejj-api-index";
const LOOKUP_PROVIDER = "smejj-api-lookup";
const MAX_SCHLUESSEL_JE_KONTO = 20;
// Laufzeit (Betreiber-Beschluss 2026-09-03, docs/api/PLAN_API_SCHLUESSEL_LAUFZEIT_ADMIN_2026-09-03.md):
// Der Kunde waehlt beim Erstellen, wie lange der Schluessel gilt. Das Ablaufdatum
// steht im Konto-Index UND im Rueckschlag — der Torwaechter prueft es ohne
// zweiten Lesevorgang. "" heisst unbefristet. Alte Eintraege ohne Feld bleiben
// unbefristet, und ein Client, der keine Laufzeit schickt, bekommt weiter das,
// was er vor dem Umbau bekam: unbefristet (der Fix wirkt nur vorwaerts).
// Verlaengern gibt es absichtlich nicht — wer laenger braucht, erzeugt einen
// neuen Schluessel und widerruft den alten (Rotation, wie bei OpenAI/Stripe).
export const LAUFZEITEN = Object.freeze({
  "30t": 30,
  "90t": 90,
  "1j": 365,
  "2j": 730,
  "5j": 1826,
  "10j": 3652,
  "20j": 7305,
  "30j": 10957,
  "unbefristet": 0
});
export const LAUFZEIT_VORAUSWAHL = "1j";
const TAG_MS = 86_400_000;
// 24 Zufallsbytes = 192 Bit. Ein Abdruck ist damit nicht rueckrechenbar, auch
// ohne Pepper: es gibt nichts zu raten. Deshalb reicht hier SHA-256 statt
// eines langsamen Passwort-Hashes (Argon2 & Co. schuetzen kurze Geheimnisse).
const ZUFALL_BYTES = 24;
const SCHLUESSEL_MUSTER = /^smejj-(live|adm)-[A-Za-z0-9_-]{32}$/;

// Jede Anfrage an /v1 muesste sonst zwei S3-Lesevorgaenge kosten. Der Cache
// haelt gepruefte Abdruecke kurz. Preis dafuer: ein Widerruf greift auf einer
// anderen Instanz erst nach dieser Frist — deshalb kurz, und im eigenen
// Prozess wird der Eintrag beim Widerruf sofort verworfen.
const CACHE_MS = 60_000;
const CACHE_NEGATIV_MS = 10_000;
const cache = new Map();

// Nutzung je Schluessel: Der Router meldet jede beantwortete Anfrage hier.
// Geschrieben wird GEDROSSELT — hoechstens alle 60 s je Schluessel ein Index-
// Schreibvorgang; dazwischen liegt der Zuwachs im Puffer. Geld-Buchhaltung
// bleibt beim Ledger (sofort, je Anfrage) — hier geht es nur um die Anzeige.
const NUTZUNG_SCHREIB_ABSTAND_MS = 60_000;
const nutzungPuffer = new Map(); // keyId -> { anfragen, token }
const nutzungSchreibMarken = new Map(); // keyId -> epoch ms

/** Erzeugt einen neuen Klartext-Schluessel samt Abdruck. Kein Speichern. */
export function baueSchluessel(zufall = crypto.randomBytes, praefix = SCHLUESSEL_PRAEFIX) {
  const rohdaten = zufall(ZUFALL_BYTES);
  const klartext = `${praefix}${rohdaten.toString("base64url")}`;
  return { klartext, abdruck: abdruckVon(klartext), letzte4: klartext.slice(-4) };
}

/** SHA-256 als Hex. Einziger Wert, der den Prozess verlaesst und bleibt. */
export function abdruckVon(klartext) {
  return crypto.createHash("sha256").update(String(klartext || ""), "utf8").digest("hex");
}

/**
 * Ablaufdatum aus der gewaehlten Laufzeit. undefined/null/"" = kein Wunsch
 * geaeussert = unbefristet (Altverhalten). Unbekannte Werte werfen 400.
 */
export function laeuftAbAus(laufzeit, ab = new Date()) {
  if (laufzeit === undefined || laufzeit === null || String(laufzeit).trim() === "") return "";
  const tage = LAUFZEITEN[String(laufzeit).trim().toLowerCase()];
  if (tage === undefined) {
    const fehler = new Error("api_key_laufzeit_invalid");
    fehler.status = 400;
    throw fehler;
  }
  if (!tage) return "";
  return new Date(ab.getTime() + tage * TAG_MS).toISOString();
}

/** true, wenn ein Ablaufdatum gesetzt ist und hinter uns liegt. */
export function istAbgelaufen(laeuftAbAm, jetztMs = Date.now()) {
  const zeit = Date.parse(String(laeuftAbAm || ""));
  return Number.isFinite(zeit) && zeit <= jetztMs;
}

/** Formprüfung ohne Speicherzugriff — spart dem Torwaechter den Umweg. */
export function hatSchluesselForm(wert) {
  return SCHLUESSEL_MUSTER.test(String(wert || ""));
}

/** Bearer-Kopf lesen. Gibt "" zurueck, wenn nichts Brauchbares dasteht. */
export function bearerSchluessel(req) {
  const kopf = String(req?.headers?.authorization || "");
  const treffer = /^Bearer\s+(\S+)$/i.exec(kopf.trim());
  if (treffer) return treffer[1];
  // OpenAI-Clients senden gelegentlich x-api-key (Anthropic-Stil). Beides
  // annehmen kostet nichts und erspart dem Kunden eine Fehlersuche.
  return String(req?.headers?.["x-api-key"] || "").trim();
}

// ---- Konto-Sicht -------------------------------------------------------------

export async function listeSchluessel(kontoId, env = process.env) {
  const index = await leseIndex(kontoId, env);
  return index.schluessel.map(maskiere);
}

export async function erzeugeSchluessel(kontoId, { name, laufzeit } = {}, env = process.env, jetztDatum = () => new Date()) {
  // Laufzeit ZUERST pruefen: ein ungueltiger Wunsch darf keinen Schluessel
  // erzeugen, der dann mit falscher Laufzeit im Speicher liegt.
  const ab = jetztDatum();
  const laeuftAbAm = laeuftAbAus(laufzeit, ab);
  const index = await leseIndex(kontoId, env);
  const aktive = index.schluessel.filter((eintrag) => !eintrag.widerrufenAm);
  if (aktive.length >= MAX_SCHLUESSEL_JE_KONTO) {
    const fehler = new Error("api_key_limit_reached");
    fehler.status = 409;
    throw fehler;
  }
  const { klartext, abdruck, letzte4 } = baueSchluessel();
  const jetzt = ab.toISOString();
  const eintrag = {
    id: `key_${crypto.randomBytes(6).toString("hex")}`,
    name: sichererName(name) || `Schluessel ${jetzt.slice(0, 10)}`,
    abdruck,
    letzte4,
    erstelltAm: jetzt,
    laeuftAbAm,
    widerrufenAm: "",
    zuletztBenutztAm: ""
  };

  // Rueckschlag ZUERST: waere er nicht da, zeigte der Index einen Schluessel,
  // den der Torwaechter nicht kennt — der Kunde bekaeme 401 auf einen Key, den
  // seine Oberflaeche als gueltig fuehrt.
  await putProviderCredential(abdruck, LOOKUP_PROVIDER, {
    enabled: true,
    apiKey: "",
    kontoId,
    keyId: eintrag.id,
    erstelltAm: jetzt,
    laeuftAbAm,
    widerrufenAm: ""
  }, env);

  index.schluessel.push(eintrag);
  await schreibeIndex(kontoId, index, env);
  return { klartext, schluessel: maskiere(eintrag) };
}

export async function widerrufeSchluessel(kontoId, keyId, env = process.env) {
  const index = await leseIndex(kontoId, env);
  const eintrag = index.schluessel.find((item) => item.id === keyId);
  if (!eintrag) {
    const fehler = new Error("api_key_not_found");
    fehler.status = 404;
    throw fehler;
  }
  if (eintrag.widerrufenAm) return maskiere(eintrag);
  const jetzt = new Date().toISOString();
  eintrag.widerrufenAm = jetzt;

  await putProviderCredential(eintrag.abdruck, LOOKUP_PROVIDER, {
    enabled: false,
    apiKey: "",
    kontoId,
    keyId: eintrag.id,
    laeuftAbAm: eintrag.laeuftAbAm || "",
    widerrufenAm: jetzt
  }, env);
  await schreibeIndex(kontoId, index, env);
  cache.delete(eintrag.abdruck);
  return maskiere(eintrag);
}

export async function loescheSchluessel(kontoId, keyId, env = process.env) {
  const index = await leseIndex(kontoId, env);
  const eintrag = index.schluessel.find((item) => item.id === keyId);
  if (!eintrag) {
    const fehler = new Error("api_key_not_found");
    fehler.status = 404;
    throw fehler;
  }
  // Endgueltig raus: Eintrag aus dem Index, Lookup-Grabstein disable + Grabstein-Markierung,
  // Prüfcache leer. Der Klartext ist ohnehin nie gespeichert; ohne Index-Eintrag bleibt der
  // Schluessel unsichtbar und der Torwaechter lehnt ihn ab (fail-closed).
  const jetzt = new Date().toISOString();
  index.schluessel = index.schluessel.filter((item) => item.id !== keyId);
  await putProviderCredential(eintrag.abdruck, LOOKUP_PROVIDER, {
    enabled: false,
    apiKey: "",
    kontoId,
    keyId: eintrag.id,
    erstelltAm: eintrag.erstelltAm,
    laeuftAbAm: eintrag.laeuftAbAm || "",
    widerrufenAm: eintrag.widerrufenAm || jetzt,
    geloeschtAm: jetzt
  }, env);
  await schreibeIndex(kontoId, index, env);
  cache.delete(eintrag.abdruck);
  return { geloescht: true, id: keyId };
}

export async function benenneSchluesselUm(kontoId, keyId, name, env = process.env) {
  const index = await leseIndex(kontoId, env);
  const eintrag = index.schluessel.find((item) => item.id === keyId);
  if (!eintrag) {
    const fehler = new Error("api_key_not_found");
    fehler.status = 404;
    throw fehler;
  }
  const sauber = sichererName(name);
  if (!sauber) {
    const fehler = new Error("api_key_name_required");
    fehler.status = 400;
    throw fehler;
  }
  eintrag.name = sauber;
  await schreibeIndex(kontoId, index, env);
  return maskiere(eintrag);
}

export async function setzeSchluesselAktiv(kontoId, keyId, aktiv, env = process.env) {
  const index = await leseIndex(kontoId, env);
  const eintrag = index.schluessel.find((item) => item.id === keyId);
  if (!eintrag) {
    const fehler = new Error("api_key_not_found");
    fehler.status = 404;
    throw fehler;
  }
  if (eintrag.widerrufenAm && aktiv) {
    const fehler = new Error("api_key_revoked");
    fehler.status = 409;
    throw fehler;
  }
  const jetzt = new Date().toISOString();
  eintrag.deaktiviertAm = aktiv ? "" : jetzt;
  await putProviderCredential(eintrag.abdruck, LOOKUP_PROVIDER, {
    enabled: Boolean(aktiv),
    apiKey: "",
    kontoId,
    keyId: eintrag.id,
    erstelltAm: eintrag.erstelltAm,
    laeuftAbAm: eintrag.laeuftAbAm || "",
    widerrufenAm: eintrag.widerrufenAm || ""
  }, env);
  await schreibeIndex(kontoId, index, env);
  if (!aktiv) cache.delete(eintrag.abdruck);
  return maskiere(eintrag);
}

/**
 * Bucht eine beantwortete Anfrage auf den Schluessel: Zeitstempel + Summen.
 * Wirft nie — die Antwort ist beim Kunden; ein Schreibfehler landet nur im Log.
 */
export async function merkeBenutzung(kontoId, keyId, { promptTokens = 0, completionTokens = 0 } = {}, env = process.env, jetzt = () => new Date()) {
  const id = String(keyId || "").slice(0, 40);
  if (!id) return;
  // Admin-ausgestellte Schluessel (adm_…) liegen nicht im Konto-Index, sondern
  // im Admin-Index — dort wird ihre Nutzung gebucht. Spaet geladen, damit die
  // beiden Module sich nicht gegenseitig importieren.
  if (id.startsWith("adm_")) {
    const { merkeAdminBenutzung } = await import("./publicApiAdminKeys.js");
    return merkeAdminBenutzung(id, { promptTokens, completionTokens }, env, jetzt);
  }
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
    const index = await leseIndex(kontoId, env);
    const eintrag = index.schluessel.find((item) => item.id === id);
    if (!eintrag) return;
    eintrag.zuletztBenutztAm = jetzt().toISOString();
    eintrag.nutzung = eintrag.nutzung || { anfragen: 0, token: 0 };
    eintrag.nutzung.anfragen += sprung.anfragen;
    eintrag.nutzung.token += sprung.token;
    await schreibeIndex(kontoId, index, env);
  } catch (error) {
    console.error(`[public-api] Nutzungs-Schreibvorgang uebersprungen (${id}):`, String(error?.message || error).slice(0, 160));
  }
}

/** Nur fuer Tests. */
export function __leereBenutzungPuffer() {
  nutzungPuffer.clear();
  nutzungSchreibMarken.clear();
}

// ---- Torwaechter -------------------------------------------------------------

/**
 * Prueft einen Klartext-Schluessel.
 * @returns {Promise<{ok: boolean, kontoId?: string, keyId?: string, grund?: string}>}
 */
export async function pruefeSchluessel(klartext, env = process.env, jetzt = () => Date.now()) {
  if (!hatSchluesselForm(klartext)) return { ok: false, grund: "api_key_malformed" };
  const abdruck = abdruckVon(klartext);
  const zwischenstand = cache.get(abdruck);
  if (zwischenstand && zwischenstand.gueltigBis > jetzt()) return zwischenstand.ergebnis;

  let ergebnis;
  let record = null;
  try {
    record = await getProviderCredential(abdruck, LOOKUP_PROVIDER, env);
    if (!record) ergebnis = { ok: false, grund: "api_key_unknown" };
    else if (record.enabled !== true || record.widerrufenAm) ergebnis = { ok: false, grund: "api_key_revoked" };
    else if (istAbgelaufen(record.laeuftAbAm, jetzt())) ergebnis = { ok: false, grund: "api_key_expired" };
    else ergebnis = { ok: true, kontoId: String(record.kontoId || ""), keyId: String(record.keyId || "") };
  } catch (error) {
    // Speicher oder Verschluesselung nicht bereit: NICHT als "unbekannter
    // Schluessel" ausgeben — das waere eine Falschaussage gegenueber dem
    // Kunden und ein 401 statt eines 503. Auch nicht cachen.
    return { ok: false, grund: "api_key_store_unavailable", status: 503, ursache: String(error?.message || error).slice(0, 120) };
  }
  if (ergebnis.ok && !ergebnis.kontoId) ergebnis = { ok: false, grund: "api_key_unknown" };
  // Ein positiver Cache-Eintrag darf NIE ueber das Ablaufdatum hinaus gelten —
  // sonst liefe ein abgelaufener Schluessel bis zu 60 s weiter.
  let gueltigBis = jetzt() + (ergebnis.ok ? CACHE_MS : CACHE_NEGATIV_MS);
  const ablauf = Date.parse(String(record?.laeuftAbAm || ""));
  if (ergebnis.ok && Number.isFinite(ablauf)) gueltigBis = Math.min(gueltigBis, ablauf);
  cache.set(abdruck, { ergebnis, gueltigBis });
  return ergebnis;
}

/** Nur fuer Tests und den Widerruf im selben Prozess. */
export function __leerePruefCache() {
  cache.clear();
}

// ---- Helfer ------------------------------------------------------------------

async function leseIndex(kontoId, env) {
  const record = await getProviderCredential(kontoId, INDEX_PROVIDER, env).catch(() => null);
  const schluessel = Array.isArray(record?.schluessel) ? record.schluessel : [];
  return { schluessel };
}

async function schreibeIndex(kontoId, index, env) {
  await putProviderCredential(kontoId, INDEX_PROVIDER, {
    enabled: true,
    apiKey: "",
    schluessel: index.schluessel.slice(-MAX_SCHLUESSEL_JE_KONTO * 2),
    aktualisiertAm: new Date().toISOString()
  }, env);
}

function maskiere(eintrag) {
  // Der Abdruck bleibt drin — er ist kein Geheimnis, aber er gehoert auch nicht
  // in eine Oberflaeche. Deshalb: raus.
  return {
    id: eintrag.id,
    name: eintrag.name,
    keyHint: `${SCHLUESSEL_PRAEFIX}••••${eintrag.letzte4}`,
    erstelltAm: eintrag.erstelltAm,
    laeuftAbAm: eintrag.laeuftAbAm || "",
    widerrufenAm: eintrag.widerrufenAm || "",
    zuletztBenutztAm: eintrag.zuletztBenutztAm || "",
    nutzung: {
      anfragen: Math.max(0, Math.floor(Number(eintrag.nutzung?.anfragen) || 0)),
      token: Math.max(0, Math.floor(Number(eintrag.nutzung?.token) || 0))
    },
    deaktiviertAm: eintrag.deaktiviertAm || "",
    zustand: eintrag.widerrufenAm ? "widerrufen"
      : istAbgelaufen(eintrag.laeuftAbAm) ? "abgelaufen"
      : (eintrag.deaktiviertAm ? "inaktiv" : "aktiv")
  };
}

function sichererName(wert) {
  const name = String(wert || "").trim().slice(0, 60);
  return /[<>]/.test(name) ? "" : name;
}

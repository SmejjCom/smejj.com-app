// smejj.com — Apple-Login-Helfer ("Mit Apple anmelden", Web-Ablauf).
// Single Responsibility: Konfiguration, State-Signatur, Client-Secret (JWT),
// Code-Tausch und Pruefung des id_token. Aufbau analog zu githubAuth.js:
// Fail-closed (fehlende Config -> Aufrufer meldet 503), alle Netzaufrufe ueber
// fetchImpl injizierbar.
//
// Was Apple anders macht als Google/GitHub:
//   - Das "Client-Secret" ist kein fester Wert, sondern ein kurzlebiges JWT,
//     das WIR mit dem privaten Schluessel (.p8) aus dem Apple-Portal signieren
//     (ES256, iss = Team-ID, sub = Services-ID, kid = Key-ID).
//   - Mit den Bereichen "name email" antwortet Apple per POST (form_post) auf
//     die Rueckkehr-Adresse, nicht per GET.
//   - Den Namen liefert Apple NUR bei der allerersten Anmeldung.
//   - Die E-Mail kann eine Weiterleitungs-Adresse sein (privaterelay.appleid.com);
//     sie ist trotzdem vom Nutzer bestaetigt (email_verified).
import crypto from "node:crypto";
import { hmac } from "../../control-server/src/shared/hash.js";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_AUTHORIZE_URL = `${APPLE_ISSUER}/auth/authorize`;
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const APPLE_KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const KEYS_TTL_MS = 60 * 60 * 1000;
// Apple erlaubt bis zu 6 Monate; wir signieren pro Tausch neu und brauchen nur Minuten.
const CLIENT_SECRET_LIFETIME_S = 300;

/**
 * Liest die Apple-Konfiguration aus der Umgebung. Der private Schluessel darf
 * als PEM mit echten Zeilenumbruechen, mit literalen "\n" (einzeilige
 * Umgebungsvariable) oder als Base64 der PEM-Datei hinterlegt sein.
 */
export function appleConfigFromEnv(env = process.env) {
  return {
    servicesId: String(env.SMEJJ_APPLE_LOGIN_SERVICES_ID || "").trim(),
    teamId: String(env.SMEJJ_APPLE_LOGIN_TEAM_ID || "").trim(),
    keyId: String(env.SMEJJ_APPLE_LOGIN_KEY_ID || "").trim(),
    privateKey: normalizeApplePrivateKey(env.SMEJJ_APPLE_LOGIN_PRIVATE_KEY)
  };
}

export function appleLoginConfigured(env = process.env) {
  const { servicesId, teamId, keyId, privateKey } = appleConfigFromEnv(env);
  return Boolean(servicesId && teamId && keyId && privateKey);
}

export function normalizeApplePrivateKey(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  if (!value.includes("BEGIN")) {
    try { value = Buffer.from(value, "base64").toString("utf8").trim(); } catch { return ""; }
  }
  value = value.replace(/\\n/g, "\n");
  return value.includes("BEGIN PRIVATE KEY") ? value : "";
}

export function appleAuthorizeUrl({ servicesId, redirectUri, state, nonce, scope = "name email" }) {
  const url = new URL(APPLE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  // Pflicht, sobald Bereiche (name/email) angefragt werden.
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("client_id", servicesId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

export function signAppleAuthState(data, secret) {
  const payload = base64UrlEncode(JSON.stringify(data));
  const signature = hmac(secret, payload, "base64url");
  return `${payload}.${signature}`;
}

/**
 * Wie verifyGithubAuthState, aber ohne zu werfen: die Rueckkehr von Apple ist
 * ein Browser-Formular, dort soll ein Mensch eine lesbare Seite sehen und keine
 * nackte JSON-Fehlermeldung (Befund 2026-08-22 beim Google-Login).
 * Bei ABGELAUFEN bleibt der Inhalt lesbar (Signatur war gueltig), bei
 * UNGUELTIGER Signatur gibt es bewusst keine Daten.
 */
export function leseAppleAuthState(state, secret, nowMs = Date.now()) {
  const [payload, signature] = String(state || "").split(".");
  const expected = hmac(secret, payload || "", "base64url");
  if (!payload || !signature || signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, grund: "ungueltig", daten: null };
  }
  let daten = null;
  try { daten = JSON.parse(base64UrlDecode(payload).toString("utf8")); } catch { return { ok: false, grund: "ungueltig", daten: null }; }
  if (Number(daten.exp || 0) <= nowMs) return { ok: false, grund: "abgelaufen", daten };
  return { ok: true, daten };
}

/** Client-Secret: ein von uns signiertes ES256-JWT (Apple verlangt kein festes Secret). */
export function createAppleClientSecret({ teamId, servicesId, keyId, privateKey }, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: teamId, iat, exp: iat + CLIENT_SECRET_LIFETIME_S, aud: APPLE_ISSUER, sub: servicesId
  }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: privateKey, dsaEncoding: "ieee-p1363"
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

// Tauscht den Authorization-Code gegen das id_token. Wirft bei Fehler und
// reicht weder Secret noch Roh-Antwort von Apple nach aussen.
export async function exchangeAppleCode(code, { config, redirectUri, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const body = new URLSearchParams({
    client_id: config.servicesId,
    client_secret: createAppleClientSecret(config, nowMs),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  const response = await fetchImpl(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "error"
  });
  if (!response.ok) throw new Error("Apple Token-Tausch fehlgeschlagen.");
  const data = await response.json();
  const idToken = String(data.id_token || "").trim();
  if (!idToken || data.error) throw new Error("Apple hat kein gueltiges Token geliefert.");
  return idToken;
}

let keysCache = { at: 0, keys: null };

async function appleKey(kid, fetchImpl, nowMs) {
  if (!keysCache.keys || nowMs - keysCache.at > KEYS_TTL_MS || !keysCache.keys.some((k) => k.kid === kid)) {
    const response = await fetchImpl(APPLE_KEYS_URL, { redirect: "error" });
    if (!response.ok) throw new Error("Apple Schluessel konnten nicht geladen werden.");
    const data = await response.json();
    keysCache = { at: nowMs, keys: Array.isArray(data.keys) ? data.keys : [] };
  }
  const jwk = keysCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("Apple Schluessel unbekannt.");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

export function vergesseAppleSchluessel() { keysCache = { at: 0, keys: null }; }

/**
 * Prueft das id_token (RS256, Aussteller, Zielgruppe, Ablauf, nonce) und gibt
 * die Nutzdaten zurueck. Fail-closed: ohne bestaetigte E-Mail kein Konto.
 */
export async function verifyAppleIdToken(token, { servicesId, expectedNonce = "", fetchImpl = fetch, nowMs = Date.now() } = {}) {
  const [headerPart, payloadPart, signaturePart] = String(token || "").split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Ungueltiges Apple Token.");
  let header; let payload;
  try {
    header = JSON.parse(base64UrlDecode(headerPart).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch { throw new Error("Ungueltiges Apple Token."); }
  if (header.alg !== "RS256" || !header.kid) throw new Error("Ungueltige Apple Signatur.");
  if (payload.iss !== APPLE_ISSUER) throw new Error("Ungueltiger Apple Issuer.");
  if (payload.aud !== servicesId) throw new Error("Apple Services-ID passt nicht.");
  if (Number(payload.exp || 0) <= Math.floor(nowMs / 1000)) throw new Error("Apple Token ist abgelaufen.");
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error("Apple Login Nonce passt nicht.");
  const key = await appleKey(header.kid, fetchImpl, nowMs);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), key, base64UrlDecode(signaturePart));
  if (!ok) throw new Error("Apple Signatur konnte nicht geprueft werden.");
  const email = String(payload.email || "").toLowerCase();
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !verified) throw new Error("Apple E-Mail ist nicht verifiziert.");
  return { email, sub: String(payload.sub || ""), privateRelay: payload.is_private_email === true || payload.is_private_email === "true" };
}

/** Apple liefert den Namen nur beim ersten Mal, als JSON-Text im Formularfeld "user". */
export function appleNameFromUserField(raw) {
  try {
    const user = JSON.parse(String(raw || ""));
    const first = String(user?.name?.firstName || "").trim();
    const last = String(user?.name?.lastName || "").trim();
    return `${first} ${last}`.trim().slice(0, 120);
  } catch { return ""; }
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

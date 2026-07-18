// smejj.com — GitHub-Login-Helfer (OAuth 2.0 Authorization-Code-Flow).
// Single Responsibility: State-Signatur + Token-Tausch + Nutzerdaten-Abruf.
// Getrennt vom bestehenden GitHub-App-Publisher (githubApp.js): dies ist eine
// eigene OAuth-App nur fuer Login (SMEJJ_GITHUB_LOGIN_CLIENT_ID/SECRET).
// Fail-closed: fehlende Config -> Aufrufer meldet 503, kein stiller Fallback.
// Alle Netzaufrufe sind ueber fetchImpl injizierbar (erstmals unit-testbar).
import crypto from "node:crypto";
import { hmac } from "../../control-server/src/shared/hash.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const USER_AGENT = "smejj.com-auth";

export function githubAuthorizeUrl({ clientId, redirectUri, scope = "read:user user:email", state }) {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export function signGithubAuthState(data, secret) {
  const payload = base64UrlEncode(JSON.stringify(data));
  const signature = hmac(secret, payload, "base64url");
  return `${payload}.${signature}`;
}

export function verifyGithubAuthState(state, secret, nowMs = Date.now()) {
  const [payload, signature] = String(state || "").split(".");
  const expected = hmac(secret, payload || "", "base64url");
  if (!payload || !signature || signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("GitHub Login State ist ungueltig.");
  }
  const data = JSON.parse(base64UrlDecode(payload).toString("utf8"));
  if (Number(data.exp || 0) <= nowMs) throw new Error("GitHub Login State ist abgelaufen.");
  return data;
}

// Tauscht den Authorization-Code gegen ein Access-Token. Wirft bei Fehler,
// gibt niemals das Secret oder Rohfehler mit Credentials weiter.
export async function exchangeGithubCode(code, {
  clientId, clientSecret, redirectUri, state, fetchImpl = fetch
} = {}) {
  const response = await fetchImpl(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, state }),
    redirect: "error"
  });
  if (!response.ok) throw new Error("GitHub Token-Tausch fehlgeschlagen.");
  const data = await response.json();
  const token = String(data.access_token || "").trim();
  if (!token || data.error) throw new Error("GitHub hat kein gueltiges Token geliefert.");
  return token;
}

// Holt Profil + verifizierte Primaer-E-Mail. Fail-closed: ohne verifizierte
// E-Mail wird kein Konto ausgestellt (kein Account-Takeover ueber Fremd-Mail).
export async function fetchGithubUser(accessToken, { fetchImpl = fetch } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const profileRes = await fetchImpl(GITHUB_USER_URL, { headers, redirect: "error" });
  if (!profileRes.ok) throw new Error("GitHub Profil konnte nicht geladen werden.");
  const profile = await profileRes.json();
  let email = String(profile.email || "").toLowerCase();
  let emailVerified = false;
  const emailsRes = await fetchImpl(GITHUB_EMAILS_URL, { headers, redirect: "error" });
  if (emailsRes.ok) {
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails)
      ? emails.find((entry) => entry.primary && entry.verified) || emails.find((entry) => entry.verified)
      : null;
    if (primary) { email = String(primary.email || "").toLowerCase(); emailVerified = true; }
  }
  if (!email || !emailVerified) throw new Error("GitHub E-Mail ist nicht verifiziert.");
  return {
    email,
    name: String(profile.name || profile.login || email),
    picture: String(profile.avatar_url || ""),
    sub: String(profile.id || ""),
    login: String(profile.login || "")
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

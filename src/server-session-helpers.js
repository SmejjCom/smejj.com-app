// smejj.com — Sitzungs- und Token-Helfer des Control Servers.
//
// Ausgelagert aus src/server.js (2026-08-13): die Datei stand bei 806 Zeilen
// und riss damit die 800-Zeilen-Grenze aus AI_Guidelines.md Abschnitt 2 —
// einer von zwei Punkten, die das Werkstatt-Tor und damit den Nachtbau
// blockierten. Hier steht bewusst NUR, was Sitzungen und Token betrifft:
// kein Routing, keine Modell-Logik. So bleibt server.js die Landkarte der
// Endpunkte und diese Datei die Antwort auf "wie sieht ein Cookie aus".
//
// SHORT_ACCESS_TOKEN und SESSION_COOKIE_SAMESITE kommen als Parameter herein
// statt hier erneut aus der Umgebung gelesen zu werden — sonst haetten zwei
// Dateien je eine eigene Wahrheit ueber dieselbe Einstellung.
import { SECURITY_LIMITS } from "./shared/securityPolicy.js";
import {
  bearerSessionToken, issueAccessToken, issueSessionToken, verifySessionToken
} from "../control-server/src/auth/sessionToken.js";
import {
  isSessionActive, newSessionId, registerSession, sessionRegistryEnabled
} from "../control-server/src/auth/sessionRegistry.js";
import { emailSessionStillValid } from "../control-server/src/routes/emailAuthRoutes.js";

export function boundedInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}


export function readAuthBody(req) {
  const contentType = String(req.headers["content-type"] || "");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > SECURITY_LIMITS.maxJsonBodyBytes) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(raw);
          return resolve({
            credential: params.get("credential") || "",
            idToken: params.get("id_token") || "",
            state: params.get("state") || "",
            redirect: true
          });
        }
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid auth request"));
      }
    });
  });
}

/**
 * Baut die kontextabhaengigen Sitzungs-Helfer.
 *
 * Dasselbe Muster wie createVoiceTts in der Chat-Bruecke: die drei Werte, die
 * frueher als Modul-Globale in server.js lagen, kommen EINMAL herein statt in
 * zwei Dateien erneut aus der Umgebung gelesen zu werden. So gibt es weiterhin
 * genau eine Wahrheit ueber Sitzungsgeheimnis, SameSite und kurze Token.
 */
export function createSessionHelpers({ sessionSecret, SESSION_COOKIE_SAMESITE, SHORT_ACCESS_TOKEN }) {
  function serializeSessionCookie(user) {
    // H2: genau HIER (Cookie wird nur beim Login gesetzt, nicht bei /me-Renewal)
    // bekommt eine Nicht-E-Mail-Sitzung ihre sid und einen Registry-Eintrag —
    // damit auch Google/Passkey/GitHub/Magic fern-widerrufbar werden.
    ensureRegistrySid(user);
    const maxAge = user?.permanent || user?.method === "google" ? 315360000 : 604800;
    return `smejj_session=${serializeSessionToken(user)}; Path=/; HttpOnly; Secure; SameSite=${SESSION_COOKIE_SAMESITE}; Max-Age=${maxAge}`;
  }

  // H2 (Flag SMEJJ_SESSION_REGISTRY): vergibt einer frisch angemeldeten
  // Nicht-E-Mail-Sitzung eine sid und hinterlegt sie als aktiv. Synchron die sid
  // (sie muss sofort in Cookie UND Access-Token), die Registrierung best-effort im
  // Hintergrund (isSessionActive wertet "noch kein Eintrag" als aktiv -> kein
  // Aussperren). E-Mail-Sitzungen haben ihre eigene Registry und werden hier
  // ausgelassen. Ohne Flag passiert nichts (Rollback per Flag).
  function ensureRegistrySid(user) {
    if (!sessionRegistryEnabled(process.env)) return;
    if (!user || user.method === "email" || user.sid) return;
    user.sid = newSessionId();
    registerSession({
      sid: user.sid,
      subject: user.userId || user.sub || user.email,
      method: user.method,
      expiresAtMs: Date.now() + 180 * 24 * 60 * 60 * 1000
    }, process.env).catch(() => {});
  }

  // Generalisierte Sitzungspruefung: E-Mail wie bisher; Nicht-E-Mail nur dann, wenn
  // die Registry aktiv ist UND das Token eine sid traegt. Legacy-Tokens ohne sid
  // (vor Flag-Aktivierung ausgestellt) bleiben gueltig.
  async function sessionStillValid(user, env = process.env) {
    if (!user) return false;
    if (user.method === "email") return emailSessionStillValid(user, env);
    if (sessionRegistryEnabled(env) && user.sid) return isSessionActive(user.sid, env);
    return true;
  }

  function serializeSessionToken(user) {
    return issueSessionToken({ secret: sessionSecret, user });
  }

  // H1-Haertung (2026-08-09, Flag SMEJJ_SHORT_ACCESS_TOKEN): der JS-lesbare Bearer,
  // den das Frontend an die Cross-Origin-Bridge schickt, ist bei aktivem Flag nur
  // noch ein kurzlebiges Access-Token (10 min, kind:"access"). Das 180-Tage-Token
  // bleibt ausschliesslich im HttpOnly-Cookie. verifySessionToken akzeptiert beide
  // Arten -> keine bestehende Sitzung bricht. Flag aus = altes Verhalten (Bearer =
  // Langzeit-Token), damit ist der Rollback ein einziges Env-Flag.
  function serializeAccessToken(user) {
    if (user?.permanent || user?.method === "google") return serializeSessionToken(user);
    return SHORT_ACCESS_TOKEN
      ? issueAccessToken({ secret: sessionSecret, user })
      : serializeSessionToken(user);
  }

  function readSession(req) {
    const match = String(req.headers.cookie || "").match(/(?:^|;\s*)smejj_session=([^;]+)/);
    const token = bearerSessionToken(req.headers || {}) || match?.[1] || "";
    return verifySessionToken(token, { secret: sessionSecret });
  }

  return {
    ensureRegistrySid, readSession, serializeAccessToken,
    serializeSessionCookie, serializeSessionToken, sessionStillValid
  };
}

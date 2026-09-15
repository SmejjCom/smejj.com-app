// Einmal-Probe Freigabe 1a (15.09.2026): prueft LIVE, ob Token und Cookie dauerhafter
// Sitzungen 30 Tage tragen. Eigenes 10-Minuten-Test-Token (Testidentitaet), nichts wird
// gespeichert oder ausgegeben ausser Laufzeiten in Tagen und Max-Age.
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { issueSessionToken } from "../../control-server/src/auth/sessionToken.js";
loadSecureLocalEnv();
const secret = String(process.env.SMEJJ_SESSION_SECRET || "");
if (!secret) { console.error("kein Schluessel"); process.exit(1); }
const token = issueSessionToken({ secret, user: { userId: "eval-harness", email: "smejjcom@gmail.com", method: "google" }, ttlMs: 10 * 60 * 1000 });
const tage = (t) => { try { const p = JSON.parse(Buffer.from(String(t).split(".")[0], "base64url").toString()); return Math.round((p.expiresAt - p.issuedAt) / 864e5); } catch { return null; } };
const me = await fetch("https://api.smejj.com/api/auth/me", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Origin: "https://smejj.com" } });
const meJson = await me.json().catch(() => ({}));
const st = await fetch("https://api.smejj.com/api/auth/session-token", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Origin: "https://smejj.com" } });
const keks = st.headers.get("set-cookie") || "";
console.log(JSON.stringify({ me: me.status, authenticated: meJson.authenticated, meTokenTage: tage(meJson.accessToken), sessionToken: st.status, cookieGesetzt: /smejj_session=/.test(keks), cookieMaxAge: (keks.match(/Max-Age=(\d+)/) || [])[1] || null }));
process.exit(0);

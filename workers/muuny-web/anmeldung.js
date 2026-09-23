// muuny.com — Anmeldung per E-Mail-Code und signierte Sitzung.
//
// Bewusst ohne Datenbank und ohne Passwort:
//  * Ein 6-stelliger Code geht per E-Mail raus, gilt 10 Minuten, hoechstens 5 Versuche.
//    Gespeichert wird nur sein Hash, im Speicher des Dienstes. Ein Neustart macht
//    offene Codes ungueltig — dann fordert man eben einen neuen an.
//  * Die Sitzung ist ein HMAC-signiertes Cookie. Es enthaelt NICHT die E-Mail,
//    sondern nur eine pseudonyme Kennung (HMAC der E-Mail mit geheimem Pfeffer).
//    Diese Kennung geht als x-muuny-nutzer an den Autopiloten; die E-Mail verlaesst
//    diesen Dienst nur Richtung E-Mail-Versand.
//  * Grenzen gegen Missbrauch: je Adresse 1 Code pro Minute und 5 pro Stunde,
//    je Absender-IP 20 pro Stunde.
import crypto from "node:crypto";

export const CODE_GUELTIG_MS = 10 * 60_000;
export const CODE_MAX_VERSUCHE = 5;
export const SITZUNG_TAGE = 30;
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normEmail(roh) {
  const e = String(roh || "").trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

const b64u = (b) => Buffer.from(b).toString("base64url");
const hmac = (schluessel, text) => crypto.createHmac("sha256", schluessel).update(text).digest();
const hashCode = (email, code) => crypto.createHash("sha256").update(`${email}\n${code}`).digest("hex");

function gleich(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Pseudonyme, stabile Nutzerkennung: gleiche E-Mail -> gleiche Kennung, ohne die E-Mail preiszugeben. */
export function nutzerKennung(email, pfeffer) {
  return `m_${hmac(pfeffer, `nutzer:${email}`).toString("hex").slice(0, 32)}`;
}

/** Gleitendes Fenster: erlaubt hoechstens `max` Ereignisse je `fensterMs` und Schluessel. */
export class Drossel {
  constructor({ max, fensterMs, jetzt = () => Date.now() }) { Object.assign(this, { max, fensterMs, jetzt }); this.m = new Map(); }
  erlaubt(schluessel) {
    const t = this.jetzt();
    const liste = (this.m.get(schluessel) || []).filter((x) => t - x < this.fensterMs);
    if (liste.length >= this.max) { this.m.set(schluessel, liste); return false; }
    liste.push(t);
    this.m.set(schluessel, liste);
    if (this.m.size > 50_000) this.aufraeumen();
    return true;
  }
  aufraeumen() {
    const t = this.jetzt();
    for (const [k, v] of this.m) if (!v.some((x) => t - x < this.fensterMs)) this.m.delete(k);
  }
}

export class CodeSpeicher {
  constructor({ jetzt = () => Date.now(), zufall = () => crypto.randomInt(0, 1_000_000) } = {}) {
    Object.assign(this, { jetzt, zufall });
    this.codes = new Map();
    this.jeAdresseMinute = new Drossel({ max: 1, fensterMs: 60_000, jetzt });
    this.jeAdresseStunde = new Drossel({ max: 5, fensterMs: 3_600_000, jetzt });
    this.jeIp = new Drossel({ max: 20, fensterMs: 3_600_000, jetzt });
  }

  /** @returns {{ok:true, code:string} | {ok:false, grund:string}} */
  neu(email, ip = "?") {
    if (!this.jeIp.erlaubt(ip)) return { ok: false, grund: "zu_viele_anfragen" };
    if (!this.jeAdresseMinute.erlaubt(email) || !this.jeAdresseStunde.erlaubt(email)) return { ok: false, grund: "zu_viele_anfragen" };
    const code = String(this.zufall()).padStart(6, "0");
    this.codes.set(email, { hash: hashCode(email, code), bis: this.jetzt() + CODE_GUELTIG_MS, versuche: 0 });
    if (this.codes.size > 50_000) for (const [k, v] of this.codes) if (v.bis < this.jetzt()) this.codes.delete(k);
    return { ok: true, code };
  }

  /** Einmal richtig = verbraucht. Zu viele Fehlversuche = verbrannt. */
  pruefe(email, code) {
    const e = this.codes.get(email);
    if (!e || e.bis < this.jetzt()) { this.codes.delete(email); return { ok: false, grund: "code_abgelaufen" }; }
    if (!/^\d{6}$/.test(String(code || "").trim())) return { ok: false, grund: "code_falsch" };
    e.versuche += 1;
    if (gleich(e.hash, hashCode(email, String(code).trim()))) { this.codes.delete(email); return { ok: true }; }
    if (e.versuche >= CODE_MAX_VERSUCHE) { this.codes.delete(email); return { ok: false, grund: "code_verbrannt" }; }
    return { ok: false, grund: "code_falsch" };
  }
}

/** Signiertes Sitzungs-Cookie: base64url(json).base64url(hmac). */
export function sitzungAusstellen(daten, schluessel, { jetzt = Date.now() } = {}) {
  const inhalt = b64u(JSON.stringify({ ...daten, bis: jetzt + SITZUNG_TAGE * 86_400_000 }));
  return `${inhalt}.${b64u(hmac(schluessel, inhalt))}`;
}

export function sitzungLesen(wert, schluessel, { jetzt = Date.now() } = {}) {
  const [inhalt, sig] = String(wert || "").split(".");
  if (!inhalt || !sig || !gleich(sig, b64u(hmac(schluessel, inhalt)))) return null;
  try {
    const d = JSON.parse(Buffer.from(inhalt, "base64url").toString("utf8"));
    return d && typeof d.u === "string" && Number(d.bis) > jetzt ? d : null;
  } catch { return null; }
}

export function cookieLesen(kopf, name) {
  for (const teil of String(kopf || "").split(";")) {
    const i = teil.indexOf("=");
    if (i > 0 && teil.slice(0, i).trim() === name) return teil.slice(i + 1).trim();
  }
  return null;
}

export function cookieSetzen(name, wert, { maxAlterS = SITZUNG_TAGE * 86_400 } = {}) {
  return `${name}=${wert}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAlterS}`;
}

/** Der Code-Versand ueber Resend. Ohne Schluessel: ehrliches "nicht eingerichtet". */
export function resendVersand({ schluessel, absender = "muuny <code@muuny.com>", fetchImpl = fetch }) {
  if (!schluessel) return null;
  return async (email, code) => {
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${schluessel}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ from: absender, to: [email], subject: `Dein muuny-Code: ${code}`,
        text: `Dein Anmeldecode fuer muuny.com: ${code}\n\nEr gilt 10 Minuten. Wenn du ihn nicht angefordert hast, ignoriere diese E-Mail.\n\nmuuny.com` })
    });
    if (!r.ok) throw new Error(`versand_${r.status}`);
  };
}

// smejj.com — Step-up fuer schreibende Admin-Aktionen (Single Responsibility:
// frischer Besitznachweis).
//
// Warum: Sitzungen laufen bis zu 180 Tage. Fuer LESEN ist das bequem und
// vertretbar — fuer Sperren, Loeschen und Rollenvergabe ist eine alte Sitzung
// allein zu wenig. Der zweite Faktor, den es heute schon gibt, ist das
// Admin-Postfach: ein 6-stelliger Code per Mail, kurz gueltig, oeffnet ein
// kleines Schreibfenster. (Passkey-Step-up folgt erst, wenn die Konsole auf
// einer smejj.com-Subdomain liegt — WebAuthn bindet an die Domain.)
//
// Bewusst in-memory: der Control-Server laeuft mit einer Replika, und ein
// Neustart schliesst schlicht alle Fenster (fail-closed, niemand faellt durch).
import crypto from "node:crypto";
import { sendAuthMail } from "../auth/mailer.js";

const CODE_GUELTIG_MS = 10 * 60 * 1000;
const FENSTER_MS = 15 * 60 * 1000;
const MAX_VERSUCHE = 5;

/** email -> { codeHash, expiresAt, versuche, elevatedUntil } */
const eintraege = new Map();

function schluesselFuer(email) {
  return String(email || "").trim().toLowerCase();
}

function hashe(code) {
  return crypto.createHash("sha256").update(String(code)).digest();
}

/** Ist fuer diese Adresse gerade ein Schreibfenster offen? */
export function istErhoeht(email, { now = Date.now } = {}) {
  const eintrag = eintraege.get(schluesselFuer(email));
  return Boolean(eintrag?.elevatedUntil && eintrag.elevatedUntil > now());
}

/**
 * Erzeugt einen frischen Code und schickt ihn an die Admin-Adresse.
 * Ein neuer Code ersetzt den alten — es gibt immer hoechstens einen.
 */
export async function fordereCode(email, { env = process.env, mail = sendAuthMail, now = Date.now } = {}) {
  const schluessel = schluesselFuer(email);
  if (!schluessel) return { ok: false, error: "step_up_email_missing" };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const bisher = eintraege.get(schluessel);
  eintraege.set(schluessel, {
    codeHash: hashe(code),
    expiresAt: now() + CODE_GUELTIG_MS,
    versuche: 0,
    // Ein offenes Fenster bleibt offen — der neue Code verlaengert es nicht.
    elevatedUntil: bisher?.elevatedUntil || 0
  });
  const ergebnis = await mail({
    to: schluessel,
    subject: "smejj.com Adminbereich — Bestaetigungscode",
    text: "Dein Bestaetigungscode fuer schreibende Admin-Aktionen: " + code + "\n\n"
      + "Er gilt 10 Minuten und oeffnet ein Schreibfenster von 15 Minuten.\n"
      + "Wenn du das nicht warst: Sitzungen widerrufen und Passwort aendern.",
    art: "admin-step-up"
  }, env);
  if (!ergebnis?.sent) {
    // Ohne Mail kein Code-Geheimnis im Umlauf — Eintrag wieder aufraeumen,
    // ein evtl. offenes Fenster aber nicht anruehren.
    if (bisher?.elevatedUntil) eintraege.set(schluessel, { elevatedUntil: bisher.elevatedUntil });
    else eintraege.delete(schluessel);
    return { ok: false, error: "step_up_mail_failed", reason: String(ergebnis?.reason || "unbekannt") };
  }
  return { ok: true, gueltigSek: CODE_GUELTIG_MS / 1000 };
}

/**
 * Oeffnet das Schreibfenster, ohne einen Mail-Code zu verlangen.
 *
 * Ausschliesslich fuer einen Nachweis, der MINDESTENS so stark ist wie der
 * Code — heute der Passkey (Besitz des Geraets plus Biometrie, gebunden an die
 * Domain). Der Aufrufer hat den Nachweis bereits geprueft; diese Funktion
 * prueft nichts, sie haelt nur die Zeit. Wer sie ohne vorherige Pruefung
 * aufruft, hebt den Step-up auf.
 */
export function oeffneFenster(email, { now = Date.now } = {}) {
  const schluessel = schluesselFuer(email);
  if (!schluessel) return { ok: false, error: "step_up_email_missing" };
  const bisher = eintraege.get(schluessel);
  eintraege.set(schluessel, {
    // Ein offener Mail-Code wird dabei entwertet: es gibt nur einen Weg zur
    // Zeit, sonst laege nach dem Passkey noch ein gueltiger Code herum.
    elevatedUntil: Math.max(now() + FENSTER_MS, bisher?.elevatedUntil || 0)
  });
  return { ok: true, fensterSek: FENSTER_MS / 1000 };
}

/** Prueft den Code und oeffnet bei Erfolg das Schreibfenster. */
export function bestaetigeCode(email, code, { now = Date.now } = {}) {
  const schluessel = schluesselFuer(email);
  const eintrag = eintraege.get(schluessel);
  if (!eintrag?.codeHash) return { ok: false, error: "step_up_code_missing" };
  if (eintrag.expiresAt <= now()) {
    eintraege.set(schluessel, { elevatedUntil: eintrag.elevatedUntil || 0 });
    return { ok: false, error: "step_up_code_expired" };
  }
  eintrag.versuche += 1;
  if (eintrag.versuche > MAX_VERSUCHE) {
    eintraege.set(schluessel, { elevatedUntil: eintrag.elevatedUntil || 0 });
    return { ok: false, error: "step_up_too_many_attempts" };
  }
  const eingabe = hashe(String(code || "").trim());
  if (!crypto.timingSafeEqual(eingabe, eintrag.codeHash)) {
    return { ok: false, error: "step_up_code_wrong", verbleibend: MAX_VERSUCHE - eintrag.versuche };
  }
  eintraege.set(schluessel, { elevatedUntil: now() + FENSTER_MS });
  return { ok: true, fensterSek: FENSTER_MS / 1000 };
}

export function __clearStepUpForTests() {
  eintraege.clear();
}

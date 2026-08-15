// smejj.com — Nutzerdatensatz fuer die OAuth-Anmeldewege (Google, GitHub).
//
// BEFUND 2026-08-14 (A-bis-Z-Pruefung des Adminbereichs): Wer sich mit Google
// anmeldet, kommt NIE in den Adminbereich. `handleGoogleAuth` prueft Googles
// `email_verified`, baut daraus eine Sitzung — und wirft den Nachweis dann weg.
// Ins Nutzerverzeichnis schreibt ausschliesslich der E-Mail-Weg. Der
// Adminbereich verlangt aber genau dort einen Eintrag:
// `adminAuth.js` -> `Boolean(record?.emailVerifiedAt)` -> sonst
// `403 admin_email_not_verified`. Ohne Datensatz ist das Feld immer leer.
//
// Gemessen am Betreiberkonto: `/api/auth/me` sagte `authenticated: true`
// (Weg "google"), `/api/admin/me` gleichzeitig `403 admin_email_not_verified`.
//
// DIESE DATEI HAELT DEN NACHWEIS FEST, statt ihn wegzuwerfen. Google und
// GitHub haben die Adresse bereits geprueft — dieselbe Tatsache, die der
// Magic-Link nachweist. Sie gehoert in denselben Datensatz.
//
// DREI REGELN, alle drei notwendig:
//
//  1. NIE ein Passwort setzen. Der Datensatz bekommt `passwordHash: null`.
//     Der Passwort-Login weist das ab (`if (!record?.passwordHash)`), und
//     `verifyPassword` faellt bei allem, was kein scrypt-Hash ist, zu. Ein
//     OAuth-Konto ist damit ueber den Passwortweg nicht erreichbar.
//  2. NIE Rechte veraendern. Ein bestehender Datensatz behaelt Rolle, Status
//     und alles andere; gesetzt wird ausschliesslich `emailVerifiedAt`, und
//     auch das nur, wenn es noch leer ist. Ein gesperrtes Konto bleibt
//     gesperrt — Google anzumelden darf keine Sperre aufheben.
//  3. NIE die Anmeldung an dieser Stelle scheitern lassen. Ist das
//     Verzeichnis gerade nicht erreichbar, meldet sich der Nutzer trotzdem an;
//     nur der Adminbereich bleibt bis zur naechsten Anmeldung zu. Andersherum
//     waere eine Speicherstoerung eine Aussperrung aller Nutzer.
import {
  DEFAULT_ROLE, DEFAULT_STATUS, getUserByEmail, newUserId, normalizeEmail, putUser
} from "./emailUserStore.js";

/**
 * Haelt fest, dass ein OAuth-Anbieter die Adresse bestaetigt hat.
 *
 * @param {{email: string, name?: string, method: string}} nutzer Anmeldedaten des Anbieters
 * @param {{env?: object, jetzt?: string, speicher?: object}} [deps]
 * @returns {Promise<"angelegt"|"bestaetigt"|"unveraendert"|"gestoert">}
 */
export async function merkeOauthBestaetigung(nutzer, { env = process.env, jetzt = null, speicher = null } = {}) {
  const laden = speicher?.getUserByEmail || getUserByEmail;
  const schreiben = speicher?.putUser || putUser;

  const email = normalizeEmail(nutzer?.email);
  if (!email) return "gestoert";
  const zeitpunkt = jetzt || new Date().toISOString();

  try {
    const vorhanden = await laden(email, env);

    if (vorhanden) {
      // Regel 2: nur das eine Feld, und nur wenn es leer ist.
      if (vorhanden.emailVerifiedAt) return "unveraendert";
      vorhanden.emailVerifiedAt = zeitpunkt;
      vorhanden.updatedAt = zeitpunkt;
      await schreiben(vorhanden, env);
      return "bestaetigt";
    }

    // Regel 1: kein Passwort. createUserRecord() verlangt einen Hash und ist
    // deshalb hier nicht benutzbar — der Datensatz entsteht ausdruecklich ohne.
    await schreiben({
      version: 1,
      userId: newUserId(),
      email,
      name: String(nutzer?.name || email.split("@")[0]).slice(0, 120),
      method: String(nutzer?.method || "oauth").slice(0, 32),
      passwordHash: null,
      emailVerifiedAt: zeitpunkt,
      role: DEFAULT_ROLE,
      status: DEFAULT_STATUS,
      createdAt: zeitpunkt,
      updatedAt: zeitpunkt,
      verify: null,
      reset: null,
      loginGuard: { failedCount: 0, lockedUntil: null },
      sessions: []
    }, env);
    return "angelegt";
  } catch {
    // Regel 3: die Anmeldung laeuft weiter.
    return "gestoert";
  }
}

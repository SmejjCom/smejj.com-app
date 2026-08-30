// smejj.com — Kontodatensatz fuer Anmeldungen ueber Google und GitHub.
//
// WARUM ES DAS GIBT (Befund 2026-08-14): Der Betreiber kam nicht in den
// Adminbereich. Die Meldung lautete „Diese E-Mail-Adresse ist noch nicht
// bestaetigt", und jeder korrekt eingegebene Bestaetigungscode aenderte nichts.
// Der Grund war eine geschlossene Schleife:
//
//   1. Google-/GitHub-Anmeldung baut nur eine Sitzung (Cookie + Token) und
//      beruehrt den Kontospeicher nie.
//   2. adminAuth.js verlangt `emailVerifiedAt` an einem Datensatz im Speicher.
//   3. verifyEmailToken() beginnt mit getUserByEmail() — ohne Datensatz bricht
//      es mit „ungueltig oder abgelaufen" ab.
//
// Es gab also nichts, woran eine Bestaetigung haften konnte. Wer sich nie per
// E-Mail und Passwort registriert hatte, konnte den Adminbereich grundsaetzlich
// nicht erreichen — unabhaengig von seiner Rolle.
//
// Bitter daran: Beide Anbieter bestaetigen die Adresse laengst und beide Routen
// pruefen das ausdruecklich (Google `payload.email_verified`, GitHub die
// `verified`-Angabe der Adressliste). Der Nachweis wurde nur nirgends vermerkt.
// Dieses Modul traegt ihn nach.
//
// GRUNDSATZ: Die Anmeldung darf hieran NIE scheitern. Eine Speicherstoerung
// sperrt niemanden aus — sie fuehrt aber auch zu keinen Rechten, denn
// adminAuth.js bleibt fail-closed und antwortet dann mit
// `admin_directory_unavailable`.
import crypto from "node:crypto";
import { getUserByEmail, normalizeEmail, putUser } from "../../control-server/src/auth/emailUserStore.js";

function neueNutzerId() {
  return `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/**
 * Stellt sicher, dass es zu einer vom Anbieter bestaetigten Adresse einen
 * Kontodatensatz gibt, und vermerkt die Bestaetigung.
 *
 * @param {{ email: string, name?: string, method: "google"|"github" }} anmeldung
 * @returns {Promise<{ angelegt: boolean, bestaetigt: boolean, grund?: string }>}
 */
export async function sichereAnbieterKonto(anmeldung, env = process.env, speicher = { getUserByEmail, putUser }) {
  const email = normalizeEmail(anmeldung?.email || "");
  const method = String(anmeldung?.method || "");
  if (!email) return { angelegt: false, bestaetigt: false, grund: "keine_adresse" };
  if (method !== "google" && method !== "github") {
    return { angelegt: false, bestaetigt: false, grund: "unbekannter_weg" };
  }

  try {
    const vorhanden = await speicher.getUserByEmail(email, env);
    const jetzt = new Date().toISOString();

    if (vorhanden) {
      // Nichts ueberschreiben, was das Konto schon hat — nur den fehlenden
      // Besitznachweis nachtragen. Rolle und Status bleiben unberuehrt.
      if (vorhanden.emailVerifiedAt) return { angelegt: false, bestaetigt: false, grund: "schon_bestaetigt" };
      vorhanden.emailVerifiedAt = jetzt;
      vorhanden.updatedAt = jetzt;
      await speicher.putUser(vorhanden, env);
      return { angelegt: false, bestaetigt: true };
    }

    await speicher.putUser({
      version: 1,
      userId: neueNutzerId(),
      email,
      name: String(anmeldung?.name || email.split("@")[0]).slice(0, 120),
      method,
      // Bewusst leer: die Anmeldung laeuft ueber den Anbieter. loginUser() lehnt
      // ohne Hash ab (mit Timing-Angleichung), die Passwort-Tuer bleibt also zu.
      passwordHash: null,
      emailVerifiedAt: jetzt,
      // Die Verwaltungsrolle wird hier NICHT vergeben — sie kommt aus dem
      // Adminbereich oder aus SMEJJ_ADMIN_OWNER_EMAILS. Ein neues Konto ueber
      // einen Anbieter darf sich keine Rechte selbst ausstellen.
      role: "user",
      status: "active",
      createdAt: jetzt,
      updatedAt: jetzt,
      verify: null,
      reset: null,
      loginGuard: { failedCount: 0, lockedUntil: null },
      sessions: []
    }, env);
    return { angelegt: true, bestaetigt: true };
  } catch (fehler) {
    // Niemals werfen: die Anmeldung selbst ist bereits gueltig.
    return { angelegt: false, bestaetigt: false, grund: `speicher_stoerung:${String(fehler?.message || "").slice(0, 60)}` };
  }
}

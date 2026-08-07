// smejj.com — Step-up per Passkey (Single Responsibility: die WebAuthn-Zeremonie
// fuer den Adminbereich).
//
// Warum das jetzt geht: Passkeys sind an die Domain gebunden (rpId
// "smejj.com"). Solange die Konsole vom Control-Server unter *.salad.cloud lief,
// war der Passkey des Betreibers dort schlicht nicht ansprechbar. Seit die
// Konsole statisch von smejj.com/admin kommt (2026-08-07), ist sie dieselbe
// Domain — der Passkey wird nutzbar.
//
// Was er gegenueber dem Mail-Code besser kann: Er beweist BESITZ DES GERAETS
// plus Biometrie, er ist nicht abtippbar, nicht weiterleitbar und nicht
// abfischbar — ein Angreifer mit Zugriff auf das Postfach kommt damit nicht
// weiter. Der Mail-Code bleibt als Rueckfall, denn wer gerade kein Geraet mit
// Passkey zur Hand hat, darf nicht ausgesperrt sein.
//
// DREI Festlegungen, die den Schutz tragen:
//   1. EIGENER Challenge-Typ ("admin-step-up"). Eine Anmelde-Challenge darf
//      niemals als Step-up durchgehen und umgekehrt — sonst oeffnet ein
//      normaler Login nebenbei das Schreibfenster.
//   2. Der Passkey muss dem HANDELNDEN Konto gehoeren. Die Kennung kommt aus
//      der Sitzung (actor.email), nie aus der Antwort des Browsers. `userHandle`
//      ist Fremddaten; wer ihn glaubt, laesst jeden fremden Passkey zu.
//   3. Ohne hinterlegten Passkey wird ehrlich abgewiesen (kein stiller
//      Rueckfall auf "erlaubt") — die Oberflaeche bietet dann den Mail-Code an.
import { verifyAuthentication } from "../auth/webauthn/ceremony.js";
import { createChallenge, signChallengeToken, verifyChallengeToken } from "../auth/webauthn/challenge.js";
import { findCredential, listCredentials, updateSignCount } from "../auth/passkeyStore.js";
import { allowedOriginsFromEnv } from "../http/cors.js";
import { userIdFor } from "../routes/passkeyRoutes.js";

const CHALLENGE_TYP = "admin-step-up";

/**
 * Unter WELCHER Kennung liegen die Passkeys dieses Admins?
 *
 * Es gibt zwei — und das ist der Grund, warum diese Funktion existiert:
 * `registrationPrincipal` in passkeyRoutes.js nimmt die `userId` AUS DER
 * SITZUNG, wenn eine da ist (E-Mail-Konten haben eine, z. B. u_hQyEW…), und
 * leitet nur sonst aus der Adresse ab. Wer hier nur `userIdFor(email)` sucht,
 * findet die Schluessel eines E-Mail-Kontos NIE — der Passkey-Weg waere
 * dauerhaft und lautlos tot, und niemand haette einen Anhaltspunkt.
 *
 * Beide Kennungen gehoeren demselben handelnden Konto (sie stammen aus der
 * aufgeloesten Sitzung), deshalb ist die Suche in beiden sicher.
 */
function kennungen(akteur) {
  const ausSitzung = String(akteur?.userId || "").trim();
  const ausAdresse = akteur?.email ? userIdFor(akteur.email) : "";
  return [...new Set([ausSitzung, ausAdresse].filter(Boolean))];
}

function konfiguration(env) {
  return {
    rpId: env.SMEJJ_PASSKEY_RP_ID || "smejj.com",
    allowedOrigins: allowedOriginsFromEnv(env),
    secret: String(env.SMEJJ_SESSION_SECRET || env.GOOGLE_SESSION_SECRET || "").trim()
  };
}

/**
 * Anmeldeoptionen fuer den Step-up: Challenge plus die Passkeys DIESES Kontos.
 * @returns {Promise<{ok: true, optionen: object} | {ok: false, status: number, error: string}>}
 */
export async function passkeyOptionen(akteur, { env = process.env } = {}) {
  const cfg = konfiguration(env);
  if (!cfg.secret) return { ok: false, status: 503, error: "step_up_passkey_unkonfiguriert" };

  let userId = "";
  let schluessel = [];
  for (const kennung of kennungen(akteur)) {
    const gefunden = await listCredentials(kennung, env).catch(() => []);
    if (gefunden.length > 0) { userId = kennung; schluessel = gefunden; break; }
  }
  if (schluessel.length === 0) {
    // Kein Passkey hinterlegt — das ist kein Fehler, sondern ein Hinweis fuer
    // die Oberflaeche, den Mail-Weg anzubieten.
    return { ok: false, status: 409, error: "step_up_kein_passkey" };
  }

  const challenge = createChallenge();
  return {
    ok: true,
    optionen: {
      challenge,
      challengeToken: signChallengeToken({ secret: cfg.secret, challenge, type: CHALLENGE_TYP, userId }),
      rpId: cfg.rpId,
      timeout: 120_000,
      // Beim Step-up ist die Nutzerpruefung (Biometrie/PIN) der Sinn der Sache,
      // nicht nur ein Wunsch — sonst genuegte das blosse Vorhandensein des
      // Geraets, und ein unbeaufsichtigter Rechner koennte mitschreiben.
      userVerification: "required",
      allowCredentials: schluessel.map((s) => ({ type: "public-key", id: s.credentialId }))
    }
  };
}

/**
 * Prueft die Antwort des Authenticators.
 * @returns {Promise<{ok: true} | {ok: false, status: number, error: string}>}
 */
export async function pruefePasskeyAntwort(akteur, koerper, { env = process.env } = {}) {
  const cfg = konfiguration(env);
  if (!cfg.secret) return { ok: false, status: 503, error: "step_up_passkey_unkonfiguriert" };

  let challengeDaten;
  try {
    challengeDaten = verifyChallengeToken({
      secret: cfg.secret,
      token: koerper?.challengeToken,
      expectedType: CHALLENGE_TYP
    });
  } catch {
    return { ok: false, status: 400, error: "step_up_challenge_ungueltig" };
  }

  // Punkt 2 der Festlegungen: die zulaessigen Kennungen stammen aus der
  // SITZUNG des Handelnden — nie aus der Antwort des Browsers.
  const erlaubt = kennungen(akteur);
  if (!erlaubt.includes(challengeDaten.userId)) {
    return { ok: false, status: 403, error: "step_up_passkey_fremdes_konto" };
  }
  const userId = challengeDaten.userId;

  const credentialId = String(koerper?.id || koerper?.rawId || "");
  const credential = await findCredential(userId, credentialId, env).catch(() => null);
  if (!credential) return { ok: false, status: 404, error: "step_up_passkey_unbekannt" };

  const antwort = koerper?.response || {};
  let ergebnis;
  try {
    ergebnis = verifyAuthentication({
      credential,
      authenticatorData: antwort.authenticatorData,
      clientDataJSON: antwort.clientDataJSON,
      signature: antwort.signature,
      expectedChallenge: challengeDaten.challenge,
      allowedOrigins: cfg.allowedOrigins,
      expectedRpId: cfg.rpId
    });
  } catch {
    return { ok: false, status: 400, error: "step_up_passkey_ungueltig" };
  }

  // Zaehlerstand nachfuehren — er entlarvt geklonte Authenticatoren. Ein
  // Fehler beim Schreiben darf die bestandene Pruefung nicht entwerten.
  await updateSignCount(userId, credentialId, ergebnis.newSignCount, env).catch(() => {});
  return { ok: true };
}

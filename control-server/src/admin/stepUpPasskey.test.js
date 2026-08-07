// smejj.com — Tests des Passkey-Step-ups.
// Ausfuehren: node --test control-server/src/admin/stepUpPasskey.test.js
//
// Geprueft wird das, was den Schutz traegt — nicht die Krypto (die liegt in
// webauthn/ceremony.js und hat eigene Tests), sondern die Bindung:
// richtiger Typ, richtiges Konto, kein stiller Rueckfall.
import test from "node:test";
import assert from "node:assert/strict";
import { _resetMemoryStore, saveCredential } from "../auth/passkeyStore.js";
import { signChallengeToken } from "../auth/webauthn/challenge.js";
import { userIdFor } from "../routes/passkeyRoutes.js";
import { passkeyOptionen, pruefePasskeyAntwort } from "./stepUpPasskey.js";
import { __clearStepUpForTests, istErhoeht, oeffneFenster } from "./stepUp.js";

const ENV = { SMEJJ_SESSION_SECRET: "geheim-fuer-tests-0123456789" };
const OWNER = { email: "owner@example.de", userId: "" };
// Ein E-Mail-Konto traegt eine eigene Konto-ID aus der Sitzung — genau die
// Falle, an der der Passkey-Weg zuerst lautlos gescheitert waere.
const OWNER_MIT_KONTO_ID = { email: "owner@example.de", userId: "u_hQyEWTjvzWUyjFyU" };

async function mitPasskey(kennung) {
  _resetMemoryStore();
  await saveCredential(kennung, {
    credentialId: "cred-1",
    publicKey: "egal-fuer-diese-tests",
    signCount: 0
  }, {}, ENV);
}

test("ohne hinterlegten Passkey wird ehrlich abgewiesen — kein stiller Durchlass", async () => {
  _resetMemoryStore();
  const ergebnis = await passkeyOptionen(OWNER, { env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 409, "409 signalisiert der Oberflaeche: nimm den Mail-Weg");
  assert.equal(ergebnis.error, "step_up_kein_passkey");
});

test("mit Passkey kommen Challenge und genau die eigenen Schluessel", async () => {
  await mitPasskey(userIdFor(OWNER.email));
  const ergebnis = await passkeyOptionen(OWNER, { env: ENV });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.optionen.rpId, "smejj.com");
  assert.equal(ergebnis.optionen.allowCredentials.length, 1);
  assert.equal(ergebnis.optionen.allowCredentials[0].id, "cred-1");
  // Beim Step-up ist Biometrie/PIN der Sinn der Sache, nicht nur ein Wunsch.
  assert.equal(ergebnis.optionen.userVerification, "required");
});

test("ohne Sitzungsschluessel wird nichts ausgegeben", async () => {
  await mitPasskey(userIdFor(OWNER.email));
  const ergebnis = await passkeyOptionen(OWNER, { env: {} });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 503);
});

test("eine ANMELDE-Challenge oeffnet kein Schreibfenster", async () => {
  await mitPasskey(userIdFor(OWNER.email));
  // Genau der Angriff, gegen den der eigene Typ gebaut ist: ein gueltiges
  // Token aus dem normalen Login als Step-up einreichen.
  const fremderTyp = signChallengeToken({
    secret: ENV.SMEJJ_SESSION_SECRET, challenge: "abc", type: "auth", userId: userIdFor(OWNER.email)
  });
  const ergebnis = await pruefePasskeyAntwort(OWNER, { challengeToken: fremderTyp, id: "cred-1" }, { env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "step_up_challenge_ungueltig");
});

test("der Passkey eines FREMDEN Kontos wird abgewiesen", async () => {
  await mitPasskey(userIdFor(OWNER.email));
  // Token korrekt signiert und richtiger Typ — aber fuer ein anderes Konto.
  const fremdesKonto = signChallengeToken({
    secret: ENV.SMEJJ_SESSION_SECRET, challenge: "abc", type: "admin-step-up",
    userId: userIdFor("jemand.anderes@example.de")
  });
  const ergebnis = await pruefePasskeyAntwort(OWNER, { challengeToken: fremdesKonto, id: "cred-1" }, { env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 403);
  assert.equal(ergebnis.error, "step_up_passkey_fremdes_konto");
});

test("ein unbekannter Schluessel wird abgewiesen", async () => {
  await mitPasskey(userIdFor(OWNER.email));
  const token = signChallengeToken({
    secret: ENV.SMEJJ_SESSION_SECRET, challenge: "abc", type: "admin-step-up", userId: userIdFor(OWNER.email)
  });
  const ergebnis = await pruefePasskeyAntwort(OWNER, { challengeToken: token, id: "gibt-es-nicht" }, { env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 404);
});

test("ein gefaelschtes Token wird abgewiesen", async () => {
  await mitPasskey(userIdFor(OWNER.email));
  const ergebnis = await pruefePasskeyAntwort(OWNER, { challengeToken: "hingeschrieben.unsinn", id: "cred-1" }, { env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.status, 400);
});

// ---- Die Falle, an der der Passkey-Weg zuerst lautlos scheiterte -------------

test("Passkeys unter der KONTO-ID der Sitzung werden gefunden", async () => {
  // Beim Einrichten nimmt passkeyRoutes die userId AUS DER SITZUNG, wenn eine
  // da ist. E-Mail-Konten haben eine (u_hQyEW…). Wer beim Step-up nur
  // userIdFor(email) durchsucht, findet den Schluessel NIE — der Passkey-Weg
  // waere dauerhaft tot, ohne Fehlermeldung, ohne Anhaltspunkt.
  await mitPasskey(OWNER_MIT_KONTO_ID.userId);
  const ergebnis = await passkeyOptionen(OWNER_MIT_KONTO_ID, { env: ENV });
  assert.equal(ergebnis.ok, true, "der unter der Konto-ID abgelegte Passkey muss gefunden werden");
  assert.equal(ergebnis.optionen.allowCredentials[0].id, "cred-1");
});

test("beide Kennungen desselben Kontos werden akzeptiert, fremde nicht", async () => {
  await mitPasskey(OWNER_MIT_KONTO_ID.userId);
  const token = signChallengeToken({
    secret: ENV.SMEJJ_SESSION_SECRET, challenge: "abc", type: "admin-step-up",
    userId: OWNER_MIT_KONTO_ID.userId
  });
  // Bis zur Signaturpruefung muss er kommen — 404/400 waeren hier Fortschritt,
  // 403 "fremdes Konto" waere der Fehler von vorhin.
  const eigen = await pruefePasskeyAntwort(OWNER_MIT_KONTO_ID, { challengeToken: token, id: "cred-1" }, { env: ENV });
  assert.notEqual(eigen.error, "step_up_passkey_fremdes_konto");

  const fremd = signChallengeToken({
    secret: ENV.SMEJJ_SESSION_SECRET, challenge: "abc", type: "admin-step-up", userId: "u_jemandAnderes123"
  });
  const abgewiesen = await pruefePasskeyAntwort(OWNER_MIT_KONTO_ID, { challengeToken: fremd, id: "cred-1" }, { env: ENV });
  assert.equal(abgewiesen.error, "step_up_passkey_fremdes_konto");
});

// ---- Das Fenster selbst ------------------------------------------------------

test("oeffneFenster hebt die Sperre — und nur fuer dieses Konto", () => {
  __clearStepUpForTests();
  assert.equal(istErhoeht(OWNER.email), false);
  const ergebnis = oeffneFenster(OWNER.email);
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.fensterSek >= 60);
  assert.equal(istErhoeht(OWNER.email), true);
  assert.equal(istErhoeht("jemand.anderes@example.de"), false);
});

test("das per Passkey geoeffnete Fenster schliesst sich genauso von selbst", () => {
  __clearStepUpForTests();
  let uhr = 1_000_000;
  const jetzt = () => uhr;
  oeffneFenster(OWNER.email, { now: jetzt });
  assert.equal(istErhoeht(OWNER.email, { now: jetzt }), true);
  uhr += 16 * 60 * 1000;
  assert.equal(istErhoeht(OWNER.email, { now: jetzt }), false);
});

test("ohne E-Mail oeffnet sich nichts", () => {
  __clearStepUpForTests();
  assert.equal(oeffneFenster("").ok, false);
});

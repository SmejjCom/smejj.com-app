// smejj.com — die Auth-Antworten duerfen nicht verraten, ob ein Konto existiert.
//
// Live-Befund vom 2026-07-28 (Anmeldewege-Pruefung gegen den echten
// Control-Server, ohne Anmeldung):
//
//   POST /api/auth/email/reset/request  {"email":"<unbekannt>"}
//   -> {"ok":true,"requested":true,"mail":{"sent":false,"reason":"unknown_account"}}
//
// Fuer eine BEKANNTE Adresse haette dort {"sent":true} gestanden. Damit konnte
// jeder Fremde beliebige E-Mail-Adressen durchprobieren und erfahren, welche
// davon ein Konto bei smejj.com haben. Dieselbe Luecke steckte in der
// Registrierung ("account_exists"). Die Oberflaeche war datensparsam
// formuliert — die API widersprach ihr.
//
// Der Fix hat zwei Haelften, und dieser Test haelt beide fest:
//   1. Der Dienst gibt das Mailergebnis als `internalMail` zurueck.
//   2. respond() in emailAuthRoutes.js entfernt genau dieses Feld, bevor
//      irgendetwas den Server verlaesst — eine Stelle fuer alle Routen.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerUser, requestPasswordReset } from "../control-server/src/auth/emailAuthService.js";

const routes = fs.readFileSync("control-server/src/routes/emailAuthRoutes.js", "utf8");
const service = fs.readFileSync("control-server/src/auth/emailAuthService.js", "utf8");
const authPage = fs.readFileSync("public/auth/auth-page.js", "utf8");

function frischeUmgebung() {
  // Speicher im Arbeitsspeicher: kein IDrive, kein Netz, kein SMTP.
  return { SMEJJ_EMAIL_USER_STORE: "memory", SMEJJ_AUTH_STORE_MODE: "memory" };
}

test("respond() entfernt internalMail aus jeder Antwort", () => {
  assert.match(
    routes,
    /const \{ status, internalMail, \.\.\.payload \} = result;/,
    "respond() muss internalMail herausnehmen — sonst geht das Mailergebnis nach aussen."
  );
});

test("der Dienst nennt das Mailergebnis nirgends mehr 'mail'", () => {
  // Ein zurueckgegebenes Feld `mail` wuerde von respond() durchgereicht.
  assert.doesNotMatch(
    service,
    /return \{[^}]*\bmail\b\s*[,}]/,
    "Rueckgabefeld 'mail' gefunden — es wuerde ausgeliefert und verriete die Konto-Existenz."
  );
  assert.match(service, /internalMail/);
});

test("Reset-Anfrage: unbekannte und bekannte Adresse liefern dieselben Aussenfelder", async () => {
  const env = frischeUmgebung();
  await registerUser({ email: "bekannt@example.invalid", password: "sicher-genug-123", origin: "https://smejj.com" }, env);

  const unbekannt = await requestPasswordReset({ email: "gibt-es-nicht@example.invalid", origin: "https://smejj.com" }, env);
  const bekannt = await requestPasswordReset({ email: "bekannt@example.invalid", origin: "https://smejj.com" }, env);

  const aussen = (r) => {
    const { status, internalMail, ...rest } = r;
    void status; void internalMail;
    return JSON.stringify(rest);
  };
  assert.equal(aussen(unbekannt), aussen(bekannt), "Die nach aussen sichtbaren Felder muessen identisch sein.");
});

test("Registrierung: neue und bestehende Adresse liefern dieselben Aussenfelder", async () => {
  const env = frischeUmgebung();
  const neu = await registerUser({ email: "neu@example.invalid", password: "sicher-genug-123", origin: "https://smejj.com" }, env);
  const nochmal = await registerUser({ email: "neu@example.invalid", password: "anderes-passwort-999", origin: "https://smejj.com" }, env);

  const aussen = (r) => {
    const { status, internalMail, ...rest } = r;
    void status; void internalMail;
    return JSON.stringify(rest);
  };
  assert.equal(aussen(neu), aussen(nochmal), "Die nach aussen sichtbaren Felder muessen identisch sein.");
});

test("die Oberflaeche entscheidet nicht mehr anhand des Mailergebnisses", () => {
  assert.doesNotMatch(
    authPage,
    /payload\.mail\?\.sent/,
    "Auch die Meldung an den Nutzer waere fuer bestehende Konten anders ausgefallen."
  );
  assert.match(authPage, /payload\.verificationMailExpected/);
});

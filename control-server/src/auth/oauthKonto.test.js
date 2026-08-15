// smejj.com — Tests fuer den Nutzerdatensatz der OAuth-Anmeldewege.
// Ausfuehren: node --test control-server/src/auth/oauthKonto.test.js
//
// Befund 2026-08-14: Wer sich mit Google anmeldete, kam nie in den
// Adminbereich — `emailVerifiedAt` blieb leer, weil der OAuth-Weg gar keinen
// Datensatz schrieb. Diese Tests halten die drei Regeln fest, die dabei nicht
// verletzt werden duerfen.
import test from "node:test";
import assert from "node:assert/strict";

import { merkeOauthBestaetigung } from "./oauthKonto.js";
import { __clearMemoryStoreForTests, createUserRecord, getUserByEmail, putUser } from "./emailUserStore.js";

const ENV = {};
const GOOGLE = { email: "Neu@Example.Invalid", name: "Neu Nutzer", method: "google" };

test.beforeEach(() => __clearMemoryStoreForTests());

test("ein neuer Google-Nutzer bekommt einen Datensatz mit bestaetigter Adresse", async () => {
  const ergebnis = await merkeOauthBestaetigung(GOOGLE, { env: ENV });
  assert.equal(ergebnis, "angelegt");

  const record = await getUserByEmail("neu@example.invalid", ENV);
  assert.ok(record, "ohne Datensatz bleibt der Adminbereich dauerhaft zu");
  assert.ok(record.emailVerifiedAt, "genau dieses Feld verlangt adminAuth.js");
  assert.equal(record.email, "neu@example.invalid", "die Adresse wird normalisiert");
  assert.equal(record.method, "google");
  assert.equal(record.role, "user", "ein Login vergibt keine Rechte");
  assert.equal(record.status, "active");
});

test("REGEL 1: ein OAuth-Konto bekommt niemals ein Passwort", async () => {
  await merkeOauthBestaetigung(GOOGLE, { env: ENV });
  const record = await getUserByEmail("neu@example.invalid", ENV);
  assert.equal(record.passwordHash, null,
    "mit einem Hash waere das Konto ueber den Passwortweg angreifbar");
});

test("REGEL 2: ein bestehender Datensatz behaelt Rolle, Status und Passwort", async () => {
  await putUser({
    ...createUserRecord({ email: "chef@example.invalid", name: "Chef", passwordHash: "scrypt$v1$x" }),
    role: "owner", status: "blocked"
  }, ENV);

  const ergebnis = await merkeOauthBestaetigung(
    { email: "chef@example.invalid", name: "Fremder Name", method: "google" }, { env: ENV }
  );
  assert.equal(ergebnis, "bestaetigt");

  const record = await getUserByEmail("chef@example.invalid", ENV);
  assert.equal(record.role, "owner", "eine Anmeldung darf keine Rolle abwerten");
  assert.equal(record.status, "blocked", "Google anzumelden darf keine Sperre aufheben");
  assert.equal(record.passwordHash, "scrypt$v1$x", "das Passwort bleibt unangetastet");
  assert.equal(record.name, "Chef", "der Anbietername ueberschreibt den gepflegten nicht");
  assert.ok(record.emailVerifiedAt);
});

test("eine bereits bestaetigte Adresse wird nicht neu gestempelt", async () => {
  await putUser({
    ...createUserRecord({ email: "alt@example.invalid", name: "Alt", passwordHash: "scrypt$v1$x" }),
    emailVerifiedAt: "2026-01-01T00:00:00.000Z"
  }, ENV);

  assert.equal(await merkeOauthBestaetigung({ email: "alt@example.invalid", method: "google" }, { env: ENV }),
    "unveraendert");
  const record = await getUserByEmail("alt@example.invalid", ENV);
  assert.equal(record.emailVerifiedAt, "2026-01-01T00:00:00.000Z",
    "der urspruengliche Nachweiszeitpunkt ist der ehrliche");
});

test("REGEL 3: eine Speicherstoerung sperrt niemanden aus", async () => {
  const kaputt = {
    getUserByEmail: async () => { throw new Error("Objektspeicher weg"); },
    putUser: async () => { throw new Error("Objektspeicher weg"); }
  };
  const ergebnis = await merkeOauthBestaetigung(GOOGLE, { env: ENV, speicher: kaputt });
  assert.equal(ergebnis, "gestoert", "die Anmeldung laeuft weiter, nur der Adminbereich bleibt zu");
});

test("ohne Adresse wird nichts geschrieben", async () => {
  let geschrieben = false;
  const ergebnis = await merkeOauthBestaetigung({ email: "", method: "google" }, {
    env: ENV, speicher: { getUserByEmail: async () => null, putUser: async () => { geschrieben = true; } }
  });
  assert.equal(ergebnis, "gestoert");
  assert.equal(geschrieben, false);
});

test("GitHub geht denselben Weg", async () => {
  assert.equal(await merkeOauthBestaetigung(
    { email: "gh@example.invalid", name: "GH", method: "github" }, { env: ENV }
  ), "angelegt");
  const record = await getUserByEmail("gh@example.invalid", ENV);
  assert.equal(record.method, "github");
  assert.ok(record.emailVerifiedAt);
});

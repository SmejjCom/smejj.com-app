// Wache gegen den Befund vom 2026-08-14: Wer sich nur ueber Google oder GitHub
// anmeldet, bekam keinen Kontodatensatz — und damit nie ein `emailVerifiedAt`.
// Der Adminbereich verlangt genau das, und das Einloesen eines
// Bestaetigungscodes beginnt mit getUserByEmail(). Ohne Datensatz war das eine
// geschlossene Schleife: Codes kamen an, wurden korrekt eingegeben, und nichts
// aenderte sich.
import test from "node:test";
import assert from "node:assert/strict";
import { sichereAnbieterKonto } from "../src/auth/anbieterKonto.js";

function speicherMit(datensaetze = {}) {
  const abgelegt = [];
  return {
    abgelegt,
    getUserByEmail: async (email) => datensaetze[email] || null,
    putUser: async (record) => { abgelegt.push(record); datensaetze[record.email] = record; }
  };
}

test("legt fuer eine Google-Anmeldung ohne Konto einen bestaetigten Datensatz an", async () => {
  const speicher = speicherMit();
  const ergebnis = await sichereAnbieterKonto({ email: "Neu@Example.com", name: "Neu", method: "google" }, {}, speicher);
  assert.equal(ergebnis.angelegt, true);
  assert.equal(ergebnis.bestaetigt, true);
  const record = speicher.abgelegt[0];
  assert.equal(record.email, "neu@example.com", "Adresse wird normalisiert");
  assert.ok(record.emailVerifiedAt, "der Anbieter-Nachweis muss vermerkt sein");
  assert.equal(record.method, "google");
});

test("das neue Konto vergibt sich KEINE Verwaltungsrolle", async () => {
  const speicher = speicherMit();
  await sichereAnbieterKonto({ email: "wer@example.com", method: "github" }, {}, speicher);
  assert.equal(speicher.abgelegt[0].role, "user", "eine Anmeldung darf sich keine Rechte ausstellen");
});

test("das neue Konto oeffnet die Passwort-Tuer nicht", async () => {
  const speicher = speicherMit();
  await sichereAnbieterKonto({ email: "wer@example.com", method: "google" }, {}, speicher);
  assert.equal(speicher.abgelegt[0].passwordHash, null, "ohne Hash lehnt loginUser ab");
});

test("traegt den fehlenden Nachweis an einem bestehenden Konto nach", async () => {
  const speicher = speicherMit({ "alt@example.com": { email: "alt@example.com", role: "owner", status: "active", emailVerifiedAt: null } });
  const ergebnis = await sichereAnbieterKonto({ email: "alt@example.com", method: "google" }, {}, speicher);
  assert.equal(ergebnis.angelegt, false);
  assert.equal(ergebnis.bestaetigt, true);
  assert.ok(speicher.abgelegt[0].emailVerifiedAt);
  assert.equal(speicher.abgelegt[0].role, "owner", "die vorhandene Rolle bleibt unangetastet");
});

test("ruehrt ein bereits bestaetigtes Konto nicht an", async () => {
  const speicher = speicherMit({ "da@example.com": { email: "da@example.com", emailVerifiedAt: "2026-01-01T00:00:00.000Z" } });
  const ergebnis = await sichereAnbieterKonto({ email: "da@example.com", method: "google" }, {}, speicher);
  assert.equal(ergebnis.grund, "schon_bestaetigt");
  assert.equal(speicher.abgelegt.length, 0, "kein ueberfluessiger Schreibvorgang");
});

test("kaputte Probe: eine Speicherstoerung sperrt niemanden aus", async () => {
  const speicher = {
    getUserByEmail: async () => { throw new Error("s3_down"); },
    putUser: async () => { throw new Error("s3_down"); }
  };
  const ergebnis = await sichereAnbieterKonto({ email: "wer@example.com", method: "google" }, {}, speicher);
  assert.equal(ergebnis.angelegt, false);
  assert.match(ergebnis.grund, /speicher_stoerung/, "der Fehler wird gemeldet, aber nicht geworfen");
});

test("fremde Anmeldewege bleiben aussen vor", async () => {
  const speicher = speicherMit();
  const ergebnis = await sichereAnbieterKonto({ email: "wer@example.com", method: "email" }, {}, speicher);
  assert.equal(ergebnis.grund, "unbekannter_weg");
  assert.equal(speicher.abgelegt.length, 0, "nur Anbieter duerfen eine Adresse als bestaetigt melden");
});

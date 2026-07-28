// smejj.com — Unit-Tests fuer DSGVO-Betroffenenanfragen.
// Ausfuehren: node --test control-server/src/admin/gdprRequests.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  GDPR_STATUS, __clearGdprForTests, dringlichkeit, erfasseAnfrage, listeAnfragen,
  restfristTage, setzeStatus, verlaengereFrist
} from "./gdprRequests.js";

const ENV = {};
const ACTOR = { email: "chefin@example.de" };
const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const TAG = 86_400_000;

test("die Frist ist ein Monat AB EINGANG, nicht ab Erfassung", async () => {
  __clearGdprForTests();
  // Die Anfrage kam vor zehn Tagen per E-Mail und wird erst heute erfasst.
  const v = await erfasseAnfrage({
    art: "auskunft", betroffeneEmail: "m.roth@example.de", eingegangenAm: "2026-07-18"
  }, { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(v.ok, true);
  assert.equal(v.vorgang.faelligAm.slice(0, 10), "2026-08-17");
  assert.equal(v.vorgang.restfristTage, 20, "zehn Tage sind bereits verbraucht");
  assert.equal(v.vorgang.artikel, "Art. 15");
});

test("eine Anfrage aus der Zukunft wird abgewiesen", async () => {
  __clearGdprForTests();
  const v = await erfasseAnfrage({
    art: "auskunft", betroffeneEmail: "a@example.de", eingegangenAm: "2026-09-01"
  }, { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(v.error, "gdpr_eingang_in_zukunft");
});

test("Art und Adresse werden geprueft", async () => {
  __clearGdprForTests();
  assert.equal((await erfasseAnfrage({ art: "irgendwas", betroffeneEmail: "a@example.de" },
    { env: ENV, nowMs: JETZT })).error, "gdpr_art_invalid");
  assert.equal((await erfasseAnfrage({ art: "auskunft", betroffeneEmail: "keine-adresse" },
    { env: ENV, nowMs: JETZT })).error, "gdpr_email_invalid");
});

test("die Restfrist wird gerechnet, nicht gespeichert", () => {
  const vorgang = { faelligAm: new Date(JETZT + 3 * TAG).toISOString(), status: GDPR_STATUS.offen };
  assert.equal(restfristTage(vorgang, JETZT), 3);
  assert.equal(restfristTage(vorgang, JETZT + 5 * TAG), -2, "ueberschritten wird negativ");
});

test("die Dringlichkeit stuft richtig ein", () => {
  const bei = (tage, status = GDPR_STATUS.offen) =>
    dringlichkeit({ faelligAm: new Date(JETZT + tage * TAG).toISOString(), status }, JETZT);
  assert.equal(bei(-1), "ueberschritten");
  assert.equal(bei(3), "kritisch");
  assert.equal(bei(8), "bald");
  assert.equal(bei(25), "im_rahmen");
  assert.equal(bei(3, GDPR_STATUS.abgeschlossen), "erledigt");
});

test("verlaengern geht genau einmal und braucht eine Begruendung", async () => {
  __clearGdprForTests();
  const v = await erfasseAnfrage({ art: "loeschung", betroffeneEmail: "a@example.de" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  const id = v.vorgang.id;

  assert.equal((await verlaengereFrist(id, "kurz", { actor: ACTOR, env: ENV, nowMs: JETZT })).error,
    "gdpr_extension_reason_required");

  const erste = await verlaengereFrist(id, "Umfangreicher Datenbestand ueber mehrere Systeme",
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(erste.ok, true);
  assert.equal(erste.after.restfristTage, 90, "30 + 60 Tage");

  const zweite = await verlaengereFrist(id, "Noch mehr Aufwand als gedacht",
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(zweite.error, "gdpr_already_extended");
});

test("ABSCHLIESSEN OHNE NACHWEIS GEHT NICHT — sonst waere er keiner", async () => {
  __clearGdprForTests();
  const v = await erfasseAnfrage({ art: "auskunft", betroffeneEmail: "a@example.de" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  const id = v.vorgang.id;

  assert.equal((await setzeStatus(id, "abgeschlossen", { actor: ACTOR, env: ENV, nowMs: JETZT })).error,
    "gdpr_nachweis_required");
  assert.equal((await setzeStatus(id, "abgelehnt", { nachweis: "kurz", actor: ACTOR, env: ENV, nowMs: JETZT })).error,
    "gdpr_nachweis_required");

  const fertig = await setzeStatus(id, "abgeschlossen",
    { nachweis: "Datenauszug als PDF am 2026-07-28 versandt", actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(fertig.ok, true);
  assert.equal(fertig.after.status, "abgeschlossen");
  assert.equal(fertig.after.dringlichkeit, "erledigt");
});

test("Zwischenstaende brauchen keinen Nachweis — nur der Abschluss", async () => {
  __clearGdprForTests();
  const v = await erfasseAnfrage({ art: "auskunft", betroffeneEmail: "a@example.de" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  const inArbeit = await setzeStatus(v.vorgang.id, "in_arbeit", { actor: ACTOR, env: ENV, nowMs: JETZT });
  assert.equal(inArbeit.ok, true);
  assert.equal(inArbeit.after.status, "in_arbeit");
});

test("die Liste zeigt DRINGENDSTE zuerst, nicht neueste", async () => {
  __clearGdprForTests();
  await erfasseAnfrage({ art: "auskunft", betroffeneEmail: "entspannt@example.de", eingegangenAm: "2026-07-27" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });
  await erfasseAnfrage({ art: "loeschung", betroffeneEmail: "eilig@example.de", eingegangenAm: "2026-06-25" },
    { actor: ACTOR, env: ENV, nowMs: JETZT });

  const liste = await listeAnfragen({ env: ENV, nowMs: JETZT });
  assert.equal(liste.vorgaenge[0].betroffeneEmail, "eilig@example.de");
  assert.equal(liste.vorgaenge[0].dringlichkeit, "ueberschritten");
  assert.equal(liste.ueberschritten, 1);
  assert.equal(liste.offen, 2);
});

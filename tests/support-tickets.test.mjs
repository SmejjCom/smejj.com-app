// smejj.com — Kundensupport Stufe 1: die Zusagen, an denen Support steht
// oder faellt. Ein Ticket darf NIE verloren gehen, eine tote KI darf NIE
// wie "beantwortet" aussehen, und Kunden sehen nur ihre eigenen Faelle.
import test from "node:test";
import assert from "node:assert/strict";

import {
  erstelleTicket,
  listeTickets,
  offeneUeberfaellig,
  holeSofortantwort
} from "../control-server/src/admin/supportTickets.js";
import { laufSupportSla } from "../control-server/src/autopilots/autopilotLaeufer.js";

// env {} = Memory-Zweig der Ablage: kein Netz, kein IDrive — jede Testdatei
// sieht ihren eigenen frischen Speicher.
const ENV = {};
const antwortOk = async () => ({ ok: true, text: "Bitte einmal abmelden und neu anmelden — das behebt es in den meisten Faellen." });
const antwortTot = async () => ({ ok: false, grund: "Bruecke HTTP 503" });

test("Ein Ticket bekommt sofort eine ehrlich gekennzeichnete KI-Antwort", async () => {
  const e = await erstelleTicket({ email: "kunde@test.de", betreff: "Login geht nicht", text: "Ich komme nicht rein.", env: ENV, sofortantwort: antwortOk });
  assert.equal(e.ok, true);
  assert.equal(e.ticket.status, "beantwortet");
  assert.equal(e.ticket.verlauf.length, 2);
  assert.equal(e.ticket.verlauf[1].von, "automatik");
  assert.match(e.ticket.verlauf[1].hinweis, /Ein Mensch liest mit/);
});

test("ENTSCHEIDEND: tote KI => Ticket bleibt OFFEN und geht nicht verloren", async () => {
  const e = await erstelleTicket({ email: "kunde@test.de", betreff: "Abo-Frage", text: "Warum wurde abgebucht?", env: ENV, sofortantwort: antwortTot });
  assert.equal(e.ok, true, "das Ticket wird IMMER angenommen");
  assert.equal(e.ticket.status, "offen", "ohne echte Antwort kein 'beantwortet'");
  assert.match(e.ticket.verlauf[1].text, /Ein Mensch uebernimmt/);
});

test("Kunden sehen nur die eigenen Tickets", async () => {
  await erstelleTicket({ email: "a@test.de", betreff: "A", text: "Problem A", env: ENV, sofortantwort: antwortOk });
  await erstelleTicket({ email: "b@test.de", betreff: "B", text: "Problem B", env: ENV, sofortantwort: antwortOk });
  const a = await listeTickets({ env: ENV, email: "a@test.de" });
  assert.ok(a.length >= 1);
  assert.equal(a.every((t) => t.email === "a@test.de"), true, "fremde Faelle sind unsichtbar");
});

test("SLA: ein offenes Ticket aelter als 15 min macht die Ampel ROT", async () => {
  const e = await erstelleTicket({ email: "c@test.de", betreff: "Haengt", text: "Nichts geht.", env: ENV, sofortantwort: antwortTot });
  const spaeter = Date.parse(e.ticket.erstelltAm) + 16 * 60 * 1000;
  const ueberfaellig = await offeneUeberfaellig({ env: ENV, minuten: 15, jetztMs: spaeter });
  assert.ok(ueberfaellig.some((t) => t.id === e.ticket.id));

  const sla = await laufSupportSla({ env: ENV, jetztMs: spaeter });
  assert.equal(sla.ok, false, "ein wartender Kunde ist ein Ausfall");
  assert.match(sla.meldung, /warten laenger als 15 min/);
});

test("SLA: frisch beantwortete Tickets sind kein Alarm", async () => {
  const sla = await laufSupportSla({ env: { LEER: "1" } });
  assert.equal(sla.ok, true);
  assert.match(sla.meldung, /Kein Kunde wartet/);
});

test("Leere oder anonyme Meldungen werden abgewiesen — kein Muell im Speicher", async () => {
  const ohneMail = await erstelleTicket({ email: "", betreff: "x", text: "genug text", env: ENV, sofortantwort: antwortOk });
  assert.equal(ohneMail.ok, false);
  const ohneText = await erstelleTicket({ email: "d@test.de", betreff: "x", text: "ab", env: ENV, sofortantwort: antwortOk });
  assert.equal(ohneText.ok, false);
});

test("Sofortantwort: ohne Geheimnis ehrlich unmoeglich, nie erfunden", async () => {
  const a = await holeSofortantwort("Betreff", "Text", { env: {} });
  assert.equal(a.ok, false);
  assert.match(a.grund, /Sitzungsgeheimnis/);
});

// smejj.com — Tests fuer die Support-Tickets.
// Ausfuehren: node --test control-server/src/admin/supportTickets.test.js
//
// WARUM ES DIESE DATEI GIBT: A-bis-Z-Pruefung 2026-08-15 — das Modul hatte
// keinen Test. Es nimmt Kundenmeldungen an und laesst sie von der KI sofort
// beantworten. Zwei Zusagen haengen daran: eine Meldung geht NIE verloren
// (auch wenn die KI schweigt), und die SLA-Ampel Nr. 35 sieht jeden Kunden,
// der zu lange wartet.
import test from "node:test";
import assert from "node:assert/strict";

import { erstelleTicket, listeTickets, offeneUeberfaellig } from "./supportTickets.js";

const ENV = {}; // ohne IDrive -> Memory-Zweig der Ablage

const stumm = async () => ({ ok: false, grund: "Bruecke antwortet nicht" });
const antwortet = async () => ({ ok: true, text: "Bitte einmal abmelden und neu anmelden. " + "x".repeat(30) });

test("ohne Adresse oder ohne Text entsteht kein Ticket", async () => {
  assert.equal((await erstelleTicket({ email: "", betreff: "x", text: "hallo du", env: ENV })).error,
    "support_email_missing");
  assert.equal((await erstelleTicket({ email: "k@example.invalid", betreff: "", text: "hallo du", env: ENV })).error,
    "support_text_missing");
  assert.equal((await erstelleTicket({ email: "k@example.invalid", betreff: "x", text: "kurz", env: ENV })).error,
    "support_text_missing");
});

test("die Meldung geht NIE verloren — auch wenn die KI schweigt", async () => {
  const vorher = (await listeTickets({ env: ENV })).length;
  const ergebnis = await erstelleTicket({
    email: "Kunde@Example.Invalid", betreff: "Anmeldung klemmt",
    text: "Ich komme seit heute nicht mehr rein.", env: ENV, sofortantwort: stumm
  });
  assert.equal(ergebnis.ok, true, "ein Ticket ohne Sofortantwort ist trotzdem ein Ticket");
  const alle = await listeTickets({ env: ENV });
  assert.equal(alle.length, vorher + 1);
  assert.equal(alle[0].status, "offen", "ohne Antwort bleibt es offen — die SLA-Ampel uebernimmt");
  assert.equal(alle[0].email, "kunde@example.invalid", "die Adresse wird normalisiert");
});

test("mit Sofortantwort ist das Ticket beantwortet", async () => {
  const ergebnis = await erstelleTicket({
    email: "kunde2@example.invalid", betreff: "Frage", text: "Wie exportiere ich meine Daten?",
    env: ENV, sofortantwort: antwortet
  });
  assert.equal(ergebnis.ok, true);
  const meins = (await listeTickets({ env: ENV, email: "kunde2@example.invalid" }))[0];
  assert.notEqual(meins.status, "offen", "wer eine Antwort hat, wartet nicht mehr");
});

test("die Liste je Kunde zeigt nur seine eigenen Tickets", async () => {
  await erstelleTicket({ email: "a@example.invalid", betreff: "A", text: "Meldung von A", env: ENV, sofortantwort: stumm });
  await erstelleTicket({ email: "b@example.invalid", betreff: "B", text: "Meldung von B", env: ENV, sofortantwort: stumm });
  const vonA = await listeTickets({ env: ENV, email: "a@example.invalid" });
  assert.ok(vonA.length >= 1);
  assert.ok(vonA.every((t) => t.email === "a@example.invalid"),
    "ein Kunde darf die Meldungen eines anderen nie sehen");
});

test("die SLA-Ampel sieht genau die Kunden, die zu lange warten", async () => {
  await erstelleTicket({
    email: "wartend@example.invalid", betreff: "Wartet", text: "Bitte um Rueckmeldung.",
    env: ENV, sofortantwort: stumm
  });
  // `erstelltAm` setzt das Modul selbst auf die echte Uhrzeit — der Vergleich
  // muss deshalb ebenfalls von der echten Uhr ausgehen. Ein fester Zeitpunkt
  // waere je nach Tageszeit mal frisch und mal ueberfaellig.
  const sofort = await offeneUeberfaellig({ env: ENV, minuten: 15, jetztMs: Date.now() });
  const spaeter = await offeneUeberfaellig({ env: ENV, minuten: 15, jetztMs: Date.now() + 16 * 60 * 1000 });
  assert.equal(sofort.length, 0, "ein frisches Ticket ist kein Ausfall");
  assert.ok(spaeter.some((t) => t.email === "wartend@example.invalid"),
    "nach 15 Minuten ohne Antwort muss es in der Ampel stehen");
});

test("beantwortete Tickets tauchen nie als ueberfaellig auf", async () => {
  await erstelleTicket({
    email: "fertig@example.invalid", betreff: "Erledigt", text: "Danke, hat sich geklaert.",
    env: ENV, sofortantwort: antwortet
  });
  const spaet = await offeneUeberfaellig({ env: ENV, minuten: 1, jetztMs: Date.now() + 24 * 3600 * 1000 });
  assert.ok(!spaet.some((t) => t.email === "fertig@example.invalid"));
});

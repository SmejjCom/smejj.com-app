// smejj.com — Unit-Tests fuer die Support-Impersonation.
// Ausfuehren: node --test control-server/src/admin/impersonation.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCOPES, IMP_STATUS, SCOPES, __clearImpersonationMemoryForTests,
  denyConsent, effectiveImpStatus, endImpersonation, getImpersonation, grantConsent,
  isScopeAllowed, listImpersonations, normalizeScopes, requestImpersonation
} from "./impersonation.js";

const ENV = {};
const JETZT = Date.parse("2026-07-28T12:00:00.000Z");
const SUPPORT = { email: "support@example.de", role: "support" };

async function antrag(patch = {}) {
  return requestImpersonation({
    subjectEmail: "kundin@example.de",
    operator: SUPPORT,
    reason: "Ticket 4471 — Magic-Link kommt nicht an",
    ...patch
  }, { env: ENV, nowMs: JETZT });
}

test("ein Antrag wartet auf Einwilligung — er startet nichts", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  assert.equal(a.ok, true);
  assert.equal(a.impersonation.status, IMP_STATUS.awaitingConsent);
  assert.equal(a.impersonation.startedAt, null);
  assert.equal(a.impersonation.endsAt, null);
});

test("Chat-Inhalte sind NICHT im Standardumfang", () => {
  assert.deepEqual([...DEFAULT_SCOPES], [SCOPES.settings, SCOPES.billing]);
  assert.equal(DEFAULT_SCOPES.includes(SCOPES.content), false);
  // Unbekannte Umfaenge fallen weg statt durchzurutschen.
  assert.deepEqual(normalizeScopes(["settings", "alles", "content"]), ["settings", "content"]);
  assert.deepEqual(normalizeScopes([]), [...DEFAULT_SCOPES]);
  assert.deepEqual(normalizeScopes(["quatsch"]), [...DEFAULT_SCOPES]);
});

test("NUR DIE BETROFFENE PERSON kann einwilligen — nicht der Support, nicht der Owner", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  for (const fremd of ["support@example.de", "owner@example.de", "chefin@example.de"]) {
    const versuch = await grantConsent(a.impersonation.id, fremd, { env: ENV, nowMs: JETZT });
    assert.equal(versuch.ok, false, fremd);
    assert.equal(versuch.error, "impersonation_consent_wrong_person");
  }
  const richtig = await grantConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(richtig.ok, true);
  assert.equal(richtig.impersonation.status, IMP_STATUS.active);
});

test("mit Einwilligung startet die Sitzung und hat ein hartes Ende", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  const frei = await grantConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT });
  const dauer = new Date(frei.impersonation.endsAt).getTime() - JETZT;
  assert.equal(dauer, 30 * 60 * 1000, "hoechstens 30 Minuten");
  assert.equal(effectiveImpStatus(frei.impersonation, JETZT + 29 * 60_000), IMP_STATUS.active);
  assert.equal(effectiveImpStatus(frei.impersonation, JETZT + 31 * 60_000), IMP_STATUS.expired);
});

test("eine laengere Dauer wird gekappt, nicht uebernommen", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag({ durationMs: 8 * 3600_000 });
  assert.equal(a.impersonation.durationMs, 30 * 60 * 1000);
});

test("die Anfrage selbst verfaellt nach 15 Minuten", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  assert.equal(effectiveImpStatus(a.impersonation, JETZT + 14 * 60_000), IMP_STATUS.awaitingConsent);
  assert.equal(effectiveImpStatus(a.impersonation, JETZT + 16 * 60_000), IMP_STATUS.expired);

  const zuSpaet = await grantConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT + 16 * 60_000 });
  assert.equal(zuSpaet.ok, false);
  assert.equal(zuSpaet.error, "impersonation_expired");
});

test("ablehnen beendet den Vorgang endgueltig", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  const nein = await denyConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(nein.impersonation.status, IMP_STATUS.denied);
  assert.equal(nein.impersonation.endedBy, "subject");

  const trotzdem = await grantConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(trotzdem.ok, false);
  assert.equal(trotzdem.error, "impersonation_not_awaiting_consent");
});

test("beide Seiten koennen jederzeit beenden — Fremde nicht", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  await grantConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT });

  const fremd = await endImpersonation(a.impersonation.id, "neugierig@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(fremd.ok, false);
  assert.equal(fremd.error, "impersonation_end_not_allowed");

  const durchKundin = await endImpersonation(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT + 60_000 });
  assert.equal(durchKundin.ok, true);
  assert.equal(durchKundin.impersonation.status, IMP_STATUS.ended);
  assert.equal(durchKundin.impersonation.endedBy, "subject");
});

test("der Umfang wird fail-closed geprueft", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag({ scopes: ["settings"] });
  const frei = await grantConsent(a.impersonation.id, "kundin@example.de", { env: ENV, nowMs: JETZT });
  const sitzung = frei.impersonation;

  assert.equal(isScopeAllowed(sitzung, "settings", JETZT + 60_000), true);
  assert.equal(isScopeAllowed(sitzung, "billing", JETZT + 60_000), false, "nicht beantragt = nicht erlaubt");
  assert.equal(isScopeAllowed(sitzung, "content", JETZT + 60_000), false);
  assert.equal(isScopeAllowed(sitzung, "settings", JETZT + 31 * 60_000), false, "abgelaufen = nichts mehr erlaubt");
  assert.equal(isScopeAllowed(a.impersonation, "settings", JETZT), false, "ohne Einwilligung = nichts erlaubt");
});

test("BREAK-GLASS laeuft ohne Einwilligung, aber kuerzer, begruendet und als Alarm markiert", async () => {
  __clearImpersonationMemoryForTests();
  const zuKnapp = await antrag({ breakGlass: true, reason: "Notfall" });
  assert.equal(zuKnapp.ok, false);
  assert.equal(zuKnapp.error, "impersonation_break_glass_reason_too_short");

  const echt = await antrag({
    breakGlass: true,
    reason: "Konto wird aktiv missbraucht, Nutzerin nicht erreichbar, Ticket 4480"
  });
  assert.equal(echt.ok, true);
  assert.equal(echt.impersonation.status, IMP_STATUS.active, "Break-Glass startet sofort");
  assert.equal(echt.impersonation.alarm, "break_glass_ohne_einwilligung");
  const dauer = new Date(echt.impersonation.endsAt).getTime() - JETZT;
  assert.equal(dauer, 10 * 60 * 1000, "deutlich kuerzer als mit Einwilligung");
});

test("sich selbst zu impersonieren ist sinnlos und wird abgewiesen", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag({ subjectEmail: "support@example.de" });
  assert.equal(a.ok, false);
  assert.equal(a.error, "impersonation_self_pointless");
});

test("ein Antrag braucht einen Grund", async () => {
  __clearImpersonationMemoryForTests();
  assert.equal((await antrag({ reason: "ab" })).error, "impersonation_reason_required");
  assert.equal((await antrag({ subjectEmail: "" })).error, "impersonation_subject_required");
});

test("die betroffene Person sieht ihre eigenen Vorgaenge — und nur die", async () => {
  __clearImpersonationMemoryForTests();
  await antrag({ subjectEmail: "kundin@example.de" });
  await antrag({ subjectEmail: "andere@example.de" });

  const ihre = await listImpersonations({ env: ENV, nowMs: JETZT, subjectEmail: "kundin@example.de" });
  assert.equal(ihre.total, 1);
  assert.equal(ihre.impersonations[0].subjectEmail, "kundin@example.de");

  const alle = await listImpersonations({ env: ENV, nowMs: JETZT });
  assert.equal(alle.total, 2);
});

test("der Datensatz ist eine Erlaubnis, kein Schluessel", async () => {
  __clearImpersonationMemoryForTests();
  const a = await antrag();
  const roh = JSON.stringify((await getImpersonation(a.impersonation.id, { env: ENV, nowMs: JETZT })).impersonation);
  for (const wort of ["token", "passwordhash", "secret", "cookie"]) {
    assert.equal(roh.toLowerCase().includes(wort), false, `Datensatz enthaelt "${wort}"`);
  }
});

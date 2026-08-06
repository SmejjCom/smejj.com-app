// smejj.com — Integrationstests der Stufe-4-Routen.
// Ausfuehren: node --test control-server/src/routes/adminStage4Routes.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../auth/emailUserStore.js";
import { __clearAuditMemoryForTests, readAuditPage } from "../admin/auditLog.js";
import { __clearModerationForTests } from "../admin/moderationQueue.js";
import { __clearGdprForTests } from "../admin/gdprRequests.js";
import { __clearAnnouncementsForTests } from "../admin/announcements.js";
import { __clearFlagsForTests } from "../admin/featureFlags.js";
import { handleAdminStage4Route } from "./adminStage4Routes.js";
import { __clearStepUpForTests, bestaetigeCode, fordereCode } from "../admin/stepUp.js";

/** Oeffnet das Schreibfenster wie die Konsole: Code holen, Code bestaetigen. */
async function erhoehe(email) {
  let code = "";
  await fordereCode(email, { mail: async (n) => { code = n.text.match(/\d{6}/)[0]; return { sent: true }; } });
  const ok = bestaetigeCode(email, code);
  if (!ok.ok) throw new Error("Step-up im Test fehlgeschlagen: " + ok.error);
}

const ENV = {};
const OWNER = { email: "owner@example.de" };
const FINANCE = { email: "finance@example.de" };

function attrappe() {
  const res = { status: 0, body: null, headers: {} };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (s, h) => { res.status = s; Object.assign(res.headers, h || {}); return res; };
  res.end = (b) => { res.body = b ? JSON.parse(b) : null; };
  return res;
}

async function ruf(methode, pfad, authUser, koerper) {
  const res = attrappe();
  const req = {
    method: methode, authUser, headers: {}, socket: {},
    on(ereignis, rueckruf) {
      if (ereignis === "data") rueckruf(JSON.stringify(koerper || {}));
      if (ereignis === "end") rueckruf();
      return req;
    }
  };
  const behandelt = await handleAdminStage4Route(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, status: res.status, body: res.body };
}

async function aufbauen() {
  __clearMemoryStoreForTests(); __clearAuditMemoryForTests();
  __clearModerationForTests(); __clearGdprForTests();
  __clearAnnouncementsForTests(); __clearFlagsForTests();
  await putUser({ ...createUserRecord({ email: "owner@example.de", name: "O", passwordHash: "h" }), role: "owner" }, ENV);
  await putUser({ ...createUserRecord({ email: "finance@example.de", name: "F", passwordHash: "h" }), role: "finance" }, ENV);
  // Aendernde Stufe-4-Routen verlangen ein offenes Step-up-Fenster; der
  // Step-up selbst ist in adminStepUp.test.js geprueft.
  __clearStepUpForTests();
  await erhoehe("owner@example.de");
  await erhoehe("finance@example.de");
}

test("ohne offenes Fenster wird eine Stufe-4-Aenderung abgewiesen", async () => {
  await aufbauen();
  __clearStepUpForTests();
  const a = await ruf("POST", "/api/admin/flags/setzen", OWNER, { name: "test", status: "on", reason: "Versuch" });
  assert.equal(a.status, 403);
  assert.equal(a.body.error, "admin_step_up_required");
  // Lesen bleibt frei — sonst muesste man fuer jeden Blick sein Postfach oeffnen.
  assert.equal((await ruf("GET", "/api/admin/flags", OWNER)).status, 200);
});

test("fremde Pfade werden durchgereicht", async () => {
  await aufbauen();
  assert.equal((await ruf("GET", "/api/admin/users", OWNER)).behandelt, false);
  assert.equal((await ruf("GET", "/api/admin/audit", OWNER)).behandelt, false);
});

test("Finance darf DSGVO-Vorgaenge nicht sehen — das sind Kontodaten", async () => {
  await aufbauen();
  const a = await ruf("GET", "/api/admin/gdpr", FINANCE);
  assert.equal(a.status, 403);
  assert.equal(a.body.error, "admin_permission_denied");
});

test("Moderation: melden, entscheiden, beides im Audit", async () => {
  await aufbauen();
  const gemeldet = await ruf("POST", "/api/admin/moderation/signal", OWNER, {
    art: "token_ausreisser", subjekt: "u_a91f4", beleg: "18,4 M Token in 24 h", schwere: "hoch"
  });
  assert.equal(gemeldet.status, 201);
  assert.equal(gemeldet.body.signal.status, "offen");
  const id = gemeldet.body.signal.id;

  const ohneBegruendung = await ruf("POST", `/api/admin/moderation/${id}/entscheiden`, OWNER,
    { bewertung: "bestaetigt", begruendung: "klar" });
  assert.equal(ohneBegruendung.status, 400);

  const entschieden = await ruf("POST", `/api/admin/moderation/${id}/entscheiden`, OWNER,
    { bewertung: "bestaetigt", begruendung: "Automatisierter Dauerlauf ohne Reaktion auf Rueckfrage", massnahme: "Sperre beantragt" });
  assert.equal(entschieden.status, 200);

  const audit = await readAuditPage({ env: ENV });
  assert.deepEqual(audit.entries.map((e) => e.action), ["moderation.entscheidung", "moderation.signal"]);
});

test("die Liste sagt ausdruecklich, dass nichts automatisch gesperrt wird", async () => {
  await aufbauen();
  const liste = await ruf("GET", "/api/admin/moderation", OWNER);
  assert.equal(liste.status, 200);
  assert.match(liste.body.hinweis, /Verdacht|nichts automatisch/i);
});

test("DSGVO: erfassen mit Rueckdatierung, abschliessen nur mit Nachweis", async () => {
  await aufbauen();
  const erfasst = await ruf("POST", "/api/admin/gdpr/erfassen", OWNER, {
    art: "auskunft", betroffeneEmail: "m.roth@example.de", eingegangenAm: "2026-07-20"
  });
  assert.equal(erfasst.status, 201);
  assert.equal(erfasst.body.vorgang.artikel, "Art. 15");
  const id = erfasst.body.vorgang.id;

  const ohneNachweis = await ruf("POST", `/api/admin/gdpr/${id}/status`, OWNER, { status: "abgeschlossen" });
  assert.equal(ohneNachweis.status, 400);
  assert.equal(ohneNachweis.body.error, "gdpr_nachweis_required");

  const fertig = await ruf("POST", `/api/admin/gdpr/${id}/status`, OWNER,
    { status: "abgeschlossen", nachweis: "Datenauszug als PDF versandt" });
  assert.equal(fertig.status, 200);
  assert.equal(fertig.body.after.status, "abgeschlossen");

  const liste = await ruf("GET", "/api/admin/gdpr", OWNER);
  assert.equal(liste.body.offen, 0);
});

test("DSGVO: verlaengern genau einmal", async () => {
  await aufbauen();
  const erfasst = await ruf("POST", "/api/admin/gdpr/erfassen", OWNER,
    { art: "loeschung", betroffeneEmail: "a@example.de" });
  const id = erfasst.body.vorgang.id;
  const erste = await ruf("POST", `/api/admin/gdpr/${id}/verlaengern`, OWNER,
    { begruendung: "Datenbestand ueber mehrere Systeme verteilt" });
  assert.equal(erste.status, 200);
  const zweite = await ruf("POST", `/api/admin/gdpr/${id}/verlaengern`, OWNER,
    { begruendung: "Noch mehr Aufwand als gedacht" });
  assert.equal(zweite.status, 409);
});

test("Ankuendigung erstellen und zurueckziehen", async () => {
  await aufbauen();
  const erstellt = await ruf("POST", "/api/admin/announcements/erstellen", OWNER, {
    art: "wartung", titel: "Wartung am 3. August", text: "30 Minuten nicht erreichbar."
  });
  assert.equal(erstellt.status, 201);
  const id = erstellt.body.ankuendigung.id;

  const zurueck = await ruf("POST", `/api/admin/announcements/${id}/zurueckziehen`, OWNER, { reason: "Termin verschoben" });
  assert.equal(zurueck.status, 200);
  assert.equal(zurueck.body.after.zustand, "zurueckgezogen");

  const liste = await ruf("GET", "/api/admin/announcements", OWNER);
  assert.equal(liste.body.total, 1, "der Datensatz bleibt dokumentiert");
  assert.equal(liste.body.aktiv, 0);
});

test("Flags: ohne Grund keine Aenderung, danach anlegen und aendern", async () => {
  await aufbauen();
  const ohneGrund = await ruf("POST", "/api/admin/flags/setzen", OWNER, { name: "chat-neu", status: "partial", percent: 5 });
  assert.equal(ohneGrund.status, 400);
  assert.equal(ohneGrund.body.error, "admin_reason_required");

  const angelegt = await ruf("POST", "/api/admin/flags/setzen", OWNER,
    { name: "chat-neu", status: "partial", percent: 5, reason: "Schrittweise Freigabe" });
  assert.equal(angelegt.status, 201);
  assert.equal(angelegt.body.neu, true);

  const geaendert = await ruf("POST", "/api/admin/flags/setzen", OWNER,
    { name: "chat-neu", status: "on", reason: "Auswertung positiv" });
  assert.equal(geaendert.status, 200);
  assert.equal(geaendert.body.neu, false);

  const audit = await readAuditPage({ env: ENV });
  assert.deepEqual(audit.entries.map((e) => e.action), ["flag.geaendert", "flag.angelegt"]);
});

test("jede Stufe-4-Aktion hinterlaesst eine Spur mit Grund", async () => {
  await aufbauen();
  await ruf("POST", "/api/admin/flags/setzen", OWNER, { name: "test-flag", status: "off", reason: "Vorbereitung" });
  await ruf("POST", "/api/admin/announcements/erstellen", OWNER,
    { art: "hinweis", titel: "Hinweis", text: "Ein Text fuer die Nutzer." });
  const audit = await readAuditPage({ env: ENV });
  for (const eintrag of audit.entries) {
    assert.ok(eintrag.reason.length >= 3, `${eintrag.action} ohne Grund`);
    assert.equal(eintrag.actorEmail, "owner@example.de");
  }
});

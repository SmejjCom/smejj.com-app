// smejj.com — Bestaetigungspflicht fuer Adminkonten und Sicherheitsalarm.
// Ausfuehren: node --test control-server/src/routes/adminVerifiziert.test.js
//
// Die wichtigste Zusicherung steht ganz unten: NIEMAND darf sich aussperren.
// Eine Bestaetigungspflicht, deren einziger Bestaetigungsweg selbst hinter der
// Pflicht liegt, waere eine geschlossene Tuer ohne Klinke — auch fuer den
// Betreiber.
import test from "node:test";
import assert from "node:assert/strict";
import { __clearMemoryStoreForTests, createUserRecord, getUserByEmail, putUser } from "../auth/emailUserStore.js";
import { __clearAuditMemoryForTests, readAuditPage } from "../admin/auditLog.js";
import { handleAdminWriteRoute } from "./adminWriteRoutes.js";
import { handleAdminUiRoute } from "./adminUiRoutes.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { __clearStepUpForTests } from "../admin/stepUp.js";
import { ARTEN, __clearAlarmForTests, meldeEreignis } from "../admin/sicherheitsAlarm.js";

// Wie in der Produktion: die Owner-Adresse steht in der Umgebung. Sie ist
// zugleich der Empfaenger der Alarmmails.
const ENV = { SMEJJ_ADMIN_OWNER_EMAILS: "owner@example.de" };
const OWNER = { email: "owner@example.de" };

function attrappe() {
  const res = { status: 0, body: null, headers: {}, roh: "" };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (s, h) => { res.status = s; Object.assign(res.headers, h || {}); return res; };
  res.end = (b) => { res.roh = b ? String(b) : ""; try { res.body = b ? JSON.parse(b) : null; } catch { res.body = null; } };
  return res;
}

async function post(pfad, authUser, koerper) {
  const res = attrappe();
  const req = {
    method: "POST", authUser, headers: {}, socket: {},
    on(e, cb) { if (e === "data") cb(JSON.stringify(koerper || {})); if (e === "end") cb(); return req; }
  };
  await handleAdminWriteRoute(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { status: res.status, body: res.body };
}

async function aufbauen({ bestaetigt = false } = {}) {
  __clearMemoryStoreForTests(); __clearAuditMemoryForTests();
  __clearStepUpForTests(); __clearAlarmForTests();
  const record = { ...createUserRecord({ email: OWNER.email, name: "Owner", passwordHash: "h" }), role: "owner" };
  if (bestaetigt) record.emailVerifiedAt = new Date().toISOString();
  await putUser(record, ENV);
  await putUser(createUserRecord({ email: "kundin@example.de", name: "Kundin", passwordHash: "h" }), ENV);
}

test("ein unbestaetigtes Adminkonto kommt an keine Daten", async () => {
  await aufbauen({ bestaetigt: false });
  const abgelehnt = await resolveAdminActor(OWNER, { env: ENV });
  assert.equal(abgelehnt.ok, false);
  assert.equal(abgelehnt.status, 403);
  assert.equal(abgelehnt.error, "admin_email_not_verified");
});

test("ein bestaetigtes Adminkonto kommt durch und traegt das Merkmal", async () => {
  await aufbauen({ bestaetigt: true });
  const erlaubt = await resolveAdminActor(OWNER, { env: ENV });
  assert.equal(erlaubt.ok, true);
  assert.equal(erlaubt.actor.emailVerified, true);
});

test("KEINE AUSSPERRUNG: Konsole und Step-up bleiben unbestaetigt erreichbar", async () => {
  await aufbauen({ bestaetigt: false });

  // Die Konsole selbst muss laden — sonst gaebe es keinen Ort, an dem man den
  // Code ueberhaupt eingeben koennte.
  const res = attrappe();
  await handleAdminUiRoute({ method: "GET", authUser: OWNER }, new URL("http://x/admin"), res, { env: ENV });
  assert.equal(res.status, 200, "die Konsolen-Oberflaeche muss unbestaetigt ausgeliefert werden");

  // Und der Weg zum Code muss offen sein. Ohne Mailkonfiguration meldet die
  // Route 503 — entscheidend ist, dass sie NICHT mit 403 abweist.
  const anforderung = await post("/api/admin/step-up/request", OWNER, {});
  assert.notEqual(anforderung.status, 403, "der Bestaetigungsweg darf nie hinter der Bestaetigungspflicht liegen");

  // Alles andere bleibt dicht.
  const aktion = await post("/api/admin/users/kundin@example.de/actions/block", OWNER, { reason: "Versuch" });
  assert.equal(aktion.status, 403);
  assert.equal(aktion.body.error, "admin_email_not_verified");
});

test("ein bestandener Step-up bestaetigt die Adresse gleich mit", async () => {
  await aufbauen({ bestaetigt: false });
  // Code ueber die Route anfordern schlaegt ohne Mailer fehl — deshalb direkt
  // ueber das Modul, mit einer Mail-Attrappe wie in adminStepUp.test.js.
  const { bestaetigeCode, fordereCode } = await import("../admin/stepUp.js");
  let code = "";
  await fordereCode(OWNER.email, { mail: async (n) => { code = n.text.match(/\d{6}/)[0]; return { sent: true }; } });

  const vorher = await getUserByEmail(OWNER.email, ENV);
  assert.equal(Boolean(vorher.emailVerifiedAt), false);

  const antwort = await post("/api/admin/step-up/confirm", OWNER, { code });
  assert.equal(antwort.status, 200);
  assert.equal(antwort.body.emailBestaetigt, true);

  const nachher = await getUserByEmail(OWNER.email, ENV);
  assert.equal(Boolean(nachher.emailVerifiedAt), true, "der Code kam an diese Adresse und zurueck — das IST der Nachweis");

  // Und der Nachweis steht im Audit-Log.
  const seite = await readAuditPage({ limit: 20 }, { env: ENV });
  const aktionen = (seite.entries || []).map((e) => e.action);
  assert.ok(aktionen.includes("user.verify"), `Bestaetigung fehlt im Audit: ${aktionen.join(", ")}`);

  // Danach ist der Weg frei — dieselbe Aktion, die eben noch 403 war.
  assert.equal(bestaetigeCode(OWNER.email, code).ok, false, "ein Code gilt nur einmal");
  const aktion = await post("/api/admin/users/kundin@example.de/actions/block", OWNER, { reason: "Missbrauch bestaetigt" });
  assert.equal(aktion.status, 200);
});

// ---- Sicherheitsalarm --------------------------------------------------------

test("ein einzelnes abgewehrtes Ereignis alarmiert NICHT", async () => {
  await aufbauen({ bestaetigt: true });
  const ergebnis = await meldeEreignis(ARTEN.vortuer, { kennung: "1.2.3.4" }, { env: ENV, mail: async () => ({ sent: true }) });
  assert.equal(ergebnis.gemeldet, false);
  assert.equal(ergebnis.anzahl, 1);
});

test("ein Muster reisst die Schwelle und wird genau einmal gemeldet", async () => {
  await aufbauen({ bestaetigt: true });
  let mails = 0;
  const optionen = { env: ENV, mail: async () => { mails += 1; return { sent: true }; } };
  let letzte = null;
  for (let i = 0; i < 30; i++) letzte = await meldeEreignis(ARTEN.vortuer, { kennung: "9.9.9.9" }, optionen);
  assert.equal(letzte.gemeldet === true || mails === 1, true);
  assert.equal(mails, 1, "die Ruhezeit verhindert eine Flut");

  const seite = await readAuditPage({ limit: 20 }, { env: ENV });
  const alarm = (seite.entries || []).find((e) => e.action === "security.alarm");
  assert.ok(alarm, "der Alarm gehoert in die faelschungssichere Kette");
  assert.equal(alarm.target, ARTEN.vortuer);
});

test("alte Ereignisse fallen aus dem Fenster — kein Alarm durch Zeitablauf", async () => {
  await aufbauen({ bestaetigt: true });
  let uhr = 1_000_000;
  const optionen = { env: ENV, now: () => uhr, mail: async () => ({ sent: true }) };
  // 24 Ereignisse, dann eine lange Pause, dann ein einzelnes: die Schwelle (25)
  // darf NICHT durch Ereignisse von vor einer Stunde erreicht werden.
  for (let i = 0; i < 24; i++) await meldeEreignis(ARTEN.vortuer, {}, optionen);
  uhr += 60 * 60_000;
  const spaet = await meldeEreignis(ARTEN.vortuer, {}, optionen);
  assert.equal(spaet.gemeldet, false);
  assert.equal(spaet.anzahl, 1, "das Fenster muss die alten Ereignisse vergessen haben");
});

test("ohne hinterlegte Owner-Adresse bleibt wenigstens der Audit-Eintrag", async () => {
  // Ein Alarm, der am fehlenden Empfaenger scheitert, darf nicht spurlos sein.
  await aufbauen({ bestaetigt: true });
  const ohneEmpfaenger = { SMEJJ_ADMIN_OWNER_EMAILS: "" };
  let mails = 0;
  for (let i = 0; i < 26; i++) {
    await meldeEreignis(ARTEN.vortuer, {}, { env: ohneEmpfaenger, mail: async () => { mails += 1; return { sent: true }; } });
  }
  assert.equal(mails, 0, "ohne Empfaenger wird nicht gemailt");
  const seite = await readAuditPage({ limit: 20 }, { env: ohneEmpfaenger });
  assert.ok((seite.entries || []).some((e) => e.action === "security.alarm"), "der Nachweis muss trotzdem stehen");
});

test("falsche Step-up-Codes haben eine eigene, viel niedrigere Schwelle", async () => {
  await aufbauen({ bestaetigt: true });
  let mails = 0;
  const optionen = { env: ENV, mail: async () => { mails += 1; return { sent: true }; } };
  for (let i = 0; i < 4; i++) await meldeEreignis(ARTEN.stepUpFalsch, {}, optionen);
  assert.equal(mails, 0, "vier Vertipper sind noch kein Angriff");
  await meldeEreignis(ARTEN.stepUpFalsch, {}, optionen);
  assert.equal(mails, 1, "der fuenfte reisst die Schwelle");
});

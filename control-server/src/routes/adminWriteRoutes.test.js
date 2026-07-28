// smejj.com — Integrationstests der schreibenden Admin-Routen (Stufe 3).
// Ausfuehren: node --test control-server/src/routes/adminWriteRoutes.test.js
//
// Geprueft wird die HTTP-Schicht: Berechtigung, Pflichtgrund, Vier-Augen und
// der Nachweis. Ohne IDrive laufen Store und Audit im Memory-Zweig.
import test from "node:test";
import assert from "node:assert/strict";
import {
  __clearMemoryStoreForTests, addSessionToRecord, createUserRecord, getUserByEmail, putUser
} from "../auth/emailUserStore.js";
import { __clearAuditMemoryForTests, readAuditPage } from "../admin/auditLog.js";
import { __clearApprovalMemoryForTests } from "../admin/approvalStore.js";
import { __clearImpersonationMemoryForTests } from "../admin/impersonation.js";
import { handleAdminWriteRoute } from "./adminWriteRoutes.js";
import { handleAccountImpersonationRoute } from "./accountImpersonationRoutes.js";

const ENV = {};

function attrappe() {
  const res = { status: 0, body: null, headers: {} };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (s, h) => { res.status = s; Object.assign(res.headers, h || {}); return res; };
  res.end = (b) => { res.body = b ? JSON.parse(b) : null; };
  return res;
}

async function post(pfad, authUser, koerper) {
  const res = attrappe();
  const req = {
    method: "POST", authUser, headers: {}, socket: {},
    on(ereignis, rueckruf) {
      if (ereignis === "data") rueckruf(JSON.stringify(koerper || {}));
      if (ereignis === "end") rueckruf();
      return req;
    }
  };
  const behandelt = await handleAdminWriteRoute(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, status: res.status, body: res.body };
}

/** Die betroffene Person handelt in ihrem EIGENEN Konto, nicht im Adminbereich. */
async function konto(pfad, authUser, koerper) {
  const res = attrappe();
  const req = {
    method: "POST", authUser, headers: {}, socket: {},
    on(ereignis, rueckruf) {
      if (ereignis === "data") rueckruf(JSON.stringify(koerper || {}));
      if (ereignis === "end") rueckruf();
      return req;
    }
  };
  const behandelt = await handleAccountImpersonationRoute(req, new URL(`http://x${pfad}`), res, { env: ENV });
  return { behandelt, status: res.status, body: res.body };
}

async function aufbauen() {
  __clearMemoryStoreForTests();
  __clearAuditMemoryForTests();
  __clearApprovalMemoryForTests();
  __clearImpersonationMemoryForTests();
  await putUser({ ...createUserRecord({ email: "owner@example.de", name: "Owner", passwordHash: "h" }), role: "owner" }, ENV);
  await putUser({ ...createUserRecord({ email: "zweite@example.de", name: "Zweite", passwordHash: "h" }), role: "admin" }, ENV);
  await putUser({ ...createUserRecord({ email: "helfer@example.de", name: "Helfer", passwordHash: "h" }), role: "support" }, ENV);
  await putUser(createUserRecord({ email: "readonly@example.de", name: "Nur Lesen", passwordHash: "h" }), ENV);
  const kundin = createUserRecord({ email: "kundin@example.de", name: "Kundin", passwordHash: "h" });
  addSessionToRecord(kundin, { sid: "s1", expiresAt: Date.now() + 3_600_000, userAgent: "Mac" });
  await putUser(kundin, ENV);
}

const OWNER = { email: "owner@example.de" };
const ZWEITE = { email: "zweite@example.de" };
const SUPPORT = { email: "helfer@example.de" };

test("ohne Grund keine Aktion", async () => {
  await aufbauen();
  const a = await post("/api/admin/users/kundin@example.de/actions/block", OWNER, {});
  assert.equal(a.status, 400);
  assert.equal(a.body.error, "admin_reason_required");
});

test("ein Konto ohne Verwaltungsrolle kommt gar nicht erst durch", async () => {
  await aufbauen();
  const a = await post("/api/admin/users/kundin@example.de/actions/block",
    { email: "readonly@example.de" }, { reason: "Versuch" });
  assert.equal(a.status, 403);
  assert.equal(a.body.error, "admin_role_required");
});

test("Support darf nicht sperren, aber Sitzungen widerrufen", async () => {
  await aufbauen();
  const sperren = await post("/api/admin/users/kundin@example.de/actions/block", SUPPORT, { reason: "Versuch" });
  assert.equal(sperren.status, 403);
  assert.equal(sperren.body.error, "admin_permission_denied");

  const sitzungen = await post("/api/admin/users/kundin@example.de/actions/sessions.revoke", SUPPORT,
    { reason: "Ticket 4471 — Geraet verloren" });
  assert.equal(sitzungen.status, 200);
  assert.equal(sitzungen.body.revokedSessions, 1);
  assert.equal(sitzungen.body.protokolliert, true);
});

test("sperren wirkt sofort, wirft Sitzungen raus und wird protokolliert", async () => {
  await aufbauen();
  const a = await post("/api/admin/users/kundin@example.de/actions/block", OWNER,
    { reason: "Missbrauch bestaetigt — 41-faches Mittel" });
  assert.equal(a.status, 200);
  assert.equal(a.body.before.status, "active");
  assert.equal(a.body.after.status, "blocked");
  assert.equal(a.body.protokolliert, true);

  const record = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(record.status, "blocked");

  const audit = await readAuditPage({ env: ENV });
  const letzter = audit.entries[0];
  assert.equal(letzter.action, "user.block");
  assert.deepEqual(letzter.before, a.body.before);
  assert.deepEqual(letzter.after, a.body.after);
  assert.match(letzter.reason, /Missbrauch/);
});

test("LOESCHEN wird beantragt, nicht ausgefuehrt — und der Antragsteller kann es nicht selbst freigeben", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/users/kundin@example.de/actions/delete", OWNER,
    { reason: "DSGVO Art. 17, Ticket 4501" });
  assert.equal(antrag.status, 202, "202 = angenommen, aber noch nicht getan");
  assert.equal(antrag.body.vierAugen, true);
  const id = antrag.body.approval.id;

  // Das Konto ist unveraendert.
  const nochDa = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(nochDa.status, "active");
  assert.equal(nochDa.name, "Kundin");

  // Der Antragsteller darf nicht freigeben.
  const selbst = await post(`/api/admin/approvals/${id}/approve`, OWNER, {});
  assert.equal(selbst.status, 403);
  assert.equal(selbst.body.error, "approval_self_approval_forbidden");

  // Und das Konto ist immer noch unveraendert.
  const immerNochDa = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(immerNochDa.name, "Kundin");
});

test("die zweite Person gibt frei — dann wird ausgefuehrt, genau einmal", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/users/kundin@example.de/actions/delete", OWNER,
    { reason: "DSGVO Art. 17, Ticket 4501" });
  const id = antrag.body.approval.id;

  const frei = await post(`/api/admin/approvals/${id}/approve`, ZWEITE, {});
  assert.equal(frei.status, 200);
  assert.equal(frei.body.ausgefuehrt, true);
  assert.equal(frei.body.beantragtVon, "owner@example.de");
  assert.equal(frei.body.freigegebenVon, "zweite@example.de");

  const geloescht = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(geloescht.status, "deleted");
  assert.equal(geloescht.name, "");
  assert.equal(geloescht.passwordHash, "");
  assert.deepEqual(geloescht.sessions, []);

  // Zweimal geht nicht.
  const nochmal = await post(`/api/admin/approvals/${id}/approve`, ZWEITE, {});
  assert.equal(nochmal.status, 409);
});

test("wer die Sache selbst nicht darf, darf sie auch nicht durchwinken", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/users/kundin@example.de/actions/delete", OWNER, { reason: "Grund" });
  const id = antrag.body.approval.id;
  const support = await post(`/api/admin/approvals/${id}/approve`, SUPPORT, {});
  assert.equal(support.status, 403);
  assert.equal(support.body.error, "admin_permission_denied");
});

test("ablehnen verlangt einen Grund und verhindert die Ausfuehrung", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/users/kundin@example.de/actions/delete", OWNER, { reason: "Grund" });
  const id = antrag.body.approval.id;

  const ohne = await post(`/api/admin/approvals/${id}/reject`, ZWEITE, {});
  assert.equal(ohne.status, 400);

  const ab = await post(`/api/admin/approvals/${id}/reject`, ZWEITE, { reason: "Beleg reicht nicht" });
  assert.equal(ab.status, 200);
  assert.equal(ab.body.approval.status, "rejected");

  const record = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(record.name, "Kundin", "abgelehnt heisst unveraendert");
});

test("Rollenvergabe braucht ebenfalls vier Augen", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/users/kundin@example.de/actions/role.grant", OWNER,
    { reason: "Neues Teammitglied", role: "support" });
  assert.equal(antrag.status, 202);

  const vorher = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(vorher.role, "user");

  const frei = await post(`/api/admin/approvals/${antrag.body.approval.id}/approve`, ZWEITE, {});
  assert.equal(frei.status, 200);
  const nachher = await getUserByEmail("kundin@example.de", ENV);
  assert.equal(nachher.role, "support");
});

test("eine unbekannte Aktion wird abgewiesen, nicht geraten", async () => {
  await aufbauen();
  const a = await post("/api/admin/users/kundin@example.de/actions/vernichten", OWNER, { reason: "Test" });
  assert.equal(a.status, 404);
  assert.equal(a.body.error, "admin_action_unknown");
});

test("Impersonation wartet auf die Einwilligung — und nur die betroffene Person kann sie geben", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/impersonation/request", SUPPORT,
    { subject: "kundin@example.de", reason: "Ticket 4471 — Magic-Link" });
  assert.equal(antrag.status, 202);
  assert.equal(antrag.body.impersonation.status, "awaiting_consent");
  const id = antrag.body.impersonation.id;

  // Der Adminbereich nimmt die Einwilligung gar nicht erst entgegen.
  const falscherWeg = await post(`/api/admin/impersonation/${id}/consent`, SUPPORT, {});
  assert.equal(falscherWeg.status, 403);
  assert.equal(falscherWeg.body.error, "impersonation_consent_belongs_to_subject");

  // Der Support kann auch im richtigen Weg nicht fuer die Kundin einwilligen.
  const selbst = await konto(`/api/account/impersonation/${id}/consent`, SUPPORT, {});
  assert.equal(selbst.status, 403);
  assert.equal(selbst.body.error, "impersonation_consent_wrong_person");

  // Die Kundin schon — in ihrer eigenen Sitzung, ganz ohne Adminrolle.
  const ihre = await konto(`/api/account/impersonation/${id}/consent`, { email: "kundin@example.de" }, {});
  assert.equal(ihre.status, 200);
  assert.equal(ihre.body.impersonation.status, "active");
  // Die Konto-Ansicht benennt die Felder so, dass eine betroffene Person sie
  // versteht: wer, grund, umfang — nicht operatorEmail/reason/scopes.
  assert.deepEqual(ihre.body.impersonation.umfang, ["settings", "billing"]);
  assert.equal(ihre.body.impersonation.wer, "helfer@example.de");
  assert.match(ihre.body.impersonation.grund, /Magic-Link/);
});

test("die betroffene Person kann jederzeit beenden", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/impersonation/request", SUPPORT,
    { subject: "kundin@example.de", reason: "Ticket 4471" });
  const id = antrag.body.impersonation.id;
  await konto(`/api/account/impersonation/${id}/consent`, { email: "kundin@example.de" }, {});

  const ende = await konto(`/api/account/impersonation/${id}/end`, { email: "kundin@example.de" }, {});
  assert.equal(ende.status, 200);
  assert.equal(ende.body.impersonation.status, "ended");
  assert.equal(ende.body.impersonation.beendetVon, "subject");
});

test("jede Aktion hinterlaesst genau eine Spur mit Vorher und Nachher", async () => {
  await aufbauen();
  await post("/api/admin/users/kundin@example.de/actions/verify", OWNER, { reason: "Support-Anfrage 4490" });
  await post("/api/admin/users/kundin@example.de/actions/block", OWNER, { reason: "Missbrauch" });
  await post("/api/admin/users/kundin@example.de/actions/unblock", OWNER, { reason: "Irrtum aufgeklaert" });

  const audit = await readAuditPage({ env: ENV });
  const aktionen = audit.entries.map((e) => e.action);
  assert.deepEqual(aktionen, ["user.unblock", "user.block", "user.verify"], "juengste zuerst");
  for (const eintrag of audit.entries) {
    assert.ok(eintrag.reason.length >= 3, "jeder Eintrag traegt seinen Grund");
    assert.ok(eintrag.before && eintrag.after, "jeder Eintrag zeigt den Unterschied");
    assert.equal(eintrag.actorEmail, "owner@example.de");
  }
});

test("fremde Pfade und GET werden durchgereicht, nicht beantwortet", async () => {
  await aufbauen();
  const res = attrappe();
  const gelesen = await handleAdminWriteRoute(
    { method: "GET", authUser: OWNER, headers: {}, socket: {} },
    new URL("http://x/api/admin/users"), res, { env: ENV });
  assert.equal(gelesen, false, "GET gehoert den lesenden Routen");

  const fremd = await post("/api/keys", OWNER, {});
  assert.equal(fremd.behandelt, false);

  const neubau = await post("/api/admin/users/index/rebuild", OWNER, { reason: "Turnus" });
  assert.equal(neubau.behandelt, false, "der Index-Neubau bleibt bei den lesenden Routen");
});

test("wer beantragt, darf auch nicht ablehnen — und zwar mit 403, nicht 409", async () => {
  await aufbauen();
  const antrag = await post("/api/admin/users/kundin@example.de/actions/delete", OWNER, { reason: "Grund" });
  const id = antrag.body.approval.id;

  const selbst = await post(`/api/admin/approvals/${id}/reject`, OWNER, { reason: "Doch nicht" });
  assert.equal(selbst.status, 403, "403 heisst nie, 409 hiesse spaeter nochmal");
  assert.equal(selbst.body.error, "approval_self_approval_forbidden");

  // Der Antrag ist unveraendert offen — und eine zweite Person kann weiterhin entscheiden.
  const ab = await post(`/api/admin/approvals/${id}/reject`, ZWEITE, { reason: "Beleg reicht nicht" });
  assert.equal(ab.status, 200);
  assert.equal(ab.body.approval.status, "rejected");
});

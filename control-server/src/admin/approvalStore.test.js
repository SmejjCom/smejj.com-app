// smejj.com — Unit-Tests fuer das Vier-Augen-Prinzip.
// Ausfuehren: node --test control-server/src/admin/approvalStore.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  STATUS, __clearApprovalMemoryForTests, approveRequest, effectiveStatus, getApproval,
  listApprovals, markExecuted, rejectRequest, requestApproval
} from "./approvalStore.js";

const ENV = {}; // kein IDrive -> Memory-Zweig
const JETZT = Date.parse("2026-07-28T12:00:00.000Z");

async function antrag(patch = {}) {
  return requestApproval({
    action: "user.delete",
    target: "u_test",
    reason: "Missbrauch bestaetigt",
    requestedBy: "chefin@example.de",
    ...patch
  }, { env: ENV, nowMs: JETZT });
}

test("ein Antrag braucht Aktion, Ziel, Grund und Antragsteller", async () => {
  __clearApprovalMemoryForTests();
  assert.equal((await antrag({ action: "" })).error, "approval_action_required");
  assert.equal((await antrag({ target: "" })).error, "approval_target_required");
  assert.equal((await antrag({ reason: "ab" })).error, "approval_reason_required");
  assert.equal((await antrag({ requestedBy: "" })).error, "approval_requester_required");
});

test("DER ANTRAGSTELLER DARF NICHT SELBST FREIGEBEN — auch nicht der Owner", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag({ requestedBy: "owner@example.de" });
  const selbst = await approveRequest(a.approval.id, "owner@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(selbst.ok, false);
  assert.equal(selbst.error, "approval_self_approval_forbidden");

  // Auch mit anderer Schreibweise nicht.
  const getarnt = await approveRequest(a.approval.id, "  OWNER@Example.DE ", { env: ENV, nowMs: JETZT });
  assert.equal(getarnt.error, "approval_self_approval_forbidden");
});

test("eine zweite Person gibt frei, danach ist der Antrag freigegeben", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag();
  const frei = await approveRequest(a.approval.id, "zweite@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(frei.ok, true);
  assert.equal(frei.approval.status, STATUS.approved);
  assert.equal(frei.approval.decidedBy, "zweite@example.de");
  assert.ok(frei.approval.decidedAt);
});

test("ein Antrag laeuft nach 24 Stunden ab und ist dann nicht mehr freigebbar", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag();
  const knappDavor = JETZT + 24 * 3600_000 - 1000;
  const knappDanach = JETZT + 24 * 3600_000 + 1000;

  assert.equal(effectiveStatus(a.approval, knappDavor), STATUS.pending);
  assert.equal(effectiveStatus(a.approval, knappDanach), STATUS.expired);

  const zuSpaet = await approveRequest(a.approval.id, "zweite@example.de", { env: ENV, nowMs: knappDanach });
  assert.equal(zuSpaet.ok, false);
  assert.equal(zuSpaet.error, "approval_expired");
});

test("zweimal entscheiden geht nicht", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag();
  await approveRequest(a.approval.id, "zweite@example.de", { env: ENV, nowMs: JETZT });
  const nochmal = await approveRequest(a.approval.id, "dritte@example.de", { env: ENV, nowMs: JETZT });
  assert.equal(nochmal.ok, false);
  assert.equal(nochmal.error, "approval_already_decided");
});

test("ablehnen haelt den Grund fest und sperrt die Ausfuehrung", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag();
  const ab = await rejectRequest(a.approval.id, "zweite@example.de", "Beleg reicht nicht", { env: ENV, nowMs: JETZT });
  assert.equal(ab.ok, true);
  assert.equal(ab.approval.status, STATUS.rejected);
  assert.equal(ab.approval.decisionReason, "Beleg reicht nicht");

  const versuch = await markExecuted(a.approval.id, { ok: true }, { env: ENV, nowMs: JETZT });
  assert.equal(versuch.ok, false);
  assert.equal(versuch.error, "approval_not_approved");
});

test("ohne Freigabe keine Ausfuehrung", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag();
  const versuch = await markExecuted(a.approval.id, { ok: true }, { env: ENV, nowMs: JETZT });
  assert.equal(versuch.ok, false);
  assert.equal(versuch.error, "approval_not_approved");
  assert.equal(versuch.status, STATUS.pending);
});

test("genau einmal ausfuehren — ein zweiter Lauf wird abgewiesen", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag();
  await approveRequest(a.approval.id, "zweite@example.de", { env: ENV, nowMs: JETZT });

  const erste = await markExecuted(a.approval.id, { geloescht: 1 }, { env: ENV, nowMs: JETZT });
  assert.equal(erste.ok, true);
  assert.equal(erste.approval.status, STATUS.executed);
  assert.deepEqual(erste.approval.result, { geloescht: 1 });

  const zweite = await markExecuted(a.approval.id, { geloescht: 1 }, { env: ENV, nowMs: JETZT });
  assert.equal(zweite.ok, false);
  assert.equal(zweite.error, "approval_already_executed");
});

test("ein unbekannter Antrag ist kein stiller Erfolg", async () => {
  __clearApprovalMemoryForTests();
  assert.equal((await getApproval("ap_gibtsnicht", { env: ENV })).error, "approval_not_found");
  assert.equal((await approveRequest("ap_gibtsnicht", "wer@example.de", { env: ENV })).error, "approval_not_found");
  assert.equal((await markExecuted("ap_gibtsnicht", {}, { env: ENV })).error, "approval_not_found");
});

test("die Liste zeigt neueste zuerst und kennzeichnet Abgelaufene", async () => {
  __clearApprovalMemoryForTests();
  await requestApproval({ action: "user.delete", target: "u_1", reason: "Grund eins", requestedBy: "a@example.de" },
    { env: ENV, nowMs: JETZT });
  await requestApproval({ action: "users.role.grant", target: "u_2", reason: "Grund zwei", requestedBy: "a@example.de" },
    { env: ENV, nowMs: JETZT + 5000 });

  const jetzt = await listApprovals({ env: ENV, nowMs: JETZT + 6000 });
  assert.equal(jetzt.total, 2);
  assert.equal(jetzt.approvals[0].target, "u_2", "neuester zuerst");
  assert.equal(jetzt.approvals.every((a) => a.status === STATUS.pending), true);

  const spaeter = await listApprovals({ env: ENV, nowMs: JETZT + 25 * 3600_000 });
  assert.equal(spaeter.approvals.every((a) => a.status === STATUS.expired), true);
});

test("der Antrag traegt keine Kontodaten und keine Geheimnisse", async () => {
  __clearApprovalMemoryForTests();
  const a = await antrag({ payload: { rolle: "support", passwordHash: "scrypt$geheim" } });
  const roh = JSON.stringify(a.approval);
  // Die Nutzlast wird uebernommen wie uebergeben — der Aufrufer darf keine
  // Geheimnisse hineinlegen. Dieser Test haelt fest, dass der Speicher selbst
  // keine hinzufuegt: kein Datensatz, keine E-Mail ausser der des Antragstellers.
  assert.equal(roh.includes("emailVerifiedAt"), false);
  assert.equal(roh.includes("sessions"), false);
  assert.equal((roh.match(/@example\.de/g) || []).length, 1, "nur der Antragsteller");
});

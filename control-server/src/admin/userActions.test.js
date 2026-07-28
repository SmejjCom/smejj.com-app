// smejj.com — Unit-Tests fuer die schreibenden Kontoaktionen.
// Ausfuehren: node --test control-server/src/admin/userActions.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  __clearMemoryStoreForTests, addSessionToRecord, createUserRecord, getUserByEmail, putUser
} from "../auth/emailUserStore.js";
import {
  auditView, clearLoginLock, deleteUserData, markEmailVerified, revokeUserSessions, setUserRole, setUserStatus
} from "./userActions.js";

const ENV = {};
const CHEFIN = { email: "chefin@example.de", role: "admin" };

async function konto(email, patch = {}) {
  const record = { ...createUserRecord({ email, name: "Test Person", passwordHash: "scrypt$geheim" }), ...patch };
  await putUser(record, ENV);
  return record;
}

async function kontoMitSitzung(email) {
  const record = await konto(email);
  addSessionToRecord(record, { sid: "s1", expiresAt: Date.now() + 3_600_000, userAgent: "Mac" });
  addSessionToRecord(record, { sid: "s2", expiresAt: Date.now() + 3_600_000, userAgent: "iPhone" });
  await putUser(record, ENV);
  return record;
}

test("sperren setzt den Status UND wirft alle Sitzungen raus", async () => {
  __clearMemoryStoreForTests();
  await kontoMitSitzung("opfer@example.de");
  const ergebnis = await setUserStatus("opfer@example.de", "blocked", { actor: CHEFIN, env: ENV });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.before.status, "active");
  assert.equal(ergebnis.after.status, "blocked");
  assert.equal(ergebnis.revokedSessions, 2, "ein gesperrtes Konto mit laufender Sitzung waere nicht gesperrt");
  assert.equal(ergebnis.after.activeSessions, 0);
});

test("man sperrt sich nicht selbst aus, waehrend man die Konsole bedient", async () => {
  __clearMemoryStoreForTests();
  await konto("chefin@example.de", { role: "admin" });
  const ergebnis = await setUserStatus("chefin@example.de", "blocked", { actor: CHEFIN, env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "admin_self_block_forbidden");
});

test("eine Aenderung, die nichts aendert, wird als solche gemeldet", async () => {
  __clearMemoryStoreForTests();
  await konto("wer@example.de");
  const ergebnis = await setUserStatus("wer@example.de", "active", { actor: CHEFIN, env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "admin_no_change");
});

test("entsperren stellt den Zugang wieder her, aber keine alte Sitzung", async () => {
  __clearMemoryStoreForTests();
  await kontoMitSitzung("opfer@example.de");
  await setUserStatus("opfer@example.de", "blocked", { actor: CHEFIN, env: ENV });
  const zurueck = await setUserStatus("opfer@example.de", "active", { actor: CHEFIN, env: ENV });
  assert.equal(zurueck.ok, true);
  assert.equal(zurueck.after.status, "active");
  assert.equal(zurueck.after.activeSessions, 0, "widerrufene Sitzungen bleiben widerrufen");
});

test("nur bekannte Rollen sind zuweisbar", async () => {
  __clearMemoryStoreForTests();
  await konto("wer@example.de");
  const ergebnis = await setUserRole("wer@example.de", "superadmin", { actor: CHEFIN, env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "admin_role_invalid");
  assert.ok(ergebnis.erlaubt.includes("support"));
  assert.equal(ergebnis.erlaubt.includes("superadmin"), false);
});

test("der letzte Owner ist geschuetzt — sonst sperrt sich die Organisation aus", async () => {
  __clearMemoryStoreForTests();
  await konto("owner@example.de", { role: "owner" });
  const letzter = await setUserRole("owner@example.de", "admin", { actor: CHEFIN, env: ENV, ownerCount: 1 });
  assert.equal(letzter.ok, false);
  assert.equal(letzter.error, "admin_last_owner_protected");

  const vonZweien = await setUserRole("owner@example.de", "admin", { actor: CHEFIN, env: ENV, ownerCount: 2 });
  assert.equal(vonZweien.ok, true);
  assert.equal(vonZweien.after.role, "admin");
});

test("niemand nimmt sich selbst die Rechte weg, waehrend er sie benutzt", async () => {
  __clearMemoryStoreForTests();
  await konto("chefin@example.de", { role: "admin" });
  const ergebnis = await setUserRole("chefin@example.de", "user", { actor: CHEFIN, env: ENV, ownerCount: 5 });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "admin_self_demote_forbidden");
});

test("Sitzungen einzeln oder alle widerrufen", async () => {
  __clearMemoryStoreForTests();
  await kontoMitSitzung("wer@example.de");
  const eine = await revokeUserSessions("wer@example.de", { onlySid: "s1", env: ENV });
  assert.equal(eine.revokedSessions, 1);
  assert.equal(eine.after.activeSessions, 1);

  const rest = await revokeUserSessions("wer@example.de", { env: ENV });
  assert.equal(rest.revokedSessions, 1);
  assert.equal(rest.after.activeSessions, 0);

  const nichts = await revokeUserSessions("wer@example.de", { env: ENV });
  assert.equal(nichts.error, "admin_no_change");
});

test("E-Mail von Hand bestaetigen entwertet den offenen Verifikationslink", async () => {
  __clearMemoryStoreForTests();
  await konto("neu@example.de", { verify: { tokenHash: "abc", expiresAt: "2026-08-01" } });
  const ergebnis = await markEmailVerified("neu@example.de", { env: ENV });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.after.emailVerified, true);

  const record = await getUserByEmail("neu@example.de", ENV);
  assert.equal(record.verify, null, "ein offener Link waere sonst weiter gueltig");
});

test("Login-Sperre aufheben ruehrt das Passwort nicht an", async () => {
  __clearMemoryStoreForTests();
  await konto("gesperrt@example.de", { loginGuard: { failedCount: 5, lockedUntil: "2026-07-28T13:00:00.000Z" } });
  const ergebnis = await clearLoginLock("gesperrt@example.de", { env: ENV });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.after.loginLockedUntil, null);

  const record = await getUserByEmail("gesperrt@example.de", ENV);
  assert.equal(record.passwordHash, "scrypt$geheim", "das Passwort bleibt unangetastet");
});

test("LOESCHEN ohne Freigabe-Nachweis wird abgewiesen", async () => {
  __clearMemoryStoreForTests();
  await konto("weg@example.de");
  const ergebnis = await deleteUserData("weg@example.de", { actor: CHEFIN, env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "admin_approval_required");
});

test("LOESCHEN entfernt die personenbezogenen Daten und laesst eine Huelle stehen", async () => {
  __clearMemoryStoreForTests();
  await kontoMitSitzung("weg@example.de");
  const ergebnis = await deleteUserData("weg@example.de", { actor: CHEFIN, approvalId: "ap_test", env: ENV });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.after.status, "deleted");

  const record = await getUserByEmail("weg@example.de", ENV);
  assert.equal(record.name, "");
  assert.equal(record.passwordHash, "");
  assert.equal(record.emailVerifiedAt, null);
  assert.deepEqual(record.sessions, []);
  assert.equal(record.verify, null);
  assert.equal(record.reset, null);
  assert.equal(record.deletedByApproval, "ap_test");
  // Die Huelle bleibt, damit dieselbe Adresse nicht sofort neu registriert wird
  // und die Audit-Spur nicht ins Leere zeigt.
  assert.equal(record.userId, ergebnis.before.userId);
  assert.equal(record.status, "deleted");
});

test("man loescht sich nicht selbst", async () => {
  __clearMemoryStoreForTests();
  await konto("chefin@example.de", { role: "admin" });
  const ergebnis = await deleteUserData("chefin@example.de", { actor: CHEFIN, approvalId: "ap_test", env: ENV });
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.error, "admin_self_delete_forbidden");
});

test("auditView zeigt den Unterschied, nicht den Datensatz", () => {
  const sicht = auditView({
    userId: "u_1", email: "a@example.de", name: "Name", passwordHash: "scrypt$x",
    role: "support", status: "active", emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    verify: { tokenHash: "geheim" }, sessions: []
  });
  assert.deepEqual(Object.keys(sicht).sort(),
    ["activeSessions", "emailVerified", "loginLockedUntil", "role", "status", "userId"]);
  const roh = JSON.stringify(sicht);
  assert.equal(roh.includes("scrypt"), false);
  assert.equal(roh.includes("geheim"), false);
  assert.equal(roh.includes("Name"), false);
});

test("ein unbekanntes Konto ist kein stiller Erfolg", async () => {
  __clearMemoryStoreForTests();
  for (const lauf of [
    () => setUserStatus("gibtsnicht@example.de", "blocked", { actor: CHEFIN, env: ENV }),
    () => setUserRole("gibtsnicht@example.de", "support", { actor: CHEFIN, env: ENV }),
    () => revokeUserSessions("gibtsnicht@example.de", { env: ENV }),
    () => markEmailVerified("gibtsnicht@example.de", { env: ENV }),
    () => clearLoginLock("gibtsnicht@example.de", { env: ENV }),
    () => deleteUserData("gibtsnicht@example.de", { actor: CHEFIN, approvalId: "ap_x", env: ENV })
  ]) {
    const ergebnis = await lauf();
    assert.equal(ergebnis.ok, false);
    assert.equal(ergebnis.error, "admin_user_not_found");
  }
});

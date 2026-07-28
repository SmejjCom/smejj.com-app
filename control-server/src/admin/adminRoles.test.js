// smejj.com — Unit-Tests fuer das Rollenmodell des Adminbereichs.
// Ausfuehren: node --test control-server/src/admin/adminRoles.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ROLES, GRANT, PERMISSIONS, can, isAdminRole, isAllowed, permissionsFor } from "./adminRoles.js";

test("fail-closed: unbekannte Rolle und unbekannte Berechtigung ergeben deny", () => {
  assert.equal(can("hausmeister", "users.read"), GRANT.deny);
  assert.equal(can("owner", "datenbank.dumpen"), GRANT.deny);
  assert.equal(can("", ""), GRANT.deny);
  assert.equal(can(null, null), GRANT.deny);
});

test("ein gewoehnliches Konto ist kein stiller Readonly-Admin", () => {
  assert.equal(isAdminRole("user"), false);
  assert.equal(can("user", "users.read"), GRANT.deny);
  assert.equal(ADMIN_ROLES.includes("user"), false);
});

test("Audit-Log ist fuer jede Rolle unveraenderlich — auch fuer den Owner", () => {
  for (const role of ADMIN_ROLES) {
    assert.equal(can(role, "audit.write"), GRANT.deny, `${role} darf das Audit-Log nicht schreiben`);
    assert.equal(can(role, "audit.delete"), GRANT.deny, `${role} darf das Audit-Log nicht loeschen`);
  }
});

test("Matrix aus Modul C: Trennung von Support und Finance", () => {
  // Support hilft, sieht aber keine Abrechnung und loescht nichts.
  assert.equal(can("support", "users.read"), GRANT.allow);
  assert.equal(can("support", "users.block"), GRANT.deny);
  assert.equal(can("support", "billing.write"), GRANT.deny);
  // Finance sieht Abrechnung, aber keine Chat-Inhalte.
  assert.equal(can("finance", "billing.write"), GRANT.allow);
  assert.equal(can("finance", "users.content.read"), GRANT.deny);
  assert.equal(can("finance", "audit.read"), GRANT.allow);
});

test("dual und consent gelten nicht als sofort erlaubt", () => {
  assert.equal(can("admin", "users.delete"), GRANT.dual);
  assert.equal(isAllowed("admin", "users.delete"), false);
  assert.equal(can("support", "impersonation.start"), GRANT.consent);
  assert.equal(isAllowed("support", "impersonation.start"), false);
  assert.equal(isAllowed("owner", "users.delete"), true);
});

test("readonly darf ausschliesslich Nutzer sehen", () => {
  const rights = permissionsFor("readonly");
  const erlaubt = PERMISSIONS.filter((permission) => rights[permission] !== GRANT.deny);
  assert.deepEqual(erlaubt, ["users.read"]);
});

test("Auditor liest Nachweise, greift aber nirgends ein", () => {
  const rights = permissionsFor("auditor");
  assert.equal(rights["audit.read"], GRANT.allow);
  assert.equal(rights["users.read"], GRANT.allow);
  assert.equal(rights["users.block"], GRANT.deny);
  assert.equal(rights["models.write"], GRANT.deny);
  assert.equal(rights["apikeys.revoke"], GRANT.deny);
});

test("Gross- und Kleinschreibung der Rolle aendert nichts", () => {
  assert.equal(can("OWNER", "models.write"), GRANT.allow);
  assert.equal(can("  Admin  ", "apikeys.revoke"), GRANT.allow);
});

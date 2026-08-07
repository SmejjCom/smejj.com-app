// smejj.com — Unit-Tests fuer die Autorisierung des Adminbereichs.
// Ausfuehren: node --test control-server/src/admin/adminAuth.test.js
//
// Ohne IDrive-Konfiguration nutzt der Nutzer-Store seinen In-Memory-Zweig.
// Genau das brauchen die Tests: echtes Store-Verhalten ohne Netz.
import test from "node:test";
import assert from "node:assert/strict";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../auth/emailUserStore.js";
import { bootstrapOwnerEmails, checkActorPermission, requireAdminPermission, resolveAdminActor } from "./adminAuth.js";

const ENV = {}; // keine IDrive-Konfiguration -> Memory-Store

// Konten sind hier standardmaessig bestaetigt: diese Datei prueft ROLLEN, und
// die Bestaetigungspflicht hat eigene Tests (routes/adminVerifiziert.test.js).
// Wer den unbestaetigten Fall braucht, uebergibt emailVerifiedAt: null.
async function seed(email, patch = {}) {
  __clearMemoryStoreForTests();
  const record = {
    ...createUserRecord({ email, name: "Test", passwordHash: "scrypt$x" }),
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    ...patch
  };
  await putUser(record, ENV);
  return record;
}

test("ohne E-Mail in der Sitzung: 401, kein Store-Zugriff noetig", async () => {
  const result = await resolveAdminActor({}, { env: ENV });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error, "admin_authentication_required");
});

test("neu angelegte Konten sind niemals Admin", async () => {
  const record = await seed("neu@example.de");
  assert.equal(record.role, "user");
  assert.equal(record.status, "active");
  const result = await resolveAdminActor({ email: "neu@example.de" }, { env: ENV });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error, "admin_role_required");
});

test("die Rolle im Token ist wirkungslos — es zaehlt nur der Store", async () => {
  await seed("faelscher@example.de"); // Rolle "user"
  // Ein Angreifer, der es schafft, zusaetzliche Felder in die Sitzung zu bekommen:
  const result = await resolveAdminActor(
    { email: "faelscher@example.de", role: "owner", isAdmin: true },
    { env: ENV }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "admin_role_required");
});

test("hinterlegte Adminrolle laesst durch", async () => {
  await seed("chefin@example.de", { role: "admin" });
  const result = await resolveAdminActor({ email: "chefin@example.de" }, { env: ENV });
  assert.equal(result.ok, true);
  assert.equal(result.actor.role, "admin");
  assert.equal(result.actor.roleSource, "store");
});

test("gesperrtes Konto verliert den Zugang, auch mit Adminrolle", async () => {
  await seed("gesperrt@example.de", { role: "admin", status: "blocked" });
  const result = await resolveAdminActor({ email: "gesperrt@example.de" }, { env: ENV });
  assert.equal(result.ok, false);
  assert.equal(result.error, "admin_account_not_active");
});

test("unbekannte Rolle im Datensatz faellt auf user zurueck, nicht nach oben", async () => {
  await seed("kreativ@example.de", { role: "superadmin" });
  const result = await resolveAdminActor({ email: "kreativ@example.de" }, { env: ENV });
  assert.equal(result.ok, false);
  assert.equal(result.error, "admin_role_required");
});

test("Owner-Bootstrap aus der Umgebung greift und ist als solcher erkennbar", async () => {
  await seed("betreiber@example.de"); // Rolle "user"
  const env = { SMEJJ_ADMIN_OWNER_EMAILS: "betreiber@example.de, zweite@example.de" };
  const result = await resolveAdminActor({ email: "betreiber@example.de" }, { env });
  assert.equal(result.ok, true);
  assert.equal(result.actor.role, "owner");
  assert.equal(result.actor.roleSource, "bootstrap");
  assert.equal(result.actor.storedRole, "user"); // die echte Rolle bleibt sichtbar
});

test("Bootstrap-Liste toleriert Trennzeichen und Schreibweisen", () => {
  const emails = bootstrapOwnerEmails({ SMEJJ_ADMIN_OWNER_EMAILS: " A@Example.DE ;b@example.de\nc@example.de" });
  assert.deepEqual([...emails].sort(), ["a@example.de", "b@example.de", "c@example.de"]);
  assert.equal(bootstrapOwnerEmails({}).size, 0);
  assert.equal(bootstrapOwnerEmails({ SMEJJ_ADMIN_OWNER_EMAILS: "kein-email" }).size, 0);
});

test("Bootstrap wirkt nicht fuer fremde Adressen", async () => {
  await seed("fremd@example.de");
  const env = { SMEJJ_ADMIN_OWNER_EMAILS: "betreiber@example.de" };
  const result = await resolveAdminActor({ email: "fremd@example.de" }, { env });
  assert.equal(result.ok, false);
  assert.equal(result.error, "admin_role_required");
});

test("requireAdminPermission verbindet Sitzung und Berechtigung", async () => {
  await seed("support@example.de", { role: "support" });
  const erlaubt = await requireAdminPermission({ email: "support@example.de" }, "users.read", { env: ENV });
  assert.equal(erlaubt.ok, true);

  const verboten = await requireAdminPermission({ email: "support@example.de" }, "billing.write", { env: ENV });
  assert.equal(verboten.ok, false);
  assert.equal(verboten.status, 403);
  assert.equal(verboten.error, "admin_permission_denied");
});

test("dual und consent werden als eigener Grund abgewiesen, nicht als pauschales Verbot", () => {
  const dual = checkActorPermission({ role: "admin" }, "users.delete");
  assert.equal(dual.ok, false);
  assert.equal(dual.error, "admin_second_approval_required");

  const consent = checkActorPermission({ role: "support" }, "impersonation.start");
  assert.equal(consent.ok, false);
  assert.equal(consent.error, "admin_subject_consent_required");
});

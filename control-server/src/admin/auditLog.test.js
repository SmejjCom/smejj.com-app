// smejj.com — Unit-Tests fuer das Audit-Log.
// Ausfuehren: node --test control-server/src/admin/auditLog.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  __clearAuditMemoryForTests, appendAuditEntry, entryHash, readAuditPage, redact, verifyAuditChain
} from "./auditLog.js";

const ENV = {}; // keine IDrive-Konfiguration -> Memory-Zweig
const ACTOR = { email: "chefin@example.de", role: "admin", roleSource: "store" };

test("ohne Grund keine Aktion", async () => {
  __clearAuditMemoryForTests();
  const ohneGrund = await appendAuditEntry({ actor: ACTOR, action: "user.block", target: "#u_1" }, { env: ENV });
  assert.equal(ohneGrund.ok, false);
  assert.equal(ohneGrund.error, "audit_reason_required");

  const ohneAktion = await appendAuditEntry({ actor: ACTOR, reason: "weil" }, { env: ENV });
  assert.equal(ohneAktion.error, "audit_action_required");

  const ohneAkteur = await appendAuditEntry({ action: "user.block", reason: "weil" }, { env: ENV });
  assert.equal(ohneAkteur.error, "audit_actor_required");
});

test("Eintraege bilden eine geschlossene Kette", async () => {
  __clearAuditMemoryForTests();
  for (const nummer of [1, 2, 3]) {
    const result = await appendAuditEntry({
      actor: ACTOR,
      action: "user.block",
      target: `#u_${nummer}`,
      before: { status: "active" },
      after: { status: "blocked" },
      reason: `Missbrauch bestaetigt ${nummer}`,
      ip: "89.14.0.1"
    }, { env: ENV });
    assert.equal(result.ok, true);
  }

  const page = await readAuditPage({ env: ENV });
  assert.equal(page.entries.length, 3);
  assert.equal(page.entries[0].target, "#u_3", "juengster Eintrag zuerst");

  const chain = verifyAuditChain(page.entries);
  assert.equal(chain.ok, true, chain.reason);

  // Der erste Eintrag haengt am Genesis-Hash.
  assert.equal(page.entries[2].prevHash, "0".repeat(64));
  // Jeder weitere zeigt auf seinen Vorgaenger.
  assert.equal(page.entries[1].prevHash, page.entries[2].hash);
  assert.equal(page.entries[0].prevHash, page.entries[1].hash);
});

test("nachtraegliche Aenderung bricht die Kette sichtbar", async () => {
  __clearAuditMemoryForTests();
  for (const nummer of [1, 2, 3]) {
    await appendAuditEntry({ actor: ACTOR, action: "user.block", target: `#u_${nummer}`, reason: "Grund" }, { env: ENV });
  }
  const page = await readAuditPage({ env: ENV });

  // Jemand faelscht den Grund eines Eintrags.
  const gefaelscht = page.entries.map((entry, index) => (
    index === 1 ? { ...entry, reason: "harmlos" } : entry
  ));
  const chain = verifyAuditChain(gefaelscht);
  assert.equal(chain.ok, false);
  assert.equal(chain.reason, "entry_hash_mismatch");
  assert.equal(chain.brokenAt, 1);
});

test("eine herausgeschnittene Zeile bleibt nicht unbemerkt", async () => {
  __clearAuditMemoryForTests();
  for (const nummer of [1, 2, 3]) {
    await appendAuditEntry({ actor: ACTOR, action: "user.block", target: `#u_${nummer}`, reason: "Grund" }, { env: ENV });
  }
  const page = await readAuditPage({ env: ENV });
  const ohneMitte = [page.entries[0], page.entries[2]];
  const chain = verifyAuditChain(ohneMitte);
  assert.equal(chain.ok, false);
  assert.equal(chain.reason, "chain_link_mismatch");
});

test("die Pruefsumme haengt nicht an der Feldreihenfolge", () => {
  const links = { version: 1, at: "2026-07-28T10:00:00.000Z", action: "x", prevHash: "a" };
  const rechts = { prevHash: "a", action: "x", at: "2026-07-28T10:00:00.000Z", version: 1 };
  assert.equal(entryHash(links), entryHash(rechts));
});

test("Geheimnisse landen nicht im Nachweis", () => {
  const redigiert = redact({
    email: "m.roth@example.de",
    passwordHash: "scrypt$geheim",
    verify: { tokenHash: "abc", expiresAt: "2026-08-01" },
    apiKey: "sk-live-123",
    nested: { secret: "psst", harmlos: "sichtbar" }
  });
  assert.equal(redigiert.passwordHash, "[entfernt]");
  assert.equal(redigiert.apiKey, "[entfernt]");
  assert.equal(redigiert.verify.tokenHash, "[entfernt]");
  assert.equal(redigiert.nested.secret, "[entfernt]");
  assert.equal(redigiert.nested.harmlos, "sichtbar");
  assert.equal(redigiert.email, "m.roth@example.de");
});

test("ueberlange Texte werden gekappt statt abgelehnt", () => {
  const lang = "x".repeat(5000);
  assert.equal(redact(lang).length, 400);
});

test("die Seite ist gedeckelt", async () => {
  __clearAuditMemoryForTests();
  for (let index = 0; index < 12; index += 1) {
    await appendAuditEntry({ actor: ACTOR, action: "index.rebuild", target: "x", reason: "Turnus" }, { env: ENV });
  }
  const page = await readAuditPage({ limit: 5, env: ENV });
  assert.equal(page.entries.length, 5);
  assert.equal(page.total, 12);
  assert.equal(verifyAuditChain(page.entries).ok, true, "auch ein Ausschnitt muss in sich stimmig sein");
});

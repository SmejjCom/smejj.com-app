// smejj.com — Unit-Tests fuer das Audit-Log.
// Ausfuehren: node --test control-server/src/admin/auditLog.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  __clearAuditMemoryForTests, appendAuditEntry, entryHash, monthSpan, readAuditPage, redact, verifyAuditChain
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

// ---- Begrenzung des Listings (Performance-Lock) ------------------------------

const S3_ENV = {
  IDRIVE_E2_ENDPOINT: "https://s3.example.com",
  IDRIVE_E2_REGION: "us-west-2",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "testeimer"
};

function antwort(status, body) {
  const bytes = Buffer.from(String(body), "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => '"etag-test"' },
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function s3MitZaehler(objekte, protokoll) {
  return async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const schluessel = decodeURIComponent(url.pathname.replace(`/${S3_ENV.IDRIVE_E2_BUCKET}/`, ""));
    if ((init.method || "GET") === "PUT") { objekte.set(schluessel, String(init.body)); return antwort(200, ""); }
    if (url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") || "";
      protokoll.push(prefix);
      const keys = [...objekte.keys()].filter((key) => key.startsWith(prefix));
      return antwort(200, `<?xml version="1.0"?><ListBucketResult>${
        keys.map((key) => `<Key>${key}</Key>`).join("")
      }<IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
    if (!objekte.has(schluessel)) return antwort(404, "");
    return antwort(200, objekte.get(schluessel));
  };
}

function auditObjekt(iso) {
  const eintrag = { version: 1, at: iso, action: "user.block", target: "x", prevHash: "0".repeat(64) };
  eintrag.hash = entryHash(eintrag);
  return [`admin/audit/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.replace(/[:.]/g, "-")}-aa.json`,
    JSON.stringify(eintrag)];
}

test("das Listing scannt nur zwei Monats-Prefixe statt des ganzen Logs", async () => {
  const objekte = new Map([
    auditObjekt("2026-07-28T09:00:00.000Z"),
    auditObjekt("2026-07-02T09:00:00.000Z"),
    auditObjekt("2026-06-30T09:00:00.000Z"),
    auditObjekt("2023-01-05T09:00:00.000Z") // uraltes Log, darf nicht mitgescannt werden
  ]);
  const protokoll = [];
  const page = await readAuditPage({
    env: S3_ENV, limit: 50, nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitZaehler(objekte, protokoll)
  });
  assert.deepEqual(protokoll, ["admin/audit/2026/07/", "admin/audit/2026/06/"]);
  assert.equal(page.window, "2m");
  assert.equal(page.entries.length, 3, "der Eintrag von 2023 liegt ausserhalb des Zeitraums");
  assert.equal(page.entries[0].at, "2026-07-28T09:00:00.000Z", "juengster zuerst");
});

test("liegt im Zeitraum nichts, wird einmalig vollstaendig gelistet", async () => {
  const objekte = new Map([auditObjekt("2023-01-05T09:00:00.000Z")]);
  const protokoll = [];
  const page = await readAuditPage({
    env: S3_ENV, limit: 50, nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitZaehler(objekte, protokoll)
  });
  assert.equal(protokoll.length, 3, "zwei Monate, dann einmal vollstaendig");
  assert.equal(protokoll[2], "admin/audit/");
  assert.equal(page.window, "all");
  assert.equal(page.entries.length, 1);
});

// ---- Waehlbarer Zeitraum -----------------------------------------------------

test("monthSpan: ohne Zeitraum genau zwei Monate, mit Zeitraum genau die dazwischen", () => {
  const ohne = monthSpan({ nowMs: Date.parse("2026-07-28T10:00:00Z") });
  assert.deepEqual(ohne.prefixes, ["admin/audit/2026/07/", "admin/audit/2026/06/"]);
  assert.equal(ohne.label, "2m");

  const mit = monthSpan({ from: "2026-04-15", to: "2026-07-03", nowMs: Date.parse("2026-07-28T10:00:00Z") });
  assert.deepEqual(mit.prefixes, [
    "admin/audit/2026/07/", "admin/audit/2026/06/", "admin/audit/2026/05/", "admin/audit/2026/04/"
  ]);
  assert.equal(mit.label, "4m");
});

test("monthSpan: der Jahreswechsel wird korrekt zurueckgerechnet", () => {
  const span = monthSpan({ from: "2025-11-20", to: "2026-01-10" });
  assert.deepEqual(span.prefixes, ["admin/audit/2026/01/", "admin/audit/2025/12/", "admin/audit/2025/11/"]);
});

test("monthSpan: ein absurder Zeitraum wird gedeckelt statt das Log abzuklappern", () => {
  const span = monthSpan({ from: "1970-01-01", to: "2026-07-28", maxMonths: 24 });
  assert.equal(span.prefixes.length, 24);
  assert.equal(span.truncated, true, "die Deckelung muss sichtbar sein");
});

test("monthSpan: unbrauchbare Datumsangaben ergeben keinen Scan", () => {
  const span = monthSpan({ from: "kein-datum", to: "2026-07-28" });
  assert.deepEqual(span.prefixes, []);
  assert.equal(span.label, "invalid");
});

test("mit Zeitraum wird NICHT auf das gesamte Log zurueckgefallen", async () => {
  const objekte = new Map([auditObjekt("2023-01-05T09:00:00.000Z")]);
  const protokoll = [];
  const page = await readAuditPage({
    env: S3_ENV, from: "2026-07-01", to: "2026-07-31",
    nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitZaehler(objekte, protokoll)
  });
  assert.equal(page.entries.length, 0, "der Eintrag von 2023 liegt ausserhalb");
  assert.equal(protokoll.includes("admin/audit/"), false,
    "eine leere Antwort auf einen Zeitraum darf nicht in eine Antwort ueber alles umschlagen");
});

test("der Zeitraum filtert auch tagesgenau, nicht nur monatsweise", async () => {
  const objekte = new Map([
    auditObjekt("2026-07-05T09:00:00.000Z"),
    auditObjekt("2026-07-20T09:00:00.000Z"),
    auditObjekt("2026-07-28T09:00:00.000Z")
  ]);
  const page = await readAuditPage({
    env: S3_ENV, from: "2026-07-10", to: "2026-07-25",
    nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitZaehler(objekte, [])
  });
  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].at, "2026-07-20T09:00:00.000Z");
});

// ---- Wiederholung beim Listen ------------------------------------------------
// Befund 2026-08-07: ein einziger Fehlversuch beim Speicher kippte die ganze
// Seite (503 in der Konsole, "Das Audit-Log liess sich nicht lesen"). Lesen ist
// gefahrlos wiederholbar — also muss es wiederholt werden.

/** Wie s3MitZaehler, laesst aber die ersten `fehlschlaege` LIST-Aufrufe scheitern. */
function s3MitAussetzern(objekte, fehlschlaege, art = "status") {
  let gescheitert = 0;
  return async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const schluessel = decodeURIComponent(url.pathname.replace(`/${S3_ENV.IDRIVE_E2_BUCKET}/`, ""));
    if (url.searchParams.get("list-type") === "2") {
      if (gescheitert < fehlschlaege) {
        gescheitert += 1;
        if (art === "wurf") throw new Error("socket hang up");
        return antwort(503, "<Error><Code>SlowDown</Code></Error>");
      }
      const prefix = url.searchParams.get("prefix") || "";
      const keys = [...objekte.keys()].filter((key) => key.startsWith(prefix));
      return antwort(200, `<?xml version="1.0"?><ListBucketResult>${
        keys.map((key) => `<Key>${key}</Key>`).join("")
      }<IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
    if (!objekte.has(schluessel)) return antwort(404, "");
    return antwort(200, objekte.get(schluessel));
  };
}

test("ein einzelner Aussetzer beim Speicher kippt die Seite nicht mehr", async () => {
  const objekte = new Map([auditObjekt("2026-07-28T09:00:00.000Z")]);
  const page = await readAuditPage({
    env: S3_ENV, limit: 50, nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitAussetzern(objekte, 1)
  });
  assert.equal(page.ok, true, "der zweite Versuch muss die Seite retten");
  assert.equal(page.entries.length, 1);
});

test("ein abgerissener Socket wird wiederholt, nicht durchgereicht", async () => {
  const objekte = new Map([auditObjekt("2026-07-28T09:00:00.000Z")]);
  const page = await readAuditPage({
    env: S3_ENV, limit: 50, nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitAussetzern(objekte, 1, "wurf")
  });
  assert.equal(page.ok, true, "ein Netzfehler darf nicht als Ausnahme nach oben schlagen");
  assert.equal(page.entries.length, 1);
});

test("bleibt der Speicher weg, sagt die Antwort WARUM", async () => {
  const objekte = new Map([auditObjekt("2026-07-28T09:00:00.000Z")]);
  const page = await readAuditPage({
    env: S3_ENV, limit: 50, nowMs: Date.parse("2026-07-28T10:00:00.000Z"),
    fetchImpl: s3MitAussetzern(objekte, 99)
  });
  assert.equal(page.ok, false);
  assert.equal(page.error, "audit_list_failed");
  assert.equal(page.grund, "s3_status_503", "der Statuscode des Speichers muss mitkommen");
});

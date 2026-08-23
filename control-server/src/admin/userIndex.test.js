// smejj.com — Unit-Tests fuer den Nutzer-Index.
// Ausfuehren: node --test control-server/src/admin/userIndex.test.js
//
// Der Index ist der einzige Weg, Konten ueberhaupt aufzulisten: sie liegen als
// einzelne Objekte unter auth/email-users/{sha256(email)}.json und aus einem
// Hash laesst sich keine Liste bilden. Getestet wird gegen einen S3-Doppelgaenger,
// nicht gegen das Netz.
import test from "node:test";
import assert from "node:assert/strict";
import {
  indexEntryFrom, invalidateUserIndexCache, readUserIndex, readUserIndexFresh, rebuildUserIndex, selectFromIndex
} from "./userIndex.js";

const ENV = {
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

/** Minimaler S3-Doppelgaenger: LIST (v2), GET, PUT auf einer Map. */
function s3Doppelgaenger(objekte) {
  return async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const schluessel = decodeURIComponent(url.pathname.replace(`/${ENV.IDRIVE_E2_BUCKET}/`, ""));
    if ((init.method || "GET") === "PUT") {
      objekte.set(schluessel, Buffer.isBuffer(init.body) ? init.body.toString("utf8") : String(init.body));
      return antwort(200, "");
    }
    if (url.searchParams.get("list-type") === "2") {
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

function konto(email, patch = {}) {
  return JSON.stringify({
    version: 1,
    userId: `u_${email.split("@")[0]}`,
    email,
    name: email.split("@")[0],
    method: "email",
    passwordHash: "scrypt$niemals-sichtbar",
    emailVerifiedAt: "2026-03-12T09:41:00.000Z",
    createdAt: "2026-03-12T09:40:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    verify: { tokenHash: "geheim", expiresAt: "2026-03-13" },
    reset: null,
    loginGuard: { failedCount: 0, lockedUntil: null },
    sessions: [],
    ...patch
  });
}

invalidateUserIndexCache();

test("ohne Objektspeicher gibt es keinen Index — und keine stille Leere", async () => {
  const leer = await rebuildUserIndex({ env: {} });
  assert.equal(leer.ok, false);
  assert.equal(leer.error, "index_requires_object_storage");
});

test("solange nie gebaut wurde, meldet das Lesen einen klaren Grund", async () => {
  const objekte = new Map();
  const gelesen = await readUserIndex({ env: ENV, fetchImpl: s3Doppelgaenger(objekte) });
  assert.equal(gelesen.ok, false);
  assert.equal(gelesen.error, "index_not_built");
});

test("Neubau findet alle Konten und sortiert nach Registrierung, neueste zuerst", async () => {
  const objekte = new Map([
    ["auth/email-users/aaa.json", konto("alt@example.de", { createdAt: "2026-01-02T00:00:00.000Z" })],
    ["auth/email-users/bbb.json", konto("neu@example.de", { createdAt: "2026-07-27T00:00:00.000Z" })],
    ["auth/email-users/ccc.json", konto("mittel@example.de", { createdAt: "2026-05-19T00:00:00.000Z" })]
  ]);
  const fetchImpl = s3Doppelgaenger(objekte);
  const gebaut = await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });
  assert.equal(gebaut.ok, true);
  assert.equal(gebaut.count, 3);
  assert.equal(gebaut.unreadable, 0);

  const gelesen = await readUserIndex({ env: ENV, fetchImpl });
  assert.equal(gelesen.ok, true);
  assert.equal(gelesen.builtAt, "2026-07-28T10:00:00.000Z");
  assert.deepEqual(gelesen.entries.map((entry) => entry.email), [
    "neu@example.de", "mittel@example.de", "alt@example.de"
  ]);
});

test("der Index traegt keine Geheimnisse", async () => {
  const objekte = new Map([["auth/email-users/aaa.json", konto("m.roth@example.de")]]);
  const fetchImpl = s3Doppelgaenger(objekte);
  await rebuildUserIndex({ env: ENV, fetchImpl });

  const roh = objekte.get("admin/index/users.json");
  assert.equal(roh.includes("scrypt$"), false, "kein Passwort-Hash im Index");
  assert.equal(roh.includes("passwordHash"), false);
  assert.equal(roh.includes("tokenHash"), false);
  assert.equal(roh.includes("m.roth@example.de"), true, "die Adresse selbst wird gebraucht");
});

test("unlesbare Objekte werden gezaehlt statt verschwiegen", async () => {
  const objekte = new Map([
    ["auth/email-users/aaa.json", konto("gut@example.de")],
    ["auth/email-users/bbb.json", "{kaputt"],
    ["auth/email-users/ccc.json", JSON.stringify({ userId: "u_ohne_mail" })]
  ]);
  const fetchImpl = s3Doppelgaenger(objekte);
  const gebaut = await rebuildUserIndex({ env: ENV, fetchImpl });
  assert.equal(gebaut.count, 1);
  assert.equal(gebaut.unreadable, 2);
});

test("indexEntryFrom zaehlt nur lebende Sitzungen", () => {
  const inEinerStunde = new Date(Date.now() + 3_600_000).toISOString();
  const gestern = new Date(Date.now() - 86_400_000).toISOString();
  const entry = indexEntryFrom({
    userId: "u_1", email: "a@example.de", name: "A", role: "support", status: "active",
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    sessions: [
      { sid: "s1", expiresAt: inEinerStunde, revokedAt: null },
      { sid: "s2", expiresAt: inEinerStunde, revokedAt: "2026-07-01T00:00:00.000Z" },
      { sid: "s3", expiresAt: gestern, revokedAt: null }
    ]
  });
  assert.equal(entry.activeSessions, 1);
  assert.equal(entry.role, "support");
  assert.equal(entry.lastSeenAt, null, "ohne lastSeenAt/createdAt in den Sitzungen bleibt 'zuletzt' leer");
  const mitZeit = indexEntryFrom({ userId: "u_2", email: "b@example.de", sessions: [
    { sid: "a", createdAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-02T00:00:00.000Z", expiresAt: gestern },
    { sid: "b", createdAt: "2026-08-20T00:00:00.000Z", lastSeenAt: "2026-08-21T00:00:00.000Z", expiresAt: gestern, revokedAt: "2026-08-22T00:00:00.000Z" }
  ] });
  assert.equal(mitZeit.lastSeenAt, "2026-08-21T00:00:00.000Z", "die juengste Beruehrung zaehlt, auch einer widerrufenen Sitzung");
  assert.equal(entry.emailVerified, true);
  assert.equal("passwordHash" in entry, false);
});

test("Bestandskonten ohne Rollenfeld erscheinen als user/active", () => {
  const entry = indexEntryFrom({ userId: "u_alt", email: "alt@example.de" });
  assert.equal(entry.role, "user");
  assert.equal(entry.status, "active");
});

test("Filtern und Blaettern arbeiten auf dem gelesenen Index", () => {
  const entries = [
    { userId: "u_1", email: "maria@example.de", name: "Maria Roth", role: "user", status: "active" },
    { userId: "u_2", email: "tobias@example.com", name: "Tobias Lenz", role: "user", status: "blocked" },
    { userId: "u_3", email: "chefin@example.de", name: "A. Bergmann", role: "admin", status: "active" }
  ];
  assert.equal(selectFromIndex(entries, { query: "roth" }).total, 1);
  assert.equal(selectFromIndex(entries, { query: "EXAMPLE.DE" }).total, 2);
  assert.equal(selectFromIndex(entries, { role: "admin" }).total, 1);
  assert.equal(selectFromIndex(entries, { status: "blocked" }).total, 1);
  assert.equal(selectFromIndex(entries, { query: "u_3" }).entries[0].email, "chefin@example.de");

  const seite = selectFromIndex(entries, { limit: 2, offset: 2 });
  assert.equal(seite.total, 3);
  assert.equal(seite.entries.length, 1);

  // Deckel: mehr als 200 je Seite gibt es nicht.
  assert.equal(selectFromIndex(entries, { limit: 9999 }).limit, 200);
});

test("Cache: der Index wird nicht bei jeder Anfrage neu geladen", async () => {
  invalidateUserIndexCache();
  const objekte = new Map([["auth/email-users/aaa.json", konto("a@example.de")]]);
  let getAufrufe = 0;
  const basis = s3Doppelgaenger(objekte);
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if ((init?.method || "GET") === "GET" && u.searchParams.get("list-type") !== "2"
      && u.pathname.includes("admin/index/users.json")) getAufrufe += 1;
    return basis(url, init);
  };
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });

  const t0 = Date.parse("2026-07-28T10:00:05.000Z");
  await readUserIndex({ env: ENV, fetchImpl, nowMs: t0 });
  await readUserIndex({ env: ENV, fetchImpl, nowMs: t0 + 1_000 });
  await readUserIndex({ env: ENV, fetchImpl, nowMs: t0 + 20_000 });
  assert.equal(getAufrufe, 1, "drei Anfragen innerhalb von 30 s duerfen nur einmal laden");

  await readUserIndex({ env: ENV, fetchImpl, nowMs: t0 + 31_000 });
  assert.equal(getAufrufe, 2, "nach Ablauf der 30 s wird wieder geladen");
});

test("Cache verschleiert das Alter des Index nicht", async () => {
  invalidateUserIndexCache();
  const objekte = new Map([["auth/email-users/aaa.json", konto("a@example.de")]]);
  const fetchImpl = s3Doppelgaenger(objekte);
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });

  const frueh = await readUserIndex({ env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T10:00:05.000Z") });
  const spaet = await readUserIndex({ env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T10:00:25.000Z") });
  assert.equal(frueh.ageSeconds, 5);
  assert.equal(spaet.ageSeconds, 25, "aus dem Cache, aber das Alter bleibt ehrlich");
});

test("ein Neubau macht den Cache sofort ungueltig", async () => {
  invalidateUserIndexCache();
  const objekte = new Map([["auth/email-users/aaa.json", konto("a@example.de")]]);
  const fetchImpl = s3Doppelgaenger(objekte);
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });
  const vorher = await readUserIndex({ env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T10:00:01.000Z") });
  assert.equal(vorher.count, 1);

  objekte.set("auth/email-users/bbb.json", konto("b@example.de"));
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:02.000Z" });
  const nachher = await readUserIndex({ env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T10:00:03.000Z") });
  assert.equal(nachher.count, 2, "der frische Stand muss sofort sichtbar sein");
});

// ---- Auffrischung ohne Zeitgeber ---------------------------------------------

test("ein frischer Index loest keinen Neubau aus", async () => {
  invalidateUserIndexCache();
  const objekte = new Map([["auth/email-users/aaa.json", konto("a@example.de")]]);
  let neubauten = 0;
  const basis = s3Doppelgaenger(objekte);
  const fetchImpl = async (url, init) => {
    if ((init?.method || "GET") === "PUT" && String(url).includes("admin/index/users.json")) neubauten += 1;
    return basis(url, init);
  };
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });
  assert.equal(neubauten, 1);

  const ergebnis = await readUserIndexFresh({
    env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T10:01:00.000Z"), staleAfterSeconds: 900
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.refreshing, false);
  assert.equal(neubauten, 1, "60 Sekunden alt ist nicht veraltet");
});

test("ein veralteter Index wird im Hintergrund erneuert — die Antwort wartet nicht", async () => {
  invalidateUserIndexCache();
  const objekte = new Map([["auth/email-users/aaa.json", konto("a@example.de")]]);
  let neubauten = 0;
  const basis = s3Doppelgaenger(objekte);
  const fetchImpl = async (url, init) => {
    if ((init?.method || "GET") === "PUT" && String(url).includes("admin/index/users.json")) neubauten += 1;
    return basis(url, init);
  };
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });
  invalidateUserIndexCache(); // Cache leeren, damit das ECHTE Alter zaehlt

  const ergebnis = await readUserIndexFresh({
    env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T11:00:00.000Z"), staleAfterSeconds: 900
  });
  assert.equal(ergebnis.ok, true, "die Liste kommt sofort, trotz Neubau");
  assert.equal(ergebnis.refreshing, true, "der Vermerk muss mit");
  assert.equal(ergebnis.count, 1, "geliefert wird der vorhandene Stand, nicht nichts");

  await new Promise((fertig) => setTimeout(fertig, 30));
  assert.equal(neubauten, 2, "der Neubau ist im Hintergrund gelaufen");
});

test("ein fehlgeschlagener Neubau kippt die Liste nicht", async () => {
  invalidateUserIndexCache();
  const objekte = new Map([["auth/email-users/aaa.json", konto("a@example.de")]]);
  const basis = s3Doppelgaenger(objekte);
  let erlaubeNeubau = true;
  const fetchImpl = async (url, init) => {
    if (!erlaubeNeubau && new URL(url).searchParams.get("list-type") === "2") throw new Error("IDrive weg");
    return basis(url, init);
  };
  await rebuildUserIndex({ env: ENV, fetchImpl, nowIso: "2026-07-28T10:00:00.000Z" });
  invalidateUserIndexCache();
  erlaubeNeubau = false;

  const ergebnis = await readUserIndexFresh({
    env: ENV, fetchImpl, nowMs: Date.parse("2026-07-28T11:00:00.000Z"), staleAfterSeconds: 900
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.count, 1, "der alte Stand bleibt bedienbar");
  await new Promise((fertig) => setTimeout(fertig, 30)); // darf nicht unbehandelt werfen
});

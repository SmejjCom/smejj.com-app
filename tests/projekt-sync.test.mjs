// Projekte-Sync (2026-08-13): Server-Bausteine — Spiegel von chat-sync.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PROJEKT_BYTES,
  loescheProjekt,
  projektSchluessel,
  pruefeProjekt,
  speichereProjekt
} from "../control-server/src/chats/projektSyncStore.js";
import { konfliktSieger } from "../control-server/src/chats/chatSyncStore.js";
import { createProjektSyncRoutes } from "../control-server/src/routes/projektSyncRoutes.js";

const E2_ENV = { IDRIVE_E2_ENDPOINT: "https://e2.example.com", IDRIVE_E2_ACCESS_KEY: "a", IDRIVE_E2_SECRET_KEY: "s", IDRIVE_E2_BUCKET: "smejj-app" };

test("projektSchluessel: projekte/<konto>/<projekt>.json", () => {
  assert.equal(projektSchluessel("user_a", "proj_1"), "projekte/user_a/proj_1.json");
});

test("pruefeProjekt: verlangt Kennung, Name (1-60) und Zeitstempel", () => {
  const gut = { id: "proj_1", name: "Marktstart", updatedAt: new Date().toISOString() };
  assert.equal(pruefeProjekt(gut).ok, true);
  assert.equal(pruefeProjekt(null).ok, false);
  assert.equal(pruefeProjekt({ ...gut, id: "../x" }).error, "projekt_id_ungueltig");
  assert.equal(pruefeProjekt({ ...gut, name: "" }).error, "projekt_name_ungueltig");
  assert.equal(pruefeProjekt({ ...gut, name: "   " }).error, "projekt_name_ungueltig");
  assert.equal(pruefeProjekt({ ...gut, name: "x".repeat(61) }).error, "projekt_name_ungueltig");
  assert.equal(pruefeProjekt({ ...gut, updatedAt: "gestern" }).error, "zeitstempel_ungueltig");
  const dick = { ...gut, ballast: "x".repeat(MAX_PROJEKT_BYTES) };
  assert.equal(pruefeProjekt(dick).error, "projekt_zu_gross");
});

test("pruefeProjekt: ein Grabstein ist ohne Namen gueltig", () => {
  // Geraet B pusht nach einer Loeschung den Grabstein zurueck — der hat
  // absichtlich keinen Namen mehr und darf nicht an der Namenspflicht scheitern.
  const grabstein = { id: "proj_1", geloescht: true, updatedAt: new Date().toISOString() };
  assert.equal(pruefeProjekt(grabstein).ok, true);
});

test("speichereProjekt: juengerer Stand gewinnt, ownerId wird erzwungen", async () => {
  const alt = { id: "proj_1", name: "Alt", updatedAt: "2026-08-13T10:00:00Z", ownerId: "user_fremd" };
  const anfragen = [];
  const fetchImpl = async (url, init) => {
    anfragen.push({ url: String(url), method: init?.method || "GET", body: init?.body });
    // signedS3Get liest den Rumpf per arrayBuffer(), nicht per text().
    const rumpf = (!init?.method || init.method === "GET") ? JSON.stringify(alt) : "";
    return {
      ok: true,
      status: 200,
      text: async () => rumpf,
      arrayBuffer: async () => new TextEncoder().encode(rumpf).buffer,
      headers: { get: () => null }
    };
  };
  // Aelterer Push wird uebersprungen:
  const zuAlt = await speichereProjekt({ kontoId: "user_a", projekt: { id: "proj_1", name: "Uralt", updatedAt: "2026-08-13T09:00:00Z" }, env: E2_ENV, fetchImpl });
  assert.equal(zuAlt.uebersprungen, true);
  // Juengerer Push wird geschrieben — und der Server ueberschreibt die
  // behauptete ownerId mit der Kontokennung aus der Sitzung:
  const neu = await speichereProjekt({ kontoId: "user_a", projekt: { id: "proj_1", name: "Neu", updatedAt: "2026-08-13T11:00:00Z", ownerId: "user_fremd" }, env: E2_ENV, fetchImpl });
  assert.equal(neu.ok, true);
  const put = anfragen.find((anfrage) => anfrage.method === "PUT");
  assert.ok(put, "es wurde geschrieben");
  assert.match(put.url, /projekte\/user_a\/proj_1\.json/);
  assert.equal(JSON.parse(String(put.body)).ownerId, "user_a");
});

test("loescheProjekt schreibt einen Grabstein ohne Namen (kein S3-Delete)", async () => {
  const anfragen = [];
  const fetchImpl = async (url, init) => { anfragen.push({ url: String(url), method: init?.method, body: init?.body }); return { ok: true, status: 200, text: async () => "" }; };
  const ergebnis = await loescheProjekt({ kontoId: "user_a", projektId: "proj_1", env: E2_ENV, fetchImpl, jetztMs: Date.parse("2026-08-13T12:00:00Z") });
  assert.equal(ergebnis.grabstein, true);
  assert.equal(anfragen.length, 1);
  assert.equal(anfragen[0].method, "PUT");
  assert.match(anfragen[0].url, /projekte\/user_a\/proj_1\.json/);
  const rumpf = JSON.parse(String(anfragen[0].body));
  assert.equal(rumpf.geloescht, true);
  assert.equal("name" in rumpf, false, "der Name ist wirklich weg");
  // Und der Grabstein gewinnt gegen jeden aelteren Push:
  assert.equal(konfliktSieger("2026-08-13T11:59:00Z", rumpf.updatedAt), "server");
});

// ---- Routen: gleiches Flag, Sitzung Pflicht, Kennung nie aus dem Rumpf ----

function fakeRes() {
  return { status: 0, payload: null };
}
function fakeJson(res, status, payload) { res.status = status; res.payload = payload; }

test("Route: ohne Flag ehrlich 503 (Projekte haengen am Verlauf-Sync-Schalter)", async () => {
  const routen = createProjektSyncRoutes({ env: {}, readSession: () => null, json: fakeJson, readJson: async () => ({}) });
  const res = fakeRes();
  const behandelt = await routen.handle({ method: "GET" }, res, new URL("https://x/api/projekte"));
  assert.equal(behandelt, true);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "chat_sync_deaktiviert");
});

test("Route: ohne Sitzung 401 — auch wenn der Rumpf eine ownerId behauptet", async () => {
  const routen = createProjektSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => null,
    json: fakeJson,
    readJson: async () => ({ projekt: { id: "proj_1", name: "X", updatedAt: new Date().toISOString(), ownerId: "user_fremd" } })
  });
  const res = fakeRes();
  await routen.handle({ method: "PUT" }, res, new URL("https://x/api/projekte"));
  assert.equal(res.status, 401);
});

test("Route: PUT mit kaputtem Projekt wird mit 400 abgewiesen", async () => {
  const routen = createProjektSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => ({ email: "a@b.de" }),
    json: fakeJson,
    readJson: async () => ({ projekt: { id: "../boese", name: "X", updatedAt: new Date().toISOString() } })
  });
  const res = fakeRes();
  await routen.handle({ method: "PUT" }, res, new URL("https://x/api/projekte"));
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "projekt_id_ungueltig");
});

test("Route: DELETE prueft die Kennung, fremde Pfade kommen nicht durch", async () => {
  const routen = createProjektSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => ({ email: "a@b.de" }),
    json: fakeJson,
    readJson: async () => ({})
  });
  const res = fakeRes();
  await routen.handle({ method: "DELETE" }, res, new URL("https://x/api/projekte?id=../fremd"));
  assert.equal(res.status, 400);
});

test("Route: andere Pfade bleiben unberuehrt", async () => {
  const routen = createProjektSyncRoutes({ env: {}, readSession: () => null, json: fakeJson, readJson: async () => ({}) });
  const res = fakeRes();
  const behandelt = await routen.handle({ method: "GET" }, res, new URL("https://x/api/chats"));
  assert.equal(behandelt, false);
  assert.equal(res.status, 0);
});

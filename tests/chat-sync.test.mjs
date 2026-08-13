// Verlauf-Sync Stufe 3 (docs/verlauf-pro-konto-plan.md): Server-Bausteine.
import test from "node:test";
import assert from "node:assert/strict";
import {
  chatKennungGueltig,
  konfliktSieger,
  kontoKennung,
  pruefeChat,
  schluessel,
  syncAktiv
} from "../control-server/src/chats/chatSyncStore.js";
import { createChatSyncRoutes } from "../control-server/src/routes/chatSyncRoutes.js";

test("syncAktiv: aus ohne Flag, an mit Flag", () => {
  assert.equal(syncAktiv({}), false);
  assert.equal(syncAktiv({ SMEJJ_CHAT_SYNC_ENABLED: "0" }), false);
  assert.equal(syncAktiv({ SMEJJ_CHAT_SYNC_ENABLED: "1" }), true);
  assert.equal(syncAktiv({ SMEJJ_CHAT_SYNC_ENABLED: "true" }), true);
});

test("kontoKennung: gleiche Regel wie das Frontend, leere Sitzung ergibt leer", () => {
  assert.equal(kontoKennung({ email: "SmejjCom@Gmail.com" }), "user_smejjcom_gmail_com");
  assert.equal(kontoKennung({ email: "smejjcom+test@gmail.com" }), "user_smejjcom_test_gmail_com");
  assert.equal(kontoKennung({}), "");
  assert.equal(kontoKennung(null), "");
});

test("chatKennungGueltig: Pfad-Tricks werden abgewiesen", () => {
  assert.equal(chatKennungGueltig("chat_1786_abc"), true);
  assert.equal(chatKennungGueltig("../fremd"), false);
  assert.equal(chatKennungGueltig("a/b"), false);
  assert.equal(chatKennungGueltig(""), false);
  assert.equal(chatKennungGueltig("x".repeat(65)), false);
});

test("schluessel: chats/<konto>/<chat>.json", () => {
  assert.equal(schluessel("user_a", "chat_1"), "chats/user_a/chat_1.json");
});

test("pruefeChat: verlangt Kennung, Nachrichten, Zeitstempel und Groessendeckel", () => {
  const gut = { id: "chat_1", messages: [], updatedAt: new Date().toISOString() };
  assert.equal(pruefeChat(gut).ok, true);
  assert.equal(pruefeChat(null).ok, false);
  assert.equal(pruefeChat({ ...gut, id: "../x" }).error, "chat_id_ungueltig");
  assert.equal(pruefeChat({ ...gut, messages: "nein" }).error, "nachrichten_fehlen");
  assert.equal(pruefeChat({ ...gut, updatedAt: "gestern" }).error, "zeitstempel_ungueltig");
  const dick = { ...gut, messages: [{ text: "x".repeat(600 * 1024) }] };
  assert.equal(pruefeChat(dick).error, "chat_zu_gross");
});

test("konfliktSieger: juengerer Stand gewinnt, Gleichstand tut nichts", () => {
  assert.equal(konfliktSieger("2026-08-13T10:00:00Z", "2026-08-13T09:00:00Z"), "neu");
  assert.equal(konfliktSieger("2026-08-13T09:00:00Z", "2026-08-13T10:00:00Z"), "server");
  assert.equal(konfliktSieger("2026-08-13T10:00:00Z", "2026-08-13T10:00:00Z"), "gleich");
  assert.equal(konfliktSieger("kaputt", "2026-08-13T10:00:00Z"), "server");
});

// ---- Routen: Sitzung ist Pflicht, Kontokennung kommt NIE aus der Anfrage ----

function fakeRes() {
  return { status: 0, payload: null };
}
function fakeJson(res, status, payload) { res.status = status; res.payload = payload; }

test("Route: ohne Flag ehrlich 503", async () => {
  const routen = createChatSyncRoutes({ env: {}, readSession: () => null, json: fakeJson, readJson: async () => ({}) });
  const res = fakeRes();
  const behandelt = await routen.handle({ method: "GET" }, res, new URL("https://x/api/chats"));
  assert.equal(behandelt, true);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "chat_sync_deaktiviert");
});

test("Route: ohne Sitzung 401 — auch wenn der Rumpf eine userId behauptet", async () => {
  const routen = createChatSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => null,
    json: fakeJson,
    readJson: async () => ({ chat: { id: "chat_1", messages: [], updatedAt: new Date().toISOString(), ownerId: "user_fremd" } })
  });
  const res = fakeRes();
  await routen.handle({ method: "PUT" }, res, new URL("https://x/api/chats"));
  assert.equal(res.status, 401);
});

test("Route: PUT mit kaputtem Chat wird mit 400 abgewiesen", async () => {
  const routen = createChatSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => ({ email: "a@b.de" }),
    json: fakeJson,
    readJson: async () => ({ chat: { id: "../boese", messages: [], updatedAt: new Date().toISOString() } })
  });
  const res = fakeRes();
  await routen.handle({ method: "PUT" }, res, new URL("https://x/api/chats"));
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "chat_id_ungueltig");
});

test("Route: DELETE prueft die Kennung, fremde Pfade kommen nicht durch", async () => {
  const routen = createChatSyncRoutes({
    env: { SMEJJ_CHAT_SYNC_ENABLED: "1" },
    readSession: () => ({ email: "a@b.de" }),
    json: fakeJson,
    readJson: async () => ({})
  });
  const res = fakeRes();
  await routen.handle({ method: "DELETE" }, res, new URL("https://x/api/chats?id=../fremd"));
  assert.equal(res.status, 400);
});

test("Route: andere Pfade bleiben unberuehrt", async () => {
  const routen = createChatSyncRoutes({ env: {}, readSession: () => null, json: fakeJson, readJson: async () => ({}) });
  const res = fakeRes();
  const behandelt = await routen.handle({ method: "GET" }, res, new URL("https://x/api/health"));
  assert.equal(behandelt, false);
  assert.equal(res.status, 0);
});

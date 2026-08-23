// TUEV Sync-Waechter (Autopilot Nr. 43): gesunde und kaputte Probe.
import test from "node:test";
import assert from "node:assert/strict";
import { bewerteSyncAlias, laufSyncAlias } from "../control-server/src/autopilots/syncAliasAutopilot.js";
import { kontoKennung } from "../control-server/src/chats/chatSyncStore.js";

const KONTO = kontoKennung({ userId: "sync-waechter", email: "sync-waechter@smejj.invalid" });
const SYNC_OK = "if (daten?.konto) merkeKontoKennung(localStorage, nutzer, daten.konto);";
const OWNER_OK = "export function kontoAliase(storage, userId) {}";

test("gesund: konto passt, Client-Dateien kennen den Alias", () => {
  const e = bewerteSyncAlias({ status: 200, antwort: { ok: true, konto: KONTO, chats: [] }, erwartetesKonto: KONTO, chatSyncQuelle: SYNC_OK, chatOwnerQuelle: OWNER_OK });
  assert.deepEqual(e.fehler, []);
});

test("kaputt: der Server-Stand vom 22.08. (kein konto) ist rot", () => {
  const e = bewerteSyncAlias({ status: 200, antwort: { ok: true, chats: [] }, erwartetesKonto: KONTO, chatSyncQuelle: SYNC_OK, chatOwnerQuelle: OWNER_OK });
  assert.equal(e.ok, false);
  assert.match(e.fehler[0], /kein `konto`/);
});

test("kaputt: der Client-Stand vom 22.08. (alte Dateien live) ist rot, auch wenn der Server passt", () => {
  const e = bewerteSyncAlias({ status: 200, antwort: { ok: true, konto: KONTO, chats: [] }, erwartetesKonto: KONTO, chatSyncQuelle: "fetch(`${API_ORIGIN}/api/chats?nurAbgleich=1`)", chatOwnerQuelle: "export function gehoertNutzer(chat, userId, geraeteBesitzer) {}" });
  assert.equal(e.fehler.length, 2);
});

test("kaputt: konto weicht von kontoKennung ab, HTTP-Fehler, fremder Besitzer", () => {
  assert.match(bewerteSyncAlias({ status: 200, antwort: { konto: "user_x" }, erwartetesKonto: KONTO, chatSyncQuelle: SYNC_OK, chatOwnerQuelle: OWNER_OK }).fehler[0], /passt nicht/);
  assert.match(bewerteSyncAlias({ status: 503, antwort: null, erwartetesKonto: KONTO, chatSyncQuelle: SYNC_OK, chatOwnerQuelle: OWNER_OK }).fehler[0], /HTTP 503/);
  assert.match(bewerteSyncAlias({ status: 200, antwort: { konto: KONTO, chats: [{ id: "chat_1", ownerId: "user_fremd" }] }, erwartetesKonto: KONTO, chatSyncQuelle: SYNC_OK, chatOwnerQuelle: OWNER_OK }).fehler[0], /fremden Besitzer/);
});

test("Lauf: ohne Geheimnis ehrlich rot, mit Doppel gruen", async () => {
  const ohne = await laufSyncAlias({ env: {} });
  assert.equal(ohne.ok, false);
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("/api/chats")) return { status: 200, json: async () => ({ ok: true, konto: KONTO, chats: [] }) };
    if (u.endsWith("chat-sync.js")) return { ok: true, status: 200, text: async () => SYNC_OK };
    return { ok: true, status: 200, text: async () => OWNER_OK };
  };
  const mit = await laufSyncAlias({ env: { SMEJJ_SESSION_SECRET: "geheim-test" }, fetchImpl });
  assert.equal(mit.ok, true, mit.meldung);
  assert.match(mit.meldung, /Server-Chats kommen an/);
});

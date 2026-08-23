// Waechter: Server- und Client-Grenze fuer Chats je Konto muessen gleich sein.
// Hintergrund 2026-08-23: der Server lieferte hoechstens 100, der Client raeumte
// ab 100 lokal auf — 26 Chats des Betreibers waren serverseitig unerreichbar.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_CHATS_PRO_KONTO } from "../control-server/src/chats/chatSyncStore.js";

test("Chat-Grenze: Server 500 und Client gleich", () => {
  assert.equal(MAX_CHATS_PRO_KONTO, 500);
  const client = readFileSync(new URL("../public/chat-store.js", import.meta.url), "utf8");
  const treffer = client.match(/^const MAX_CHATS = (\d+);/m);
  assert.ok(treffer, "MAX_CHATS in public/chat-store.js nicht gefunden");
  assert.equal(Number(treffer[1]), MAX_CHATS_PRO_KONTO);
});

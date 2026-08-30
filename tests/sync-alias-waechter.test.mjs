// TUEV fuer den Sync-Waechter: eine gesunde und eine kaputte Probe je Stufe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pruefeQuellen, pruefeAntwort } from "../scripts/check-sync-alias.mjs";
import * as owner from "../public/chat-owner.js";

const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const quellen = () => ({
  owner: lies("public/chat-owner.js"), sync: lies("public/chat-sync.js"),
  store: lies("public/chat-store.js"), route: lies("control-server/src/routes/chatSyncRoutes.js")
});

test("Stufe A: der echte Quellstand besteht", () => {
  const e = pruefeQuellen(quellen());
  assert.deepEqual(e.fehler, []);
  assert.equal(e.ok, true);
});

test("Stufe A: der Stand vom 22.08. (ohne Alias) faellt durch — genau der tote Sync", () => {
  const q = quellen();
  q.route = q.route.replace("konto: kontoId", "");
  q.sync = q.sync.replace("gehoertNutzer(fern, nutzer, besitzer, aliase)", "gehoertNutzer(fern, nutzer, besitzer)");
  const e = pruefeQuellen(q);
  assert.equal(e.ok, false);
  assert.ok(e.fehler.some((f) => f.includes("konto")));
  assert.ok(e.fehler.some((f) => f.includes("ohne Alias")));
});

test("Stufe A: ein nackter gehoertNutzer-Aufruf im Store wird gemeldet", () => {
  const q = quellen();
  q.store += "\nconst x = gehoertNutzer({}, 'u', '');\n";
  assert.equal(pruefeQuellen(q).ok, false);
});

const KONTO = "user_158c1e609cc03bb4c36f70b7e059fbfd";

test("Stufe B: gesunde Live-Antwort — Server-Chat gilt als eigen, Zweitkonto erbt nichts", () => {
  const e = pruefeAntwort({ ok: true, konto: KONTO, chats: [{ id: "chat_1", ownerId: KONTO, updatedAt: "2026-08-23T10:00:00Z" }] }, owner);
  assert.deepEqual(e.fehler, []);
});

test("Stufe B: Antwort ohne konto (alter Server) ist ROT", () => {
  const e = pruefeAntwort({ ok: true, chats: [] }, owner);
  assert.equal(e.ok, false);
  assert.ok(e.fehler.some((f) => f.includes("konto")));
});

test("Stufe B: ein Client-Modul ohne Alias-Logik ist ROT (Sync tot)", () => {
  const alt = { ...owner, gehoertNutzer: (chat, userId) => String(chat?.ownerId || "") === userId };
  const e = pruefeAntwort({ ok: true, konto: KONTO, chats: [] }, alt);
  assert.ok(e.fehler.some((f) => f.includes("FREMD")));
});

test("Stufe B: ein fremder Besitzer in der Liste wird gemeldet", () => {
  const e = pruefeAntwort({ ok: true, konto: KONTO, chats: [{ id: "chat_x", ownerId: "user_fremd" }] }, owner);
  assert.ok(e.fehler.some((f) => f.includes("fremden Besitzer")));
});

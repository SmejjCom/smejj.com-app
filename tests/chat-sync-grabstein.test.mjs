// Grabsteine im Chat-Abgleich (15.09.2026): geloeschte Chats nicht bei jedem Laden erneut holen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { grabsteinWeg } from "../public/chat-sync-auswahl.js";
import { nurAbgleichsfelder } from "../control-server/src/chats/chatSyncStore.js";

test("grabsteinWeg: ohne Feld wie bisher holen, Grabstein ueberspringen oder lokal entfernen", () => {
  assert.equal(grabsteinWeg({ id: "a", updatedAt: "t" }, null), "holen");
  assert.equal(grabsteinWeg({ id: "a", geloescht: true }, null), "ueberspringen");
  assert.equal(grabsteinWeg({ id: "a", geloescht: true }, { id: "a" }), "entfernen");
  assert.equal(grabsteinWeg({ id: "a", geloescht: "true" }, null), "holen", "nur echtes true");
});

test("Server nennt den Grabstein in der Abgleichsliste, sonst nichts Neues", () => {
  assert.deepEqual(nurAbgleichsfelder({ id: "a", updatedAt: "t", ownerId: "u", geloescht: true, messages: [] }), { id: "a", updatedAt: "t", ownerId: "u", geloescht: true });
  assert.deepEqual(nurAbgleichsfelder({ id: "b", updatedAt: "t", messages: [1] }), { id: "b", updatedAt: "t" });
  assert.match(fs.readFileSync("control-server/src/chats/chatIndex.js", "utf8"), /chat\?\.geloescht === true \? \{ geloescht: true \} : \{\}/);
});

test("pull() prueft den Grabstein NACH der Besitzerpruefung und VOR dem Einzelabruf", () => {
  const q = fs.readFileSync("public/chat-sync.js", "utf8");
  const besitzer = q.indexOf("if (!gehoertNutzer(fern, nutzer, besitzer, aliase))");
  const grab = q.indexOf("const grabstein = grabsteinWeg(fern, lokal);");
  const abruf = q.indexOf("await holeVollstaendig(fern.id, kopf)");
  assert.ok(besitzer > 0 && grab > besitzer && abruf > grab);
});

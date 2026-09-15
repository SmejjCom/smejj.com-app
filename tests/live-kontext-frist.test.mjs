// Gesamtfrist fuer die Websuche im Agenten-Weg (15.09.2026): nie mehr 30+ s ohne Byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { holeLiveKontext, mitFrist, SUCH_FRIST_MS } from "../src/agent/liveKontext.js";

const basis = { codingTask: false, erkenneAbsicht: () => ({ kind: "none" }), beantworteLive: async () => null, sollSuchen: () => true };

test("schnelle Suche liefert ihren Kontext", async () => {
  assert.equal(await holeLiveKontext("x", { ...basis, baueSuchkontext: async () => "KONTEXT", suchFristMs: 200 }), "KONTEXT");
});

test("haengende Suche: nach der Frist leer, ohne Fehler", async () => {
  const t0 = Date.now();
  const wert = await holeLiveKontext("x", { ...basis, baueSuchkontext: () => new Promise(() => {}), suchFristMs: 60 });
  assert.equal(wert, "");
  assert.ok(Date.now() - t0 < 1000);
});

test("fehlerhafte Suche wird zu leerem Kontext; Standardfrist 15 s", async () => {
  assert.equal(await mitFrist(Promise.reject(new Error("x")), 50), "");
  assert.equal(SUCH_FRIST_MS, 15_000);
});

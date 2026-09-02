// smejj.com — Verlauf ans Ende scrollen: nur im Block-Aufbau, nie gegen den Nutzer, nie im Strom.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/verlauf-unten.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("scrolleAnsEnde springt ans Ende — nicht im Strom, nicht bei Nutzer-Scroll, nicht ohne Ueberlauf", () => {
  const log = { scrollHeight: 2000, clientHeight: 500, scrollTop: 0 };
  assert.equal(m.scrolleAnsEnde(log, { strom: true }), false);
  assert.equal(m.scrolleAnsEnde(log, { nutzerNah: true }), false);
  assert.equal(log.scrollTop, 0);
  assert.equal(m.scrolleAnsEnde(log), true);
  assert.equal(log.scrollTop, 2000);
  assert.equal(m.scrolleAnsEnde({ scrollHeight: 300, clientHeight: 500, scrollTop: 0 }), false, "kein Ueberlauf");
  assert.equal(m.scrolleAnsEnde(null), false);
});

test("Beobachter auf #startLog (childList), Rad/Touch als Nutzer-Signal, Haken in chat-actions-menu.js", () => {
  assert.match(quelle, /wache\.observe\(log, \{ childList: true \}\)/);
  assert.match(quelle, /\["wheel", "touchmove"\]/);
  assert.match(quelle, /smejj:chat-strom/);
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/verlauf-unten.js").catch(() => {})'));
});

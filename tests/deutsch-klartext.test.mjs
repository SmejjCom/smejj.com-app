// smejj.com — UI/UX Nr. 7+8 zur Laufzeit: Texte nur ersetzen, wo der alte Wortlaut steht; idempotent.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/deutsch-klartext.js", import.meta.url), "utf8");
const modul = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

function knoten(text, attrs = {}) {
  const a = { ...attrs };
  return { textContent: text, getAttribute: (k) => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = v; }, parentElement: null, _a: a };
}

test("15 Stellen: jede englische/erklaerungslose Stelle bekommt Klartext, ein zweiter Lauf aendert nichts mehr", () => {
  const doc = new Map();
  for (const e of modul.TEXTE) {
    if (e.eltern) { const strong = knoten(e.nur); const span = knoten("lokal"); span.parentElement = { querySelector: () => strong }; doc.set(e.wahl, span); continue; }
    const attrs = {}; if (e.nurAttr) attrs[e.attr ? Object.keys(e.attr)[0] : "title"] = e.nurAttr; if (e.title) attrs.title = e.nur;
    doc.set(e.wahl, knoten(e.nur || "", attrs));
  }
  const fake = { querySelector: (w) => doc.get(w) || null };
  assert.equal(modul.TEXTE.length, 15);
  const erst = modul.setzeKlartext(fake);
  assert.ok(erst >= 15, `mindestens 15 Aenderungen, waren ${erst}`);
  assert.equal(doc.get('[data-view="arbeitsbereiche"]').textContent, "Projekte");
  assert.equal(doc.get('#modelPickerMenu [data-stufe="schnell"]').textContent, "Schnell — Antwort in Sekunden");
  assert.equal(doc.get("#stufeNachdenken").getAttribute("title"), "Nimmt sich Zeit und antwortet gründlicher (langsamer)");
  assert.equal(modul.setzeKlartext(fake), 0, "idempotent");
});

test("fremder Wortlaut bleibt unangetastet (z. B. schon uebersetzte Oberflaeche)", () => {
  const k = knoten("Projects (3)");
  const fake = { querySelector: (w) => (w === '[data-view="arbeitsbereiche"]' ? k : null) };
  modul.setzeKlartext(fake);
  assert.equal(k.textContent, "Projects (3)");
});

test("Haken im Startmodul chat-actions-menu.js, keine ids oder data-Attribute im Modul veraendert", () => {
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/deutsch-klartext.js").catch(() => {})'));
  assert.ok(!/setAttribute\("(id|data-[a-z-]+)"/.test(quelle));
});

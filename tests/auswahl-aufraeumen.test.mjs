// smejj.com — die iOS-Auswahlleiste blieb nach einer Wischgeste ueber Menues und
// Ansichtswechseln liegen (Geraetetest 22.09.2026). Die Auswahl wird am Handy bei
// Ansichtswechsel, Spur-Schliessen und Profil-Menuepunkten aufgehoben.
import test from "node:test";
import assert from "node:assert/strict";
import { raeumeAuswahlAuf, verdrahteAuswahl } from "../public/mobil-dock.js";

function selection(collapsed) {
  let ranges = collapsed ? 0 : 1;
  return { get rangeCount() { return ranges; }, get isCollapsed() { return ranges === 0; }, removeAllRanges() { ranges = 0; } };
}

test("eine stehende Auswahl wird aufgehoben, eine leere bleibt unberuehrt", () => {
  const sel = selection(false);
  assert.equal(raeumeAuswahlAuf({ getSelection: () => sel }), true);
  assert.equal(sel.rangeCount, 0);
  assert.equal(raeumeAuswahlAuf({ getSelection: () => selection(true) }), false);
  assert.equal(raeumeAuswahlAuf({}), false, "ohne Selection-API kein Fehler");
});

test("verdrahtet popstate und die Bedienflaechen, aber nur einmal", () => {
  const winHandler = {}; const docHandler = {};
  const win = { addEventListener: (n, f) => { winHandler[n] = f; }, getSelection: () => sel };
  const sel = selection(false);
  const doc = { documentElement: { dataset: {} }, addEventListener: (n, f) => { docHandler[n] = f; } };
  assert.equal(verdrahteAuswahl(doc, win), true);
  assert.equal(verdrahteAuswahl(doc, win), false);
  assert.ok(winHandler.popstate && docHandler.click);
  docHandler.click({ target: { closest: (q) => (q.includes("data-dock-action") ? {} : null) } });
  assert.equal(sel.rangeCount, 0);
});

// smejj.com — Das rechte Panel darf den Chat nie unter 380 px druecken
// (Betreiber 2026-08-23, Screenshot: Chat auf ~140 px). Reine Rechnung,
// je eine kaputte und eine gesunde Probe.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { innerWidth: 1280, addEventListener() {} };
globalThis.document = { documentElement: { style: { setProperty() {} } }, body: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } }, querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { maxPanelBreite, PANEL_WIDTHS } = await import("../public/panel-layout.js");

test("kaputt: 1108 px Fenster, Spur 196 — frueher durfte das Panel 520 px nehmen", () => {
  // Vorher: min(520, 1108 - 120) = 520 -> dem Chat blieben 392 px abzueglich
  // Spur = 196 px, in der Praxis ~140 px. Jetzt: 1108 - 196 - 380 = 532 -> 520
  // bleibt ERLAUBT, weil es passt; bei 828 px aber nicht mehr:
  assert.equal(maxPanelBreite("right", { fenster: 828, mitteLinks: 196 }), 252);
  assert.ok(828 - 196 - 252 >= 380, "dem Chat bleiben mindestens 380 px");
});

test("gesund: breites Fenster bleibt bei max 520, schmales nie unter min", () => {
  assert.equal(maxPanelBreite("right", { fenster: 1600, mitteLinks: 196 }), PANEL_WIDTHS.max);
  assert.equal(maxPanelBreite("right", { fenster: 600, mitteLinks: 196 }), PANEL_WIDTHS.min);
  // Links unveraendert: Fenster minus centerMin.
  assert.equal(maxPanelBreite("left", { fenster: 500 }), Math.min(PANEL_WIDTHS.max, 500 - PANEL_WIDTHS.centerMin));
});

// smejj.com — Tests fuer den Split-View-Backdrop-Waechter (job_browser_panel_backdrop_20260803).
//
// Festgehaltene Zusage: Im Browser-Split-View schliesst ein Klick in den linken
// Arbeitsbereich (z. B. ins Schreibfeld) das Panel NICHT mehr. Das Backdrop
// (#sidebarBackdrop aus panel-backdrop.js) wird bei body.browser-pane-open
// unterdrueckt; Ausnahme: offenes linkes Menue (left-panel-open) behaelt sein
// Abdunkeln und Wegklicken. Live bewiesen am 2026-08-03 (sw v206).
//
// Der Waechter ist bewusst ein eigenes Modul ohne Exporte und ohne Imports
// (browser-pane.js steht am 800-Zeilen-Limit, panel-backdrop.js unter
// Start-Lock). Deshalb prueft dieser Test die Verdrahtung strukturell und
// dass der Import in Node ohne DOM gefahrlos ist — dieselbe Konvention wie
// bei browser-pane.js ("In Node-Tests gibt es kein document").

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const guard = fs.readFileSync("public/browser-pane-backdrop.js", "utf8");

test("Import in Node ist gefahrlos (document-Waechter greift)", async () => {
  await assert.doesNotReject(() => import("../public/browser-pane-backdrop.js"));
});

test("index.html laedt den Waechter als Modul nach browser-pane.js", () => {
  assert.match(html, /<script src="\/assets\/browser-pane-backdrop\.js\?v=1" type="module"><\/script>/);
  const paneAt = html.indexOf("/assets/browser-pane.js?v=");
  const guardAt = html.indexOf("/assets/browser-pane-backdrop.js?v=1");
  assert.ok(paneAt > -1 && guardAt > paneAt, "Waechter muss nach browser-pane.js stehen");
});

test("sw.js hat den Waechter im Precache (cache-first erreicht Bestandsnutzer nur so)", () => {
  assert.match(sw, /"\/assets\/browser-pane-backdrop\.js",/);
});

test("Waechter unterdrueckt nur im Split-View und schont das linke Menue", () => {
  assert.match(guard, /browser-pane-open/);
  assert.match(guard, /left-panel-open/);
  assert.match(guard, /sidebarBackdrop/);
  // Beide Ausloeser beobachtet: hidden-Attribut des Backdrops UND body-Klassen.
  assert.match(guard, /attributeFilter:\s*\["hidden"\]/);
  assert.match(guard, /attributeFilter:\s*\["class"\]/);
});

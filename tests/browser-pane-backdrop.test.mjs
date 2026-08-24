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

import { syncSplitViewBackdrop } from "../public/browser-pane-backdrop.js";
import { backdropCloseTarget } from "../public/panel-backdrop.js";

const html = fs.readFileSync("public/index.html", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const guard = fs.readFileSync("public/browser-pane-backdrop.js", "utf8");

// Minimales Dokument statt jsdom: das Projekt haelt sich abhaengigkeitsfrei
// (package.json hat keine Laufzeit-Abhaengigkeiten), und der Waechter braucht
// nur classList, style und getElementById.
function fakeDoc(klassen = [], { mitPanel = true } = {}) {
  const classSet = new Set(klassen);
  const panelKlassen = new Set(mitPanel ? ["is-open", "is-browser-mode"] : []);
  const entfernteStile = [];
  return {
    body: {
      classList: {
        contains: (name) => classSet.has(name),
        remove: (name) => classSet.delete(name)
      },
      style: { removeProperty: (name) => entfernteStile.push(name) }
    },
    getElementById: (id) => (id === "browserPanel" && mitPanel
      ? { classList: { remove: (name) => panelKlassen.delete(name) } }
      : null),
    klassen: classSet,
    panelKlassen,
    entfernteStile
  };
}

test("Import in Node ist gefahrlos (document-Waechter greift)", async () => {
  await assert.doesNotReject(() => import("../public/browser-pane-backdrop.js"));
});

test("index.html laedt den Waechter als Modul nach browser-pane.js", () => {
  // Seit der Konsolidierung 24.08. laedt browser-nachladen.js Pane UND Waechter
  // beim ersten Bedarf — die Reihenfolge-Zusage gilt im Nachlader.
  const nachladen = fs.readFileSync("public/browser-nachladen.js", "utf8");
  const paneAt = nachladen.indexOf('import("./browser-pane.js?v=');
  const guardAt = nachladen.indexOf('import("./browser-pane-backdrop.js?v=2")');
  assert.ok(paneAt > -1 && guardAt > paneAt, "Waechter muss nach browser-pane.js geladen werden");
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

// --- Verhalten: Backdrop im Split-View ---------------------------------------

test("offener Split-View ohne Menue: das Backdrop wird unterdrueckt", () => {
  const doc = fakeDoc(["right-panel-open", "browser-pane-open"]);
  const backdrop = { hidden: false };
  syncSplitViewBackdrop(doc, backdrop);
  assert.equal(backdrop.hidden, true, "links muss klickbar bleiben");
  assert.equal(doc.klassen.has("browser-pane-open"), true, "der Split-View bleibt offen");
});

test("Split-View mit offenem Menue: das Backdrop bleibt sichtbar", () => {
  const doc = fakeDoc(["right-panel-open", "browser-pane-open", "left-panel-open"]);
  const backdrop = { hidden: false };
  syncSplitViewBackdrop(doc, backdrop);
  assert.equal(backdrop.hidden, false, "das Menue behaelt sein Abdunkeln");
});

test("ohne Split-View bleibt das Backdrop unangetastet", () => {
  const doc = fakeDoc(["left-panel-open"]);
  const backdrop = { hidden: false };
  syncSplitViewBackdrop(doc, backdrop);
  assert.equal(backdrop.hidden, false);
});

// --- Nacharbeit Punkt 1: kein Restzustand nach dem Schliessen ----------------

test("geschlossenes Panel laesst keinen Browser-Modus am body zurueck", () => {
  // app.js schliesst ueber setBrowserPanelOpen(false): right-panel-open faellt,
  // browser-pane-open blieb bisher stehen.
  const doc = fakeDoc(["browser-pane-open"]);
  syncSplitViewBackdrop(doc, { hidden: true });
  assert.equal(doc.klassen.has("browser-pane-open"), false, "Klasse muss weg sein");
  assert.equal(doc.panelKlassen.has("is-browser-mode"), false, "Browser-Modus muss weg sein");
  assert.deepEqual(doc.entfernteStile, ["--right-panel-width"], "Split-View-Breite muss weg sein");
});

test("das Aufraeumen laeuft auch ohne Panel-Element durch (fail-soft)", () => {
  const doc = fakeDoc(["browser-pane-open"], { mitPanel: false });
  assert.doesNotThrow(() => syncSplitViewBackdrop(doc, { hidden: true }));
  assert.equal(doc.klassen.has("browser-pane-open"), false);
});

// --- Nacharbeit Punkt 2: Wegklicken schliesst nur die oberste Ebene ----------

test("Wegklicken im Split-View schliesst nur das Menue, nicht das Panel", () => {
  assert.equal(backdropCloseTarget({ splitView: true, menuOpen: true }), "menu");
});

test("ohne Split-View schliesst Wegklicken weiterhin alles (Non-Regression)", () => {
  assert.equal(backdropCloseTarget({ splitView: false, menuOpen: true }), "all");
  assert.equal(backdropCloseTarget({ splitView: false, menuOpen: false }), "all");
  // Split-View ohne Menue: das Backdrop ist unterdrueckt, ein Klick kommt gar
  // nicht an — die Regel bleibt trotzdem konservativ.
  assert.equal(backdropCloseTarget({ splitView: true, menuOpen: false }), "all");
});

test("panel-backdrop.js verdrahtet die Entscheidung wirklich am Klick", () => {
  const quelle = fs.readFileSync("public/panel-backdrop.js", "utf8");
  assert.match(quelle, /backdrop\?\.addEventListener\("click", closeFromBackdrop\)/);
  assert.match(quelle, /backdropCloseTarget\(\{/);
  // Escape bleibt bewusst "alles zu" — ausdrueckliche Nutzeraktion.
  assert.match(quelle, /if \(event\.key !== "Escape"\) return;[\s\S]*?closeAll\(\);/);
});

// Waechter fuer den Nachlader von Browser- und Maus-Panel.
//
// GEMESSEN 2026-08-23 (gzip, von aussen — die Browser-Zahlen sind
// unkomprimiert und taugen fuer das Budget nicht):
//   Startseite sofort 335,6 KB gegen ein Budget von 300 KB.
//   Panel + Maus:      63,3 KB in 16 Modulen, die beim ersten Bildaufbau
//                      niemand sieht.
//   ohne sie:         272,4 KB — unter Budget.
//
// Nur das Browser-Panel auszulagern haette 1,9 KB gebracht: maus-panel.js
// importiert dieselbe Kette und zieht sie doch wieder herein. Darum beide.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { haengeBrowserNachladerEin, panelIstOffen } from "../public/browser-nachladen.js";

const lies = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

/** Ein Dokument-Ersatz, der nur kann, was der Nachlader braucht. */
function dokumentAttrappe({ offen = false, mitPanel = true } = {}) {
  const klassen = new Set(offen ? ["is-open"] : []);
  const klickHandler = [];
  const panel = {
    classList: { contains: (k) => klassen.has(k), add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) },
    _oeffnen() { klassen.add("is-open"); this._melden?.(); }
  };
  return {
    getElementById: (id) => (id === "browserPanel" && mitPanel ? panel : null),
    addEventListener: (art, fn) => { if (art === "click") klickHandler.push(fn); },
    _klick: (treffer) => klickHandler.forEach((fn) => fn({ target: { closest: (s) => (s === "#mausButton" && treffer ? {} : null) } })),
    _panel: panel
  };
}

function fensterAttrappe() {
  const horcher = new Map();
  return {
    addEventListener: (art, fn) => { (horcher.get(art) || horcher.set(art, []).get(art)).push(fn); },
    dispatchEvent: (e) => { (horcher.get(e.type) || []).forEach((fn) => fn(e)); return true; },
    _hat: (art) => (horcher.get(art) || []).length
  };
}

// globalThis.CustomEvent gibt es in Node ab 19 — hier nur zur Sicherheit.
if (typeof CustomEvent === "undefined") {
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
}
// MutationObserver gibt es in Node nicht: eine Attrappe, die der Test steuert.
let letzterBeobachter = null;
globalThis.MutationObserver = class {
  constructor(fn) { this.fn = fn; letzterBeobachter = this; }
  observe(ziel) { this.ziel = ziel; ziel._melden = () => this.fn(); }
  disconnect() { this.abgemeldet = true; }
};

test("ist das Panel schon offen, wird sofort geladen", async () => {
  let geladen = 0;
  const art = haengeBrowserNachladerEin(dokumentAttrappe({ offen: true }), fensterAttrappe(), async () => { geladen += 1; });
  assert.equal(art, "sofort");
  await new Promise((r) => setImmediate(r));
  assert.equal(geladen, 1);
});

test("ohne Panel im Dokument passiert nichts Schlimmes", () => {
  assert.equal(haengeBrowserNachladerEin(dokumentAttrappe({ mitPanel: false }), fensterAttrappe(), async () => {}), "kein-ziel");
});

test("das Panel geht auf -> geladen, und nur EINMAL", async () => {
  let geladen = 0;
  const dok = dokumentAttrappe();
  haengeBrowserNachladerEin(dok, fensterAttrappe(), async () => { geladen += 1; });
  dok._panel._oeffnen();
  await new Promise((r) => setImmediate(r));
  dok._panel._oeffnen();
  dok._panel._oeffnen();
  await new Promise((r) => setImmediate(r));
  assert.equal(geladen, 1, "dreimal geoeffnet, einmal geladen");
  assert.equal(letzterBeobachter.abgemeldet, true, "danach meldet sich der Beobachter ab");
});

test("der Maus-Knopf laedt ebenfalls — er liegt ausserhalb des Panels", async () => {
  let geladen = 0;
  const dok = dokumentAttrappe();
  haengeBrowserNachladerEin(dok, fensterAttrappe(), async () => { geladen += 1; });
  dok._klick(false);
  await new Promise((r) => setImmediate(r));
  assert.equal(geladen, 0, "ein Klick woanders laedt nichts");
  dok._klick(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(geladen, 1);
});

test("ein Maus-Auftrag aus dem CHAT wird nach dem Laden NACHGEREICHT", async () => {
  // Der heikle Fall: das Ereignis ist durch, bevor das Modul da ist. Ohne
  // Nachreichen verpasst ein Maus-Auftrag aus dem Chat seine Anzeige — und
  // nichts sieht kaputt aus.
  let geladen = 0;
  const fenster = fensterAttrappe();
  haengeBrowserNachladerEin(dokumentAttrappe(), fenster, async () => { geladen += 1; });
  const gesehen = [];
  fenster.addEventListener("smejj:maus-lauf-gestartet", (e) => gesehen.push(e.detail));
  fenster.dispatchEvent(new CustomEvent("smejj:maus-lauf-gestartet", { detail: { id: "lauf-1" } }));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(geladen, 1, "der Auftrag hat das Laden ausgeloest");
  assert.deepEqual(gesehen.at(-1), { id: "lauf-1" }, "und das Ereignis kam erneut an");
});

test("alle drei Maus-Ereignisse sind angeschlossen", () => {
  const fenster = fensterAttrappe();
  haengeBrowserNachladerEin(dokumentAttrappe(), fenster, async () => {});
  for (const art of ["smejj:maus-replay-request", "smejj:maus-lauf-gestartet", "smejj:maus-auftrag-starten"]) {
    assert.ok(fenster._hat(art) > 0, `${art} wird nicht abgehoert`);
  }
});

test("ein Fehlschlag laesst den naechsten Versuch zu", async () => {
  // Ein stumm nicht geladenes Modul waere von einem toten Knopf nicht zu
  // unterscheiden.
  let versuche = 0;
  const dok = dokumentAttrappe();
  haengeBrowserNachladerEin(dok, fensterAttrappe(), async () => { versuche += 1; if (versuche === 1) throw new Error("Netz weg"); });
  dok._panel._oeffnen();
  await new Promise((r) => setImmediate(r));
  dok._panel._oeffnen();
  await new Promise((r) => setImmediate(r));
  assert.equal(versuche, 2, "der zweite Versuch laeuft");
});

test("index.html laedt die drei Module NICHT mehr fest", () => {
  const html = lies("../public/index.html");
  assert.match(html, /browser-nachladen\.js/, "der Nachlader steht drin");
  for (const weg of ["browser-pane.js?v=", "browser-pane-backdrop.js?v=", "maus-panel.js?v="]) {
    assert.ok(!html.includes(`<script src="/assets/${weg}`), `${weg} haengt noch als festes Tag drin`);
  }
});

test("die Marken im Nachlader passen zu denen im Precache", () => {
  // Zwei Kennungen fuer dasselbe Modul heissen zwei Instanzen mit getrenntem
  // Zustand — dieselbe Falle wie bei chat-store.js am selben Tag.
  const nach = lies("../public/browser-nachladen.js");
  for (const m of ["browser-pane.js", "browser-pane-backdrop.js", "maus-panel.js"]) {
    assert.match(nach, new RegExp(`import\\("\\./${m.replace(".", "\\.")}\\?v=[^"]+"\\)`), `${m} wird nicht mit Marke geladen`);
  }
});

// Such-Overlay (Cmd+K) — Verdrahtungs-Vertrag.
// Freigabe: docs/approvals/2026-08-13-suche-overlay-startlock-freigabe.md
//
// Die Tests pruefen die Textform der Dateien (wie profile-dock.test.mjs):
// kein DOM noetig, aber jede der Verdrahtungsstellen ist einzeln abgesichert —
// genau die Stellen, deren stilles Fehlen das Overlay unsichtbar machen wuerde.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const appJs = fs.readFileSync("public/app.js", "utf8");
const searchJs = fs.readFileSync("public/search.js", "utf8");
const overlayJs = fs.readFileSync("public/search-overlay.js", "utf8");
const overlayCss = fs.readFileSync("public/search-overlay.css", "utf8");
const swJs = fs.readFileSync("public/sw.js", "utf8");

test("index.html traegt Overlay-Markup und Stylesheet", () => {
  assert.match(html, /<div id="searchOverlay" class="search-overlay" hidden>/);
  assert.match(html, /<input id="searchOverlayQuery" type="search"/);
  assert.match(html, /<div id="searchOverlayLog" class="search-overlay-log" aria-live="polite">/);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/search-overlay\.css\?v=[^"]+">/);
  // Die alte Such-Seite bleibt als Rueckfallebene bestehen.
  assert.match(html, /<section id="search" class="view" aria-label="Suche">/);
});

test("Nav-Knopf Suche oeffnet das Overlay, nicht die Seite", () => {
  assert.match(appJs, /import \{ openSearchOverlay \} from "\.\/search-overlay\.js";/);
  assert.match(appJs, /button\.dataset\.view === "search" && openSearchOverlay\(\)/);
});

test("Cmd+K schaltet das Overlay und search.js reicht die Datenwege durch", () => {
  assert.match(searchJs, /import \{ initSearchOverlay, toggleSearchOverlay \} from "\.\/search-overlay\.js";/);
  assert.match(searchJs, /if \(toggleSearchOverlay\(\)\) return;/);
  assert.match(searchJs, /initSearchOverlay\(\{/);
  // Chat-Treffer tragen das Chat-Objekt (Ausschnitt, Zeit, Titel im Overlay).
  assert.match(searchJs, /chat\.id, chat\];/);
});

test("Overlay hebt sicher hervor und bedient die Tastatur", () => {
  // Chat-Inhalt darf nie als Markup interpretiert werden: Hervorhebung nur
  // ueber DOM-Knoten (mitHervorhebung), niemals ueber innerHTML.
  assert.match(overlayJs, /mitHervorhebung/);
  assert.doesNotMatch(overlayJs, /innerHTML/);
  assert.match(overlayJs, /"ArrowDown"/);
  assert.match(overlayJs, /"Escape"/);
  // Gleicher chat-store-Spezifizierer wie search.js — sonst ZWEITE Modulinstanz.
  assert.match(overlayJs, /from "\/assets\/chat-store\.js\?v=pin-20260806"/);
});

test("Overlay-Zeilen halten die 44-px-Touch-Regel", () => {
  assert.match(overlayCss, /\.search-overlay-row \{[^}]*min-height: 44px/s);
  assert.match(overlayCss, /\.search-overlay-close \{[^}]*min-height: 44px/s);
});

test("sw.js precacht beide Overlay-Dateien", () => {
  assert.match(swJs, /"\/assets\/search-overlay\.js",/);
  assert.match(swJs, /"\/assets\/search-overlay\.css",/);
});

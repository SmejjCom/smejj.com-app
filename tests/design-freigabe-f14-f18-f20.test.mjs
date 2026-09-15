// smejj.com — Design-Lock-Freigabe 14.09. ("OK – F18, F20 und F14 umsetzen").
// Drei Befunde der A-bis-Z-Pruefung (docs/qa/befunde-2026-09-14.md), die die
// geschuetzte Startseite bzw. das Farbschema betreffen. Diese Zusagen halten
// fest, was OHNE Browser pruefbar ist; die Masse selbst misst
// scripts/testing/measure_touch_targets_app.mjs gegen die Live-Seite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lese = (datei) => readFileSync(new URL(`../public/${datei}`, import.meta.url), "utf8");
const spur = lese("design-v12-spur.css");
const chat = lese("design-v12-chat.css");
const buendel = lese("start-styles.css");
const surface = lese("settings-surface.js");

test("F14: Spur-Eintraege sind bei grobem Zeiger oder Handy-Breite 44 px hoch", () => {
  // V12 setzte 38 px OHNE Media-Bedingung und schlug damit die 44-px-Zusage aus
  // design-v11 (max-width 600) — gemessen 16 Verstoesse (4 + 12 bei offener Spur).
  const block = spur.match(/@media \(pointer: coarse\), \(max-width: 600px\) \{([\s\S]*?)\n\}/);
  assert.ok(block, "der Touch-Block fehlt in design-v12-spur.css");
  assert.match(block[1], /\.nav-start \.nav-button,\s*\n\s*\.sidebar \.nav-vier \.nav-button \{[^}]*min-height: 44px/);
  // Der Block muss NACH der 38-px-Regel stehen, sonst verliert er bei gleicher Spezifitaet.
  assert.ok(spur.indexOf("min-height: 38px") < spur.indexOf("@media (pointer: coarse), (max-width: 600px)"));
});

test("F18: unter 430 px zwei Spalten ohne Silbentrennung — leere Startseite UND laufender Chat", () => {
  // Seit 15.09. folgt der 360-px-Nachtrag (Kachel "Programmieren") — der 430-Block endet davor.
  const block = chat.match(/@media \(max-width: 430px\) \{([\s\S]*?)\n\}\n\n\/\* 320-px/) || chat.match(/@media \(max-width: 430px\) \{([\s\S]*)\n\}\s*$/);
  assert.ok(block, "der 430-px-Block fehlt in design-v12-chat.css");
  assert.match(block[1], /#start:not\(\.has-start-chat\) \.start-chips\.start-chipreihe,\s*\n\s*#start\.has-start-chat \.start-chips\.start-chipreihe \{\s*\n\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  // Beide Knopf-Regeln schalten die Trennung ab und verbieten den Umbruch.
  const knopfRegeln = block[1].match(/\.start-chipreihe button \{[^}]*\}/g) || [];
  assert.equal(knopfRegeln.length, 2);
  for (const regel of knopfRegeln) {
    assert.match(regel, /white-space: nowrap/);
    assert.match(regel, /hyphens: manual/);
    assert.match(regel, /overflow-wrap: normal/);
  }
  // Der 430-Block steht nach dem 600-Block (gleiche Spezifitaet, spaeter gewinnt).
  assert.ok(chat.indexOf("@media (max-width: 600px)") < chat.indexOf("@media (max-width: 430px)"));
});

test("360-px-Nachtrag: nur Innenabstand/Schrift, steht nach dem 430-Block und im Buendel", () => {
  const nachtrag = chat.match(/@media \(max-width: 360px\) \{([\s\S]*?)\n\}/);
  assert.ok(nachtrag, "360-px-Block fehlt");
  assert.match(nachtrag[1], /padding: 0 6px;/);
  assert.doesNotMatch(nachtrag[1], /white-space|min-height/, "Umbruch und Zielhoehe bleiben wie in F18");
  assert.ok(chat.indexOf("@media (max-width: 430px)") < chat.indexOf("@media (max-width: 360px)"));
  assert.ok(buendel.includes("@media (max-width: 360px)"));
});

test("das Buendel start-styles.css traegt beide Bloecke (bundle-start-styles.mjs gelaufen)", () => {
  assert.ok(buendel.includes("@media (pointer: coarse), (max-width: 600px)"), "F14-Block fehlt im Buendel");
  assert.ok(buendel.includes("@media (max-width: 430px)"), "F18-Block fehlt im Buendel");
});

test("F20: 'Hell' und 'So wie mein Geraet' sind sichtbar, aber gesperrt, mit Hinweis", () => {
  assert.match(surface, /\["dark", "Dunkel"\], \["light", "Hell", true\], \["system", "So wie mein Gerät", true\]/);
  // Der select-Helfer setzt disabled aus dem dritten Feld.
  assert.match(surface, /\(\[value, text, gesperrt\]\) => `<option value="\$\{value\}"\$\{gesperrt \? " disabled" : ""\}>/);
  assert.match(surface, /settings-hinweis-hell/);
});

test("F20: die Laufzeit loest jede gespeicherte Wahl auf dunkel auf, solange das helle Thema unfertig ist", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  const runtime = await import("../public/settings-runtime.js");
  assert.equal(runtime.HELLES_THEMA_FERTIG, false);
  for (const wahl of ["light", "system", "dark"]) assert.equal(runtime.resolvedTheme(wahl), "dark", wahl);
});

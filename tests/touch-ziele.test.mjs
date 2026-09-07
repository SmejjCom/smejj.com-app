// smejj.com — Touch-Ziele 44 px ueberall (Betreiber-Auftrag 2026-09-07, "Teste du selber, weiter").
// Rundgang durch alle Ansichten: Pixel 7 hoch (412 px) und quer (863 px), Pixel Tablet (800 px).
// Ueber 600 px galt das Schreibtisch-Mass (Seitenleiste 36, Chat-Zeilen 28, Reiter 42) —
// auf Touch-Geraeten zu klein. Am Handy blieben Banner (42), Profilbild (28x26) und
// Werkzeug-Zeilen (42) uebrig. Diese Zusagen halten beide Heilungen fest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lade = async (datei) => {
  const quelle = readFileSync(new URL(`../public/${datei}`, import.meta.url), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));
};
const kompakt = await lade("kompakt.js");
const dock = await lade("mobil-dock.js");

test("kompakt.js: ueber 600 px nur bei Touch (pointer:coarse) — Seitenleiste, Chat-Zeilen, Reiter, rechte Leiste, Profil auf 44 px", () => {
  const block = kompakt.REGELN.match(/@media \(min-width:601px\) and \(pointer:coarse\)\{([^@]*)\}/);
  assert.ok(block, "der Touch-Block fehlt oder hat die falsche Bedingung");
  for (const sel of [".sidebar .nav-button.nav-button", ".nav-start .nav-button.nav-button", ".browser-panel-nav button", ".spur-reiter button", "#profileDock button"]) {
    assert.ok(block[1].includes(sel), `${sel} fehlt im Touch-Block`);
  }
  assert.match(block[1], /min-height:44px/);
  assert.doesNotMatch(block[1], /font-size|width:/, "nur Mindesthoehen — keine Schrift, keine Breiten");
});

test("kompakt.js: die Maus am Schreibtisch bleibt unberuehrt (kein Block ohne pointer:coarse ueber 600 px)", () => {
  const ueber600 = [...kompakt.REGELN.matchAll(/@media \(min-width:601px\)([^{]*)\{/g)].map((m) => m[1]);
  assert.ok(ueber600.length >= 1);
  for (const bedingung of ueber600) assert.match(bedingung, /pointer:coarse/);
});

test("mobil-dock.js: Sitzungs-Banner, Profilbild-Knopf und Werkzeug-Zeilen am Handy 44 px", () => {
  assert.match(dock.REGELN, /#smejj-sitzung-abgelaufen a,body #smejj-sitzung-abgelaufen button\{min-height:44px/);
  assert.match(dock.REGELN, /\.account-picture-choose\.account-picture-choose\{min-height:44px/);
  assert.match(dock.REGELN, /\.view \.toolbar button\{min-height:44px\}/);
});

test("beide Module haengen ohne Marke im Precache (Aenderung braucht nur den CACHE_NAME-Sprung)", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"/assets/kompakt.js",'));
  assert.ok(sw.includes('"/assets/mobil-dock.js",'));
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/kompakt.js").catch(() => {})'));
});

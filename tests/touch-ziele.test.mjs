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
  assert.doesNotMatch(block[1], /font-size/, "keine Schriftgroessen");
  // Runde 3: auch die Schreibfeld-Knoepfe und die Code-Leiste (Tablet 800 px: 38/34/30/32/19 px)
  for (const sel of [".prompt-glass .ghost-button.icon-button", ".prompt-glass .send-button", ".prompt-glass .model-picker .text-chip", ".codeleiste .icon-button", ".codeleiste .repochip", "#codeAufgabe", "#smejj-sitzung-abgelaufen button"]) {
    assert.ok(block[1].includes(sel), `${sel} fehlt im Touch-Block (Runde 3)`);
  }
  assert.ok(!/(width|height):\s*(3[0-9]|4[0-3])px/.test(block[1]), "keine Masse unter 44 px");
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

test("Mikrofon leuchtet beim Diktat in Logofarbe (Chat und Code), sonst normal; Spiegel auf den Code-Knopf", () => {
  assert.match(kompakt.REGELN, /body \[data-start-tool=voice\]\.is-recording,body #codeDiktat\.is-recording\{color:#02fdfd/);
  assert.doesNotMatch(kompakt.REGELN, /is-recording\{[^}]*#ff5c5c/, "kein Rot mehr");
  const quelle = readFileSync(new URL("../public/kompakt.js", import.meta.url), "utf8");
  assert.match(quelle, /export function spiegleDiktat/);
  assert.match(quelle, /attributeFilter: \["class"\]/);
  // Spiegel ohne Browser: Fake-Dokument, Fake-Beobachter
  let beobachtet = null;
  class B { constructor(cb) { this.cb = cb; } observe(el) { beobachtet = el; } }
  const quelleEl = { classList: { contains: () => true } };
  const ziel = { klassen: {}, attrs: {}, classList: { toggle(k, an) { this.k = k; this.an = an; } }, setAttribute(a, v) { this.attrs[a] = v; } };
  const doc = { querySelector: () => quelleEl, getElementById: () => ziel };
  assert.equal(kompakt.spiegleDiktat(doc, B), true);
  assert.equal(beobachtet, quelleEl);
  assert.equal(ziel.classList.an, true);
  assert.equal(ziel.attrs["aria-pressed"], "true");
});

// ---- Rundgang 08.09. (Pixel quer 863 px, Tablet 800 px, pointer:coarse) ---------------------
test("Runde 5: Kopfknoepfe, Werkzeugzeilen, Konto-Reiter und Plus-Menue auf grobem Zeigegeraet 44 px", () => {
  const k = readFileSync(new URL("../public/kompakt.js", import.meta.url), "utf8");
  // gemessen: view-chrome 32x32, toolbar 40, account-nav 40, plus-menu 38 (min-height stand auf 34)
  assert.match(k, /\.view \.view-chrome button,body \.premium-view \.view-chrome button\{width:44px!important;height:44px!important\}/);
  assert.match(k, /\.view \.toolbar button,body \.view \.panel-actions button,body \.plus-menu\.plus-menu button,/);
  assert.match(k, /#profile \.account-nav button,body #profile \.account-actions button,/);
  assert.match(k, /\.account-picture-actions button,body #profile \.account-picture-choose\{min-height:44px\}/);
  assert.match(k, /\.view input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\),body \.view select,/);
  assert.match(k, /\.view textarea,body \.view form button\{min-height:44px\}/);
  assert.match(k, /#start \.prompt-glass #startMessage,body #code \.codefeld #codeAufgabe\{min-height:44px\}/, "das Start-Feld selbst mass 43,5 px");
  // Der Block gilt weiterhin nur fuer grobe Zeigegeraete ueber 600 px — die Maus bleibt unberuehrt.
  const block = k.split('"@media (min-width:601px) and (pointer:coarse){"')[1];
  assert.ok(block.includes("account-picture-choose"), "die neuen Regeln liegen IM coarse-Block");
});


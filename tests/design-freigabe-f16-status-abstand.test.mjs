// smejj.com — Befund F16 der A-bis-Z-Pruefung 14.09. (docs/qa/befunde-2026-09-14.md):
// Einstellungen bei offenem Browser-Panel (Desktop 1094 px, Panel 514 px) —
// der Kopfzeile bleiben 293 px, der Textblock schrumpfte auf das Wort
// "Einstellungen" (231 px) und die Marke "Lokal gespeichert" (134 px, nowrap)
// ragte 93 px ueber den Rand, halb unter dem Panel. Gemessen headless am 14.09.
// Der Fix in public/settings-surface.css: die Kopfzeile darf umbrechen, der
// Textblock verlangt 320 px, der Abstand ist fest (24 px waagerecht, 12 px
// senkrecht). Diese Zusagen lesen die echte Quelle; die Masse selbst misst
// ein headless Chrome (siehe Prueffbefehle im Befund).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/settings-surface.css", import.meta.url), "utf8");
// Nur der Grundteil (vor der ersten Medienabfrage): die 480-px-Regel setzte
// flex-wrap schon immer, aber eben erst unter 480 px — bei 1094 px griff sie nie.
const grund = css.slice(0, css.indexOf("@media"));
const regel = (auswahl) => {
  const m = grund.match(new RegExp(`${auswahl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
};
// Gemessene Breiten (Chrome headless 14.09.): Marke 134 px; Kopfzeile bei
// 1094 px mit Browser-Panel 293 px, bei 900 px ohne Panel 628 px.
const MARKE_PX = 134;
const KOPF_1094_PANEL_PX = 293;
const KOPF_900_PX = 628;

test("F16: die Kopfzeile darf im Grundzustand umbrechen und hat einen festen Abstand", () => {
  const kopf = regel("#settings .settings-header");
  assert.ok(kopf, "Grundregel #settings .settings-header fehlt");
  assert.match(kopf, /flex-wrap:\s*wrap/, "ohne flex-wrap ragt die Marke bei Enge ueber den Rand");
  assert.match(kopf, /gap:\s*12px 24px/, "fester Abstand 12 px senkrecht, 24 px waagerecht");
});

test("F16: der Textblock verlangt 320 px — nur er, nicht die Statusmarke", () => {
  const text = regel("#settings .settings-header > div:first-child");
  assert.ok(text, "Regel fuer den Textblock (> div:first-child) fehlt");
  assert.match(text, /flex:\s*1 1 320px/);
  assert.match(text, /min-width:\s*0/);
  // Die Marke ist ebenfalls ein div: eine Regel "> div" ohne :first-child
  // wuerde ihr flex: none ueberschreiben.
  assert.doesNotMatch(grund, /\.settings-header > div\s*\{/, "'> div' ohne :first-child traefe auch die Marke");
  const marke = regel("#settings .settings-status");
  assert.match(marke, /flex:\s*none/, "kein Rueckbau: die Marke bleibt flex: none");
  assert.match(marke, /white-space:\s*nowrap/, "kein Rueckbau: ab 481 px bleibt die Marke einzeilig");
});

test("F16: Rechnung — bei 1094 px mit Panel bricht die Marke um, bei 900 px ohne Panel nicht", () => {
  const basis = Number((regel("#settings .settings-header > div:first-child").match(/flex:\s*1 1 (\d+)px/) || [])[1]);
  const spalte = Number((regel("#settings .settings-header").match(/gap:\s*\d+px (\d+)px/) || [])[1]);
  assert.ok(basis > 0 && spalte > 0, "Basis und Spaltenabstand muessen lesbar sein");
  const einzeilig = (kopf) => basis + spalte + MARKE_PX <= kopf;
  assert.equal(einzeilig(KOPF_1094_PANEL_PX), false, "bei 293 px muss die Marke unter die Unterzeile");
  assert.equal(einzeilig(KOPF_900_PX), true, "bei 628 px bleibt die Marke neben der Ueberschrift");
  // Und der Textblock darf nie schmaler werden als das Wort "Einstellungen"
  // (231 px bei 38 px Schrift) — sonst bricht die Ueberschrift selbst um.
  assert.ok(basis >= 231);
});

// smejj.com — Ansichten nach dem Login am Handy (Betreiber 07.09.: "Profil und Einstellungen
// sind Desktopversion"). Reiter in einer wischbaren Zeile, Kopf kompakt, Felder 44 px,
// Knoepfe volle Breite, Konsole weg, Raster/Tabellen scrollen in sich.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/mobil-ansichten.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("nur am Handy, geschlossener Block, Klammern ausgeglichen", () => {
  assert.ok(m.REGELN.startsWith("@media (max-width:600px){") && m.REGELN.endsWith("}"));
  assert.equal((m.REGELN.match(/\{/g) || []).length, (m.REGELN.match(/\}/g) || []).length);
});

test("Reiter von Einstellungen, Konto und Verlauf werden EINE wischbare Zeile mit 44-px-Zielen", () => {
  assert.match(m.REGELN, /#settings \.settings-nav\.settings-nav,body #profile \.account-nav\.account-nav,body #chatHistory \.ch-chips\.ch-chips\{display:flex;flex-wrap:nowrap;align-items:center;overflow-x:auto/);
  assert.match(m.REGELN, /\.settings-nav-button\.settings-nav-button,body #profile \.account-nav button,body #chatHistory \.ch-chips \.ch-chip\{flex:0 0 auto;height:44px;min-height:44px;white-space:nowrap/);
  assert.match(m.REGELN, /\.settings-nav-sub[^}]*\{display:none\}/, "Untertitel der Reiter weichen in der Zeile");
});

test("Felder und Auswahl 44 px und volle Breite, Aktionsknoepfe untereinander", () => {
  assert.match(m.REGELN, /#settings \.settings-row select,[^{]*\{width:100%;min-height:44px;box-sizing:border-box\}/);
  assert.match(m.REGELN, /\.account-actions\.account-actions,body #settings \.settings-action\.settings-action,[^{]*\{display:flex;flex-direction:column;gap:8px\}/);
  assert.match(m.REGELN, /\.account-picture-choose\{width:100%;min-height:44px;justify-content:center\}/);
});

test("Konsole kompakt statt weg, Zeilen per flex-wrap (nicht column), Raster einspaltig, Tabellen scrollen in sich", () => {
  assert.match(m.REGELN, /body \.view \.output\.output\{min-height:44px;padding:10px 12px\}/);
  assert.doesNotMatch(m.REGELN, /settings-row\.settings-row\{[^}]*flex-direction:column/, "column liess die Zeile auf 230 px Leere wachsen (gemessen 07.09.)");
  assert.match(m.REGELN, /\.settings-row\.settings-row\{flex-wrap:wrap/);
  assert.match(m.REGELN, /\.status-grid\.status-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(m.REGELN, /body \.view table,body #profile \.account-status\{display:block;max-width:100%;overflow-x:auto/);
});

test("keine Schrift unter 15 px, keine Ziele unter 44 px; Modul haengt an mobil-dock.js und im Precache", () => {
  for (const [, px] of m.REGELN.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(px) >= 15, `font-size ${px}px`);
  assert.ok(!/(min-height|height):\s*(3[0-9]|4[0-3])px/.test(m.REGELN));
  const dock = readFileSync(new URL("../public/mobil-dock.js", import.meta.url), "utf8");
  assert.ok(dock.includes('import("/assets/mobil-ansichten.js").catch(() => {})'));
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"/assets/mobil-ansichten.js",'));
});

// ---- Betreiber-Screenshot 08.09. 08:48: Einstellungen liessen sich seitlich verschieben --------
test("Einstellungen schieben nicht mehr seitlich: Rasterspalte gedeckelt, Felder duerfen schrumpfen", () => {
  assert.match(m.REGELN, /#settings\.view,body #profile\.view\{overflow-x:hidden\}/);
  // Wurzel war grid-template-columns:403px — ein Rasterfeld hat min-width:auto und waechst mit dem Inhalt.
  assert.match(m.REGELN, /\.settings-content\.settings-content\{grid-template-columns:minmax\(0,1fr\);min-width:0\}/);
  assert.match(m.REGELN, /\.settings-content>\*,body #settings \.settings-panel\.settings-panel\{min-width:0;max-width:100%\}/);
  assert.match(m.REGELN, /\.ac-sub,body #settings \.ac-subhead[^{]*\{white-space:normal\}/, "nowrap-Untertitel trieb die Breite");
  assert.match(m.REGELN, /#settings select,body #settings input[^{]*\{max-width:100%;min-width:0;box-sizing:border-box\}/);
});

test("Cline-Knoepfe einspaltig und 44 px hoch (gemessen 177x38 in zwei Spalten)", () => {
  assert.match(m.REGELN, /\.cline-actions\.cline-actions\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(m.REGELN, /\.cline-actions button\{width:100%;min-height:44px\}/);
});

test("Suchfeld in der Reiterzeile bleibt bedienbar (schrumpfte auf 26 px)", () => {
  assert.match(m.REGELN, /\.settings-nav #settingsSuche\{flex:0 0 clamp\(160px,48vw,220px\);min-width:160px;min-height:44px/);
});

test("Kippschalter und Rechtslinks sind volle Ziele (gemessen 46x26 und 16 px hoch)", () => {
  assert.match(m.REGELN, /\.settings-switch,body #profile \.settings-switch\{min-height:44px;display:inline-flex;align-items:center\}/);
  assert.match(m.REGELN, /\.settings-links a,body \.view \.settings-links a\{min-height:44px;display:inline-flex;align-items:center\}/);
});


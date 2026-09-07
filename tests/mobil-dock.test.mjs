// smejj.com — Schlankes Dock am Handy (Betreiber-Auftrag 2026-09-07, "100 % Responsive").
// Gemessen im Pixel-7-Emulator (412 px) und auf den iPhone-Screenshots des Betreibers:
// doppelte untere Safe-Area (68 pt Leere), Code-Leiste in zwei Zeilen, Platzhalter in
// zwei Zeilen, Start-Feld wuchs bis 324 px. Diese Zusagen halten die Heilung fest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/mobil-dock.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("Regeln gelten nur am Handy (bis 600 px) und sind ein geschlossener Block", () => {
  assert.ok(m.REGELN.startsWith("@media (max-width:600px){"));
  assert.ok(m.REGELN.endsWith("}"));
  const auf = (m.REGELN.match(/\{/g) || []).length, zu = (m.REGELN.match(/\}/g) || []).length;
  assert.equal(auf, zu, "jede Klammer wird geschlossen");
});

test("untere Safe-Area nur EINMAL: Feld und Code-Leiste geben ihren Rand ab, die Huelle behaelt ihn", () => {
  assert.match(m.REGELN, /#start \.prompt-glass\.prompt-glass\.prompt-glass\{margin-bottom:0/);
  assert.match(m.REGELN, /#code \.codeunten\.codeunten\.codeunten\{padding-bottom:0\}/);
  assert.doesNotMatch(m.REGELN, /main\.shell[^{]*\{[^}]*padding/, "die Huelle wird nicht angefasst — sie traegt die Safe-Area (mobil-composer.css)");
});

test("beide Felder wachsen bis ~5 Zeilen (148 px) und scrollen dann innen", () => {
  assert.equal(m.MAX_FELD_HOEHE, 148);
  assert.match(m.REGELN, /#startMessage\{max-height:148px;overflow-y:auto\}/);
  assert.match(m.REGELN, /#codeAufgabe\{max-height:148px;overflow-y:auto;min-height:44px\}/);
});

test("Code-Leiste bleibt EINE Zeile: Rechnung bei 368 px Innenbreite geht auf, Ziele 44 px", () => {
  assert.match(m.REGELN, /\.codeleiste\.codeleiste\{flex-wrap:nowrap/);
  assert.match(m.REGELN, /\.repochip\.repochip\{max-width:80px;min-width:44px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(m.REGELN, /#codeTiefeAnzeige\{display:none\}/, "die reine Anzeige 'Mittel' faellt weg, sie ist kein Ziel");
  // Modus 44 + Stufe 80 + Anhang 44 + Diktat 44 + Modell 64 + Senden 44 + 5 Luecken a 4
  assert.ok(44 + 80 + 44 + 44 + 64 + 44 + 5 * 4 < 368);
  assert.ok(!/height:\s*(3[0-9]|4[0-3])px/.test(m.REGELN), "keine Ziele unter 44 px");
  assert.doesNotMatch(m.REGELN, /font-size/, "keine Schriftgroessen (grosse Schrift, Betreiber-Regel)");
});

test("Platzhalter des Code-Felds bricht nicht mehr um", () => {
  assert.match(m.REGELN, /#codeAufgabe::placeholder\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
});

test("Verlauf scrollt in sich (contain, weich), Code-Bloecke waagerecht, Seite nie seitlich", () => {
  assert.match(m.REGELN, /#startLog\.start-log,body #code #codeLogHalter\.code-log-halter\{overflow-y:auto;overscroll-behavior:contain;scroll-behavior:smooth/);
  assert.match(m.REGELN, /\.start-log \.entry pre,body \.code-log-halter pre[^{]*\{max-width:100%;overflow-x:auto/);
  assert.match(m.REGELN, /body,body main\.shell\.shell\{overflow-x:clip\}/, "clip statt hidden: kein Scroll-Container, sticky bleibt heil");
});

test("Haken in chat-actions-menu.js (nur am Handy) und Eintrag im Service-Worker-Vorrat", () => {
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('beiHandy(() => import("/assets/mobil-dock.js").catch(() => {}));'));
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"/assets/mobil-dock.js",'), "ohne Precache-Eintrag ist das Modul offline tot");
});

test("Stil wird genau einmal eingehaengt", () => {
  const kopf = { children: [], appendChild(k) { this.children.push(k); } };
  const doc = { head: kopf, getElementById: (id) => kopf.children.find((k) => k.id === id) || null, createElement: () => ({}) };
  assert.equal(m.sorgeFuerStil(doc), true);
  assert.equal(m.sorgeFuerStil(doc), false);
  assert.equal(kopf.children.length, 1);
  assert.equal(kopf.children[0].textContent, m.REGELN);
});

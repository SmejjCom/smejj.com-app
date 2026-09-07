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

// ---- Runde 4 (Betreiber 07.09. abends): Modell-Menue, Chat-Glas, Vollbild-Versatz ----------
test("Modell-Menue am Handy: Picker static, Menue absolut ueber die Glasbreite (fixed scheitert am backdrop-filter), eine Spalte, Text bricht um", () => {
  assert.match(m.REGELN, /#start \.prompt-glass \.model-picker\.model-picker\{position:static\}/);
  assert.match(m.REGELN, /#startModellMenue\.code-modus-menue,[^{]*\{position:absolute!important;left:6px!important;right:6px!important;top:auto!important;bottom:calc\(100% \+ 8px\)!important;width:auto!important/);
  assert.doesNotMatch(m.REGELN, /model-submenu[^{]*\{position:fixed/, "fixed landet unter backdrop-filter bei y=-125 (gemessen 07.09.)");
  assert.match(m.REGELN, /#start:not\(\.has-start-chat\) #startModellMenue\.code-modus-menue[^{]*\{top:calc\(100% \+ 8px\)!important;bottom:auto!important\}/, "leere Startseite: nach unten aufklappen");
  assert.match(m.REGELN, /#startModellMenue\.code-modus-menue button,[^{]*\{display:flex;align-items:center;gap:10px;width:100%;flex:0 0 auto;min-height:44px;white-space:normal/);
  assert.match(m.REGELN, /\.modus-links,body \.model-submenu \.model-submenu-name\{flex:1 1 auto;min-width:0;white-space:normal/);
});

test("Chat ohne Seitwaerts-Schieben: Eintraege brechen Links, Tabellen scrollen in sich; Frage als Glasblase, Kopfglas", () => {
  assert.match(m.REGELN, /#startLog \.entry,body #codeLogHalter \.entry\{max-width:100%;overflow-wrap:anywhere;word-break:break-word\}/);
  assert.match(m.REGELN, /#startLog \.entry table,[^{]*\{display:block;max-width:100%;overflow-x:auto/);
  assert.match(m.REGELN, /\.entry\.user\.user\{margin-left:14%;max-width:86%;[^}]*backdrop-filter:blur/);
  assert.match(m.REGELN, /\.mobil-kopfglas\{position:fixed;top:0;left:0;right:0;height:calc\(env\(safe-area-inset-top,0px\) \+ 52px\);z-index:73;pointer-events:none/);
  assert.match(m.REGELN, /body:not\(\.mobil-chat-offen\) \.mobil-kopfglas\{display:none\}/);
});

test("Vollbild-Versatz: gemessen wird nur standalone, hochkant, ohne Tastatur, plausibel; Rahmen und Flaechen rechnen ihn ein", () => {
  const basis = { standalone: true, apple: true, schirmHoehe: 852, schirmBreite: 393, innerHeight: 800, tastaturOffen: false };
  assert.equal(m.misstVersatz(basis), 52, "852 - 800 = 52 (Betreiber-iPhone, 17:32)");
  assert.equal(m.misstVersatz({ ...basis, standalone: false }), 0, "im Browser-Tab nichts");
  assert.equal(m.misstVersatz({ ...basis, apple: false, schirmHoehe: 915, schirmBreite: 412, innerHeight: 839 }), 0, "Android-TWA: 76 px sind Status- und Navigationsleiste, kein Fehler");
  assert.equal(m.misstVersatz({ ...basis, tastaturOffen: true }), 0, "offene Tastatur verfaelscht innerHeight");
  assert.equal(m.misstVersatz({ ...basis, schirmBreite: 900, schirmHoehe: 393, innerHeight: 340 }), 0, "quer nicht");
  assert.equal(m.misstVersatz({ ...basis, innerHeight: 600 }), 0, "252 px sind kein Statusleisten-Versatz");
  assert.equal(m.misstVersatz({ ...basis, innerHeight: 852 }), 0);
  assert.match(m.REGELN, /@media \(display-mode:standalone\) and \(max-width:600px\)\{body::after\{bottom:calc\(-1 \* var\(--vollbild-fehl,0px\)\)\}/);
  // Betreiber 22:32: mit dem Fehlbetrag auf den dvh-Flaechen rutschte das Dock unter den Schirm — 100dvh ist die volle Hoehe.
  assert.doesNotMatch(m.REGELN, /100dvh \+ var\(--vollbild-fehl/, "der Fehlbetrag gilt nur fuer position:fixed, nie fuer dvh-Hoehen");
});

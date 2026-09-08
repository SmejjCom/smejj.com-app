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
  // Die Huelle traegt die Safe-Area (mobil-composer.css); angefasst wird sie NUR bei offener Tastatur (Punkt 7).
  const huellenRegeln = [...m.REGELN.matchAll(/([^{}]*main\.shell[^{]*)\{[^}]*padding/g)].map((t) => t[1]);
  assert.ok(huellenRegeln.every((sel) => sel.includes("html.tastatur-offen")), `Huelle nur bei offener Tastatur: ${huellenRegeln.join(" | ")}`);
});

test("beide Felder wachsen bis ~5 Zeilen (148 px) und scrollen dann innen", () => {
  assert.equal(m.MAX_FELD_HOEHE, 148);
  assert.match(m.REGELN, /#startMessage\{max-height:148px;overflow-y:auto\}/);
  assert.match(m.REGELN, /#codeAufgabe\{max-height:148px;overflow-y:auto;min-height:44px\}/);
});

test("Code-Leiste bleibt EINE Zeile: Rechnung bei 368 px Innenbreite geht auf, Ziele 44 px", () => {
  assert.match(m.REGELN, /\.codeleiste\.codeleiste\{flex-wrap:nowrap/);
  assert.match(m.REGELN, /\.repochip\.repochip\{display:inline-block;max-width:110px;min-width:44px/);
  assert.match(m.REGELN, /#codeTiefeAnzeige\{display:none\}/, "die reine Anzeige 'Mittel' faellt weg, sie ist kein Ziel");
  // Die Chips sind flex:0 1 auto — sie duerfen schrumpfen. Massgeblich ist darum die Rechnung mit den
  // MINDESTBREITEN: Modus 44 + Stufe 44 + Anhang 44 + Diktat 44 + Modell 64 + Senden 44 + 5 Luecken a 4.
  assert.match(m.REGELN, /\.repochip\.repochip\{[^}]*flex:0 1 auto\}/);
  assert.ok(44 + 44 + 44 + 44 + 64 + 44 + 5 * 4 < 368);
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
  assert.match(m.REGELN, /#startLog \.entry table,[^{]*\{display:block;width:max-content;max-width:100%;overflow-x:auto/);
  // 08.09.: Zellen wurden buchstabenweise zerhackt ("Ze/it") — sie brechen jetzt gar nicht mehr,
  // die Tabelle scrollt stattdessen in sich.
  assert.match(m.REGELN, /table td,body #startLog \.entry table th,[^{]*\{overflow-wrap:normal;word-break:normal;white-space:nowrap;min-width:72px\}/);
  assert.match(m.REGELN, /#startLog \.entry a\{overflow-wrap:anywhere\}/, "lange Links ausserhalb von Tabellen brechen weiter um");
  assert.match(m.REGELN, /\.entry\.user\.user\{margin-left:14%;max-width:86%;[^}]*backdrop-filter:blur/);
  assert.match(m.REGELN, /\.mobil-kopfglas\{position:fixed;top:0;left:0;right:0;height:calc\(env\(safe-area-inset-top,0px\) \+ 52px\);z-index:73;pointer-events:none/);
  assert.match(m.REGELN, /body:not\(\.mobil-chat-offen\) \.mobil-kopfglas\{display:none\}/);
});

test("Vollbild-Rahmen: bedingungsloser Ueberstand nach unten (keine Messung mehr), nie dvh-Flaechen", () => {
  assert.equal(m.sichtbareUnterkante({ offsetTop: 0, height: 852 }), 852, "voller Schirm");
  assert.equal(m.sichtbareUnterkante({ offsetTop: 0, height: 512.4 }), 512, "Tastatur offen: Rahmen endet an der Tastatur");
  assert.equal(m.sichtbareUnterkante({ offsetTop: 0, height: 0 }), 0, "unbekannt -> Rueckfall 100%");
  // 08.09. 08:52: auch der visualViewport meldete 800 statt 852 — in der Apple-App zaehlt der Bildschirm
  assert.equal(m.schirmUnterkante({ schirmHoehe: 852, schirmBreite: 393, innerWidth: 393, innerHeight: 800 }), 852, "hochkant: lange Seite");
  assert.equal(m.schirmUnterkante({ schirmHoehe: 852, schirmBreite: 393, innerWidth: 852, innerHeight: 350 }), 393, "quer: kurze Seite (iOS meldet screen immer hochkant)");
  assert.equal(m.schirmUnterkante({ schirmHoehe: 0, schirmBreite: 0, innerWidth: 1, innerHeight: 1 }), 0);
  const quelle2 = readFileSync(new URL("../public/mobil-dock.js", import.meta.url), "utf8");
  assert.match(quelle2, /\(apple && standalone\(\)\)\s*\? schirmUnterkante/, "Apple-App nimmt die Bildschirmkante");
  // 08.09. 08:48-08:55: der Balken kam auch mit screen.height zurueck. Drei Messwege sind gescheitert,
  // darum reicht der Rahmen jetzt ohne jede Messung 120 px unter die Kante — wie der Grund seit 05.09.
  assert.match(m.REGELN, /@media \(display-mode:standalone\) and \(max-width:600px\)\{body::after\{top:0;bottom:-120px;height:auto\}\}/);
  assert.doesNotMatch(m.REGELN, /body::after\{[^}]*var\(--vv-unten/, "keine gemessene Rahmenhoehe mehr");
  assert.doesNotMatch(m.REGELN, /vollbild-fehl/, "innerHeight-Messung ist raus (Betreiber 08.09. 01:49: Balken kam nach der Tastatur zurueck)");
  assert.doesNotMatch(m.REGELN, /100dvh \+ var\(/, "dvh-Flaechen bleiben unangetastet");
  const quelle = readFileSync(new URL("../public/mobil-dock.js", import.meta.url), "utf8");
  assert.match(quelle, /vv\.addEventListener\("resize", setze\); vv\.addEventListener\("scroll", setze\);/);
});

test("Punkt 7: bei offener Bildschirmtastatur faellt der untere Sicherheitsrand weg — Feld buendig an der Tastaturkante", () => {
  assert.equal(m.tastaturOffen({ fokusImFeld: true, sichtbarUnten: 512, schirmHoehe: 852 }), true, "Feld fokussiert, Flaeche um die Tastatur kuerzer");
  assert.equal(m.tastaturOffen({ fokusImFeld: true, sichtbarUnten: 852, schirmHoehe: 852 }), false, "Hardware-Tastatur: Flaeche voll, kein Umbau");
  assert.equal(m.tastaturOffen({ fokusImFeld: false, sichtbarUnten: 512, schirmHoehe: 852 }), false, "ohne Fokus nie");
  assert.equal(m.tastaturOffen({ fokusImFeld: true, sichtbarUnten: 0, schirmHoehe: 0 }), true, "ohne visualViewport zaehlt der Fokus");
  assert.match(m.REGELN, /html\.tastatur-offen\{--sa-bottom:0px\}/);
  assert.match(m.REGELN, /html\.tastatur-offen main\.shell\.shell\{padding-bottom:0\}/);
  assert.match(m.REGELN, /html\.tastatur-offen #start \.prompt-glass\.prompt-glass\.prompt-glass,html\.tastatur-offen #code \.codeunten\.codeunten\.codeunten\{margin-bottom:0;padding-bottom:0\}/);
  const quelle = readFileSync(new URL("../public/mobil-dock.js", import.meta.url), "utf8");
  assert.match(quelle, /doc\.addEventListener\("focusout", \(\) => setTimeout\(setze, 120\), true\);/, "focusout mit capture und Verzoegerung");
});

// ---- Runde 5 (Betreiber-Screenshots 08.09. 08:48-08:55) -------------------------------------
test("Code-Bereich: Gruss und Verlauf liegen unter dem Kopfglas, nicht darunter versteckt", () => {
  assert.match(m.REGELN, /body\.mobil-chat-offen #code \.codegruss\{padding-top:calc\(env\(safe-area-inset-top,0px\) \+ 60px\)\}/);
  assert.match(m.REGELN, /#code #codeLogHalter\.code-log-halter\{padding-top:calc\(env\(safe-area-inset-top,0px\) \+ 56px\);scroll-padding-top:/);
});

test("Stufe-Chip kuerzt mit Ellipse statt beidseitig abzuschneiden (inline-flex kann das nicht)", () => {
  assert.match(m.REGELN, /\.codeleiste \.repochip\.repochip\{display:inline-block;max-width:110px;min-width:44px;height:44px;line-height:44px;text-align:center;overflow:hidden;text-overflow:ellipsis/);
  assert.doesNotMatch(m.REGELN, /\.repochip\.repochip\{display:inline-flex/, "inline-flex laesst text-overflow verpuffen");
  assert.match(m.REGELN, /#codeModusChip\.repochip\{max-width:72px\}/, "der kurze Modus-Chip macht dem Stufen-Chip Platz");
});

test("Diagnose-Messzeile: liest Schirm, Fenster, sichtbare Flaeche, Safe-Areas und Modus (nur installierte App)", () => {
  const doc = {
    documentElement: {},
    body: { appendChild() {}, },
    createElement: () => ({ style: { cssText: "" }, getBoundingClientRect: () => ({ height: 34 }), remove() {} }),
    querySelector: () => null,
  };
  const win = { screen: { width: 393, height: 852 }, innerWidth: 393, innerHeight: 800,
    visualViewport: { width: 393, height: 800, offsetTop: 0 }, devicePixelRatio: 3, navigator: { standalone: true } };
  globalThis.getComputedStyle = () => ({});
  const gemessen = m.messwerte(win, doc);
  assert.equal(gemessen.schirm, "393x852");
  assert.equal(gemessen.fenster, "393x800", "genau dieser Unterschied ist der Balken");
  assert.equal(gemessen.sichtbar, "393x800+0");
  assert.equal(gemessen.saUnten, 34);
  assert.match(gemessen.modus, /standalone/);
  // Die Zeile darf NUR in der installierten App erscheinen — im Browser nie.
  const quelle = readFileSync(new URL("../public/mobil-dock.js", import.meta.url), "utf8");
  assert.match(quelle, /standalone\)"\)\.matches \|\| navigator\.standalone === true\) zeigeMesszeile\(\)/);
  assert.match(quelle, /setTimeout\(\(\) => zeile\.remove\(\), 15000\)/, "verschwindet von selbst");
});


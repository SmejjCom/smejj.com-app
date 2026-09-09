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
  // Die Huelle traegt die Safe-Area (mobil-composer.css, main.shell padding-bottom). Angefasst wird sie
  // in genau ZWEI Faellen: bei offener Tastatur faellt sie auf 0 (Punkt 7), und in der installierten App
  // bekommt sie einen Mindestwert, weil iOS dort seit dem Wechsel auf status-bar-style "default"
  // safe-area-inset-bottom mit 0 meldet (gemessen 08.09. im Simulator). Verdoppelt wird sie nie:
  // das Feld und die Code-Leiste geben ihren eigenen Rand ab (die beiden Zusagen darueber).
  const huellenRegeln = [...m.REGELN.matchAll(/([^{}]*main\.shell[^{]*)\{[^}]*padding/g)].map((t) => t[1]);
  assert.ok(
    huellenRegeln.every((sel) => sel.includes("html.tastatur-offen") || sel.includes("html:not(.tastatur-offen)")),
    `Huelle nur fuer Tastatur oder Mindestabstand: ${huellenRegeln.join(" | ")}`,
  );
  // In der installierten App faellt der Rand auf 0: der Home-Balken liegt in den 62 pt UNTER der
  // Flaeche (Vollbild oben), ein Abstand wuerde dort nur Platz verschenken.
  assert.ok(m.REGELN.includes('html:not(.tastatur-offen) main.shell.shell{padding-bottom:0}'));
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
  assert.doesNotMatch(m.REGELN, /top:calc\(100% \+ 8px\)!important;bottom:auto!important/, "seit 08.09. sitzt das Glas auch leer unten — das Menue klappt immer nach oben");
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

test("Vollbild oben, und der Streifen unten wird unsichtbar gemacht statt bekaempft", () => {
  // GEMESSEN 08.09. in der installierten App im iPhone-Simulator (Diagnoseseite, drei Messstreifen):
  // Schirm 402x874, Fenster 402x812, fixed inset:0 = 812, 100dvh = 812 — es fehlten 62 pt, genau
  // safe-area-inset-top. Die fehlende Flaeche liegt AUSSERHALB des WebViews; ein Rahmen mit
  // bottom:-120px endete dort ebenso. Ursache: apple-mobile-web-app-status-bar-style
  // "black-translucent" -> UIWebClipStatusBarStyleLegacyBlackTranslucent in der Webclip-Datei.
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  // Betreiber-Anweisung 08.09.: Vollbild oben. Im Simulator gemessen — es gibt genau zwei Zustaende:
  //   black-translucent -> Flaeche top 0 / hoch 812: Vollbild oben, 62 pt Schwarz unten
  //   black oder default -> hoch 874: nichts unten, dafuer ein Statusleistenbalken oben
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /viewport-fit=cover/, "ohne cover waere die Flaeche erst recht kleiner");
  assert.doesNotMatch(m.REGELN, /vollbild-fehl|--vv-unten/, "keine gemessene Rahmenhoehe mehr");
  // Der Streifen unten wird unsichtbar gemacht statt bekaempft: gleiche Farbe, kein Rahmen, kein Schein.
  assert.match(m.REGELN, /@media \(display-mode:standalone\) and \(max-width:600px\)\{html\{--sa-bottom:0px;background:#000\}/);
  assert.match(m.REGELN, /body::before\{background:[^}]*#000 100%\) #000\}/, "Grund laeuft auf die Farbe dahinter aus");
  assert.match(m.REGELN, /body::after\{box-shadow:inset 0 1px 0[^}]*inset 0 26px 40px -26px[^}]*\}/, "unten weder Strich noch Schein");
  assert.ok(!/body::after\{box-shadow:[^}]*inset 0 -1px/.test(m.REGELN), "kein unterer Strich");
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

// ---- Betreiber-Screenshots 08.09. 14:24/14:29 ------------------------------------------------
test("Startseite sammelt sich unten statt mittig — unten blieben 153 px leer", () => {
  assert.match(m.REGELN, /#start:not\(\.has-start-chat\) \.home-feed\.home-feed\{justify-content:flex-end;gap:10px\}/);
  assert.match(m.REGELN, /\.home-hero\.home-hero\{margin-bottom:2px\}/);
});

test("Modell-Menue liegt ueber den Werkzeug-Kacheln (Stapel-Kontext des Glases)", () => {
  // .prompt-glass traegt backdrop-filter -> eigener Stapel-Kontext; .start-chips kommt im DOM
  // spaeter und gewann bei gleichem Stapelwert. Der Fingerdruck traf die Kachel statt der Zeile.
  assert.match(m.REGELN, /#start \.prompt-glass\.prompt-glass\{position:relative;z-index:70\}/);
  assert.match(m.REGELN, /#startModellMenue\.code-modus-menue,[^{]*\{background:#0d1219;z-index:80!important\}/, "opak, damit nichts durchscheint");
});

test("Aktionen an Antworten sind am Handy lesbar (kein Zeigen, kein Hover)", () => {
  assert.match(m.REGELN, /#startLog \.msg-actions \.msg-act,body #codeLogHalter \.msg-actions \.msg-act\{color:rgba\(246,243,238,\.82\)\}/);
});

test("Antworten tragen dieselben Menuepunkte wie eigene Fragen (Kopieren, Vorlesen)", () => {
  const menue = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  const kopf = menue.split("const MENU_KOPF")[1];
  const assistant = kopf.split("assistant: Object.freeze([")[1].split("])")[0];
  for (const act of ["copy", "speak", "regen"]) assert.ok(assistant.includes(`act: "${act}"`), `Antwort-Menue braucht ${act}`);
});

test("Die drei Punkte unter einer Antwort sind antippbar", () => {
  // Gemessen 08.09.: #startLog .msg-actions traegt pointer-events:none und am Handy overflow-x:auto —
  // die Leiste war 0 px hoch, ihre Knoepfe ragten heraus und wurden vom Scroll-Container abgeschnitten.
  assert.match(m.REGELN, /#startLog \.msg-actions,body #codeLogHalter \.msg-actions\{pointer-events:auto;min-height:44px;overflow:visible;margin-top:0\}/);
  // Und ein NORMALER Abstand unter dem letzten Eintrag — keine Overlay-Freihaltung.
  // KORRIGIERT 09.09.: hier standen 132px, weil ich das Eingabefeld fuer ein schwebendes Dock
  // hielt. Live nachgemessen ist .home-feed ein Raster (grid-template-rows: minmax(0,1fr) auto)
  // und .prompt-glass steht auf position:relative — ein Geschwister, das nie ueber dem Log liegt.
  // Die 132px hielten also nichts frei, sie verschenkten den Platz (81px Loch statt 16px).
  const treffer = m.REGELN.match(
    /#startLog\.start-log,body #code #codeLogHalter\.code-log-halter\{padding-bottom:(\d+)px\}/,
  );
  assert.ok(treffer, "der Abstand unter dem letzten Eintrag muss gesetzt sein");
  const abstand = Number(treffer[1]);
  assert.ok(abstand >= 8, `Abstand ${abstand}px — die Leiste klebt sonst am Eingabefeld`);
  assert.ok(abstand <= 24, `Abstand ${abstand}px — das ist ein Loch, kein Abstand (Feld ist kein Overlay)`);
});

test("Auf der leeren Startseite steht das EINGABEFELD unten, nicht nur der Block", () => {
  // Gemessen 08.09.: mit flex-end allein sass das Feld bei 441 von 839 — darunter Werkzeugzeile
  // und "Erste Schritte" mit zusammen 374 px. Der Betreiber meinte das Feld ("wie ChatGPT").
  assert.match(m.REGELN, /\.home-feed \.erste-schritte\{order:6\}/);
  assert.match(m.REGELN, /\.home-feed \.start-chips\{order:7\}/);
  assert.match(m.REGELN, /\.home-feed \.prompt-glass\{order:8\}/);
});

test("Das Modell-Menue schliesst beim Tipp daneben — sonst schluckt es die ganze Oberflaeche", () => {
  // GEMESSEN 08.09.: der vorhandene Aussenklick-Handler sitzt in code-flaeche.js, und dieses Modul
  // ist auf der Startseite gar nicht geladen. Das Menue blieb offen und blockierte mit z-index 80
  // alles darunter — unter anderem die Aktionen unter einer Antwort.
  const quelle = readFileSync(new URL("../public/code-modell-menue.js", import.meta.url), "utf8");
  assert.match(quelle, /export function bewacheAussenklick\(menueId, knopf\)/);
  assert.match(quelle, /bewacheAussenklick\(menueId, chip\);/, "beim Oeffnen gesetzt");
  assert.match(quelle, /doc\.addEventListener\("pointerdown", daneben, true\)/, "der Finger meldet pointerdown");
  assert.match(quelle, /e\.key === "Escape"/, "Escape schliesst am Schreibtisch");
  // Abgehaertet nach dem eigenen Rollentest: nur EIN Wachhund gleichzeitig, und contains statt
  // id-Selektor (ein Knopf ohne id haette "#" ergeben — ungueltiger Selektor).
  assert.match(quelle, /aktiverLoeser\?\.\(\);/, "alter Wachhund wird geloest");
  assert.match(quelle, /knopf\?\.contains\?\.\(ziel\)/);
  // schliesseModellMenue muss BEIDE Menues treffen
  const zu = quelle.split("export function schliesseModellMenue")[1].split("}")[0];
  assert.ok(zu.includes("codeModellMenue") && zu.includes("startModellMenue"));
});

test("Auch das Start-Feld selbst haelt 44 px (mass 43,5)", () => {
  assert.match(m.REGELN, /#start \.prompt-glass #startMessage,body #start \.prompt-glass textarea\.textarea\{min-height:44px!important\}/);
});


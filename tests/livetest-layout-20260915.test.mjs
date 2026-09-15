// smejj.com — A-bis-Z-Livetest 15.09.2026, Layout-Befunde am Handy. Lokal gegen die
// Live-Seite nachgemessen (Chrome, Emulation, lokale Dateien):
//
// F5:  390 px, nach "Neu generieren": "Nächste Version" rechts 401 px (Leiste endet
//      bei 379) — nachher 356 px, bei 375 px ebenfalls 356 (Leiste 364).
// F6:  Eingabefeld 40 px hoch, solange mobil-dock.js noch nicht nachgeladen war —
//      nachher 44 px schon aus dem Start-Buendel (Nachdenken/Fusslinks ebenso).
// F11: Android quer 863x304: Werkzeugzeile unten 309/304, "Programmieren" bis
//      "Datei" rechts ausserhalb — nachher unten 302/304, rechts 843/863, Spur zu.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (d) => readFileSync(`public/${d}`, "utf8");

// ---- F5 ----------------------------------------------------------------------
/** Breite der Antwort-Leiste am Handy (gemessene Masse, chat-actions-woerter.js). */
function leistenBreite({ zeitSichtbar }) {
  const aktionen = 5 * 44 + 4 * 6;          // Kopieren … Mehr, Steg 6 px
  const zeit = zeitSichtbar ? 6 + 33 : 0;   // Steg + "15:03"
  const waehler = 6 + 6 + 44 + 1 + 44;      // Steg + margin-left + Pfeil + gap + Pfeil
  return aktionen + zeit + waehler;
}

test("F5 KAPUTT (v883): mit Uhrzeit ragt der Versionswaehler bei 390 und 375 px hinaus", () => {
  for (const [schirm, leiste] of [[390, 368], [375, 353]]) {
    assert.ok(leistenBreite({ zeitSichtbar: true }) > leiste, `${schirm} px: ${leistenBreite({ zeitSichtbar: true })} > ${leiste}`);
  }
});

test("F5 GESUND: mit Waehler weicht die Uhrzeit — alles passt in eine Zeile", () => {
  for (const [schirm, leiste] of [[390, 368], [375, 353]]) {
    assert.ok(leistenBreite({ zeitSichtbar: false }) <= leiste, `${schirm} px: ${leistenBreite({ zeitSichtbar: false })} <= ${leiste}`);
  }
  const q = lies("chat-actions-woerter.js");
  const handy = q.slice(q.indexOf('"@media (max-width:600px){"'));
  assert.match(handy, /\.msg-actions:has\(\.msg-versions\) \.msg-zeit\{display:none\}/, "Regel steht im Handy-Block");
});

// ---- F6 ----------------------------------------------------------------------
const buendel = lies("start-styles.css");

test("F6 KAPUTT (v883): ohne mobil-dock.js galt im Buendel nur min-height 40 px", () => {
  assert.match(buendel, /#start \.prompt-glass textarea \{[^}]*min-height: 40px !important;/, "die alte Untergrenze (Ursache) steht weiter im V11-Teil");
});

test("F6 GESUND: das Buendel selbst hebt Feld, Nachdenken und Fusslinks am Finger auf 44 px", () => {
  const block = buendel.slice(buendel.lastIndexOf("@media (pointer: coarse) {"));
  assert.match(block, /#start \.prompt-glass textarea \{ min-height: 44px !important; \}/);
  assert.match(block, /\.legal-links a \{ min-height: 44px; \}/);
  assert.match(block, /@container schreibfeld \(max-width: 400px\) \{\s*#start \.prompt-glass \.fpille-nachdenken \{ width: 44px; min-width: 44px; \}/);
  assert.ok(buendel.lastIndexOf("min-height: 44px !important") > buendel.lastIndexOf("min-height: 40px !important"), "spaeter in der Kaskade = gewinnt bei gleicher Spezifitaet");
});

// ---- F11 ---------------------------------------------------------------------
test("F11 GESUND: im flachen Querformat schrumpft die Werkzeugzeile nicht und rueckt zusammen", () => {
  const q = lies("design-v12-vollbild.css");
  const quer = q.slice(q.indexOf("@media (max-width: 1000px) and (orientation: landscape) and (max-height: 520px)"));
  assert.match(quer, /#start\.has-start-chat \.start-chips\.start-chipreihe \{ flex-shrink: 0; gap: 4px; padding-top: 2px; padding-bottom: 2px; \}/);
  assert.match(quer, /#start\.has-start-chat \.start-chips\.start-chipreihe button \{ padding: 0 6px; \}/);
  assert.ok(buendel.includes("flex-shrink: 0; gap: 4px; padding-top: 2px; padding-bottom: 2px;"), "auch im ausgelieferten Buendel");
});

/** Laedt spur-schalter.js mit einem nachgebauten Fenster der gegebenen Groesse. */
async function spurNachStart({ breite, hoehe }) {
  const klassen = new Set();
  const knopf = { dataset: {}, attr: {}, setAttribute(n, v) { this.attr[n] = v; }, addEventListener() {} };
  const passt = (q) => {
    const bed = [...q.matchAll(/\((min|max)-(width|height): (\d+)px\)/g)].every(([, art, dim, wert]) => {
      const ist = dim === "width" ? breite : hoehe;
      return art === "min" ? ist >= Number(wert) : ist <= Number(wert);
    });
    const quer = !q.includes("orientation: landscape") || breite > hoehe;
    return bed && quer;
  };
  globalThis.window = { matchMedia: (q) => ({ matches: passt(q), addEventListener() {} }), addEventListener() {} };
  globalThis.document = {
    readyState: "complete",
    body: { classList: { contains: (k) => klassen.has(k), add: (k) => klassen.add(k), toggle() {} }, append() {} },
    getElementById: (id) => (id === "appMenuButton" ? knopf : null),
    querySelector: () => null,
    documentElement: { style: { setProperty() {} } }
  };
  globalThis.MutationObserver = class { observe() {} };
  const modul = await import(`../public/spur-schalter.js?fall=${breite}x${hoehe}`);
  return { modul, zu: klassen.has("spur-zu"), knopf };
}

test("F11 KAPUTT (v883) und GESUND: die Spur im Handy-Querformat", async () => {
  const quer = await spurNachStart({ breite: 863, hoehe: 304 });
  // v883 kannte kein flaches Querformat: ab 768 px Breite galt die Desktop-Spur (offen).
  assert.equal(quer.modul.FLACHES_QUERFORMAT.includes("orientation: landscape"), true);
  assert.equal(quer.zu, true, "863x304: Spur startet zu");
  assert.equal(quer.knopf.attr["aria-expanded"], "false");
  const desktop = await spurNachStart({ breite: 1440, hoehe: 900 });
  assert.equal(desktop.zu, false, "am Desktop bleibt die Spur offen wie bisher");
  const flachesFenster = await spurNachStart({ breite: 1280, hoehe: 480 });
  assert.equal(flachesFenster.zu, false, "ein flaches, BREITES Desktop-Fenster ist kein Handy");
  delete globalThis.window; delete globalThis.document; delete globalThis.MutationObserver;
});

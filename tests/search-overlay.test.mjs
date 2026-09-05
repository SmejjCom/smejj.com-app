// Such-Overlay (Cmd+K) — Verdrahtungs-Vertrag.
// Freigabe: docs/approvals/2026-08-13-suche-overlay-startlock-freigabe.md
//
// Die Tests pruefen die Textform der Dateien (wie profile-dock.test.mjs):
// kein DOM noetig, aber jede der Verdrahtungsstellen ist einzeln abgesichert —
// genau die Stellen, deren stilles Fehlen das Overlay unsichtbar machen wuerde.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const appJs = fs.readFileSync("public/app.js", "utf8");
const searchJs = fs.readFileSync("public/search.js", "utf8");
const overlayJs = fs.readFileSync("public/search-overlay.js", "utf8");
const overlayCss = fs.readFileSync("public/search-overlay.css", "utf8");
const swJs = fs.readFileSync("public/sw.js", "utf8");

test("index.html traegt Overlay-Markup und Stylesheet", () => {
  assert.match(html, /<div id="searchOverlay" class="search-overlay" hidden>/);
  assert.match(html, /<input id="searchOverlayQuery" type="search"/);
  assert.match(html, /<div id="searchOverlayLog" class="search-overlay-log" aria-live="polite">/);
  // Seit 2026-08-13 kein eigenes <link> mehr: das Overlay-CSS steckt im
  // Start-Buendel (scripts/build/bundle-start-styles.mjs). Die Startseite darf
  // genau EIN render-blockierendes Stylesheet laden — drei Extra-Links hatten
  // diesen Vertrag gebrochen (tests/deferred-start.test.mjs). Geprueft wird
  // deshalb, dass das CSS wirklich ausgeliefert wird, nicht WIE es verlinkt ist.
  assert.match(html, /<link rel="stylesheet" href="\/assets\/start-styles\.css\?v=[^"]+">/);
  assert.match(
    fs.readFileSync("public/start-styles.css", "utf8"),
    /\/\* ---- search-overlay\.css ---- \*\//,
    "Overlay-CSS fehlt im Start-Buendel — die Suche waere unformatiert"
  );
  // Die alte Such-Seite bleibt als Rueckfallebene bestehen.
  assert.match(html, /<section id="search" class="view" aria-label="Suche">/);
});

// Kennungen NICHT mehr hart pinnen: der feste Pin (erst ohne ?v=, dann
// pin-20260806) riss bei jedem legitimen Marken-Bump und stand wochenlang rot,
// ohne einen echten Fehler zu melden. Die eigentliche Regel ist: ALLE
// Importstellen desselben Moduls tragen DIESELBE Kennung — sonst entsteht
// eine zweite Modulinstanz. Genau das wird jetzt geprueft.
// Modulname, dahinter die Cache-Marke als OPTIONALE Gruppe 1. Der Name muss
// direkt hinter einem "/" stehen — sonst wuerde "nachladen.js" auch in
// "such-nachladen.js" treffen und der Test gruen melden, was er nie geprueft hat.
const alsPfad = (modul) => `[^"]*/${modul.replace(/\./g, "\\.")}(\\?v=[A-Za-z0-9._-]+)?`;

/**
 * Unter welcher Kennung laedt `quelle` das Modul — statisch ODER per import()?
 * Seit der Such-Diaet holt search.js das Overlay nachladend (overlayLader); die
 * alte Fassung sah nur `from "…"` und meldete darum "Overlay fehlt", obwohl es
 * geladen wird.
 */
function kennung(quelle, modul) {
  const treffer = quelle.match(new RegExp(`(?:from\\s*|import\\()"${alsPfad(modul)}"`));
  return treffer ? treffer[1] || "(ohne)" : null;
}

/**
 * Namen eines statischen Imports — oder null, wenn das Modul gar nicht
 * importiert wird. Geprueft wird der MODULNAME, nicht seine Marke.
 */
export function importNamen(quelle, modul) {
  const treffer = quelle.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${alsPfad(modul)}"`));
  return treffer ? treffer[1].split(",").map((n) => n.trim()).filter(Boolean) : null;
}

/** Laedt `quelle` das Modul per dynamischem import()? Marke egal. */
export function ladetDynamisch(quelle, modul) {
  return new RegExp(`import\\("${alsPfad(modul)}"\\)`).test(quelle);
}

test("kaputte und gesunde Probe: der Modulname zaehlt, die Cache-Marke nicht", () => {
  // Gesund: dieselbe Verdrahtung unter jeder Marke — und ohne Marke.
  assert.deepEqual(importNamen('import { a, b } from "./such-nachladen.js?v=99";', "such-nachladen.js"), ["a", "b"]);
  assert.deepEqual(importNamen('import { a } from "./such-nachladen.js";', "such-nachladen.js"), ["a"]);
  assert.ok(ladetDynamisch('import("./search.js?v=b54")', "search.js"));
  assert.ok(ladetDynamisch('import("/assets/search.js")', "search.js"));
  // Kaputt: fehlender Import muss auffallen — das Lockern der Marke darf den
  // Waechter nicht zahnlos machen (Hausregel: kaputte UND gesunde Probe).
  assert.equal(importNamen('import { a } from "./search.js?v=b54";', "such-nachladen.js"), null);
  assert.ok(!ladetDynamisch('const m = "./search.js";', "search.js"));
  // Kaputt: ein Teilname darf nicht durchrutschen.
  assert.equal(importNamen('import { a } from "./such-nachladen.js?v=5";', "nachladen.js"), null);
  assert.ok(!ladetDynamisch('import("./search-overlay.js?v=b54")', "search.js"));
  // kennung() sieht beide Ladeformen und liefert die Marke zum Vergleichen.
  assert.equal(kennung('import { a } from "/assets/chat-store.js?v=b67";', "chat-store.js"), "?v=b67");
  assert.equal(kennung('import("./search-overlay.js?v=b61")', "search-overlay.js"), "?v=b61");
  assert.equal(kennung('import { a } from "./search-overlay.js";', "search-overlay.js"), "(ohne)");
  assert.equal(kennung('import { a } from "./search.js?v=b54";', "search-overlay.js"), null);
});

test("Nav-Knopf Suche oeffnet das Overlay, nicht die Seite", () => {
  // Seit der Such-Diaet (25.08.) laedt app.js search.js erst bei Bedarf ueber
  // such-nachladen.js; das Overlay kommt weiter aus search.js (overlayLader).
  // Geprueft wird, WAS app.js aus dem Nachlader zieht — nicht die Marke und
  // nicht die vollstaendige Namensliste: `ladeSucheFuerAnsicht` kam am 04.09.
  // dazu (der Haken, ohne den die Suche nie lud) und haette diesen Test sonst
  // ein zweites Mal grundlos rot gestellt.
  const namen = importNamen(appJs, "such-nachladen.js");
  assert.ok(namen, "app.js bindet den Such-Nachlader nicht mehr");
  for (const name of ["bindeSuchNachlader", "holeSuche"]) {
    assert.ok(namen.includes(name), `app.js holt ${name} nicht aus such-nachladen.js`);
  }
  assert.match(appJs, /button\.dataset\.view === "search"\) \{ holeSuche\(\)\.then\(\(m\) => Promise\.resolve\(m\.oeffneSuchOverlay\(\)\)\)/, "der Nav-Knopf laedt und oeffnet das Overlay");
});

test("Cmd+K schaltet das Overlay und search.js reicht die Datenwege durch", () => {
  // app.js importiert search-overlay nicht mehr selbst (Such-Diaet 25.08.);
  // die EINE Kennung lebt in search.js (overlayLader) — der Nachlader in
  // such-nachladen.js kennt nur search.js selbst.
  assert.ok(kennung(searchJs, "search-overlay.js"), "search.js laedt das Overlay");
  assert.equal(kennung(appJs, "search-overlay.js"), null, "app.js importiert das Overlay nicht mehr direkt");
  const nachladerJs = fs.readFileSync("public/such-nachladen.js", "utf8");
  // search.js hat genau EINE Importstelle (hier), darum entsteht keine zweite
  // Modulinstanz und die Marke darf frei wandern. Fixiert war sie auf ?v=b51,
  // live steht b54 — genau die Falle "Tests nie auf Cache-Marken festnageln".
  assert.ok(ladetDynamisch(nachladerJs, "search.js"), "der Nachlader laedt search.js nicht mehr per import()");
  // Cmd+K schaltet seit dem Nachlade-Umbau (24.08.) ueber overlayLader; der
  // hier fixierte Direktaufruf `if (toggleSearchOverlay()) return;` steht so
  // nicht mehr im Code. Geprueft wird der VERTRAG, nicht der Wortlaut: Cmd+K
  // gebunden, Overlay geschaltet, Such-Seite als Rueckfallebene.
  assert.match(searchJs, /event\.key\.toLowerCase\(\) !== "k"/, "search.js bindet Cmd+K nicht mehr");
  assert.match(searchJs, /toggleSearchOverlay\(\)/, "Cmd+K schaltet das Overlay nicht");
  assert.match(searchJs, /goToView\("search"\)/, "ohne Overlay fehlt die Rueckfallebene auf die Such-Seite");
  assert.match(searchJs, /initSearchOverlay\(\{/);
  // Chat-Treffer tragen das Chat-Objekt (Ausschnitt, Zeit, Titel im Overlay).
  assert.match(searchJs, /chat\.id, chat\];/);
});

test("Overlay hebt sicher hervor und bedient die Tastatur", () => {
  // Chat-Inhalt darf nie als Markup interpretiert werden: Hervorhebung nur
  // ueber DOM-Knoten (mitHervorhebung), niemals ueber innerHTML.
  assert.match(overlayJs, /mitHervorhebung/);
  assert.doesNotMatch(overlayJs, /innerHTML/);
  assert.match(overlayJs, /"ArrowDown"/);
  assert.match(overlayJs, /"Escape"/);
  // Gleicher chat-store-Spezifizierer wie search.js — sonst ZWEITE Modulinstanz.
  assert.equal(
    kennung(overlayJs, "chat-store.js"),
    kennung(searchJs, "chat-store.js"),
    "search-overlay.js und search.js importieren chat-store.js unter verschiedenen Kennungen — zweite Modulinstanz"
  );
});

test("Overlay-Zeilen halten die 44-px-Touch-Regel", () => {
  assert.match(overlayCss, /\.search-overlay-row \{[^}]*min-height: 44px/s);
  assert.match(overlayCss, /\.search-overlay-close \{[^}]*min-height: 44px/s);
});

test("sw.js precacht das Overlay-Modul; das CSS kommt ueber das Buendel", () => {
  assert.match(swJs, /"\/assets\/search-overlay\.js",/);
  // search-overlay.css steht bewusst NICHT mehr einzeln im Precache: es ist
  // Teil von start-styles.css. Ein Doppeleintrag waere toter Ballast und
  // wuerde tests/deferred-start.test.mjs brechen.
  assert.ok(!swJs.includes('"/assets/search-overlay.css"'), "Overlay-CSS liegt doppelt im Precache");
  assert.match(swJs, /"\/assets\/start-styles\.css"/);
});

// smejj.com — Der Hinweisstreifen "Deine Anmeldung ist abgelaufen" darf die
// Ueberschrift einer Ansicht nicht zudecken (Befund F21).
//
// GEMESSEN 2026-09-14 im Android-Emulator (412x839, Anmeldung abgelaufen,
// Ansicht /papierkorb): der Streifen (position: fixed, top: 0) lag ueber
// "Meine Sachen / Papierkorb". auth-gate.js meldet seine Hoehe seit dem
// 10.09. als --hinweis-hoehe; seit dem 12.09. rechnen Spur, Kopfknoepfe und
// Startseite damit. Die uebrigen Ansichten (.view:not(#start), also alle mit
// .premium-view) rechneten NICHT damit: ihr oberes Polster (72 px, mobil
// 56 px) ist kleiner als der Streifen (gemessen 105 px bei 375 px Breite).
//
// DER FIX steht in public/design-v11-views.css — dem Kaskaden-Ende fuer alle
// Ansichten ausser #start (premium-surfaces.js haengt sie als LETZTE in den
// Kopf) und KEINE Lock-Datei. Er schiebt die Ansicht um die gemeldete Hoehe
// nach unten (margin-top), ohne eine einzige Polster-Zahl abzuschreiben.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const views = fs.readFileSync("public/design-v11-views.css", "utf8");
const flaechen = fs.readFileSync("public/premium-surfaces.js", "utf8");
const gate = fs.readFileSync("public/auth-gate.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

// Liefert alle Regelbloecke (Selektor, Rumpf, umgebende @-Regeln) einer
// CSS-Datei — ohne Bibliothek, wie im Rest des Projekts.
function bloecke(css) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stapel = [];
  const ergebnis = [];
  let puffer = "";
  for (const stueck of ohneKommentare.split(/(\{|\})/)) {
    if (stueck === "{") { stapel.push(puffer.trim()); puffer = ""; }
    else if (stueck === "}") {
      const selektor = stapel.pop();
      if (selektor && !selektor.startsWith("@")) {
        ergebnis.push({ selektor, rumpf: puffer, at: stapel.filter((s) => s.startsWith("@")) });
      }
      puffer = "";
    } else puffer += stueck;
  }
  return ergebnis;
}

function versatzRegel(css) {
  return bloecke(css).find((b) =>
    b.selektor.split(",").map((s) => s.trim()).includes(".view.premium-view") &&
    /margin-top\s*:\s*var\(--hinweis-hoehe,\s*0px\)/.test(b.rumpf));
}

test("jede Ansicht ausser #start rueckt um die gemeldete Streifenhoehe nach unten", () => {
  const regel = versatzRegel(views);
  assert.ok(regel, "design-v11-views.css kennt --hinweis-hoehe nicht — der Streifen deckt die Ueberschrift zu");
  // Ausserhalb jeder @media-Regel: der Streifen erscheint in jeder Breite.
  assert.deepEqual(regel.at, [], "der Versatz darf nicht an eine Bildschirmbreite gebunden sein");
  // Keine abgeschriebenen Polster-Zahlen (72/56/52/46/58 px): die Hoehe kommt
  // allein aus der Variable, sonst pflegt man dieselbe Zahl an zwei Orten.
  assert.ok(!/\b[1-9]\d*px\b/.test(regel.rumpf), "keine festen Pixelzahlen im Versatz");
});

test("die Regel erreicht jede Ansicht ausser #start — ueber premium-surfaces.js", () => {
  // premium-view bekommt genau .view:not(#start) …
  assert.match(flaechen, /querySelectorAll\("\.view:not\(#start\)"\)[\s\S]{0,80}classList\.add\("premium-view"\)/,
    "ohne die Klasse greift .view.premium-view nirgends");
  // … und design-v11-views.css wird dort als LETZTES Stylesheet geladen
  // (Kaskaden-Ende: bei gleicher Spezifitaet gewinnt es durch Reihenfolge).
  const liste = flaechen.match(/for \(const href of \[([^\]]+)\]\)/);
  assert.ok(liste, "die Ladeliste der Premium-Stylesheets fehlt");
  const hrefs = [...liste[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.at(-1), "/assets/design-v11-views.css", "design-v11-views.css muss das Kaskaden-Ende bleiben");
  // Der SW liefert die Datei aus dem Precache — der Fix kommt erst mit einer
  // neuen Cache-Marke an (Falle "Cache-Marken", Memory).
  assert.match(sw, /"\/assets\/design-v11-views\.css"/, "die Datei muss im Precache bleiben");
});

test("die Variable wird wirklich gesetzt — und auf 0 zurueckgenommen", () => {
  assert.match(gate, /setProperty\("--hinweis-hoehe"/, "auth-gate.js meldet die Streifenhoehe nicht");
  // Fallback 0px in der Regel: ohne Streifen aendert sich kein Pixel.
  assert.match(versatzRegel(views)?.rumpf ?? "", /var\(--hinweis-hoehe,\s*0px\)/);
});

test("kein Rueckbau: nichts anderes setzt margin an einer Ansichts-Wurzel", () => {
  // Das Versatz-Element ist die Ansicht selbst. Setzte irgendein spaeter
  // geladenes oder spezifischeres Stylesheet dort `margin`, verloere die
  // Regel still — gemessen ueber alle Stylesheets, die eine Ansicht tragen.
  const dateien = ["start-styles.css", "app-surfaces.css", "design-cyan-views.css",
    "design-v11-views.css", "settings-surface.css", "account-privacy.css", "view-chrome.css"];
  const wurzel = /^(#[\w-]+)?(\.view|\.premium-view)?(\.[\w-]+|:[\w-]+(\([^)]*\))?|\[[^\]]*\])*$/;
  const treffer = [];
  for (const datei of dateien) {
    for (const b of bloecke(fs.readFileSync(`public/${datei}`, "utf8"))) {
      const wurzeln = b.selektor.split(",").map((s) => s.trim())
        .filter((s) => wurzel.test(s) && /view|^#[\w-]+\.(view|premium-view)/.test(s));
      if (wurzeln.length && /(^|[;\s])margin(-top)?\s*:/.test(b.rumpf)) treffer.push(`${datei}: ${wurzeln.join(", ")}`);
    }
  }
  assert.deepEqual(treffer, ["design-v11-views.css: .view.premium-view"],
    "genau EINE Regel darf die Ansicht versetzen — sonst gewinnt eine andere");
});

test("die Lock-Dateien der Startseite bleiben unberuehrt", () => {
  for (const datei of ["public/styles.css", "public/app-surfaces.css", "public/start-styles.css"]) {
    const text = fs.readFileSync(datei, "utf8");
    assert.ok(!/margin-top\s*:\s*var\(--hinweis-hoehe/.test(text),
      `${datei} steht unter dem Start-Lock — der Versatz darf dort nicht landen`);
  }
});

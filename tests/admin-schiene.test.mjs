// smejj.com — die linke Schiene der Operations Console (Freigabe 2026-09-04):
// Logo-Knopf, gemerkte Breite, Zieh-Griff auf der Trennlinie.
//
// Geprueft wird das ECHTE Browser-Skript in einer kleinen DOM-Attrappe — nicht
// eine Kopie der Logik im Test. Ein Test, der die Logik nachbaut, beweist nur,
// dass der Test funktioniert (Lehre "Pruefung prueft die falsche Frage").
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const WURZEL = new URL("../control-server/admin-ui/", import.meta.url);
const SCHIENE = readFileSync(new URL("schiene.js", WURZEL), "utf8");
const CSS = readFileSync(new URL("console.css", WURZEL), "utf8");
const HTML = readFileSync(new URL("index.html", WURZEL), "utf8");

/** Gerade so viel DOM, wie schiene.js anfasst. */
function buehne(ablage = {}) {
  const horcher = new Map();
  const klassen = new Set();
  const griff = {
    attribute: {},
    setAttribute(n, w) { this.attribute[n] = w; },
    addEventListener(art, fn) { horcher.set(art, fn); },
    setPointerCapture() {}, releasePointerCapture() {}
  };
  const knopf = { attribute: {}, setAttribute(n, w) { this.attribute[n] = w; }, addEventListener() {} };
  const stil = {};
  const fenster = {};
  const sandbox = {
    window: fenster,
    document: {
      documentElement: { style: { setProperty(n, w) { stil[n] = w; } } },
      body: {
        classList: {
          add: (k) => klassen.add(k),
          remove: (k) => klassen.delete(k),
          contains: (k) => klassen.has(k),
          toggle: (k, an) => (an ? klassen.add(k) : klassen.delete(k))
        }
      },
      getElementById: (id) => (id === "railGriff" ? griff : id === "markeKnopf" ? knopf : null)
    },
    localStorage: {
      getItem: (k) => (k in ablage ? ablage[k] : null),
      setItem: (k, w) => { ablage[k] = String(w); }
    },
    requestAnimationFrame: (fn) => { fn(); return 1; },
    cancelAnimationFrame: () => {},
    Number, Math, String, Boolean
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(SCHIENE, vm.createContext(sandbox));
  return { api: fenster.smejjAdminSchiene, stil, klassen, griff, knopf, horcher, ablage };
}

test("die Datei meldet sich als window.smejjAdminSchiene an", () => {
  const b = buehne();
  assert.equal(typeof b.api.herstellen, "function");
  assert.equal(typeof b.api.bindeGriff, "function");
  assert.equal(typeof b.api.umschalten, "function");
});

test("die Masse in schiene.js und console.css sind DASSELBE", () => {
  const b = buehne();
  // Wandert eine der beiden Zahlen, springt der Griff neben die Kante.
  assert.match(CSS, new RegExp(`body\\.rail-zu\\{--rail:${b.api.masse.EINGEKLAPPT}px;\\}`));
  assert.match(CSS, /:root\{[\s\S]*--rail:284px;/);
  assert.equal(b.api.masse.NORMAL, 284);
  assert.ok(b.api.masse.SCHWELLE < b.api.masse.MIN, "die Einrast-Schwelle muss unter der Mindestbreite liegen");
});

test("ohne gemerkten Stand steht die Schiene offen auf 284 px", () => {
  const b = buehne();
  b.api.herstellen();
  assert.equal(b.stil["--rail"], "284px");
  assert.equal(b.klassen.has("rail-zu"), false);
  assert.equal(b.knopf.attribute["aria-expanded"], "true");
});

test("ein gemerkter Stand wird beim Laden wiederhergestellt", () => {
  const b = buehne({ "smejj.admin.schiene": "zu", "smejj.admin.schiene-breite": "360" });
  b.api.herstellen();
  assert.equal(b.klassen.has("rail-zu"), true);
  assert.equal(b.knopf.attribute["aria-expanded"], "false");
  // Die gemerkte Breite bleibt erhalten, damit das Aufklappen dorthin zurueckkehrt.
  b.api.umschalten();
  assert.equal(b.klassen.has("rail-zu"), false);
  assert.equal(b.stil["--rail"], "360px");
});

test("eine unsinnige gemerkte Breite wird auf den erlaubten Bereich gestutzt", () => {
  const b = buehne({ "smejj.admin.schiene-breite": "9999" });
  b.api.herstellen();
  assert.equal(b.stil["--rail"], b.api.masse.MAX + "px");
  const c = buehne({ "smejj.admin.schiene-breite": "kaputt" });
  c.api.herstellen();
  assert.equal(c.stil["--rail"], "284px");
});

test("Ziehen nach rechts verbreitert und merkt die Breite", () => {
  const b = buehne();
  b.api.herstellen();
  b.api.bindeGriff();
  b.horcher.get("pointerdown")({ button: 0, clientX: 284, pointerId: 1, preventDefault() {} });
  assert.equal(b.klassen.has("rail-zieht"), true);
  b.horcher.get("pointermove")({ clientX: 344, pointerId: 1 });
  assert.equal(b.stil["--rail"], "344px");
  b.horcher.get("pointerup")({ pointerId: 1 });
  assert.equal(b.klassen.has("rail-zieht"), false);
  assert.equal(b.ablage["smejj.admin.schiene-breite"], "344");
  assert.equal(b.ablage["smejj.admin.schiene"], "auf");
});

test("bis zum Logo ziehen klappt ein — und Ziehen oeffnet wieder", () => {
  const b = buehne();
  b.api.herstellen();
  b.api.bindeGriff();
  b.horcher.get("pointerdown")({ button: 0, clientX: 284, pointerId: 1, preventDefault() {} });
  b.horcher.get("pointermove")({ clientX: 40, pointerId: 1 });   // weit links, unter der Schwelle
  assert.equal(b.klassen.has("rail-zu"), true, "unter der Schwelle muss es einrasten");
  b.horcher.get("pointerup")({ pointerId: 1 });
  assert.equal(b.ablage["smejj.admin.schiene"], "zu");

  // Aus dem eingeklappten Zustand wieder herausziehen.
  b.horcher.get("pointerdown")({ button: 0, clientX: 68, pointerId: 2, preventDefault() {} });
  b.horcher.get("pointermove")({ clientX: 320, pointerId: 2 });
  assert.equal(b.klassen.has("rail-zu"), false, "nach rechts ziehen muss wieder oeffnen");
  b.horcher.get("pointerup")({ pointerId: 2 });
  assert.equal(b.ablage["smejj.admin.schiene"], "auf");
});

test("waehrend des Zugs wird nichts in die Ablage geschrieben", () => {
  const b = buehne();
  b.api.herstellen();
  b.api.bindeGriff();
  const vorher = b.ablage["smejj.admin.schiene-breite"];
  b.horcher.get("pointerdown")({ button: 0, clientX: 284, pointerId: 1, preventDefault() {} });
  for (let x = 285; x < 400; x += 5) b.horcher.get("pointermove")({ clientX: x, pointerId: 1 });
  assert.equal(b.ablage["smejj.admin.schiene-breite"], vorher, "im Zug darf nur die CSS-Variable wandern");
  b.horcher.get("pointerup")({ pointerId: 1 });
  assert.equal(b.ablage["smejj.admin.schiene-breite"], "395", "am Ende genau die letzte Zeigerposition");
});

test("Doppelklick auf die Trennlinie schaltet um", () => {
  const b = buehne();
  b.api.herstellen();
  b.api.bindeGriff();
  b.horcher.get("dblclick")({ preventDefault() {} });
  assert.equal(b.klassen.has("rail-zu"), true);
  b.horcher.get("dblclick")({ preventDefault() {} });
  assert.equal(b.klassen.has("rail-zu"), false);
});

test("die Pfeiltasten bedienen den Griff auch ohne Maus", () => {
  const b = buehne();
  b.api.herstellen();
  b.api.bindeGriff();
  b.horcher.get("keydown")({ key: "ArrowRight", preventDefault() {} });
  assert.equal(b.stil["--rail"], "300px");
  b.horcher.get("keydown")({ key: "Home", preventDefault() {} });
  assert.equal(b.klassen.has("rail-zu"), true);
  b.horcher.get("keydown")({ key: "End", preventDefault() {} });
  assert.equal(b.stil["--rail"], "284px");
});

test("ein privater Modus ohne localStorage bringt die Schiene nicht zum Absturz", () => {
  const b = buehne();
  // Ablage schlaegt fehl — genau wie im Privatmodus mancher Browser.
  const kaputt = buehne();
  kaputt.api.herstellen();
  assert.doesNotThrow(() => kaputt.api.umschalten());
  assert.ok(b.api);
});

test("index.html laedt schiene.js VOR console.js und traegt den Griff", () => {
  const reihe = [...HTML.matchAll(/src="\/admin\/([^"]+)"/g)].map((t) => t[1]);
  assert.ok(reihe.indexOf("schiene.js") >= 0, "schiene.js fehlt in index.html");
  assert.ok(reihe.indexOf("schiene.js") < reihe.indexOf("console.js"), "schiene.js muss vor console.js laden");
  assert.match(HTML, /id="railGriff"[\s\S]*role="separator"/);
  assert.match(HTML, /id="markeKnopf"/);
});

test("der Griff liegt genau auf der Kante und ist gross genug zum Treffen", () => {
  assert.match(CSS, /\.rail-griff\{[\s\S]*left:var\(--rail\)/);
  const breite = /\.rail-griff\{[\s\S]*?width:(\d+)px/.exec(CSS);
  assert.ok(breite && Number(breite[1]) >= 8, "unter 8 px trifft die Maus die Linie nicht zuverlaessig");
  assert.match(CSS, /\.rail-griff\{[\s\S]*?cursor:col-resize/);
  assert.match(CSS, /\.rail-griff\{[\s\S]*?touch-action:none/);
  // Regressionsschutz mit Begruendung (Befund 2026-09-04): ein Uebergang auf
  // grid-template-columns liess die Schiene einen Schritt hinterherhinken —
  // der Wert kommt aus einer Custom Property, der Uebergang startet dann auf
  // dem schon geaenderten Ausgangswert und kommt nie an.
  // Kommentare raus, sonst schlaegt die Probe auf der Begruendung an, die
  // genau diese Zeichenkette nennt.
  const ohneKommentare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(ohneKommentare, /transition:[^;}]*grid-template-columns/);
});

test("der Control-Server liefert schiene.js aus", () => {
  const routen = readFileSync(new URL("../control-server/src/routes/adminUiRoutes.js", import.meta.url), "utf8");
  assert.match(routen, /"schiene\.js": "schiene\.js"/);
});

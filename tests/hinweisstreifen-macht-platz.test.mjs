// smejj.com — Der Hinweisstreifen "Deine Anmeldung ist abgelaufen" darf keine
// Bedienelemente zudecken.
//
// DER BEFUND (2026-09-12, Android-Emulator, LIVE gemessen):
// Im Querformat des Telefons (863x360) und auf dem Tablet (1280x648) lagen
// VIER Bedienelemente vollstaendig unter dem Streifen — der Spur-Knopf
// (#appMenuButton), der Browser-Knopf (#browserButton) und die beiden
// Umschalter "Start"/"Code". Im Hochformat (412x839) waren es zwei. Antippen
// war unmoeglich: gemessen nicht per Rechteck-Vergleich, sondern mit
// document.elementFromPoint auf die Mitte jedes Knopfes — dort lag jedes Mal
// der Streifen (bzw. dessen Text und sein "Spaeter"-Knopf).
//
// WARUM ES PASSIERTE: Der Streifen meldet seine Hoehe seit dem 10.09. als
// CSS-Variable --hinweis-hoehe. Gerechnet hat damit aber nur EINE Datei
// (composer-tools.css, fuer das X des Sprachmodus). Alles andere, was selbst
// `position: fixed; top: 0` traegt — die beiden Kopfknoepfe, das Logo, die
// Seitenleiste mitsamt Spur-Reitern —, blieb darunter liegen. Eine gemeldete
// Zahl, die niemand liest, schuetzt nichts.
//
// WARUM DER FIX IN auth-gate.js STEHT und nicht im Stylesheet: public/styles.css,
// public/branding.css und das Buendel public/start-styles.css stehen unter dem
// Start-Lock (100%-Schutz der Startseite) und duerfen ohne schriftliche
// Bestaetigung des Betreibers nicht angefasst werden. Die Regel gehoert
// ohnehin zum Streifen — sie entsteht mit ihm und verschwindet mit ihm. Ohne
// Streifen aendert sich an der Startseite kein Pixel.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { zeigeAbgelaufenHinweis } = await import("../public/auth-gate.js");
const gateJs = fs.readFileSync("public/auth-gate.js", "utf8");

// Minimales Dokument statt jsdom: das Projekt haelt sich abhaengigkeitsfrei.
// Es kann genau so viel, wie der Streifen braucht — createElement, append,
// getElementById, ein Ereignis und eine CSS-Variable.
function fakeWin() {
  const knoten = new Map();
  const mach = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), id: "", textContent: "", href: "", type: "",
      style: { cssText: "" }, kinder: [], eltern: null, hoerer: new Map(),
      setAttribute() {},
      append(...k) { for (const x of k) { x.eltern = el; el.kinder.push(x); } },
      appendChild(k) { k.eltern = el; el.kinder.push(k); if (k.id) knoten.set(k.id, k); return k; },
      addEventListener(typ, f) { el.hoerer.set(typ, f); },
      getBoundingClientRect: () => ({ height: 65 }),
      remove() {
        if (el.id) knoten.delete(el.id);
        const i = el.eltern?.kinder.indexOf(el);
        if (i >= 0) el.eltern.kinder.splice(i, 1);
      }
    };
    return el;
  };
  const wurzelStile = new Map();
  const dok = {
    body: mach("body"),
    head: mach("head"),
    documentElement: { style: { setProperty: (n, v) => wurzelStile.set(n, v) } },
    createElement: mach,
    getElementById: (id) => knoten.get(id) || null,
    wurzelStile
  };
  dok.body.appendChild = (k) => { k.eltern = dok.body; dok.body.kinder.push(k); if (k.id) knoten.set(k.id, k); return k; };
  dok.head.appendChild = (k) => { k.eltern = dok.head; dok.head.kinder.push(k); if (k.id) knoten.set(k.id, k); return k; };
  return { document: dok, location: { pathname: "/", search: "" } };
}

test("der Streifen bringt seine Platz-Regel mit", () => {
  const win = fakeWin();
  assert.equal(zeigeAbgelaufenHinweis(win), true, "der Streifen muss erscheinen");
  const stil = win.document.getElementById("smejj-sitzung-abgelaufen-platz");
  assert.ok(stil, "ohne Platz-Regel deckt der Streifen die Kopfknoepfe zu");
  assert.equal(stil.eltern, win.document.head, "die Regel gehoert in den head");
});

test("die Regel schiebt genau das, was oben klebt", () => {
  const win = fakeWin();
  zeigeAbgelaufenHinweis(win);
  const css = win.document.getElementById("smejj-sitzung-abgelaufen-platz").textContent;
  // .glass-icon traegt beide Kopfknoepfe (#appMenuButton, #browserButton).
  assert.match(css, /\.glass-icon/, "die Kopfknoepfe muessen mitrutschen");
  assert.match(css, /\.app-brand-logo/, "das Logo klebt ebenfalls oben");
  // Die Seitenleiste nimmt die Spur-Reiter "Start"/"Code" mit nach unten.
  assert.match(css, /\.sidebar\s*\{\s*top:\s*var\(--hinweis-hoehe/, "ohne die Leiste bleiben Start/Code unerreichbar");
  // Keine festen Zahlen wiederholen: die Hoehe kommt aus der gemeldeten Variable.
  assert.match(css, /var\(--hinweis-hoehe, 0px\)/, "Fallback 0px — ohne Streifen aendert sich nichts");
  assert.ok(!/\b(32|84|65)px\b/.test(css), "keine aus dem Stylesheet abgeschriebenen Zahlen");
});

test('"Spaeter" nimmt Streifen UND Regel wieder mit', () => {
  const win = fakeWin();
  zeigeAbgelaufenHinweis(win);
  const streifen = win.document.getElementById("smejj-sitzung-abgelaufen");
  const spaeter = streifen.kinder.find((k) => k.textContent === "Später");
  assert.ok(spaeter, "der Schliessknopf fehlt");
  spaeter.hoerer.get("click")();
  assert.equal(win.document.getElementById("smejj-sitzung-abgelaufen"), null, "der Streifen muss weg sein");
  assert.equal(win.document.getElementById("smejj-sitzung-abgelaufen-platz"), null,
    "eine Regel, die laenger lebt als ihr Anlass, verschiebt die Oberflaeche grundlos");
  assert.equal(win.document.wurzelStile.get("--hinweis-hoehe"), "0px", "die gemeldete Hoehe muss auf 0 zurueck");
});

test("die Lock-Dateien der Startseite bleiben unberuehrt", () => {
  // Der eigentliche Grund, warum der Fix hier steht und nicht dort.
  for (const datei of ["public/styles.css", "public/branding.css", "public/start-styles.css"]) {
    const text = fs.readFileSync(datei, "utf8");
    assert.ok(!/\.sidebar\s*\{[^}]*top:\s*var\(--hinweis-hoehe/.test(text),
      `${datei} steht unter dem Start-Lock — die Regel darf dort nicht landen`);
  }
  // …und der Streifen bringt sie wirklich selbst mit.
  assert.match(gateJs, /function legePlatzAn/, "die Platz-Regel gehoert zum Streifen");
  assert.match(gateJs, /function raeumePlatzWeg/, "und muss mit ihm verschwinden");
});

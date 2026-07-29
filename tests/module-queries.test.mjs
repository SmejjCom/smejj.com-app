// smejj.com — Schutztests fuer den Waechter "EIN Modul, EINE Kennung"
// (scripts/check-module-queries.mjs, 2026-07-29).
//
// Die Falle hat dreimal live zugeschlagen (sw v184, v185, 2026-07-29). Diese
// Tests halten fest, dass der Waechter sie erkennt — und dass er die
// Schreibweisen als dasselbe Modul zaehlt, denn genau daran ist die
// Handpruefung frueher gescheitert: `./x.js`, `/assets/x.js` und `../x.js`
// sehen verschieden aus und meinen dieselbe Datei.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findeVerstoesse, sammleKennungen } from "../scripts/check-module-queries.mjs";

function baueOrdner(dateien) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "smejj-mq-"));
  for (const [name, inhalt] of Object.entries(dateien)) {
    const ziel = path.join(wurzel, name);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, inhalt);
  }
  return wurzel;
}

test("zwei Kennungen fuer dasselbe Modul sind ein Verstoss", () => {
  const wurzel = baueOrdner({
    "a.js": 'import { x } from "./ziel.js?v=1";',
    "b.js": 'import { y } from "./ziel.js?v=blitz-20260726";',
    "ziel.js": "export const x = 1; export const y = 2;"
  });
  const verstoesse = findeVerstoesse(sammleKennungen(wurzel));
  assert.equal(verstoesse.length, 1);
  assert.equal(verstoesse[0].modul, "ziel.js");
  assert.deepEqual(verstoesse[0].kennungen.map((k) => k.kennung).sort(), ["v=1", "v=blitz-20260726"]);
});

test("verschiedene Schreibweisen desselben Moduls zaehlen als EIN Modul", () => {
  // Genau hier ist die Handpruefung frueher gescheitert.
  const wurzel = baueOrdner({
    "a.js": 'import { x } from "./ziel.js?v=1";',
    "unter/b.js": 'import { y } from "../ziel.js?v=1";',
    "c.js": 'import { z } from "/assets/ziel.js?v=1";',
    "ziel.js": "export const x = 1;"
  });
  const treffer = sammleKennungen(wurzel);
  assert.ok(treffer.has("ziel.js"), "alle drei Schreibweisen muessen auf ziel.js zeigen");
  assert.equal(treffer.get("ziel.js").size, 1, "eine einzige Kennung");
  assert.equal(findeVerstoesse(treffer).length, 0);
});

test("gleiche Kennung ueberall ist in Ordnung", () => {
  const wurzel = baueOrdner({
    "a.js": 'import { x } from "./ziel.js?v=2";',
    "b.js": 'import { y } from "./ziel.js?v=2";',
    "seite.html": '<script src="/assets/ziel.js?v=2" type="module"></script>',
    "ziel.js": "export const x = 1;"
  });
  assert.equal(findeVerstoesse(sammleKennungen(wurzel)).length, 0);
});

test("Kennung fehlt bei einem Bezug — auch das ist ein Verstoss", () => {
  // sw v184 in Reinform: einmal mit ?v=3, einmal ohne. Zwei Modulinstanzen.
  const wurzel = baueOrdner({
    "a.js": 'import { x } from "./ziel.js";',
    "b.js": 'import { y } from "./ziel.js?v=3";',
    "ziel.js": "export const x = 1;"
  });
  const verstoesse = findeVerstoesse(sammleKennungen(wurzel));
  assert.equal(verstoesse.length, 1);
  assert.ok(verstoesse[0].kennungen.some((k) => k.kennung === "(ohne)"));
});

test("Skript-Tags in HTML werden mitgelesen", () => {
  // Der Live-Befund vom 2026-07-29 steckte in public/de/index.html, nicht in
  // einem Modul — ein Pruefer, der nur Importe liest, haette ihn verfehlt.
  const wurzel = baueOrdner({
    "de/index.html": '<script src="/assets/ziel.js?v=alt" type="module"></script>',
    "en/index.html": '<script src="/assets/ziel.js?v=neu" type="module"></script>',
    "ziel.js": "export const x = 1;"
  });
  const verstoesse = findeVerstoesse(sammleKennungen(wurzel));
  assert.equal(verstoesse.length, 1);
  assert.equal(verstoesse[0].modul, "ziel.js");
});

test("dynamische Importe zaehlen mit, Laufzeit-Ausdruecke nicht", () => {
  const wurzel = baueOrdner({
    "a.js": 'const m = await import("./ziel.js?v=1");',
    "b.js": 'const m = await import("./ziel.js?v=2");',
    "c.js": "const m = await import(`./${name}.js?v=3`);",
    "ziel.js": "export const x = 1;"
  });
  const treffer = sammleKennungen(wurzel);
  const verstoesse = findeVerstoesse(treffer);
  assert.equal(verstoesse.length, 1, "die beiden festen Kennungen sind der Verstoss");
  assert.equal(verstoesse[0].modul, "ziel.js");
  // Der Template-Literal-Import darf nicht als eigenes Modul auftauchen.
  assert.ok(![...treffer.keys()].some((m) => m.includes("${")), "Laufzeit-Ausdruecke bleiben aussen vor");
});

test("das echte Projekt ist sauber", () => {
  // Der eigentliche Zweck: ab jetzt faellt jeder neue Doppelbezug hier auf.
  const verstoesse = findeVerstoesse(sammleKennungen());
  assert.deepEqual(
    verstoesse.map((v) => v.modul),
    [],
    `Module unter mehreren Kennungen: ${JSON.stringify(verstoesse, null, 1)}`
  );
});

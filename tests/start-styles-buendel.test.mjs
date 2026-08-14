// smejj.com — das Start-Buendel und seine ausgelieferte Kopie.
//
// WARUM ES DAS GIBT (2026-08-14): `public/start-styles.css` ist ein erzeugtes
// Buendel und darum von der 800-Zeilen-Regel ausgenommen. Die Ausnahme gilt ab
// jetzt auch fuer `public/assets/start-styles.css` — und genau dort lag eine
// Falle: index.html laedt `/assets/start-styles.css`, aber der Buendler schrieb
// nur die Wurzel-Fassung. Wer die Quellen aenderte und buendelte, sah live
// weiter das alte Buendel. Ohne Fehlermeldung, ohne rotes Feld.
//
// Eine Ausnahme von einer Regel ist nur so ehrlich wie die Pruefung, die an
// ihre Stelle tritt. Diese Datei ist diese Pruefung: beide Fassungen muessen
// Zeichen fuer Zeichen aus den Quellen entstehen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBundle, SOURCES, OUTPUTS } from "../scripts/build/bundle-start-styles.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("beide Fassungen des Buendels sind aktuell", async () => {
  const erwartet = await buildBundle();
  assert.ok(OUTPUTS.length >= 2, "die ausgelieferte Kopie fehlt in der Zielliste");

  for (const ziel of OUTPUTS) {
    const ist = await readFile(ziel, "utf8").catch(() => "");
    assert.equal(ist, erwartet,
      `${path.relative(REPO, ziel)} weicht von den Quellen ab — 'node scripts/build/bundle-start-styles.mjs' ausfuehren`);
  }
});

test("die Fassung, die index.html laedt, gehoert zu den Zielen", async () => {
  // Der Fehler war nicht "eine Datei vergessen", sondern "die FALSCHE Datei
  // gepflegt". Darum wird hier gegen das gemessen, was die Seite wirklich holt.
  const html = await readFile(path.join(REPO, "public", "index.html"), "utf8");
  const treffer = html.match(/<link[^>]+href="([^"]*start-styles\.css[^"]*)"/);
  assert.ok(treffer, "index.html laedt gar kein Start-Buendel mehr");

  const geladen = treffer[1].split("?")[0].replace(/^\//, "");
  const alsPfad = path.join(REPO, "public", geladen.replace(/^assets\//, "assets/"));
  assert.ok(OUTPUTS.some((ziel) => path.resolve(ziel) === path.resolve(alsPfad)),
    `index.html laedt ${geladen}, aber der Buendler schreibt diese Fassung nicht`);
});

test("das Buendel enthaelt jede Quelldatei, in der Reihenfolge der Kaskade", async () => {
  const buendel = await buildBundle();
  let letzte = -1;
  for (const name of SOURCES) {
    const stelle = buendel.indexOf(`/* ---- ${name} ---- */`);
    assert.ok(stelle > -1, `${name} fehlt im Buendel`);
    assert.ok(stelle > letzte, `${name} steht in falscher Reihenfolge — die Kaskade kippt`);
    letzte = stelle;
  }
});

// Die Zeilenregel fuer die QUELLEN prueft check-guidelines selbst — mit seiner
// eigenen Ratsche fuer Altlasten (public/styles.css steht dort bei 1589). Sie
// hier nachzubauen hiesse, zwei Wahrheiten ueber dieselbe Regel zu fuehren.

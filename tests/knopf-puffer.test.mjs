// smejj.com — der Browser-Knopf ist nie tot (Klick-Puffer).
//
// Gemessen 2026-08-19: ein Klick 3,7 s nach dem Seitenladen verpuffte
// wortlos — app.js verdrahtet den Knopf erst nach seiner Importkette.
// Der Puffer merkt den Klick und feuert ihn nach, sobald app.js
// "smejj:panel-bereit" meldet. Lokal bewiesen: Sofort-Klick -> Panel
// oeffnete nachtraeglich nach 1,2 s.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const puffer = fs.readFileSync("public/knopf-puffer.js", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");

test("der Puffer ist klassisch und importfrei — er muss VOR den Modulen laufen", () => {
  assert.doesNotMatch(puffer, /^import /m);
  // index.html laedt ihn OHNE type="module": module sind deferred, der
  // Puffer soll beim Parsen laufen.
  assert.match(index, /<script src="\/assets\/knopf-puffer\.js\?v=\d+"><\/script>/);
});

test("beide Haelften des Handschlags existieren", () => {
  assert.match(puffer, /smejj:panel-bereit/);
  assert.match(app, /smejj:panel-bereit/);
  // und der nachgefeuerte Klick laeuft durch den echten Handler:
  assert.match(puffer, /knopf\.click\(\)/);
});

test("der Puffer liegt im Precache — offline darf der Knopf nicht sterben", () => {
  assert.match(sw, /"\/assets\/knopf-puffer\.js"/);
});

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

test("der Puffer prueft die WIRKUNG, statt app.js zu befragen", () => {
  // app.js steht am 800-Zeilen-Limit und soll unangetastet bleiben (eigener
  // Waechter). Der Puffer verlangt deshalb KEIN Signal von dort: er klickt
  // und schaut, ob das Panel aufgeht — wirkt es nicht, versucht er es erneut.
  assert.doesNotMatch(app, /smejj:panel-bereit/, "app.js bleibt unberuehrt");
  assert.match(puffer, /classList\.contains\("is-open"\)/);
  assert.match(puffer, /knopf\.click\(\)/);
  // Endliche Frist — ein Puffer, der ewig weiterklickt, waere schlimmer als
  // der tote Knopf.
  assert.match(puffer, /VERSUCHE\s*=\s*\d+/);
  assert.match(puffer, /rest <= 0/);
});

test("ein Klick bei OFFENEM Panel ist ein Schliessen — der Puffer klickt dann nie nach", () => {
  // Gemessen 2026-09-14: Panel per Wiederherstellung offen, Nutzer klickt zu,
  // 60 ms spaeter "nicht offen" — der Puffer hielt das fuer einen verlorenen
  // Klick und riss das Panel wieder auf. Die Pruefung muss VOR dem setTimeout
  // stehen: offen beim Klick => verdrahtet => erledigt.
  const vorher = puffer.indexOf("if (panelOffen()) { erledigt = true; return; }");
  const timer = puffer.indexOf("setTimeout(function () {");
  assert.ok(vorher > 0, "Wache 'offen beim Klick' fehlt");
  assert.ok(vorher < timer, "die Wache muss VOR dem verzoegerten Nachklicken stehen");
});

test("der Puffer liegt im Precache — offline darf der Knopf nicht sterben", () => {
  assert.match(sw, /"\/assets\/knopf-puffer\.js"/);
});

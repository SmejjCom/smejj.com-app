// smejj.com — Der Service Worker kennt DIESELBEN App-Routen wie die App.
//
// WARUM ES DIESEN TEST GIBT (12.09.2026): GitHub Pages kennt nur Dateien. Ein
// Aufruf von /projects liefert 404, 404.html schickt den Nutzer auf "/" zurueck
// — und auf dem Android-Geraet wurde daraus ein Kreisel: die App wanderte im
// Sekundentakt /smejjBot -> / -> /chat-history -> / -> /browser -> /. Der
// Service Worker faengt Navigationen auf App-Routen jetzt ab und liefert die
// Huelle aus dem Zwischenspeicher.
//
// Dafuer steht die Routenliste an ZWEI Orten: in public/view-routes.js (die App)
// und in public/sw.js (der Worker, der keine Module laden kann). Zwei Orte sind
// zwei Wahrheiten, sobald sie auseinanderlaufen — genau das verhindert dieser
// Test. Er ist billiger als der Fehler, den er abfaengt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VIEW_PATHS, PATH_VIEWS } from "../public/view-routes.js";

const swQuelle = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function routenAusWorker() {
  const start = swQuelle.indexOf("const APP_ROUTEN = new Set([");
  assert.notEqual(start, -1, "APP_ROUTEN fehlt im Service Worker");
  const ende = swQuelle.indexOf("]);", start);
  return new Set([...swQuelle.slice(start, ende).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

test("der Worker kennt jede App-Route der App — ausser der Wurzel", () => {
  const imWorker = routenAusWorker();
  const derApp = new Set([...Object.values(VIEW_PATHS), ...Object.keys(PATH_VIEWS)].filter((p) => p && p !== "/"));
  const fehlen = [...derApp].filter((p) => !imWorker.has(p));
  assert.deepEqual(fehlen, [], `im Service Worker fehlen Routen: ${fehlen.join(", ")} — ein Lesezeichen darauf landet im 404-Kreisel`);
});

test("der Worker erfindet keine Routen, die die App nicht kennt", () => {
  const imWorker = routenAusWorker();
  const derApp = new Set([...Object.values(VIEW_PATHS), ...Object.keys(PATH_VIEWS)]);
  const zuviel = [...imWorker].filter((p) => !derApp.has(p));
  assert.deepEqual(zuviel, [], `der Service Worker faengt Pfade ab, die es nicht gibt: ${zuviel.join(", ")} — die ehrliche 404-Seite waere richtig`);
});

test("die Wurzel bleibt aussen vor — sie ist die Huelle selbst", () => {
  assert.ok(!routenAusWorker().has("/"), "/ darf nicht in der Liste stehen, sonst faengt der Worker sich selbst");
});

test("nur NAVIGATIONEN werden abgefangen, und unbekannte Pfade nie", () => {
  const stelle = swQuelle.slice(swQuelle.indexOf("APP-ROUTEN UEBERLEBEN"), swQuelle.indexOf("function huelleAusCache"));
  assert.match(stelle, /request\.mode === "navigate"/, "ein Bild oder Skript darf nie die Huelle bekommen");
  assert.match(stelle, /APP_ROUTEN\.has/, "ohne diese Pruefung verschwaende der Worker die ehrliche 404-Seite");
  assert.match(stelle, /antwort && antwort\.ok \? antwort : huelleAusCache/, "eine gesunde Antwort aus dem Netz hat Vorrang");
});

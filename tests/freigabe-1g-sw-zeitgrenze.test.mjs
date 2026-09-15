// Betreiber-Freigabe 1g (15.09.2026): Zeitgrenzen im Service Worker — Installation und
// Seiten-Navigation haengen nie mehr unbegrenzt; /api/ und Stroeme bleiben ohne Grenze.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const start = quelle.indexOf("function mitZeitgrenze");
const mitZeitgrenze = new Function(`${quelle.slice(start, quelle.indexOf("\n}\n", start) + 2)}; return mitZeitgrenze;`)();

test("Netz schneller als die Grenze: Netzantwort", async () => {
  assert.equal(await mitZeitgrenze(Promise.resolve("netz"), () => "cache", 50), "netz");
});

test("Netz haengt: nach der Grenze gewinnt der Speicher; ohne Treffer wird weiter gewartet", async () => {
  let spaet;
  const haengt = new Promise((r) => { spaet = r; });
  assert.equal(await mitZeitgrenze(haengt, () => "cache", 20), "cache");
  const haengt2 = new Promise((r) => setTimeout(() => r("netz-spaet"), 60));
  assert.equal(await mitZeitgrenze(haengt2, () => undefined, 20), "netz-spaet");
  spaet("egal");
});

test("Netzfehler vor der Grenze wird weitergereicht (bestehender Offline-Rueckfall greift)", async () => {
  await assert.rejects(mitZeitgrenze(Promise.reject(new Error("offline")), () => "cache", 50), /offline/);
});

test("Verdrahtung: Installation mit Signal, Navigation mit Grenze, /api/ ohne", () => {
  assert.match(quelle, /new Request\(url, \{ cache: "reload", signal: installSignal\(\) \}\)/);
  assert.match(quelle, /const INSTALL_ZEITGRENZE_MS = 30000;/);
  assert.match(quelle, /mitZeitgrenze\(netz, \(\) => caches\.match\(request\)\)/);
  assert.match(quelle, /if \(url\.pathname\.startsWith\("\/api\/"\)\) \{\n\s*event\.respondWith\(fetch\(request\)\);/);
});

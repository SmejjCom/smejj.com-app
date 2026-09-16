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
  // Livetest 15.09.2026 (Firefox): /api/ wird gar nicht mehr abgefangen — ohne
  // Zeitgrenze bleibt es damit erst recht (tests/sw-api-und-huelle.test.mjs).
  assert.match(quelle, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
});

// ---- 16.09.2026: die Grenze gilt je PAKET ab seinem eigenen Start ------------
//
// Befund: addAll mit 237 vorab erzeugten Anfragen — die 30-s-Uhr lief in der
// Warteschlange ab, der volle Speicher blieb leer (gemessen 41 s fuer alle
// Dateien bei sechs parallelen Abrufen). Diese Tests halten fest, dass
//   1. Anfragen und Uhren erst unmittelbar vor ihrem Paket entstehen,
//   2. ein Paket hoechstens sechs Dateien hat,
//   3. Alles-oder-nichts bleibt: scheitert ein Paket, wird der Speicher geloescht.
const fStart = quelle.indexOf("const INSTALL_PAKET");
const fEnde = quelle.indexOf("\n}\n", quelle.indexOf("async function fuelleSpeicher")) + 2;
class AnfrageAttrappe { constructor(url, init) { this.url = url; this.init = init; } }
function baueFueller(signal) {
  return new Function("installSignal", "Request", "caches", "AKTIVER_CACHE",
    `${quelle.slice(fStart, fEnde)}; return fuelleSpeicher;`)(signal, AnfrageAttrappe, { delete: async () => true }, "test");
}

test("fuelleSpeicher: Uhren entstehen je Paket, Pakete haben hoechstens sechs Dateien", async () => {
  const liste = Array.from({ length: 20 }, (_, i) => `/datei-${i}.js`);
  let signale = 0;
  const pakete = [];
  const fueller = baueFueller(() => { signale += 1; return undefined; });
  await fueller({ addAll: async (anfragen) => { pakete.push({ groesse: anfragen.length, signaleBisher: signale }); } }, liste);
  assert.deepEqual(pakete.map((p) => p.groesse), [6, 6, 6, 2]);
  // Beim n-ten Paket existieren nur die Uhren der Pakete 1..n — nie alle 20 vorab.
  let summe = 0;
  pakete.forEach((p) => { summe += p.groesse; assert.equal(p.signaleBisher, summe); });
});

test("fuelleSpeicher: scheitert ein Paket, wird der halbe Speicher geloescht und die Installation scheitert", async () => {
  const liste = Array.from({ length: 13 }, (_, i) => `/datei-${i}.js`);
  let geloescht = 0;
  let paket = 0;
  const fueller = baueFueller(() => undefined);
  await assert.rejects(
    fueller({ addAll: async () => { paket += 1; if (paket === 2) throw new TypeError("Failed to fetch"); } }, liste, () => { geloescht += 1; }),
    /Failed to fetch/
  );
  assert.equal(geloescht, 1, "alles oder nichts: ein halber Speicher darf nie stehen bleiben");
});

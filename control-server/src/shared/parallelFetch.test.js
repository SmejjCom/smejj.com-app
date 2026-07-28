// smejj.com — Unit-Tests fuer das begrenzte nebenlaeufige Holen.
// Ausfuehren: node --test control-server/src/shared/parallelFetch.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { mapMitGrenze } from "./parallelFetch.js";

test("die Reihenfolge der Ergebnisse folgt der Eingabe, nicht der Fertigstellung", async () => {
  const eingabe = [50, 10, 30, 5, 20];
  const ergebnis = await mapMitGrenze(eingabe, async (ms, i) => {
    await new Promise((f) => setTimeout(f, ms));
    return i;
  }, 4);
  assert.deepEqual(ergebnis, [0, 1, 2, 3, 4]);
});

test("es laufen nie mehr als erlaubt gleichzeitig", async () => {
  let jetzt = 0;
  let hoechststand = 0;
  await mapMitGrenze(Array.from({ length: 30 }, (_, i) => i), async () => {
    jetzt += 1;
    hoechststand = Math.max(hoechststand, jetzt);
    await new Promise((f) => setTimeout(f, 5));
    jetzt -= 1;
  }, 4);
  assert.equal(hoechststand <= 4, true, `hoechstens 4, war ${hoechststand}`);
  assert.equal(hoechststand > 1, true, "es soll ueberhaupt parallel laufen");
});

test("ein Fehler ergibt null und kippt nicht den ganzen Lauf", async () => {
  const ergebnis = await mapMitGrenze([1, 2, 3], async (n) => {
    if (n === 2) throw new Error("kaputt");
    return n * 10;
  }, 2);
  assert.deepEqual(ergebnis, [10, null, 30]);
});

test("nebenlaeufig ist deutlich schneller als nacheinander", async () => {
  const start = Date.now();
  await mapMitGrenze(Array.from({ length: 16 }, () => 20), async (ms) => {
    await new Promise((f) => setTimeout(f, ms));
  }, 8);
  const gebraucht = Date.now() - start;
  assert.equal(gebraucht < 16 * 20 * 0.6, true,
    `16 Aufgaben a 20 ms mit 8 gleichzeitig sollten deutlich unter 320 ms bleiben, waren ${gebraucht} ms`);
});

test("Randfaelle: leere Liste, keine Liste, absurde Grenzen", async () => {
  assert.deepEqual(await mapMitGrenze([], async () => 1), []);
  assert.deepEqual(await mapMitGrenze(null, async () => 1), []);
  assert.deepEqual(await mapMitGrenze([1, 2], async (n) => n, 0), [1, 2]);
  assert.deepEqual(await mapMitGrenze([1, 2], async (n) => n, 9999), [1, 2]);
});

// smejj.com — Tests fuer die Feldmessung.
//
// Zwei Zusagen: (1) Es verlaesst nichts das Geraet — keine Netzanfrage, kein
// Endpunkt. (2) Ein p75 wird erst behauptet, wenn genug Besuche vorliegen;
// vorher gilt kein Budget als verfehlt.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BUDGETS, clearFieldVitals, fieldVitalsSummary, initFieldVitals } from "../public/field-vitals.js";

function fakeScope(besuche = []) {
  const speicher = new Map();
  if (besuche.length) speicher.set("smejj.vitals.v1", JSON.stringify(besuche));
  return {
    localStorage: {
      getItem: (k) => speicher.get(k) ?? null,
      setItem: (k, v) => speicher.set(k, v),
      removeItem: (k) => speicher.delete(k)
    },
    speicher
  };
}

const besuch = (lcp, inp = 50, ttfb = 60, cls = 0) => ({ t: "2026-07-28T10:00", lcp_ms: lcp, inp_ms: inp, ttfb_ms: ttfb, cls });

test("ohne Besuche wird nichts behauptet", () => {
  const z = fieldVitalsSummary(fakeScope());
  assert.equal(z.besuche, 0);
  assert.deepEqual(z.verstoesse, []);
  for (const k of Object.keys(BUDGETS)) assert.equal(z.werte[k], null);
});

test("p75 wird korrekt aus den Besuchen gebildet", () => {
  const werte = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  const z = fieldVitalsSummary(fakeScope(werte.map((v) => besuch(v))));
  assert.equal(z.besuche, 10);
  assert.equal(z.werte.lcp_ms.p75, 800, "p75 von 10 Werten ist der achte");
  assert.equal(z.werte.lcp_ms.min, 100);
  assert.equal(z.werte.lcp_ms.max, 1000);
});

test("wenige Besuche loesen NIE einen Budgetbruch aus", () => {
  // Neun schlechte Besuche: statistisch bedeutungslos, darf nichts melden.
  const z = fieldVitalsSummary(fakeScope(Array.from({ length: 9 }, () => besuch(9000))));
  assert.deepEqual(z.verstoesse, [], "unter 10 Besuchen wird kein Budget bewertet");
});

test("ab zehn Besuchen wird ein echter Budgetbruch gemeldet", () => {
  const z = fieldVitalsSummary(fakeScope(Array.from({ length: 12 }, () => besuch(9000))));
  assert.ok(z.verstoesse.some((v) => v.startsWith("lcp_ms")), `erwartet lcp-Verstoss, war: ${z.verstoesse.join(", ")}`);
});

test("gute Werte melden keinen Verstoss", () => {
  const z = fieldVitalsSummary(fakeScope(Array.from({ length: 20 }, () => besuch(400, 40, 50, 0))));
  assert.deepEqual(z.verstoesse, []);
});

test("Loeschen entfernt die lokalen Messwerte", () => {
  const scope = fakeScope([besuch(500)]);
  assert.equal(clearFieldVitals(scope), true);
  assert.equal(fieldVitalsSummary(scope).besuche, 0);
});

test("kaputter Speicher bringt nichts zum Absturz", () => {
  const scope = fakeScope();
  scope.speicher.set("smejj.vitals.v1", "{kein json");
  assert.equal(fieldVitalsSummary(scope).besuche, 0);
  assert.equal(initFieldVitals({}), false, "ohne PerformanceObserver einfach nichts tun");
});

test("das Modul sendet nichts und kennt keinen Endpunkt", () => {
  const quelle = fs.readFileSync("public/field-vitals.js", "utf8");
  for (const verboten of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "https://"]) {
    assert.ok(!quelle.includes(verboten), `Feldmessung darf nichts senden — gefunden: ${verboten}`);
  }
});

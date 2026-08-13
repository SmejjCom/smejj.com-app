// smejj.com — Selbstheilung: die BREMSE ist der Prüfgegenstand.
//
// Ein Heiler ohne Bremse ist gefährlicher als keiner: er hämmert im
// Sekundentakt gegen einen Dienst, der ohnehin am Boden liegt. Diese Tests
// halten fest, dass genau dreimal versucht wird, mit wachsendem Abstand,
// und dass danach ein Mensch gerufen wird statt weiterzuhämmern.
import test from "node:test";
import assert from "node:assert/strict";

import {
  planeHeilung,
  fuehreHeilungAus,
  VERSUCHE_MAX,
  ABSTAENDE_MS
} from "../control-server/src/autopilots/selbstheilung.js";

const rot = (id, extra = {}) => ({ id, name: id, ampel: "rot", ampelGrund: "Überfällig", ...extra });
const gruen = (id) => ({ id, name: id, ampel: "gruen", ampelGrund: "pünktlich" });

test("Gruene Autopiloten werden nicht angefasst", () => {
  const zustand = new Map();
  const plan = planeHeilung({ autopiloten: [gruen("a"), gruen("b")], zustand, jetztMs: 1000 });
  assert.deepEqual(plan.heilen, []);
  assert.deepEqual(plan.eskalieren, []);
});

test("Erster Versuch passiert SOFORT, der zweite erst nach Abstand", () => {
  const zustand = new Map();
  const t0 = 1_000_000;

  const p1 = planeHeilung({ autopiloten: [rot("x")], zustand, jetztMs: t0 });
  assert.deepEqual(p1.heilen, [{ id: "x", versuch: 1 }], "sofort versuchen");

  // Direkt danach: noch nicht wieder — sonst waere es ein Hammer.
  const p2 = planeHeilung({ autopiloten: [rot("x")], zustand, jetztMs: t0 + 1000 });
  assert.deepEqual(p2.heilen, [], "kein zweiter Versuch im selben Moment");
  assert.equal(p2.warten.length, 1);
  assert.ok(p2.warten[0].nochMs > 0);

  // Nach dem Abstand: zweiter Versuch.
  const p3 = planeHeilung({ autopiloten: [rot("x")], zustand, jetztMs: t0 + ABSTAENDE_MS[1] + 1 });
  assert.deepEqual(p3.heilen, [{ id: "x", versuch: 2 }]);
});

test("ENTSCHEIDEND: nach drei Versuchen wird eskaliert, nicht weitergehaemmert", () => {
  const zustand = new Map();
  let t = 1_000_000;
  const ap = [rot("y")];

  planeHeilung({ autopiloten: ap, zustand, jetztMs: t });                       // 1
  t += ABSTAENDE_MS[1] + 1;
  planeHeilung({ autopiloten: ap, zustand, jetztMs: t });                       // 2
  t += ABSTAENDE_MS[2] + 1;
  const p3 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t });            // 3
  assert.deepEqual(p3.heilen, [{ id: "y", versuch: VERSUCHE_MAX }]);

  t += ABSTAENDE_MS[2] + 1;
  const p4 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t });
  assert.deepEqual(p4.heilen, [], "kein vierter Versuch");
  assert.equal(p4.eskalieren.length, 1, "stattdessen wird ein Mensch gerufen");
  assert.match(p4.eskalieren[0].grund, /3 Wiederbelebungsversuche/);

  // Und danach Ruhe: nicht bei jedem Takt erneut eskalieren (Mail-Sturm).
  t += 10 * ABSTAENDE_MS[2];
  const p5 = planeHeilung({ autopiloten: ap, zustand, jetztMs: t });
  assert.deepEqual(p5.eskalieren, [], "eskaliert wird genau einmal");
  assert.deepEqual(p5.heilen, []);
});

test("Wieder gruen setzt den Zaehler zurueck — erst dann, nicht schon beim Versuch", () => {
  const zustand = new Map();
  const t0 = 5_000_000;
  planeHeilung({ autopiloten: [rot("z")], zustand, jetztMs: t0 });
  assert.equal(zustand.get("z").versuche, 1, "der Versuch zaehlt, auch wenn er lief");

  planeHeilung({ autopiloten: [gruen("z")], zustand, jetztMs: t0 + 1000 });
  assert.equal(zustand.has("z"), false, "geheilt = Zaehler weg");

  // Faellt er spaeter erneut aus, beginnt die Bremse wieder bei eins.
  const p = planeHeilung({ autopiloten: [rot("z")], zustand, jetztMs: t0 + 2000 });
  assert.deepEqual(p.heilen, [{ id: "z", versuch: 1 }]);
});

test("In Wartung wird nichts wiederbelebt", () => {
  const zustand = new Map();
  const plan = planeHeilung({
    autopiloten: [rot("w", { wartung: { seit: "2026-08-13", grund: "Umbau" } })],
    zustand, jetztMs: 1000
  });
  assert.deepEqual(plan.heilen, [], "stillgelegt heisst stillgelegt");
});

test("Ohne hinterlegten Weg wird ehrlich eskaliert statt Erfolg vorzutaeuschen", async () => {
  const alarme = [];
  const ergebnisse = await fuehreHeilungAus({
    plan: { heilen: [{ id: "ohne-weg", versuch: 1 }], eskalieren: [], warten: [] },
    heiler: {},
    sendeAlarm: async (e) => { alarme.push(e); }
  });
  assert.equal(ergebnisse[0].ok, false);
  assert.match(ergebnisse[0].grund, /kein Wiederbelebungsweg/);
  assert.equal(alarme.length, 1, "der Betreiber erfaehrt, dass es hier keinen Weg gibt");
});

test("Der Heiler bezeugt sich selbst", async () => {
  const gemeldet = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [{ id: "a", versuch: 1 }], eskalieren: [], warten: [{ id: "b", nochMs: 5000 }] },
    heiler: { a: async () => true },
    melde: (id, e) => { gemeldet.set(id, e); return true; }
  });
  const m = gemeldet.get("selbstheilung");
  assert.ok(m, "ohne Selbstmeldung wuesste niemand, ob der Heiler arbeitet");
  assert.equal(m.status, "ok");
  assert.match(m.meldung, /1\/1 Wiederbelebung/);

  const leer = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [], eskalieren: [], warten: [] },
    melde: (id, e) => { leer.set(id, e); return true; }
  });
  assert.match(leer.get("selbstheilung").meldung, /Nichts zu heilen/);
});

test("Eskalation faerbt die Heiler-Ampel rot", async () => {
  const gemeldet = new Map();
  await fuehreHeilungAus({
    plan: { heilen: [], eskalieren: [{ id: "tot", name: "tot", grund: "3x nichts" }], warten: [] },
    melde: (id, e) => { gemeldet.set(id, e); return true; },
    sendeAlarm: async () => {}
  });
  assert.equal(gemeldet.get("selbstheilung").status, "fehler",
    "wenn der Heiler aufgibt, darf seine eigene Ampel nicht gruen bleiben");
});

// muuny AI — die drei Stellen, an denen der Kreislauf bis zum 20.09.2026 OFFEN war.
//
// 1. Eine bewaehrte Canary kam nie auf 100 Prozent (con-1.3 hing 15 Tage bei 10 %).
// 2. Der Alias 'muuny-stable' existierte nicht — die Anwendung haette eine feste Nummer gefragt.
// (Der fruehere dritte Punkt — Daten selbst erzeugen — ist seit dem 21.09.2026 abgeschafft:
//  erzeugte Beispiele machen das Modell schlechter. Siehe muuny-tor.test.mjs.)
// Jeder Test hier haelt genau eine dieser Luecken zu.
import assert from "node:assert/strict";
import test from "node:test";
import {
  ALIAS, aliasStand, befoerdereCanaryWennBewaehrt, BEWAEHRUNG_STUNDEN,
  pruefeBefoerderung, setzeCanary, waehleVersion
} from "../workers/muuny-autopilot/canary.js";
import { L } from "../workers/muuny-autopilot/lager.js";

/** e2-Attrappe: ein Objekt im Arbeitsspeicher, sonst nichts. */
function e2Attrappe(anfang = {}) {
  const ablage = { ...anfang };
  return {
    ablage,
    async getJson(key, standard = null) { return key in ablage ? JSON.parse(JSON.stringify(ablage[key])) : standard; },
    async putJson(key, wert) { ablage[key] = JSON.parse(JSON.stringify(wert)); return { ok: true }; },
    async putText(key, text) { ablage[key] = text; return { ok: true }; },
    async getText(key) { return ablage[key] ?? null; }
  };
}

const GUT = { antworten: 500, fehler: 5, fehlerrate: 0.01, sicherheitsvorfaelle: 0, kostenProAntwortUsd: 0.001, abstuerze: 0, latenzMs: 800 };

test("Befoerderung braucht Zeit, Daten und ein sauberes Bild — je einzeln", () => {
  const seit = new Date("2026-09-19T00:00:00Z").toISOString();
  const spaet = new Date("2026-09-20T12:00:00Z");

  // Zeit allein reicht nicht: ohne Betriebsdaten hat die Canary nichts bewiesen.
  assert.match(pruefeBefoerderung({ antworten: 3 }, { canarySeit: seit, jetzt: spaet }).grund, /zu_wenig_betriebsdaten/);
  // Daten allein reichen nicht: die Bewaehrungszeit ist eine Zeit, keine Stueckzahl.
  const frueh = new Date("2026-09-19T02:00:00Z");
  assert.match(pruefeBefoerderung(GUT, { canarySeit: seit, jetzt: frueh }).grund, /bewaehrung_laeuft/);
  // Ein Rollback-Grund schlaegt jede Wartezeit.
  assert.match(pruefeBefoerderung({ ...GUT, sicherheitsvorfaelle: 1 }, { canarySeit: seit, jetzt: spaet }).grund, /rollback_grund/);
  // Schlechter als der alte Stand ist kein Fortschritt, auch ohne Grenzverletzung.
  const schlechter = pruefeBefoerderung({ ...GUT, latenzMs: 3000 }, { canarySeit: seit, jetzt: spaet, stabilMetriken: { ...GUT, latenzMs: 800 } });
  assert.match(schlechter.grund, /schlechter_als_stabil/);
  // Alles zusammen: reif.
  const reif = pruefeBefoerderung(GUT, { canarySeit: seit, jetzt: spaet, stabilMetriken: GUT });
  assert.equal(reif.reif, true, reif.grund || "");
  assert.ok(reif.stunden >= BEWAEHRUNG_STUNDEN);
});

test("Eine bewaehrte Canary geht wirklich auf 100 Prozent — die Luecke von 15 Tagen", async () => {
  const e2 = e2Attrappe({
    [L.deploy]: { alias: ALIAS, stable: "muuny-1.0", canary: "muuny-1.3",
      canarySeit: new Date("2026-09-05T14:00:00Z").toISOString(), canaryAnteil: 0.1, historie: [] },
    [`${L.deployMetriken}/muuny-1.3.json`]: GUT,
    [`${L.deployMetriken}/muuny-1.0.json`]: GUT
  });
  const z = { historie: [] };
  const r = await befoerdereCanaryWennBewaehrt({ e2, jetzt: () => new Date("2026-09-20T18:00:00Z") }, z);
  assert.equal(r.befoerdert, true, r.grund || "");
  const d = await e2.getJson(L.deploy);
  assert.equal(d.stable, "muuny-1.3");
  assert.equal(d.canary, null, "nach der Befoerderung gibt es keine Canary mehr");
  assert.equal(d.canaryAnteil, 0);
  assert.equal(d.letzteBefoerderung.von, "muuny-1.0");
  assert.ok(d.historie.some((h) => h.aktion === "befoerdert"));
});

test("Ohne Betriebsdaten haengt die Canary nicht still, sondern nennt ihren Grund", async () => {
  const e2 = e2Attrappe({
    [L.deploy]: { stable: "muuny-1.0", canary: "muuny-1.3", canarySeit: new Date("2026-09-05T14:00:00Z").toISOString(), historie: [] }
  });
  const r = await befoerdereCanaryWennBewaehrt({ e2, jetzt: () => new Date("2026-09-20T18:00:00Z") }, null);
  assert.equal(r.befoerdert, false);
  assert.match(r.grund, /zu_wenig_betriebsdaten/);
  assert.match((await e2.getJson(L.deploy)).canaryWartetAuf, /zu_wenig_betriebsdaten/,
    "der Grund muss IM Deploy-Stand stehen, sonst sieht ihn niemand");
});

test("Der Alias verteilt deterministisch: derselbe Nutzer bekommt dasselbe Modell", async () => {
  const e2 = e2Attrappe({ [L.deploy]: { alias: ALIAS, stable: "muuny-1.0", canary: "muuny-1.3", canaryAnteil: 0.1, canarySeit: "2026-09-20T00:00:00Z", historie: [] } });
  const stand = await aliasStand(e2);
  assert.equal(stand.alias, "muuny-stable");
  assert.equal(stand.version, "muuny-1.0");
  assert.equal(stand.canaryAnteil, 0.1);

  // Dieselbe Kennung, zehnmal gefragt: immer dieselbe Antwort. Ein Nutzer, der mitten im
  // Gespraech das Modell wechselt, erlebt einen Bruch, den niemand erklaeren kann.
  const einmal = waehleVersion(stand, "nutzer-4711").version;
  for (let i = 0; i < 10; i += 1) assert.equal(waehleVersion(stand, "nutzer-4711").version, einmal);

  // Ueber viele Kennungen trifft der Anteil ungefaehr die 10 Prozent.
  let canary = 0;
  const n = 5000;
  for (let i = 0; i < n; i += 1) if (waehleVersion(stand, `nutzer-${i}`).rolle === "canary") canary += 1;
  const anteil = canary / n;
  assert.ok(anteil > 0.07 && anteil < 0.13, `Canary-Anteil ${anteil} liegt nicht bei 10 %`);
});

test("Ohne Canary bedient immer der stabile Stand", async () => {
  const e2 = e2Attrappe({ [L.deploy]: { stable: "muuny-1.3", canary: null, historie: [] } });
  const stand = await aliasStand(e2);
  assert.equal(stand.canaryAnteil, 0);
  for (const k of ["a", "b", "c", ""]) assert.equal(waehleVersion(stand, k).version, "muuny-1.3");
});

test("setzeCanary traegt Alias und Anteil ein, ein Rollback nimmt beides zurueck", async () => {
  const e2 = e2Attrappe({ [L.deploy]: { stable: "muuny-1.3", canary: null, historie: [] } });
  const d = await setzeCanary(e2, { versions: [] }, "muuny-1.7");
  assert.equal(d.alias, ALIAS);
  assert.equal(d.canaryAnteil, 0.1, "eine neue Version startet bei 10 Prozent, nie bei 100");
  assert.equal(d.stable, "muuny-1.3", "der Rueckfall-Anker bleibt der alte Stand");
});

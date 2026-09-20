// muuny AI — die drei Stellen, an denen der Kreislauf bis zum 20.09.2026 OFFEN war.
//
// 1. Eine bewaehrte Canary kam nie auf 100 Prozent (con-1.3 hing 15 Tage bei 10 %).
// 2. Der Alias 'muuny-stable' existierte nicht — die Anwendung haette eine feste Nummer gefragt.
// 3. Fehlten Daten, blieb der Kreislauf stehen, statt welche zu erzeugen.
// Jeder Test hier haelt genau eine dieser Luecken zu.
import assert from "node:assert/strict";
import test from "node:test";
import {
  ALIAS, aliasStand, befoerdereCanaryWennBewaehrt, BEWAEHRUNG_STUNDEN,
  pruefeBefoerderung, setzeCanary, waehleVersion
} from "../workers/muuny-autopilot/canary.js";
import { mischungFuer, naechsterDatensatzName, startwertFuer } from "../workers/muuny-autopilot/nachschub.js";
import { NACHSCHUB_ABSTAND_MS, sorgeFuerNachschub } from "../workers/muuny-autopilot/kreislauf.js";
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

test("Datensatznamen werden nie zweimal vergeben und zaehlen die con-Reihe weiter", () => {
  const index = { datensaetze: [{ name: "con-grundfaehigkeiten-v3" }, { name: "con-grundfaehigkeiten-v4" }] };
  assert.equal(naechsterDatensatzName(index), "muuny-grundfaehigkeiten-v5",
    "v1 bis v4 sind verbraucht — eine verbrauchte Nummer neu zu vergeben loescht die Herkunft einer Note");
  index.datensaetze.push({ name: "muuny-grundfaehigkeiten-v5" });
  assert.equal(naechsterDatensatzName(index), "muuny-grundfaehigkeiten-v6");
  assert.equal(naechsterDatensatzName({ datensaetze: [] }), "muuny-grundfaehigkeiten-v1");
});

test("Derselbe Name ergibt denselben Datensatz, ein neuer Name einen anderen", () => {
  assert.equal(startwertFuer("muuny-grundfaehigkeiten-v5"), startwertFuer("muuny-grundfaehigkeiten-v5"));
  assert.notEqual(startwertFuer("muuny-grundfaehigkeiten-v5"), startwertFuer("muuny-grundfaehigkeiten-v6"));
});

test("Die Mischung geht gegen die Schwaeche, opfert aber nie die anderen Bereiche", () => {
  const s = mischungFuer("sicherheit");
  assert.ok(s.sicherheit > MISCHUNG_ANTEIL_STANDARD, "Sicherheit muss deutlich schwerer wiegen");
  for (const feld of ["reasoning", "sprache", "gleichungen", "zaehlenImSatz", "wortzahl", "siezen", "nachfragen"]) {
    assert.ok(s[feld] > 0, `${feld} darf nicht auf null fallen — con-1.1.0 verlernte am 03.09. genau so das Verweigern`);
  }
  assert.ok(mischungFuer("reasoning").reasoning > s.reasoning);
  assert.ok(mischungFuer("sprache").siezen > s.siezen);
});
const MISCHUNG_ANTEIL_STANDARD = 2500;

test("Der Kreislauf erzeugt Daten selbst — und hoechstens einen Satz je Stunde", async () => {
  const e2 = e2Attrappe();
  const ctx = { e2, konfig: { suitesDir: new URL("../workers/muuny-autopilot/suites", import.meta.url).pathname },
    jetzt: () => new Date("2026-09-20T18:00:00Z") };
  const z = { historie: [], schwaechste: { kategorie: "sicherheit" } };
  const plan = { schritt: "trainingsplan", phase: "warten_auf_daten", schwaeche: { kategorie: "sicherheit" } };

  const r = await sorgeFuerNachschub(ctx, z, plan);
  assert.ok(r, "beim ersten Mal muss ein Datensatz entstehen");
  assert.equal(r.name, "muuny-grundfaehigkeiten-v1");
  assert.ok(r.paare >= 3000, `nur ${r.paare} Paare — der Kreislauf verlangt mindestens 3000`);
  assert.equal(r.freigegeben, true, "ein Satz, der die eigene Pruefung besteht, muss freigegeben sein");
  assert.equal(z.letzterNachschub.kategorie, "sicherheit");
  // Wirklich in e2 gelandet, mit Index-Eintrag — sonst findet ihn der naechste Takt nicht.
  assert.ok(e2.ablage[`${L.datensaetze}/${r.name}/train.jsonl`], "train.jsonl fehlt in e2");
  const index = await e2.getJson(L.datensatzIndex);
  assert.equal(index.datensaetze.at(-1).name, r.name);
  assert.equal(index.datensaetze.at(-1).freigegeben, true);

  // Zweiter Takt fuenf Minuten spaeter: nichts Neues, sonst lagen nach einem Tag 288 Saetze in e2.
  const ctx2 = { ...ctx, jetzt: () => new Date("2026-09-20T18:05:00Z") };
  assert.equal(await sorgeFuerNachschub(ctx2, z, plan), null);
  assert.match(z.nachschubWartet, /Abstand laeuft/);

  // Eine Stunde spaeter: der naechste Satz, und zwar unter NEUEM Namen.
  const ctx3 = { ...ctx, jetzt: () => new Date(new Date("2026-09-20T18:00:00Z").getTime() + NACHSCHUB_ABSTAND_MS + 1000) };
  const r3 = await sorgeFuerNachschub(ctx3, z, plan);
  assert.equal(r3.name, "muuny-grundfaehigkeiten-v2");
});

test("Ein Fehler beim Nachschub kippt den Takt nicht", async () => {
  const kaputt = e2Attrappe();
  kaputt.putText = async () => { throw new Error("e2 weg"); };
  const z = { historie: [] };
  const r = await sorgeFuerNachschub({ e2: kaputt, konfig: { suitesDir: new URL("../workers/muuny-autopilot/suites", import.meta.url).pathname } },
    z, { schritt: "trainingsplan", phase: "warten_auf_daten", schwaeche: { kategorie: "sicherheit" } });
  assert.equal(r, null);
  assert.match(z.nachschubFehler.text, /e2 weg/);
});

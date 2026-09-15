// smejj.com — Prüfstand der Admin-Konsole: statische Pages-Dateien und die
// Quellen-Reihenfolge der Radar-Ansicht je Herkunft (15.09.).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

import { statischePagesDatei, STATISCHE_PAGES_DATEIEN } from "../scripts/lib/pages-statisch.mjs";

test("Pages-Liste: jede statische Adresse hat ihre Datei im Repo", () => {
  assert.ok(Object.hasOwn(STATISCHE_PAGES_DATEIEN, "/radar/berichte.json"));
  for (const adresse of Object.keys(STATISCHE_PAGES_DATEIEN)) {
    assert.equal(statischePagesDatei("GET", adresse)?.vorhanden, true, adresse);
  }
});

test("Pages-Liste: kaputte Proben fallen auf, gesunde gehen durch", () => {
  const liste = { "/x.json": "public/x.json" };
  assert.equal(statischePagesDatei("GET", "/x.json", { liste, existiert: () => false }).vorhanden, false, "fehlende Datei");
  assert.equal(statischePagesDatei("GET", "/x.json?v=2", { liste, existiert: () => true }).vorhanden, true);
  assert.equal(statischePagesDatei("GET", "/y.json", { liste, existiert: () => true }), null, "ungelistet bleibt Handler-Sache");
  assert.equal(statischePagesDatei("POST", "/x.json", { liste, existiert: () => true }), null, "Pages beantwortet kein POST");
  assert.equal(statischePagesDatei("GET", "/api/admin/ops/evolution"), null);
});

/** Lädt console-stage10.js in eine Sandbox und schreibt die Abrufe mit. */
async function radarAbrufe(hostname, antworten = {}) {
  const gerufen = [];
  const fenster = { adminViewsStage10: { radar: () => "" } };
  const sandbox = {
    window: fenster,
    location: { hostname },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async (adresse) => {
      gerufen.push(adresse);
      const status = antworten[adresse] ?? 200;
      return { ok: status === 200, status, json: async () => ({ berichte: [] }) };
    }
  };
  vm.runInNewContext(readFileSync("control-server/admin-ui/console-stage10.js", "utf8"), sandbox);
  await fenster.adminStage10.seiten.radar.laden({ zeichne: () => {}, fehler: () => {} });
  return gerufen;
}

test("Radar-Ansicht: auf smejj.com zuerst die Pages-Datei — kein 404 mehr", async () => {
  assert.deepEqual(await radarAbrufe("smejj.com"), ["/radar/berichte.json"]);
  assert.deepEqual(await radarAbrufe("www.smejj.com"), ["/radar/berichte.json"]);
  // Rückfall bleibt: fehlt die Pages-Datei, kommt die Admin-Datei dran.
  assert.deepEqual(await radarAbrufe("smejj.com", { "/radar/berichte.json": 404 }), ["/radar/berichte.json", "/admin/radar-berichte.json"]);
});

test("Radar-Ansicht: auf dem Control-Weg zuerst die Admin-Datei", async () => {
  assert.deepEqual(await radarAbrufe("smejj-control.zeabur.app"), ["/admin/radar-berichte.json"]);
  assert.deepEqual(await radarAbrufe("smejj-control.zeabur.app", { "/admin/radar-berichte.json": 404 }), ["/admin/radar-berichte.json", "/radar/berichte.json"]);
});

test("Radar-Ansicht: Spiegel public/admin ist identisch mit der Quelle", () => {
  assert.equal(readFileSync("public/admin/console-stage10.js", "utf8"), readFileSync("control-server/admin-ui/console-stage10.js", "utf8"));
});

test("Prüfstand check-admin-konsole läuft grün (smejj.com-Sicht)", () => {
  const lauf = spawnSync(process.execPath, ["scripts/check-admin-konsole.mjs"], { encoding: "utf8" });
  assert.equal(lauf.status, 0, lauf.stderr || lauf.stdout);
  assert.match(lauf.stdout, /statische Pages-Datei \(1 gelistet\)/);
});

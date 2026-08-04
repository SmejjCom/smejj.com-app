// smejj.com — Tests fuer den autonomen Lauf IM Gespraechsfaden.
//
// Betreiber-Befund 2026-08-04: "Wenn ich drauf klicke, schickt er mich auf eine
// andere Seite und das ist nicht richtig."
//
// Die wichtigste Zusage steht zuerst: Der bewaehrte Weg darf nicht verloren
// gehen. Klappt der Lauf im Faden nicht, gibt starteImFaden `false` zurueck und
// der Aufrufer oeffnet wie bisher die Automatik-Ansicht.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bauJobRumpf, laufToken, neueJobId, starteImFaden, statusZeile } from "../public/autonomous-thread-run.js";

const speicher = (eintraege = {}) => ({ getItem: (k) => (k in eintraege ? eintraege[k] : null) });
const karte = () => ({ textContent: "" });
const sofort = () => Promise.resolve();

test("ohne Anmeldung wird gar nicht erst gestartet — der alte Weg uebernimmt", async () => {
  globalThis.sessionStorage = speicher();
  globalThis.localStorage = speicher();
  let gerufen = false;
  const ok = await starteImFaden({ request: { task: "x" }, karte: karte(), fetchImpl: async () => { gerufen = true; } });
  assert.equal(ok, false);
  assert.equal(gerufen, false, "ohne Token darf kein Aufruf rausgehen");
});

test("beide Token-Quellen gelten (Sitzung ODER App-Anmeldung)", () => {
  assert.equal(laufToken(speicher({ "smejj.apiToken.v1": "a" }), speicher()), "a");
  assert.equal(laufToken(speicher(), speicher({ "smejj.auth.accessToken.v1": "b" })), "b");
  assert.equal(laufToken(speicher(), speicher()), "");
  const kaputt = { getItem: () => { throw new Error("gesperrt"); } };
  assert.equal(laufToken(kaputt, kaputt), "", "gesperrter Speicher gilt als abgemeldet");
});

test("der Job-Rumpf traegt dieselben Felder wie die Automatik-Ansicht", () => {
  const rumpf = bauJobRumpf({ task: "Baue X", executionMode: "edit", uiChange: true, previewUrl: "https://imild.com/" }, "job_1");
  assert.equal(rumpf.jobId, "job_1");
  assert.equal(rumpf.task, "Baue X");
  assert.equal(rumpf.executionMode, "edit");
  assert.equal(rumpf.repository.publishMode, "pull-request");
  assert.deepEqual(rumpf.preview, { required: true, url: "https://imild.com/" });
  const analyse = bauJobRumpf({ task: "Pruefe Y", executionMode: "analyze" }, "job_2");
  assert.equal(analyse.repository.publishMode, "diff-only");
  assert.equal(analyse.preview.required, false);
  assert.equal("url" in analyse.preview, false, "ohne Adresse keine leere Adresse mitschicken");
});

test("neueJobId hat das erwartete Format", () => {
  assert.match(neueJobId(() => 0.5, () => 1), /^job_[a-z0-9]+_[a-z0-9]+$/);
});

test("statusZeile uebersetzt und bleibt bei Unbekanntem ehrlich", () => {
  assert.equal(statusZeile({ status: "running" }), "arbeitet");
  assert.equal(statusZeile({ status: "running", currentStep: "Tests" }), "arbeitet — Tests");
  assert.equal(statusZeile({ status: "wasauchimmer" }), "wasauchimmer");
  assert.equal(statusZeile(null), "unbekannt");
});

test("ein gescheitertes Anlegen faellt auf den alten Weg zurueck", async () => {
  globalThis.sessionStorage = speicher({ "smejj.apiToken.v1": "t" });
  globalThis.localStorage = speicher();
  const ok = await starteImFaden({
    request: { task: "x" }, karte: karte(), warte: sofort,
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: "kaputt" }) })
  });
  assert.equal(ok, false, "nichts laeuft -> der Aufrufer soll die Ansicht oeffnen");
});

test("ein erfolgreicher Lauf meldet den Fortschritt in der Karte", async () => {
  globalThis.sessionStorage = speicher({ "smejj.apiToken.v1": "t" });
  globalThis.localStorage = speicher();
  const k = karte();
  const zustaende = ["running", "verifying", "passed"];
  let abfragen = 0;
  const ok = await starteImFaden({
    request: { task: "Baue X" }, karte: k, warte: sofort,
    fetchImpl: async (url, options) => {
      if (options?.method === "POST" && url.endsWith("/autonomous-run")) return { ok: true, json: async () => ({}) };
      if (options?.method === "POST") return { ok: true, json: async () => ({ job: { id: "job_x" } }) };
      const status = zustaende[Math.min(abfragen++, zustaende.length - 1)];
      return { ok: true, json: async () => ({ job: { id: "job_x", status } }) };
    }
  });
  assert.equal(ok, true);
  assert.match(k.textContent, /bestanden/);
  assert.ok(abfragen >= 3, "es wurde bis zum Abschluss beobachtet");
});

test("eine verpasste Abfrage bricht den Lauf nicht ab", async () => {
  globalThis.sessionStorage = speicher({ "smejj.apiToken.v1": "t" });
  globalThis.localStorage = speicher();
  let abfragen = 0;
  const ok = await starteImFaden({
    request: { task: "x" }, karte: karte(), warte: sofort,
    fetchImpl: async (url, options) => {
      if (options?.method === "POST") return { ok: true, json: async () => ({ job: { id: "job_y" } }) };
      abfragen += 1;
      if (abfragen === 1) throw new Error("Netz kurz weg");
      return { ok: true, json: async () => ({ job: { id: "job_y", status: "done" } }) };
    }
  });
  assert.equal(ok, true, "ein laufender Job wird nicht verleugnet");
});

test("der Aufrufer wechselt die Ansicht NUR im Rueckfall", () => {
  const quelle = fs.readFileSync("public/autonomous-intent.js", "utf8");
  const nachStart = quelle.slice(quelle.indexOf("starteImFaden"));
  assert.match(nachStart, /if \(imFaden\) return;/, "bei Erfolg endet es im Faden");
  assert.ok(
    nachStart.indexOf("if (imFaden) return;") < nachStart.indexOf('goToView("automation")'),
    "der Ansichtswechsel steht HINTER dem Rueckfall-Abbruch"
  );
});

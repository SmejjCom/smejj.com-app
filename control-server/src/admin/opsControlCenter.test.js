// smejj.com — Autopilot Control Center: kaputte UND gesunde Lage.
import test from "node:test";
import assert from "node:assert/strict";

import { controlCenterUebersicht, statusVon } from "./opsControlCenter.js";
import { WIRKUNG, KETTE, wirkungVon } from "./autopilotWirkung.js";
import { AUTOPILOTEN } from "./opsAutopilotenListe.js";

const ap = (id, ampel, meldung = "ok", mehr = {}) => ({ id, nummer: mehr.nummer || "00", name: mehr.name || id, bereich: mehr.bereich || "Betrieb & Auslieferung", ampel, zeitplan: "alle 30 Minuten", letzterLauf: { am: "2026-09-15T00:00:00Z", status: ampel === "rot" ? "fehler" : "ok", meldung }, ampelGrund: meldung });

test("Wirkungs-Tabelle kennt nur existierende Autopiloten, und jede Kette nennt echte Kennungen", () => {
  const ids = new Set(AUTOPILOTEN.map((a) => a.id));
  for (const id of [...WIRKUNG.baustein, ...Object.keys(WIRKUNG.teilweise)]) assert.ok(ids.has(id), `unbekannt: ${id}`);
  for (const k of KETTE) for (const id of k.ids) assert.ok(ids.has(id), `${k.schritt}: unbekannt ${id}`);
  assert.equal(KETTE.length, 13, "BEOBACHTEN bis WEITER VERBESSERN = 13 Schritte");
  assert.equal(wirkungVon("knowledge-distiller").stufe, "baustein");
  assert.equal(wirkungVon("red-team-probe").stufe, "echt");
});

test("Status in den Worten des Auftrags", () => {
  assert.equal(statusVon(ap("x", "rot")), "fehler");
  assert.equal(statusVon(ap("x", "wartung")), "blockiert");
  assert.equal(statusVon(ap("x", "gruen", "Messung gestartet (Hintergrund, glm-5-2)")), "arbeitet");
  assert.equal(statusVon(ap("x", "grau")), "wartet");
  assert.equal(statusVon(ap("knowledge-distiller", "gruen")), "test", "ein grüner Baustein ist KEIN aktiver Autopilot");
  assert.equal(statusVon(ap("red-team-probe", "gruen")), "aktiv");
});

test("Kaputte Lage: rote Sicherheits-Wache steht in 'kaputt' UND 'Sicherheit', mit Beleg", () => {
  const uebersicht = { autopiloten: [
    ap("konto-wache", "rot", "Admin-Liste wurde geändert (NEU x@y)", { bereich: "Sicherheit & Wachdienst", name: "Konto-Wache", nummer: "52" }),
    ap("bau-wache", "gruen", "Container läuft mit dem jüngsten Commit 441263a6"),
    ap("knowledge-distiller", "gruen", "Destillation: 3/3")
  ] };
  const d = controlCenterUebersicht({ uebersicht, env: {} });
  const kaputt = d.antworten.find((a) => a.frage === "Was ist kaputt?");
  assert.equal(kaputt.ampel, "rot");
  assert.match(kaputt.satz, /Konto-Wache/);
  assert.equal(kaputt.belege[0].nummer, "52");
  const sicher = d.antworten.find((a) => a.frage === "Welche Sicherheitsprobleme existieren?");
  assert.equal(sicher.ampel, "rot");
  assert.equal(d.zaehler.fehler, 1);
  assert.equal(d.zaehler.test, 1);
  assert.equal(d.autopiloten[0].id, "konto-wache", "Rot steht oben");
  assert.equal(d.antworten.length, 12);
  const entwickeln = d.kette.find((k) => k.schritt === "Entwickeln");
  assert.equal(entwickeln.zustand, "reisst", "ohne Zuständigen reißt die Kette — und die Seite sagt es");
});

test("Gesunde Lage: nichts kaputt, keine erfundene Zahl ohne Beleg", () => {
  const uebersicht = { autopiloten: [ap("red-team-probe", "gruen", "5 abgewehrt", { bereich: "Sicherheit & Wachdienst" }), ap("rueck-roller", "gruen", "stabiler Stand 441263a6")] };
  const d = controlCenterUebersicht({ uebersicht, env: {} });
  assert.equal(d.antworten.find((a) => a.frage === "Was ist kaputt?").ampel, "gruen");
  const zurueck = d.antworten.find((a) => a.frage === "Kann ich zurückrollen?");
  assert.equal(zurueck.belege.length, 1, "nur vorhandene Autopiloten werden Beleg");
  assert.match(zurueck.belege[0].meldung, /441263a6/);
  const modell = d.antworten.find((a) => a.frage === "Welches Modell wird benutzt?");
  assert.ok(modell.satz.length > 10);
});

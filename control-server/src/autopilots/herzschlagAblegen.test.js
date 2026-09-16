// Ausfuehren: node --test control-server/src/autopilots/herzschlagAblegen.test.js
//
// Was diese Tests schuetzen: Nach jedem Deploy standen vier Autopiloten bis zu
// 30 Minuten grau ("Seit dem <Vortag> kein Herzschlag"), obwohl sie am Tag
// davor 53-131 Mal gelaufen waren — sie haengen am Netz-Durchgang bzw. am
// Rot-Fall und melden nur in den Prozess. Ihr Lauf wird deshalb abgelegt.
//
// Und die Gegenprobe ist genauso wichtig: NUR diese vier. Wuerde der Taktgeber
// jeden Lauf ablegen, waeren das rund 72 Schreibvorgaenge je Durchgang.
import test from "node:test";
import assert from "node:assert/strict";

import { HERZSCHLAG_ABLEGEN, meldeUndMerke, fuehreLaeufeAus } from "./autopilotLaeufer.js";
import { interneMeldung } from "../admin/opsAutopiloten.js";

test("genau die vier, die einen Neustart ueberleben muessen", () => {
  assert.deepEqual([...HERZSCHLAG_ABLEGEN].sort(), [
    "selbstheilung", "sync-waechter", "synthetic-user-watchdog", "voice-region-check"
  ]);
});

test("meldet weiter wie interneMeldung — auch fuer die nicht abgelegten", () => {
  // interneMeldung kennt nur registrierte Kennungen; der Rueckgabewert ist die
  // Quittung. meldeUndMerke darf ihn nicht verfaelschen.
  const erwartet = interneMeldung("voice-region-check", { status: "ok", meldung: "Probe", dauerMs: 1 });
  const gemeldet = meldeUndMerke("voice-region-check", { status: "ok", meldung: "Probe", dauerMs: 1 });
  assert.equal(gemeldet, erwartet);

  const unbekannt = meldeUndMerke("gibt-es-nicht", { status: "ok", meldung: "x", dauerMs: 1 });
  assert.equal(unbekannt, interneMeldung("gibt-es-nicht", { status: "ok", meldung: "x", dauerMs: 1 }));
});

test("ein Schreibfehler der Ablage macht aus einem guten Lauf keinen schlechten", async () => {
  // Ohne IDrive-Zugang schreibt die Ablage nicht — genau dieser Fall wird hier
  // durchlaufen. Der Lauf muss trotzdem als gelungen gemeldet werden.
  const gemeldet = [];
  const ergebnisse = await fuehreLaeufeAus(
    [["voice-region-check", async () => ({ ok: true, meldung: "Probe ohne Ablage" })]],
    { melde: (id, e) => { gemeldet.push([id, e.status]); return true; } }
  );
  assert.equal(ergebnisse[0].ok, true);
  assert.deepEqual(gemeldet, [["voice-region-check", "ok"]]);
});

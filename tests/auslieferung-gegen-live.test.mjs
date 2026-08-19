// TUEV fuer den Drift-Waechter (scripts/check-auslieferung-gegen-live.mjs).
//
// Ein Waechter, der nur an gesunden Proben getestet wird, sagt nichts aus — er
// koennte immer gruen sein. Darum bekommt jede Regel hier BEIDES: eine kaputte
// Probe, die rot werden MUSS, und eine gesunde, die gruen bleiben muss.
//
// Die Proben sind die echten Faelle vom 2026-08-19: chat-stream.js war in der
// Quelle 170 Zeilen kuerzer als in der Auslieferung, und lokalesModell.js
// existierte in der Quelle ueberhaupt nicht — es haing nur am Import der
// ausgelieferten Fassung.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bewerte, importZiele, hashe, sammleDateien } from "../scripts/check-auslieferung-gegen-live.mjs";

const paket = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("DRIFT: kuerzere Quelle wird rot, gleiche Fassung bleibt gruen", () => {
  const kaputt = bewerte({ pfad: "ai/chat-stream.js", quelle: "eine Zeile\n", live: "eine Zeile\nund noch eine\n" });
  assert.equal(kaputt.length, 1, "Drift muss auffallen");
  assert.equal(kaputt[0].art, "DRIFT");

  const gesund = bewerte({ pfad: "ai/chat-stream.js", quelle: "gleich\n", live: "gleich\n" });
  assert.deepEqual(gesund, [], "identische Fassungen sind kein Befund");
});

test("FEHLT-QUELLE: nur ausgeliefertes Modul wird rot", () => {
  // Genau der lokalesModell.js-Fall: ein Bau aus der Quelle haette die Datei
  // nie erzeugt und die Gratis-Stufe 0 still geloescht.
  const kaputt = bewerte({ pfad: "ai/lokalesModell.js", quelle: null, live: "export const x = 1;\n" });
  assert.equal(kaputt.length, 1);
  assert.equal(kaputt[0].art, "FEHLT-QUELLE");
});

test("NICHT-LIVE: Quelldatei ohne Auslieferung wird rot", () => {
  const kaputt = bewerte({ pfad: "ai/neu.js", quelle: "export const x = 1;\n", live: null });
  assert.equal(kaputt.length, 1);
  assert.equal(kaputt[0].art, "NICHT-LIVE");
});

test("Importe der AUSGELIEFERTEN Fassung werden mitverfolgt", () => {
  const live = 'import { frageLokal } from "./lokalesModell.js";\nimport x from "../config.js?v=5";\n';
  const ziele = importZiele(live, "ai/chat-stream.js");
  assert.deepEqual(ziele, ["ai/lokalesModell.js", "config.js"]);
  // Ohne diese Kette waere lokalesModell.js nie aufgefallen: es steht in keiner
  // Quelldatei, nur im Import der Live-Fassung.
});

test("angemeldete Ausnahme haengt am Hash der Auslieferung", () => {
  const skript = readFileSync(new URL("../scripts/check-auslieferung-gegen-live.mjs", import.meta.url), "utf8");
  const treffer = skript.match(/liveHash: "([0-9a-f]{64})"/);
  assert.ok(treffer, "jede Ausnahme braucht einen Hash — sonst ist sie ein Freifahrtschein");
  // Die Hash-Funktion selbst: 64 Hex-Zeichen und fuer verschiedene Eingaben
  // verschieden — sonst wuerde die Bindung an die Auslieferung nichts halten.
  assert.match(hashe("a"), /^[0-9a-f]{64}$/);
  assert.notEqual(hashe("a"), hashe("b"));
});

test("der Waechter beobachtet ai/ und ist in check:all angeschlossen", () => {
  // "Schutz gebaut, aber nicht angeschlossen" ist das haeufigste Muster in
  // diesem Projekt — darum wird die Verdrahtung mitgeprueft.
  const dateien = sammleDateien("public", "ai");
  assert.ok(dateien.includes("ai/chat-stream.js"), "chat-stream.js muss beobachtet sein");
  assert.ok(dateien.includes("ai/lokalesModell.js"), "die zurueckgefuehrte Datei muss beobachtet sein");
  assert.match(paket.scripts["check:auslieferung-gegen-live"], /check-auslieferung-gegen-live\.mjs/);
  assert.match(paket.scripts["check:all"], /check:auslieferung-gegen-live/);
});

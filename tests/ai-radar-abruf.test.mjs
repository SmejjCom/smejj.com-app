// smejj ai radar — der ABRUF: kommt das Wissen im Chat an?
//
// Hintergrund (live gemessen 21.09.2026): Die Radar-Eintraege lagen im
// gemeinsamen Wissensindex, erreichten dort aber BM25-Werte um 3 — die
// Schwelle des Projektwissens liegt bei 20. Der Chat antwortete darum
// "Ich habe keinen Zugriff auf internes gespeichertes Wissen", obwohl zehn
// Eintraege bereitlagen. Dieser Test haelt den eigenen Weg fest.
import test from "node:test";
import assert from "node:assert/strict";
import { RADAR_MIN_SCORE, baueRadarKontext, radarIndexVerwerfen } from "../control-server/src/rag/radarKontext.js";
import { buildIndex, searchIndex } from "../control-server/src/rag/bm25Index.js";
import { MIN_TOP_SCORE } from "../control-server/src/rag/ragRanking.js";

const CHUNKS = [
  {
    id: "radar:w1:1", source: "smejj-ai-radar/funktionen", heading: "OpenAI Realtime API",
    text: "On May 7, 2026, OpenAI launched three new audio models through its Realtime API for speech to speech conversations. (Stand 2026-05-07, abgerufen 2026-09-21, Quelle: https://www.aitrove.ai/blog/openai-realtime, Pruefstatus: geprueft)"
  },
  {
    id: "radar:w2:1", source: "smejj-ai-radar/konkurrenz", heading: "Perplexity",
    text: "Perplexity added a comparison mode that queries several assistants at once. (Stand unbekannt, abgerufen 2026-09-21, Quelle: https://releasebot.io/updates/perplexity-ai, Pruefstatus: einzelquelle (nur EINE Quelle))"
  }
];
const lader = async () => CHUNKS;

test("die Falle bleibt festgehalten: im grossen Index erreicht Radar-Wissen die Schwelle NICHT", () => {
  const index = buildIndex(CHUNKS);
  const bester = searchIndex(index, "Realtime API OpenAI audio models", 3)[0];
  assert.ok(bester, "der Treffer ist da");
  assert.ok(bester.score < MIN_TOP_SCORE,
    `gemessen ${bester.score} gegen Schwelle ${MIN_TOP_SCORE} — genau daran scheiterte der Abruf am 21.09.`);
});

test("eigener Weg: passende Frage bekommt den Block mit Quelle, Stand und Pruefstatus", async () => {
  radarIndexVerwerfen();
  const block = await baueRadarKontext("Was ist neu bei der Realtime API von OpenAI?", { lader });
  assert.ok(block.includes("smejj ai radar"), "der Block nennt seine Herkunft");
  assert.ok(block.includes("Realtime API"));
  assert.ok(block.includes("Quelle: https://www.aitrove.ai/blog/openai-realtime"));
  assert.ok(block.includes("Stand 2026-05-07"));
  assert.ok(block.includes("Pruefstatus: geprueft"));
  assert.ok(/nur auf EINER Quelle/.test(block), "die Regel zur Einzelquelle steht im Block");
});

test("unpassende Frage bekommt NICHTS — kein Kontext ist besser als falscher", async () => {
  radarIndexVerwerfen();
  const block = await baueRadarKontext("Wie backe ich einen Hefezopf?", { lader });
  assert.equal(block, "");
});

test("leere oder kaputte Ablage: kein Block, kein Absturz", async () => {
  radarIndexVerwerfen();
  assert.equal(await baueRadarKontext("Realtime API", { lader: async () => [] }), "");
  radarIndexVerwerfen();
  assert.equal(await baueRadarKontext("Realtime API", { lader: async () => { throw new Error("e2 weg"); } }), "");
});

test("die Schwelle ist bewusst niedriger als die des Projektwissens", () => {
  assert.ok(RADAR_MIN_SCORE < MIN_TOP_SCORE);
  assert.ok(RADAR_MIN_SCORE > 0, "aber nicht null — sonst passt jede Frage zu jedem Eintrag");
});

test("der Chat-Weg bindet den Block ein (src/server.js)", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.ok(quelle.includes("radarKontextVon(task)"), "der Radar-Block muss beim Bauen der Anfrage gerufen werden");
  assert.ok(/if \(radarContext\) userParts\.push\(radarContext\);/.test(quelle), "und in die Nachricht wandern");
});

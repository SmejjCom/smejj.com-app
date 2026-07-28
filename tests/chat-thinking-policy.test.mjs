// smejj.com — Tests der Denk-Modus-Entscheidung im Chat und der Wartezeit-Messung.
import test from "node:test";
import assert from "node:assert/strict";
import { chatThinkingMode, latestUserPrompt, THINKING_DISABLED } from "../src/ai/chatThinkingPolicy.js";
import { classifyProfile } from "../control-server/src/llm/modelRouter.js";
import {
  buildProbeBody,
  median,
  probeFirstToken,
  quantile,
  readTimedStream,
  summarizeProbes
} from "../src/evaluation/firstTokenProbe.js";
import { parseArguments, runProbeSeries } from "../scripts/testing/measure_first_token.mjs";

test("massgeblich ist die letzte Nutzerfrage, nicht der Systemtext oder der Verlauf", () => {
  assert.equal(latestUserPrompt([
    { role: "system", content: "Regeln" },
    { role: "user", content: "erste Frage" },
    { role: "assistant", content: "Antwort mit dem Wort refactor" },
    { role: "user", content: "zweite Frage" }
  ]), "zweite Frage");
  assert.equal(latestUserPrompt([{ role: "user", content: "   " }, { role: "user", content: "echt" }]), "echt");
  assert.equal(latestUserPrompt([{ role: "system", content: "nur Regeln" }]), "");
  assert.equal(latestUserPrompt(null), "");
});

test("Coding behaelt das Reasoning, alles andere antwortet sofort", () => {
  // Coding: Antwortguete geht vor Wartezeit.
  assert.equal(chatThinkingMode([{ role: "user", content: "Bitte refactor diese Funktion" }], classifyProfile), undefined);
  assert.equal(chatThinkingMode([{ role: "user", content: "Schreib einen test in javascript" }], classifyProfile), undefined);

  // Gespraech: rund 6 s unsichtbares Reasoning entfallen.
  assert.deepEqual(chatThinkingMode([{ role: "user", content: "Wie ist das Wetter in Berlin?" }], classifyProfile), THINKING_DISABLED);
  assert.deepEqual(chatThinkingMode([{ role: "user", content: "Erklaer mir kurz, was smejj.com macht." }], classifyProfile), THINKING_DISABLED);
});

test("ohne erkennbare Nutzerfrage bleibt das bisherige Verhalten unveraendert", () => {
  // Fail-closed zugunsten des Bestehenden: lieber nichts umstellen als raten.
  assert.equal(chatThinkingMode([{ role: "system", content: "nur Regeln" }], classifyProfile), undefined);
  assert.equal(chatThinkingMode([], classifyProfile), undefined);
  assert.equal(chatThinkingMode(null, classifyProfile), undefined);
  assert.equal(chatThinkingMode([{ role: "user", content: "Frage" }], null), undefined);
});

test("die letzte Nutzerfrage entscheidet, nicht eine fruehere", () => {
  const verlauf = [
    { role: "user", content: "Bitte refactor mein javascript" },
    { role: "assistant", content: "Hier ist der Patch." },
    { role: "user", content: "Danke, und wie spaet ist es?" }
  ];
  assert.deepEqual(chatThinkingMode(verlauf, classifyProfile), THINKING_DISABLED);
});

test("die Messung trennt Antwortkopf, erstes Ereignis und erstes sichtbares Zeichen", async () => {
  // Genau diese Trennung hat den Befund erklaert: das Modell lieferte laengst,
  // sichtbar wurde erst Sekunden spaeter.
  const frames = [
    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"denkt\"}}]}\n\n",
    "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n",
    "data: {\"choices\":[{\"delta\":{\"content\":\"Hallo\"}}]}\n\n",
    "data: [DONE]\n\n"
  ];
  // Gestellte Uhr: die Messung fragt sie genau zweimal ab — beim ersten Ereignis
  // und beim ersten sichtbaren Zeichen. Genau diese beiden Zeitpunkte spannen die
  // unsichtbare Wartezeit auf.
  const zeitpunkte = [100, 700];
  let abfrage = 0;
  const stream = await readTimedStream(asyncChunks(frames), {
    started: 0,
    now: () => zeitpunkte[abfrage++] ?? 999
  });
  assert.equal(abfrage, 2, "genau zwei Messpunkte");
  assert.equal(stream.firstFrameMs, 100, "erstes Ereignis zaehlt auch ohne sichtbaren Inhalt");
  assert.equal(stream.firstVisibleMs, 700, "sichtbar wird erst das Ereignis mit Inhalt");
  assert.equal(stream.firstVisibleMs - stream.firstFrameMs, 600, "unsichtbare Wartezeit");
  assert.equal(stream.frames, 4);
  assert.equal(stream.chars, 5);
});

test("die Messung meldet Antwortzeiten und Fehler ehrlich", async () => {
  let tick = 0;
  const ok = await probeFirstToken({
    endpoint: "https://beispiel.test/api/chat",
    messages: [{ role: "user", content: "Frage" }],
    model: "glm-5-2",
    now: () => (tick += 50),
    fetchImpl: async (url, init) => {
      assert.equal(JSON.parse(init.body).model, "glm-5-2");
      return {
        ok: true,
        headers: { get: () => "zhipu:glm-5.2" },
        body: asyncChunks(["data: {\"choices\":[{\"delta\":{\"content\":\"Ja\"}}]}\n\n", "data: [DONE]\n\n"])
      };
    }
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.backend, "zhipu:glm-5.2");
  assert.equal(ok.chars, 2);

  const fehler = await probeFirstToken({
    endpoint: "https://beispiel.test/api/chat",
    messages: [{ role: "user", content: "Frage" }],
    fetchImpl: async () => ({ ok: false, status: 502, headers: { get: () => null } })
  });
  assert.equal(fehler.ok, false);
  assert.equal(fehler.error, "http_502");
  assert.equal(fehler.firstVisibleMs, null);
});

test("der Anfragekoerper passt sich dem Endpunkt an", () => {
  const messages = [{ role: "system", content: "Regeln" }, { role: "user", content: "Frage" }];
  assert.deepEqual(buildProbeBody({ messages, model: "glm-5-2", bodyMode: "chat" }), { messages, model: "glm-5-2" });
  // /api/agent kennt keine Nachrichtenliste, sondern genau eine Aufgabe.
  assert.deepEqual(buildProbeBody({ messages, model: "glm-5-2", bodyMode: "agent" }), { task: "Frage", model: "glm-5-2" });
  assert.deepEqual(buildProbeBody({ messages, bodyMode: "chat" }), { messages });
});

test("die Zusammenfassung nennt die unsichtbare Wartezeit als eigene Groesse", () => {
  const summary = summarizeProbes([
    { ok: true, ttfbMs: 100, firstFrameMs: 120, firstVisibleMs: 6120, totalMs: 7000, chars: 50 },
    { ok: true, ttfbMs: 200, firstFrameMs: 220, firstVisibleMs: 6220, totalMs: 7100, chars: 60 },
    { ok: false, ttfbMs: null, firstFrameMs: null, firstVisibleMs: null, totalMs: 900, chars: 0 }
  ]);
  assert.equal(summary.runs, 3);
  assert.equal(summary.ok, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.unsichtbarWartezeitMsMedian, 6000, "genau dieser Anteil ist ohne Modellwechsel behebbar");
  assert.equal(summary.firstVisibleMsMedian, 6120);
  assert.equal(median([]), null);
  assert.equal(quantile([5, 1, 3], 50), 3);
});

test("die Kommandozeile der Messung waehlt den Koerper passend zum Endpunkt", () => {
  assert.equal(parseArguments([]).options.bodyMode, "chat");
  assert.equal(parseArguments(["--endpoint", "control-agent"]).options.bodyMode, "agent");
  assert.equal(parseArguments(["--endpoint", "control-agent", "--body-mode", "chat"]).options.bodyMode, "chat");
  assert.equal(parseArguments(["--endpoint", "salad"]).error, "unknown_endpoint:salad");
  assert.equal(parseArguments(["--body-mode", "raten"]).error, "unknown_body_mode:raten");
  assert.equal(parseArguments(["--runs", "0"]).error, "invalid_runs");
  assert.equal(parseArguments(["--runs", "99"]).error, "invalid_runs");
});

test("die Messreihe fuehrt genau so viele Aufrufe aus wie verlangt", async () => {
  const gesehen = [];
  const probes = await runProbeSeries({
    endpoint: "https://beispiel.test/api/chat",
    model: "glm-5-2",
    prompt: "Frage",
    runs: 3,
    bodyMode: "agent",
    delayMs: 0,
    probe: async ({ bodyMode }) => {
      gesehen.push(bodyMode);
      return { ok: true, ttfbMs: 10, firstFrameMs: 11, firstVisibleMs: 12, totalMs: 20, frames: 2, chars: 3, backend: "test", error: null };
    }
  });
  assert.equal(probes.length, 3);
  assert.deepEqual(gesehen, ["agent", "agent", "agent"]);
});

async function* asyncChunks(parts) {
  const encoder = new TextEncoder();
  for (const part of parts) yield encoder.encode(part);
}

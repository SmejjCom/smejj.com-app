// smejj.com — Tests der Event-Taxonomie und des Provider-Uebersetzers (Phase 1).
import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_EVENTS, isAgentEvent, sanitizeEventData } from "../src/agent/events/eventTypes.js";
import { formatAgentEvent, parseOpenAiSseChunk, translateOpenAiStream } from "../src/agent/events/eventTranslator.js";

function readerFrom(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: async () => (index < chunks.length
      ? { value: encoder.encode(chunks[index++]), done: false }
      : { value: undefined, done: true }),
    releaseLock() {}
  };
}

async function collect(iterable) {
  const frames = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

test("Event-Taxonomie enthaelt die geforderten Namen", () => {
  for (const name of ["task.created", "assistant.message", "tool.requested", "approval.required", "verification.passed", "task.completed"]) {
    assert.ok(isAgentEvent(name), `${name} fehlt`);
  }
  assert.equal(isAgentEvent("job.status"), false, "Alt-Events gehoeren nicht zur Taxonomie");
  assert.equal(isAgentEvent("erfundenes.event"), false);
});

test("sanitizeEventData entfernt nicht erlaubte Felder (Deny-by-Default)", () => {
  const data = sanitizeEventData("assistant.message", {
    sessionId: "s1",
    delta: "Hallo",
    apiKey: "sk-geheim",
    choices: [{ delta: { content: "roh" } }]
  });
  assert.deepEqual(data, { sessionId: "s1", delta: "Hallo" });
  assert.ok(!("apiKey" in data));
  assert.ok(!("choices" in data));
});

test("Unbekanntes Event liefert leeres Datenobjekt statt Durchreichen", () => {
  assert.deepEqual(sanitizeEventData("unbekannt.event", { secret: "x" }), {});
});

test("formatAgentEvent erzeugt gueltigen SSE-Frame ohne Fremdfelder", () => {
  const frame = formatAgentEvent(AGENT_EVENTS.assistantMessage, { sessionId: "s1", delta: "Hi", apiKey: "sk-geheim" });
  assert.ok(frame.startsWith("event: assistant.message\ndata: "));
  assert.ok(frame.endsWith("\n\n"));
  assert.ok(!frame.includes("sk-geheim"));
});

test("parseOpenAiSseChunk liest Deltas und [DONE]", () => {
  const chunk = 'data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\ndata: {"choices":[{"delta":{"content":" Welt"}}]}\n\ndata: [DONE]\n\n';
  const result = parseOpenAiSseChunk("", chunk);
  assert.deepEqual(result.deltas, ["Hallo", " Welt"]);
  assert.equal(result.done, true);
  assert.equal(result.error, null);
});

test("parseOpenAiSseChunk haelt unvollstaendige Frames im Buffer", () => {
  const first = parseOpenAiSseChunk("", 'data: {"choices":[{"delta":{"content":"Te');
  assert.deepEqual(first.deltas, []);
  const second = parseOpenAiSseChunk(first.buffer, 'st"}}]}\n\n');
  assert.deepEqual(second.deltas, ["Test"]);
});

test("Whitespace-Deltas bleiben erhalten (Regressionsschutz Bug K1)", () => {
  const result = parseOpenAiSseChunk("", 'data: {"choices":[{"delta":{"content":"  "}}]}\n\ndata: {"choices":[{"delta":{"content":"\\n"}}]}\n\n');
  assert.deepEqual(result.deltas, ["  ", "\n"], "Leerzeichen/Zeilenumbrueche duerfen nicht verloren gehen");
});

test("finish_reason error wird zu AgentError", () => {
  const result = parseOpenAiSseChunk("", 'data: {"choices":[{"finish_reason":"error","error":{"message":"kaputt"}}]}\n\n');
  assert.ok(result.error);
  assert.equal(result.error.name, "AgentError");
});

test("translateOpenAiStream streamt Deltas als smejj.com-Events", async () => {
  let text = "";
  const frames = await collect(translateOpenAiStream({
    reader: readerFrom(['data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\n', 'data: {"choices":[{"delta":{"content":" Welt"}}]}\n\ndata: [DONE]\n\n']),
    sessionId: "s1",
    onText: (value) => { text = value; }
  }));
  assert.equal(text, "Hallo Welt");
  assert.equal(frames.length, 3, "zwei Deltas + Abschluss");
  assert.ok(frames.every((frame) => frame.startsWith("event: assistant.message")));
  assert.ok(frames.at(-1).includes('"done":true'));
  assert.ok(!frames.join("").includes("choices"), "Provider-Struktur darf nicht durchsickern");
});

test("translateOpenAiStream wirft AgentError bei Provider-Fehler im Stream", async () => {
  await assert.rejects(
    () => collect(translateOpenAiStream({
      reader: readerFrom(['data: {"error":{"message":"boom","status":503}}\n\n']),
      sessionId: "s1"
    })),
    (error) => error.name === "AgentError" && error.code === "PROVIDER_UNAVAILABLE"
  );
});

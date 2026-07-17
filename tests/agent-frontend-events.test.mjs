// smejj.com — Tests des Frontend-Clients der Agent API (Phase 1).
// Belegt: Das Frontend kennt keine Provider-Strukturen mehr und faellt sauber
// auf den bestehenden Pfad zurueck, wenn die Agent API nicht aktiv ist.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseAgentSseFrames, agentErrorMessage, runAgentChat } from "../public/agent/agentEvents.js";

const CHAT_CLIENT = fileURLToPath(new URL("../public/ai/chatClient.js", import.meta.url));

function output() {
  return { textContent: "" };
}

function sseStream(chunks, { ok = true, status = 200 } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok,
    status,
    body: {
      getReader: () => ({
        read: async () => (index < chunks.length
          ? { value: encoder.encode(chunks[index++]), done: false }
          : { value: undefined, done: true })
      })
    },
    json: async () => ({})
  };
}

test("parseAgentSseFrames liest smejj.com-Events", () => {
  const chunk = 'event: assistant.message\ndata: {"sessionId":"s1","delta":"Hallo"}\n\nevent: task.completed\ndata: {"sessionId":"s1"}\n\n';
  const { events } = parseAgentSseFrames("", chunk);
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "assistant.message");
  assert.equal(events[0].data.delta, "Hallo");
  assert.equal(events[1].event, "task.completed");
});

test("parseAgentSseFrames haelt unvollstaendige Frames zurueck", () => {
  const first = parseAgentSseFrames("", 'event: assistant.message\ndata: {"delta":"Te');
  assert.equal(first.events.length, 0);
  const second = parseAgentSseFrames(first.buffer, 'st"}\n\n');
  assert.equal(second.events[0].data.delta, "Test");
});

test("agentErrorMessage uebersetzt Fehlerklassen ohne Provider-Namen", () => {
  assert.match(agentErrorMessage({ code: "MODEL_NOT_AVAILABLE" }), /Modell/);
  assert.match(agentErrorMessage({ code: "AUTHENTICATION_ERROR" }), /Anmeldung|API-Key/);
  const text = Object.keys({ MODEL_NOT_AVAILABLE: 1, PROVIDER_UNAVAILABLE: 1 })
    .map((code) => agentErrorMessage({ code })).join(" ");
  assert.ok(!/cline/i.test(text), "Frontend-Meldungen duerfen keinen Provider nennen");
});

test("runAgentChat streamt Deltas in den Ausgabeknoten", async () => {
  const node = output();
  const fetchImpl = async (url) => (String(url).endsWith("/tasks")
    ? { ok: true, status: 201, json: async () => ({ sessionId: "11111111-1111-1111-1111-111111111111" }) }
    : sseStream([
      'event: task.started\ndata: {"sessionId":"s1"}\n\n',
      'event: assistant.message\ndata: {"sessionId":"s1","delta":"Hallo"}\n\n',
      'event: assistant.message\ndata: {"sessionId":"s1","delta":" Welt"}\n\n',
      'event: task.completed\ndata: {"sessionId":"s1"}\n\n'
    ]));
  const result = await runAgentChat({ apiOrigin: "https://x", token: "t", messages: [{ role: "user", content: "Hi" }], output: node, provider: "cline", fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(node.textContent, "Hallo Welt");
});

test("runAgentChat meldet handled:false bei deaktivierter Agent API (Fallback greift)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const result = await runAgentChat({ apiOrigin: "https://x", token: "t", messages: [], output: output(), provider: "cline", fetchImpl });
  assert.equal(result.handled, false);
  assert.equal(result.reason, "agent_api_disabled");
});

test("runAgentChat zeigt task.failed als nutzerlesbare Meldung", async () => {
  const node = output();
  const fetchImpl = async (url) => (String(url).endsWith("/tasks")
    ? { ok: true, status: 201, json: async () => ({ sessionId: "11111111-1111-1111-1111-111111111111" }) }
    : sseStream(['event: task.failed\ndata: {"sessionId":"s1","error":{"code":"MODEL_NOT_AVAILABLE"}}\n\n']));
  const result = await runAgentChat({ apiOrigin: "https://x", token: "t", messages: [], output: node, provider: "cline", fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "MODEL_NOT_AVAILABLE");
  assert.match(node.textContent, /Modell/);
});

test("runAgentChat ohne Token faellt zurueck statt zu senden", async () => {
  const result = await runAgentChat({ apiOrigin: "https://x", token: "", messages: [], output: output() });
  assert.equal(result.handled, false);
});

test("Start-Lock: chatClient.js bleibt unveraendert bis zur Lock-Freigabe", async () => {
  const source = await readFile(CHAT_CLIENT, "utf8");
  // public/ai/chatClient.js steht unter Start-Lock (AGENTS.md). Die Integration des
  // Agent-Clients erfolgt erst nach ausdruecklicher schriftlicher Lock-Freigabe.
  // Bis dahin ist der Agent-Client eigenstaendig getestet (Tests oben) und nicht verdrahtet.
  assert.ok(source.includes("runClineChat"), "bestehender Cline-Pfad muss unveraendert bleiben");
  assert.ok(!source.includes("runAgentChat"), "keine Verdrahtung ohne Start-Lock-Freigabe");
});

test("Agent-Client ist vollstaendig provider-neutral", async () => {
  const source = await readFile(fileURLToPath(new URL("../public/agent/agentEvents.js", import.meta.url)), "utf8");
  assert.ok(!source.includes("choices"), "Der Agent-Client darf keine Provider-Struktur lesen");
  assert.ok(!/cline|openai|glm|kimi/i.test(source), "kein Anbietername im neutralen Client");
});

test("Agent-Client verlangt einen Provider vom Aufrufer (kein Default)", async () => {
  const result = await runAgentChat({ apiOrigin: "https://x", token: "t", messages: [], output: output() });
  assert.equal(result.handled, false);
  assert.equal(result.reason, "no_provider");
});

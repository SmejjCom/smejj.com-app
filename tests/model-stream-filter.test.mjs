import assert from "node:assert/strict";
import test from "node:test";
import { filterSseEvent, stripInternalReferences, stripThinkingContent } from "../control-server/src/llm/streamFilter.js";

test("thinking blocks are stripped across streamed content chunks", () => {
  const state = { content: "", insideThink: false };
  assert.equal(stripThinkingContent("<think>", state), "");
  assert.equal(stripThinkingContent("private plan", state), "");
  assert.equal(stripThinkingContent("</thi", state), "");
  assert.equal(stripThinkingContent("nk>Antwort", state), "Antwort");
  assert.equal(stripThinkingContent(" sichtbar", state), " sichtbar");
});

test("partial opening tag is not leaked", () => {
  const state = { content: "", insideThink: false };
  assert.equal(stripThinkingContent("Hallo <thi", state), "Hallo ");
  assert.equal(stripThinkingContent("nk>intern</think> Welt", state), " Welt");
});

test("SSE delta content is rewritten without thinking content", () => {
  const state = { content: "", insideThink: false };
  const hidden = filterSseEvent('data: {"choices":[{"delta":{"content":"<think>"}}]}', state);
  const visible = filterSseEvent('data: {"choices":[{"delta":{"content":"</think>OK"}}]}', state);
  assert.equal(hidden, "");
  assert.match(visible, /"content":"OK"/);
});

test("provider reasoning fields never leave the control stream", () => {
  const state = { content: "", insideThink: false };
  const reasoningOnly = filterSseEvent(
    'data: {"choices":[{"delta":{"reasoning_content":"private chain"}}]}',
    state
  );
  const roleAndReasoning = filterSseEvent(
    'data: {"choices":[{"delta":{"role":"assistant","reasoning":"private"}}]}',
    state
  );
  const visible = filterSseEvent(
    'data: {"choices":[{"delta":{"content":"OK","thinking":"private"}}]}',
    state
  );

  assert.equal(reasoningOnly, "");
  assert.match(roleAndReasoning, /"role":"assistant"/);
  assert.doesNotMatch(roleAndReasoning, /private|reasoning/);
  assert.match(visible, /"content":"OK"/);
  assert.doesNotMatch(visible, /private|thinking/);
});

test("malformed upstream data is dropped instead of forwarded", () => {
  assert.equal(filterSseEvent("data: not-json"), "");
});

test("DONE event resets stream filter state", () => {
  const state = { content: "", insideThink: true };
  assert.equal(filterSseEvent("data: [DONE]", state), "data: [DONE]");
  assert.equal(state.insideThink, false);
});

test("internal project source references are redacted from visible stream chunks", () => {
  const text = "Quelle: [Project_Goals.md](https://smejj.com/Project_Goals.md), docs/deployment/runbook.md";
  const redacted = stripInternalReferences(text);
  assert.ok(!redacted.includes("Project_Goals.md"));
  assert.ok(!redacted.includes("docs/deployment"));
  assert.match(redacted, /interne Projektquelle/);
});

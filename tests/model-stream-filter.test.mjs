import assert from "node:assert/strict";
import test from "node:test";
import { filterSseEvent, stripThinkingContent } from "../control-server/src/llm/streamFilter.js";

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

test("DONE event resets stream filter state", () => {
  const state = { content: "", insideThink: true };
  assert.equal(filterSseEvent("data: [DONE]", state), "data: [DONE]");
  assert.equal(state.insideThink, false);
});

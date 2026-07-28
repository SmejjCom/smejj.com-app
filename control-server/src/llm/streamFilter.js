// Weiterreichung fuer src/server.js: die Datei steht hart an der 800-Zeilen-Grenze
// und darf keine zusaetzliche Import-Zeile bekommen (2026-07-28).
export { streamWithTools, withAgentTools } from "./toolLoop.js";

const OPEN_THINK = "<think>";
const CLOSE_THINK = "</think>";
const INTERNAL_REASONING_FIELDS = Object.freeze([
  "analysis",
  "reasoning",
  "reasoning_content",
  "reasoning_details",
  "thinking"
]);
const INTERNAL_REFERENCE_PATTERN = /https?:\/\/smejj\.com\/(?:docs\/)?[^\s)\]]+\.md|(?:Memory_Bank|Project_Goals|AI_Guidelines)\.md|docs\/[^\s)\]]+\.md/g;

export async function pipeVisibleModelStream(body, res) {
  const decoder = new TextDecoder();
  const state = { buffer: "", content: "", insideThink: false };
  for await (const chunk of body) {
    state.buffer += decoder.decode(chunk, { stream: true });
    drainSseBuffer(state, res, false);
  }
  state.buffer += decoder.decode();
  drainSseBuffer(state, res, true);
}

function drainSseBuffer(state, res, flush) {
  let splitAt = state.buffer.indexOf("\n\n");
  while (splitAt !== -1) {
    const event = state.buffer.slice(0, splitAt);
    state.buffer = state.buffer.slice(splitAt + 2);
    const filtered = filterSseEvent(event, state);
    if (filtered) res.write(`${filtered}\n\n`);
    splitAt = state.buffer.indexOf("\n\n");
  }
  if (flush && state.buffer.trim()) {
    const filtered = filterSseEvent(state.buffer, state);
    if (filtered) res.write(`${filtered}\n\n`);
    state.buffer = "";
  }
}

export function filterSseEvent(event, state = { content: "", insideThink: false }) {
  const lines = event.split("\n");
  const dataIndex = lines.findIndex((line) => line.startsWith("data: "));
  if (dataIndex === -1) return event;

  const payload = lines[dataIndex].slice(6);
  if (payload === "[DONE]") {
    state.content = "";
    state.insideThink = false;
    return event;
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return "";
  }

  const choice = parsed?.choices?.[0];
  stripReasoningFields(parsed, choice);
  const delta = choice?.delta;
  const content = delta?.content;
  if (typeof content !== "string") {
    if (emptyObject(delta) && !choice?.finish_reason && !parsed?.usage) return "";
    lines[dataIndex] = `data: ${JSON.stringify(parsed)}`;
    return lines.join("\n");
  }

  const visible = stripInternalReferences(stripThinkingContent(content, state));
  delta.content = visible;
  if (!visible && Object.keys(delta).length === 1) return "";
  lines[dataIndex] = `data: ${JSON.stringify(parsed)}`;
  return lines.join("\n");
}

function stripReasoningFields(parsed, choice) {
  for (const target of [parsed, choice, choice?.delta, choice?.message]) {
    if (!target || typeof target !== "object") continue;
    for (const field of INTERNAL_REASONING_FIELDS) delete target[field];
  }
}

function emptyObject(value) {
  return !value || typeof value !== "object" || Object.keys(value).length === 0;
}

export function stripInternalReferences(content) {
  return String(content || "").replace(INTERNAL_REFERENCE_PATTERN, "interne Projektquelle");
}

export function stripThinkingContent(content, state = { content: "", insideThink: false }) {
  state.content += content;
  let visible = "";

  while (state.content) {
    const lower = state.content.toLowerCase();
    if (state.insideThink) {
      const closeAt = lower.indexOf(CLOSE_THINK);
      if (closeAt === -1) {
        state.content = keepPossibleTagTail(state.content, CLOSE_THINK);
        return visible;
      }
      state.content = state.content.slice(closeAt + CLOSE_THINK.length);
      state.insideThink = false;
      continue;
    }

    const openAt = lower.indexOf(OPEN_THINK);
    if (openAt !== -1) {
      visible += state.content.slice(0, openAt);
      state.content = state.content.slice(openAt + OPEN_THINK.length);
      state.insideThink = true;
      continue;
    }

    const tail = possibleOpeningTail(state.content);
    visible += state.content.slice(0, state.content.length - tail.length);
    state.content = tail;
    return visible;
  }

  return visible;
}

function possibleOpeningTail(text) {
  const lower = text.toLowerCase();
  for (let length = Math.min(OPEN_THINK.length - 1, lower.length); length > 0; length -= 1) {
    if (OPEN_THINK.startsWith(lower.slice(-length))) return text.slice(-length);
  }
  return "";
}

function keepPossibleTagTail(text, tag) {
  const lower = text.toLowerCase();
  for (let length = Math.min(tag.length - 1, lower.length); length > 0; length -= 1) {
    if (tag.startsWith(lower.slice(-length))) return text.slice(-length);
  }
  return "";
}

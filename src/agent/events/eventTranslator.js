// smejj.com — Uebersetzer von Provider-Streams in neutrale smejj.com-Events.
// Zweck: Einzige Ausgangsstelle fuer Events. OpenAI-kompatible SSE-Chunks (Cline,
// GLM, Kimi und kuenftige Anbieter) werden hier in die smejj.com-Taxonomie
// uebersetzt; Provider-Strukturen enden an dieser Grenze.
// Input: rohe SSE-Bytes. Output: sanitisierte smejj.com-Events als SSE-Text.

import { AGENT_EVENTS, sanitizeEventData } from "./eventTypes.js";
import { toAgentError } from "../errors.js";

/**
 * Formatiert ein Event als SSE-Frame. Wendet immer die Feld-Allowlist an.
 * Output: "event: <name>\ndata: <json>\n\n"
 */
export function formatAgentEvent(eventName, data = {}) {
  const payload = sanitizeEventData(eventName, data);
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Zerlegt einen OpenAI-kompatiblen SSE-Stream in Text-Deltas.
 * Stateful: Aufrufer haelt den Buffer zwischen den Chunks.
 * Input: Buffer-String + neuer Chunk. Output: { buffer, deltas[], done, error }.
 */
export function parseOpenAiSseChunk(buffer, chunk) {
  const combined = `${buffer}${chunk}`;
  const frames = combined.split("\n\n");
  const rest = frames.pop() || "";
  const deltas = [];
  let done = false;
  let error = null;

  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === "[DONE]") { done = true; continue; }
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue; // Unvollstaendige Zeile — naechster Chunk vervollstaendigt sie.
      }
      if (parsed?.error) {
        error = toAgentError({
          name: "ClineApiError",
          message: parsed.error?.message || "Provider stream error",
          code: parsed.error?.code,
          status: Number(parsed.error?.status) || 502
        });
        continue;
      }
      const choice = parsed?.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason === "error") {
        error = toAgentError({
          name: "ClineApiError",
          message: choice.error?.message || "Provider stream error",
          status: 502
        });
        continue;
      }
      const delta = choice.delta?.content || choice.message?.content || "";
      if (delta) deltas.push(String(delta));
    }
  }
  return { buffer: rest, deltas, done, error };
}

/**
 * Uebersetzt einen OpenAI-kompatiblen Stream fortlaufend in smejj.com-Events.
 * Async-Generator: jedes Delta wird sofort ausgegeben (echtes Streaming, kein
 * Sammeln). Der Aufrufer erhaelt fertige SSE-Frames.
 * Wirft nie Provider-Fehler durch — immer AgentError.
 * onText() erhaelt am Ende den vollstaendig zusammengesetzten Text.
 */
export async function* translateOpenAiStream({ reader, sessionId, decoder = new TextDecoder(), onText }) {
  let buffer = "";
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const parsed = parseOpenAiSseChunk(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.buffer;
      if (parsed.error) throw parsed.error;
      for (const delta of parsed.deltas) {
        text += delta;
        yield formatAgentEvent(AGENT_EVENTS.assistantMessage, { sessionId, delta, done: false });
      }
      if (parsed.done) break;
    }
    yield formatAgentEvent(AGENT_EVENTS.assistantMessage, { sessionId, delta: "", done: true });
    onText?.(text);
  } catch (error) {
    onText?.(text);
    throw toAgentError(error);
  } finally {
    reader.releaseLock?.();
  }
}

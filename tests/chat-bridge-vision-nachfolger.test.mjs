// Bild-Verstehen ueberlebt ein abgeschaltetes Groq-Modell (15.09.2026: qwen/qwen3.6-27b -> 404).
import assert from "node:assert/strict";
import test from "node:test";

process.env.SMEJJ_LLM_GROQ_API_KEY = "test-schluessel";
process.env.SMEJJ_LLM_GROQ_VISION_MODEL = "qwen/qwen3.6-27b"; // wie die alte Zeabur-Einstellung
const { streamVisionLane, VISION_MODELLE } = await import(`../public/chat-bridge-vision.js?nachfolger=${Date.now()}`);

const BILD = `data:image/png;base64,${"A".repeat(200)}`;
const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 2000, maxBodyBytes: 1024 * 1024 };
const strom = (text) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`)); c.close(); } });
const antwort = () => { const r = { kopf: null, teile: [], writeHead: (s, h) => { r.status = s; r.kopf = h; }, write: (t) => { r.teile.push(String(t)); return true; }, end: () => { r.ende = true; }, on: () => {}, once: () => {} }; return r; };

test("Env-Modell zuerst, Nachfolger qwen3.8-27b als naechster, keine Doppelten", () => {
  assert.deepEqual(VISION_MODELLE, ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]);
});

test("404 fuer das alte Modell: der Nachfolger antwortet, Kopfzeile nennt ihn", async () => {
  const gefragt = [];
  globalThis.fetch = async (_url, init) => {
    const model = JSON.parse(init.body).model; gefragt.push(model);
    if (model === "qwen/qwen3.6-27b") return new Response('{"error":{"code":"model_not_found"}}', { status: 404 });
    return new Response(strom("Ein Bildschirmfoto."), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  const res = antwort();
  assert.equal(await streamVisionLane(res, { preferences: { bildDataUrl: BILD } }, "Was ist zu sehen?", deps), true);
  assert.deepEqual(gefragt, ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]);
  assert.equal(res.kopf["x-smejj-model-id"], "qwen/qwen3.8-27b");
});

test("429 (Anbieter-Lage) wechselt NICHT das Modell, sondern gibt an den Text-Weg ab", async () => {
  const gefragt = [];
  globalThis.fetch = async (_url, init) => { gefragt.push(JSON.parse(init.body).model); return new Response("{}", { status: 429 }); };
  const res = antwort();
  assert.equal(await streamVisionLane(res, { preferences: { bildDataUrl: BILD } }, "Frage", deps), false);
  assert.deepEqual(gefragt, ["qwen/qwen3.6-27b"]);
  assert.equal(res.kopf, null, "kein Byte gesendet");
});

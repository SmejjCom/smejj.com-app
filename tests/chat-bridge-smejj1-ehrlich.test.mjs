// smejj.com Bruecke v176 (25.09.2026): wer "smejj 1" waehlt, bekommt smejj 1 —
// gemessen vorher: die Schnellspur antwortete mit gpt-oss unter dem Namen smejj 1.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

test("smejj 1 gewaehlt: Schnellspur (Groq) wird nie gefragt, der Control-Weg antwortet", async (t) => {
  const gefragt = [];
  const stub = http.createServer((req, res) => {
    let roh = ""; req.on("data", (s) => { roh += s; }); req.on("end", () => {
      if (req.url === "/api/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ authenticated: true, user: { email: "t@smejj.com" } })); }
      if (req.url === "/api/radar/kontext") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true,"kontext":""}'); }
      gefragt.push(req.url);
      res.writeHead(200, { "Content-Type": "text/event-stream", "x-smejj-model-id": req.url.includes("/v1/") ? "openai/gpt-oss-120b" : "smejj-1" });
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Paris." } }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const port = 19100 + Math.floor(Math.random() * 800);
  const b = spawn(process.execPath, ["public/chat-bridge.js"], { env: { ...process.env, PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_LLM_GROQ_API_KEY: "x",
    SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1`, SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${stub.address().port}`, SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "YES" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { b.kill(); stub.close(); });
  let aus = ""; b.stdout.on("data", (s) => { aus += s; });
  for (let i = 0; i < 60 && !aus.includes("chat-bridge: http"); i += 1) await new Promise((r) => setTimeout(r, 100));
  for (const model of ["smejj 1", "smejj-1"]) {
    gefragt.length = 0;
    const r = await fetch(`http://127.0.0.1:${port}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer t" },
      body: JSON.stringify({ task: "Was ist die Hauptstadt von Frankreich?", model, history: [], preferences: { stufe: "auto" } }) });
    await r.text();
    assert.equal(r.headers.get("x-smejj-model-id"), "smejj-1", model);
    assert.deepEqual(gefragt, ["/api/agent"], `${model}: nur der Control-Weg`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

test("chat, coding, streaming and model failure share the registry router", async () => {
  const state = { kimiFails: false, glmFails: false, requests: [] };
  const mock = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    const isKimi = req.url.startsWith("/kimi/");
    state.requests.push({ isKimi, body });
    if ((isKimi && state.kimiFails) || (!isKimi && state.glmFails)) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end('{"error":"unavailable"}');
    }
    const content = isKimi ? "KIMI_STREAM_OK" : "GLM_STREAM_OK";
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`);
  });
  await listen(mock);
  const mockPort = mock.address().port;
  const appPort = await freePort();
  const app = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env,
      PORT: String(appPort),
      SMEJJ_HOST: "127.0.0.1",
      SMEJJ_SERVER_AI_ENABLED: "true",
      SMEJJ_SERVER_AI_REMAINING: "10",
      SMEJJ_KIMI_K2_7_ENABLED: "YES",
      SMEJJ_MODEL_FALLBACK_ENABLED: "YES",
      SMEJJ_LLM_KIMI_BASE_URL: `http://127.0.0.1:${mockPort}/kimi`,
      SMEJJ_LLM_KIMI_API_KEY: "test-kimi-key",
      SMEJJ_LLM_KIMI_MODEL: "kimi-test",
      SMEJJ_LLM_ZHIPU_BASE_URL: `http://127.0.0.1:${mockPort}/glm`,
      SMEJJ_LLM_ZHIPU_API_KEY: "test-glm-key",
      SMEJJ_LLM_ZHIPU_MODEL: "glm-5.2",
      SMEJJ_LLM_PROVIDER_ORDER: "zhipu"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(app, appPort);
    const base = `http://127.0.0.1:${appPort}`;
    const headers = { "Content-Type": "application/json", Origin: base };

    const chat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "Kimi K2.7", message: "Hallo" })
    });
    assert.equal(chat.status, 200);
    assert.equal(chat.headers.get("x-smejj-model-id"), "kimi-k2-7");
    assert.equal(chat.headers.get("x-smejj-model-fallback"), "false");
    assert.match(await chat.text(), /KIMI_STREAM_OK/);
    assert.equal(state.requests.at(-1).body.max_tokens, 4_096);

    const coding = await fetch(`${base}/api/agent`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "Kimi K2.7", task: "Fixe den Bug im JavaScript Code und erklaere den Test." })
    });
    assert.equal(coding.status, 200);
    assert.equal(coding.headers.get("x-smejj-model-id"), "kimi-k2-7");
    assert.match(await coding.text(), /KIMI_STREAM_OK/);
    assert.equal(state.requests.at(-1).body.max_tokens, 4_096);
    assert.match(state.requests.at(-1).body.messages[0].content, /smejj\.com Code Agent/);

    state.kimiFails = true;
    const fallback = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "kimi-k2-7", message: "Fallback" })
    });
    assert.equal(fallback.status, 200);
    assert.equal(fallback.headers.get("x-smejj-model-id"), "glm-5-2");
    assert.equal(fallback.headers.get("x-smejj-model-fallback"), "true");
    assert.match(await fallback.text(), /GLM_STREAM_OK/);

    state.glmFails = true;
    const failed = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "Kimi K2.7", message: "Alle aus" })
    });
    assert.equal(failed.status, 502);
    const failure = await failed.json();
    assert.equal(failure.error, "All model backends failed.");
    assert.equal(failure.attempts.length >= 2, true);
  } finally {
    app.kill("SIGTERM");
    await close(mock);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Serverstart-Timeout")), 15_000);
    const onData = (chunk) => {
      if (!String(chunk).includes("smejj.com Code MVP")) return;
      clearTimeout(timer);
      resolve();
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server vorzeitig beendet: ${code}`));
    });
    child.stderr.on("data", () => {});
  });
}

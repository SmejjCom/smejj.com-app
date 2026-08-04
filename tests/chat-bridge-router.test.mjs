import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

test("chat bridge proxies model choice to the registry router and keeps legacy GLM fallback", async () => {
  const state = { controlFails: false, bodies: [] };
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    // Seit 2026-08-04 fragt die Bruecke vor jeder Modell-Route hier nach, ob das
    // Token gilt (Anmeldepflicht). Ohne diese Antwort bekaeme der Test 401.
    if (req.url === "/api/auth/me") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ authenticated: req.headers.authorization === "Bearer test-token", user: { email: "test@smejj.com" } }));
    }
    const body = JSON.parse(raw || "{}");
    state.bodies.push({ url: req.url, body });
    if (req.url === "/api/chat" && state.controlFails) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end('{"error":"router unavailable"}');
    }
    const control = req.url === "/api/chat";
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "x-smejj-model-backend": control ? "kimi:kimi-test" : "zhipu:glm-5.2",
      "x-smejj-model-id": control ? "kimi-k2-7" : "glm-5-2",
      "x-smejj-model-fallback": "false"
    });
    const content = control ? "CONTROL_KIMI_OK" : "LEGACY_GLM_OK";
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`);
  });
  await listen(upstream);
  const upstreamPort = upstream.address().port;
  const bridgePort = await freePort();
  const bridge = spawn(process.execPath, ["public/chat-bridge.js"], {
    env: {
      ...process.env,
      PORT: String(bridgePort),
      SMEJJ_HOST: "127.0.0.1",
      SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "YES",
      SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${upstreamPort}`,
      SMEJJ_LLM_SALAD_BASE_URL: `http://127.0.0.1:${upstreamPort}/legacy`,
      SMEJJ_LLM_SALAD_API_KEY: "legacy-key",
      SMEJJ_LLM_SALAD_MODEL: "glm-5.2",
      SMEJJ_LLM_HEADER: "Authorization"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForBridge(bridge);
    const response = await request(bridgePort, "Kimi K2.7");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-smejj-model-id"), "kimi-k2-7");
    assert.match(await response.text(), /CONTROL_KIMI_OK/);
    assert.equal(state.bodies[0].body.model, "Kimi K2.7");

    state.controlFails = true;
    const fallback = await request(bridgePort, "Kimi K2.7");
    assert.equal(fallback.status, 200);
    assert.equal(fallback.headers.get("x-smejj-model-id"), "glm-5-2");
    assert.equal(fallback.headers.get("x-smejj-model-fallback"), "true");
    assert.match(await fallback.text(), /LEGACY_GLM_OK/);
  } finally {
    bridge.kill("SIGTERM");
    await close(upstream);
  }
});

function request(port, model) {
  return fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer test-token" },
    body: JSON.stringify({ model, message: "test" })
  });
}

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

function waitForBridge(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Bridge-Start-Timeout")), 10_000);
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("smejj.com chat-bridge")) return;
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Bridge vorzeitig beendet: ${code}`));
    });
  });
}

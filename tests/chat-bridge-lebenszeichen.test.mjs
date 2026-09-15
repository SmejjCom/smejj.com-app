// v152 (Betreiber-Freigabe 1f, 15.09.2026): Antwortkopf vorab + Lebenszeichen, wenn der
// Control Server schweigt; schnelle Absagen behalten ihren Status; faellt der Control
// Server ganz aus, antwortet das eigene Modell im SELBEN Strom.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const quelleBruecke = readFileSync(new URL("../public/chat-bridge.js", import.meta.url), "utf8");

const listen = (s) => new Promise((r, j) => { s.once("error", j); s.listen(0, "127.0.0.1", r); });
const close = (s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); });
const freePort = () => new Promise((r, j) => { const s = net.createServer(); s.once("error", j); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });
const waitForBridge = (child) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Bridge-Start-Timeout")), 10_000);
  child.stdout.on("data", (c) => { if (String(c).includes("smejj.com chat-bridge")) { clearTimeout(timer); resolve(); } });
  child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Bridge vorzeitig beendet: ${code}`)); });
});

test("Lebenszeichen: Vorab-Kopf nach 5 s, Absage behaelt Status, Ausfall → eigenes Modell im Strom", { timeout: 60_000 }, async () => {
  const lage = { modus: "spaet" };
  const offen = new Set();
  const upstream = http.createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    if (req.url === "/api/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ authenticated: true, user: { email: "test@smejj.com" } })); }
    if (req.url.startsWith("/legacy")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "EIGENES_MODELL_OK" } }] })}\n\ndata: [DONE]\n\n`);
    }
    if (lage.modus === "absage") { res.writeHead(429, { "Content-Type": "application/json" }); return res.end('{"error":"budget"}'); }
    if (lage.modus === "haengt") { offen.add(res); return; }
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "x-smejj-model-backend": "zhipu:glm-5.2", "x-smejj-model-id": "glm-5-2", "x-smejj-model-fallback": "false" });
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "SPAET_OK" } }] })}\n\ndata: [DONE]\n\n`);
    }, 6500);
  });
  await listen(upstream);
  const up = upstream.address().port;
  const port = await freePort();
  const bridge = spawn(process.execPath, ["public/chat-bridge.js"], {
    env: { ...process.env, PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "YES", SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${up}`,
      SMEJJ_LLM_SALAD_BASE_URL: `http://127.0.0.1:${up}/legacy`, SMEJJ_LLM_SALAD_API_KEY: "k", SMEJJ_LLM_SALAD_MODEL: "glm-5.2", SMEJJ_LLM_HEADER: "Authorization",
      SMEJJ_CHAT_BRIDGE_TIMEOUT_MS: "9000", SMEJJ_LLM_GROQ_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const frage = () => fetch(`http://127.0.0.1:${port}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer t" }, body: JSON.stringify({ model: "smejj 1.2", message: "Erklaere kurz Photosynthese." }) });
  try {
    await waitForBridge(bridge);
    // 1) Control antwortet nach 6,5 s: Kopf kommt vorher, Lebenszeichen, Modell-Beleg, Antwort
    let t0 = Date.now();
    let r = await frage();
    const kopfMs = Date.now() - t0;
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-smejj-kopf"), "vorab");
    assert.ok(kopfMs >= 3000 && kopfMs < 5000, `Kopf nach ${kopfMs} ms`);
    let text = await r.text();
    assert.match(text, /^: lebenszeichen/m);
    assert.match(text, /: smejj-modell backend=zhipu:glm-5\.2 id=glm-5-2 fallback=false/);
    assert.match(text, /SPAET_OK/);
    // 2) Schnelle Absage (429 Kostenschutz/Limit): echter Status, kein Vorab-Kopf
    lage.modus = "absage";
    r = await frage();
    assert.equal(r.status, 429);
    assert.equal(r.headers.get("x-smejj-kopf"), null);
    await r.text();
    // 3) Control haengt: Vorab-Kopf, dann eigenes Modell im selben Strom (fallback=true)
    lage.modus = "haengt";
    t0 = Date.now();
    r = await frage();
    assert.equal(r.status, 200);
    text = await r.text();
    assert.ok(Date.now() - t0 < 15_000);
    assert.match(text, /: smejj-modell backend=[^ ]+ id=glm-5-2 fallback=true/);
    assert.match(text, /EIGENES_MODELL_OK/);
    // 4) Live-Lage ohne Direktmodell (modelConfigured false): Notfall ueber die Schnellspur im selben Strom
    assert.match(quelleBruecke, /if \(imStrom && await streamFastLane\(res, messages, profile, requestedModel, "schnell", \{ notfall: true \}\)\) return;/);
  } finally {
    bridge.kill("SIGTERM");
    for (const res of offen) res.destroy();
    await close(upstream);
  }
});

test("Notfall ohne Direktmodell: Groq-Schnellspur antwortet im Strom nach dem Vorab-Kopf", { timeout: 60_000 }, async () => {
  const offen = new Set();
  const upstream = http.createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    if (req.url === "/api/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ authenticated: true, user: { email: "test@smejj.com" } })); }
    if (req.url.startsWith("/groq")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "NOTFALL_SCHNELLSPUR_OK" } }] })}\n\ndata: [DONE]\n\n`);
    }
    offen.add(res); // Control haengt
  });
  await listen(upstream);
  const up = upstream.address().port;
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "YES", SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${up}`, SMEJJ_CHAT_BRIDGE_TIMEOUT_MS: "8000" };
  for (const k of Object.keys(env)) if (/^SMEJJ_LLM_/.test(k)) delete env[k];
  Object.assign(env, { SMEJJ_LLM_GROQ_API_KEY: "g", SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${up}/groq` });
  const bridge = spawn(process.execPath, ["public/chat-bridge.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await waitForBridge(bridge);
    const r = await fetch(`http://127.0.0.1:${port}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer t" }, body: JSON.stringify({ model: "smejj 1.2", message: "Erklaere kurz Photosynthese." }) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-smejj-kopf"), "vorab");
    const text = await r.text();
    assert.match(text, /: smejj-modell backend=groq:[^ ]+ id=[^ ]+ fallback=true/);
    assert.match(text, /NOTFALL_SCHNELLSPUR_OK/);
  } finally {
    bridge.kill("SIGTERM");
    for (const res of offen) res.destroy();
    await close(upstream);
  }
});

test("Reserve im Strom: scheitern Control UND Schnellspur, antwortet der Control-Chat (frueherer Browser-Reserveweg)", { timeout: 60_000 }, async () => {
  const offen = new Set(); const lage = { agent: 0, chat: 0 };
  const upstream = http.createServer(async (req, res) => {
    let raw = ""; for await (const c of req) raw += c;
    if (req.url === "/api/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ authenticated: true, user: { email: "test@smejj.com" } })); }
    if (req.url.startsWith("/groq")) { res.writeHead(429, { "Content-Type": "application/json" }); return res.end('{"error":"rate"}'); }
    if (req.url === "/api/agent") { lage.agent += 1; offen.add(res); return; }
    if (req.url === "/api/chat") {
      lage.chat += 1;
      res.writeHead(200, { "Content-Type": "text/event-stream", "x-smejj-model-backend": "zhipu:glm-4.5-flash", "x-smejj-model-id": "glm-4.5-flash", "x-smejj-model-fallback": "true" });
      return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "RESERVE_CHAT_OK" } }] })}\n\ndata: [DONE]\n\n`);
    }
    res.writeHead(404); res.end();
  });
  await listen(upstream);
  const up = upstream.address().port;
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "YES", SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${up}`, SMEJJ_CHAT_BRIDGE_TIMEOUT_MS: "8000" };
  for (const k of Object.keys(env)) if (/^SMEJJ_LLM_/.test(k)) delete env[k];
  Object.assign(env, { SMEJJ_LLM_GROQ_API_KEY: "g", SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${up}/groq` });
  const bridge = spawn(process.execPath, ["public/chat-bridge.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await waitForBridge(bridge);
    const r = await fetch(`http://127.0.0.1:${port}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer t" }, body: JSON.stringify({ model: "smejj 1.2", task: "Erklaere kurz Photosynthese.", history: [] }) });
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.equal(lage.agent, 1);
    assert.equal(lage.chat, 1, "Reserve genau einmal");
    assert.match(text, /: smejj-modell backend=zhipu:glm-4\.5-flash id=glm-4\.5-flash fallback=true/);
    assert.match(text, /RESERVE_CHAT_OK/);
    assert.doesNotMatch(text, /Verbindung zum Server unterbrochen/);
  } finally {
    bridge.kill("SIGTERM");
    for (const res of offen) res.destroy();
    await close(upstream);
  }
});

test("v156: Reserve im laufenden Strom bekommt sofort Puls und Restfrist statt 60 s Stille", async () => {
  const { starteVorlauf, LEBENSZEICHEN_ALLE_MS } = await import("../public/chat-bridge-lebenszeichen.js");
  const geschrieben = [];
  const res = { headersSent: true, writableEnded: false, writeHead: () => assert.fail("Kopf darf nicht doppelt gehen"), write: (z) => geschrieben.push(z) };
  let fristGesetzt = 0;
  const vorlauf = starteVorlauf(res, {}, () => { fristGesetzt += 1; return setTimeout(() => {}, 60_000); });
  assert.equal(fristGesetzt, 1, "Restfrist sofort gesetzt");
  await new Promise((r) => setTimeout(r, LEBENSZEICHEN_ALLE_MS + 300));
  vorlauf.aufraeumen();
  assert.ok(geschrieben.some((z) => z.startsWith(": lebenszeichen")), "Puls laeuft im Strom");
  const vorher = geschrieben.length;
  await new Promise((r) => setTimeout(r, LEBENSZEICHEN_ALLE_MS + 300));
  assert.equal(geschrieben.length, vorher, "nach aufraeumen kein Puls mehr");
});

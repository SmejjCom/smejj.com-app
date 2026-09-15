// v157 (A-bis-Z-Befund M3, 15.09.2026): "Bild verstehen" antwortete 1 von 3 Mal leer —
// das Bild ging mit, geantwortet hat das TEXTmodell groq:openai/gpt-oss-120b mit leerem
// Text. Die Vision-Spur gab bei 429/Timeout still "false" zurueck, die Schnellspur
// uebernahm. Hier mit gestellten Antworten: 429, Timeout, leer, Erfolg, Totalausfall —
// und einmal durch die echte Bruecke, damit belegt ist, dass kein Textmodell antwortet.
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const echterFetch = globalThis.fetch;
delete process.env.SMEJJ_LLM_GROQ_VISION_MODEL;
delete process.env.SMEJJ_LLM_GROQ_API_KEY;
const ohneSchluessel = await import(`../public/chat-bridge-vision.js?ohne=${Date.now()}`);
process.env.SMEJJ_LLM_GROQ_API_KEY = "test-schluessel";
const { streamVisionLane, VISION_MODELLE, VISION_FEHLTEXT } = await import(`../public/chat-bridge-vision.js?ausfall=${Date.now()}`);

const BILD = `data:image/png;base64,${"A".repeat(200)}`;
const KOERPER = { preferences: { bildDataUrl: BILD } };
const deps = { corsHeaders: () => ({}), securityHeaders: () => ({}), timeoutMs: 2000, maxBodyBytes: 1024 * 1024, wartenMs: 20, kopfMs: 10_000 };
const sse = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const strom = (text) => new ReadableStream({ start(c) { if (text) c.enqueue(new TextEncoder().encode(sse(text))); c.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); c.close(); } });
const ok = (text) => new Response(strom(text), { status: 200, headers: { "Content-Type": "text/event-stream" } });
const antwort = () => {
  const r = { status: null, kopf: null, teile: [], ende: false, writableEnded: false, zeiten: {} };
  const t0 = Date.now();
  r.writeHead = (s, h) => { r.status = s; r.kopf = h; r.zeiten.kopf = Date.now() - t0; };
  r.write = (t) => { r.teile.push(String(t)); return true; };
  r.end = () => { r.ende = true; r.writableEnded = true; };
  r.text = () => r.teile.join("");
  return r;
};
/** fetch, der sich wie der echte an das Abbruchsignal haelt — auch im Rumpf. */
const haengt = (init) => new Promise((_ok, fehler) => {
  init.signal.addEventListener("abort", () => fehler(Object.assign(new Error("aborted"), { name: "AbortError" })));
});

test("Standardliste: Nachfolger zuerst, dann der alte Name", () => {
  assert.deepEqual(VISION_MODELLE, ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b"]);
});

test("Erfolg: ein Aufruf, Kopf nennt das Vision-Modell, Text und [DONE] kommen an", async () => {
  const gefragt = [];
  globalThis.fetch = async (_u, init) => { gefragt.push(JSON.parse(init.body).model); return ok("Eine Katze."); };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Was ist zu sehen?", deps), true);
  assert.deepEqual(gefragt, ["qwen/qwen3.8-27b"]);
  assert.equal(res.kopf["x-smejj-model-id"], "qwen/qwen3.8-27b");
  assert.match(res.text(), /Eine Katze\./);
  assert.match(res.text(), /data: \[DONE\]/);
  assert.equal(res.ende, true);
});

test("429: kurz warten, dasselbe Modell erneut — der zweite Versuch antwortet", async () => {
  const gefragt = [];
  const zeiten = [];
  const t0 = Date.now();
  globalThis.fetch = async (_u, init) => {
    gefragt.push(JSON.parse(init.body).model); zeiten.push(Date.now() - t0);
    return gefragt.length === 1 ? new Response('{"error":"rate_limit"}', { status: 429 }) : ok("Ein Hund.");
  };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", deps), true);
  assert.deepEqual(gefragt, ["qwen/qwen3.8-27b", "qwen/qwen3.8-27b"]);
  assert.ok(zeiten[1] - zeiten[0] >= 15, `Neuversuch nach ${zeiten[1] - zeiten[0]} ms — es muss kurz gewartet werden`);
  assert.match(res.text(), /Ein Hund\./);
  assert.doesNotMatch(res.text(), /nicht ausgewertet/);
});

test("5xx zweimal: danach das naechste Vision-Modell", async () => {
  const gefragt = [];
  globalThis.fetch = async (_u, init) => {
    const model = JSON.parse(init.body).model; gefragt.push(model);
    return model === "qwen/qwen3.8-27b" ? new Response("{}", { status: 503 }) : ok("Ein Baum.");
  };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", deps), true);
  assert.deepEqual(gefragt, ["qwen/qwen3.8-27b", "qwen/qwen3.8-27b", "qwen/qwen3.6-27b"]);
  assert.equal(res.kopf["x-smejj-model-id"], "qwen/qwen3.6-27b");
});

test("Timeout (Anbieter schweigt): Versuch wird abgebrochen und wiederholt", async () => {
  let aufrufe = 0;
  globalThis.fetch = async (_u, init) => { aufrufe += 1; return aufrufe === 1 ? haengt(init) : ok("Ein Haus."); };
  const res = antwort();
  const t0 = Date.now();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", { ...deps, timeoutMs: 80 }), true);
  const dauer = Date.now() - t0;
  assert.equal(aufrufe, 2);
  assert.ok(dauer >= 80 && dauer < 1500, `nach ${dauer} ms`);
  assert.match(res.text(), /Ein Haus\./);
});

test("Timeout NACH dem Kopf (Rumpf schweigt): auch das ist kein Erfolg", async () => {
  let aufrufe = 0;
  globalThis.fetch = async (_u, init) => {
    aufrufe += 1;
    if (aufrufe > 1) return ok("Ein Boot.");
    const stumm = new ReadableStream({ start(c) { init.signal.addEventListener("abort", () => c.error(Object.assign(new Error("aborted"), { name: "AbortError" }))); } });
    return new Response(stumm, { status: 200 });
  };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", { ...deps, timeoutMs: 80 }), true);
  assert.equal(aufrufe, 2);
  assert.equal(res.teile.filter((t) => t.startsWith("data: [DONE]")).length, 1, "genau ein [DONE]");
  assert.match(res.text(), /Ein Boot\./);
});

test("leere Antwort (nur [DONE]) wird NIE als Erfolg gestreamt — neuer Versuch", async () => {
  let aufrufe = 0;
  globalThis.fetch = async () => { aufrufe += 1; return aufrufe === 1 ? ok("") : ok("Ein Auto."); };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", deps), true);
  assert.equal(aufrufe, 2);
  assert.equal(res.teile.filter((t) => t.startsWith("data: [DONE]")).length, 1, "das leere [DONE] darf nicht durch");
  assert.equal(res.teile[0].includes("Ein Auto."), true, "erstes geschriebenes Stueck ist der Inhalt");
});

test("alles scheitert: ehrliche sichtbare Meldung, 200-Strom, hoechstens drei Anfragen", async () => {
  let aufrufe = 0;
  globalThis.fetch = async () => { aufrufe += 1; return aufrufe % 2 ? ok("") : new Response("{}", { status: 429 }); };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", deps), true);
  assert.equal(aufrufe, 3);
  assert.equal(res.status, 200);
  assert.equal(res.kopf["x-smejj-bridge"], "chat-vision");
  assert.ok(res.text().includes(JSON.stringify(VISION_FEHLTEXT)), "die Meldung steht als Antworttext im Strom");
  assert.match(res.text(), /data: \[DONE\]/);
  assert.equal(res.ende, true);
});

test("langsame Versuche: Vorab-Kopf mit Lebenszeichen, das Modell folgt als Kommentar", async () => {
  let aufrufe = 0;
  globalThis.fetch = async () => { aufrufe += 1; await new Promise((w) => setTimeout(w, 60)); return aufrufe === 1 ? new Response("{}", { status: 429 }) : ok("Ein Berg."); };
  const res = antwort();
  assert.equal(await streamVisionLane(res, KOERPER, "Frage", { ...deps, kopfMs: 30 }), true);
  assert.equal(res.kopf["x-smejj-kopf"], "vorab");
  assert.ok(res.zeiten.kopf < 60, `Kopf nach ${res.zeiten.kopf} ms`);
  assert.match(res.text(), /^: lebenszeichen/);
  assert.match(res.text(), /: smejj-modell backend=groq:qwen\/qwen3\.8-27b id=qwen\/qwen3\.8-27b fallback=false/);
  assert.match(res.text(), /Ein Berg\./);
});

test("ohne Groq-Schluessel, aber MIT Bild: ehrliche Meldung statt stillem Text-Weg", async () => {
  globalThis.fetch = async () => { throw new Error("darf nicht gerufen werden"); };
  const res = antwort();
  assert.equal(await ohneSchluessel.streamVisionLane(res, KOERPER, "Frage", deps), true);
  assert.match(res.text(), /Das Bild konnte gerade nicht ausgewertet werden/);
});

// --- durch die echte Bruecke: Bild + Vision 429 => nie das Textmodell -----------------
const listen = (s) => new Promise((r, j) => { s.once("error", j); s.listen(0, "127.0.0.1", r); });
const freePort = () => new Promise((r, j) => { const s = net.createServer(); s.once("error", j); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });

test("Bruecke: Bild-Anfrage bei Vision-429 faellt NIE an groq:openai/gpt-oss-120b", { timeout: 30_000 }, async () => {
  const modelle = [];
  const stub = http.createServer(async (req, res) => {
    let roh = ""; for await (const c of req) roh += c;
    if (req.url === "/api/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ authenticated: true, user: { email: "t@smejj.com" } })); }
    const model = JSON.parse(roh || "{}").model; modelle.push(model);
    if (String(model).startsWith("qwen/")) { res.writeHead(429, { "Content-Type": "application/json" }); return res.end('{"error":"rate_limit"}'); }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(`${sse("TEXTMODELL_OHNE_BILD")}data: [DONE]\n\n`);
  });
  await listen(stub);
  const up = stub.address().port;
  const port = await freePort();
  const bruecke = spawn(process.execPath, ["public/chat-bridge.js"], {
    env: { ...process.env, SMEJJ_CHAT_BRIDGE_NO_START: "0", PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${up}/v1`,
      SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${up}`, SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "NO", SMEJJ_LLM_GROQ_VISION_MODEL: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await new Promise((fertig, fehler) => {
      const uhr = setTimeout(() => fehler(new Error("Bruecke startet nicht")), 10_000);
      bruecke.stdout.on("data", (c) => { if (String(c).includes("chat-bridge: http")) { clearTimeout(uhr); fertig(); } });
    });
    const faelle = [
      ["/api/agent", { task: "Was ist auf dem Bild?", preferences: { bildDataUrl: BILD } }],
      ["/api/chat", { messages: [{ role: "user", content: "Was ist auf dem Bild?" }], preferences: { bildDataUrl: BILD } }],
      // Bild OHNE Begleittext: vor v157 uebersprang /api/chat die Vision-Spur ganz.
      ["/api/chat", { messages: [{ role: "user", content: "" }], preferences: { bildDataUrl: BILD } }]
    ];
    for (const [route, rumpf] of faelle) {
      modelle.length = 0;
      const r = await echterFetch(`http://127.0.0.1:${port}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer t" }, body: JSON.stringify(rumpf) });
      const text = await r.text();
      assert.equal(r.status, 200, route);
      assert.equal(r.headers.get("x-smejj-bridge"), "chat-vision", route);
      assert.match(text, /Das Bild konnte gerade nicht ausgewertet werden/, route);
      assert.doesNotMatch(text, /TEXTMODELL_OHNE_BILD/, route);
      assert.equal(modelle.some((m) => /gpt-oss/.test(String(m))), false, `${route}: Textmodell gefragt: ${modelle.join(", ")}`);
      assert.ok(modelle.length >= 2 && modelle.every((m) => String(m).startsWith("qwen/")), `${route}: ${modelle.join(", ")}`);
    }
  } finally {
    bruecke.kill("SIGTERM");
    stub.closeAllConnections?.();
    stub.close();
  }
});

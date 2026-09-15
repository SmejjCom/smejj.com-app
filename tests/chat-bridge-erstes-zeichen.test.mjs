// v157 (A-bis-Z-Befund M6, 15.09.2026): Erste-Zeichen-Zeit Median 4-5 s, p95 11 s.
// Am Code gemessen, wo die Bruecke unnoetig wartet — hier mit Zeitstempeln belegt:
//   1. Anmeldepruefung: war der Control Server nicht erreichbar, wartete JEDE Anfrage
//      erneut bis zu 5 s (Zeitgrenze), obwohl sie danach ohnehin durchgelassen wurde.
//   2. Doppelter Rundlauf: beobachteAnmeldung und allowAuthenticated fragten parallel.
//   3. Websuche-Rueckfall ohne Frist (Node-Grenze 300 s).
//   4. Leere Schnellspur-Antwort galt als Erfolg (Kopf + [DONE], keine Zeichen).
// NICHT der Engpass (gemessen, siehe Ergebnisbericht): die Projektwissen-Suche braucht
// unter 4 ms beim ersten und unter 1 ms bei jedem weiteren Aufruf (911 Abschnitte).
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { _leereAuthCache, allowAuthenticated, beobachteAnmeldung, pruefeToken } from "../public/chat-bridge-auth.js";
import { pipeMitInhalt } from "../public/chat-bridge-strom.js";
import { buildWebContext, WEB_KONTEXT_FRIST_MS } from "../public/chat-bridge-websuche.js";

const echterFetch = globalThis.fetch;
const sse = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const strom = (...teile) => new ReadableStream({ start(c) { for (const t of teile) c.enqueue(new TextEncoder().encode(t)); c.close(); } });

test("Control nicht erreichbar: nur die ERSTE Anfrage wartet, die naechsten 15 s nicht erneut", async () => {
  _leereAuthCache();
  let rundlaeufe = 0;
  const haengt = async () => { rundlaeufe += 1; await new Promise((w) => setTimeout(w, 150)); throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); };
  const basis = { controlOrigin: "https://control.test", fetchFn: haengt };
  let t0 = performance.now();
  assert.equal(await pruefeToken("tok", { ...basis, jetzt: 10_000 }), "unbekannt");
  const erste = performance.now() - t0;
  t0 = performance.now();
  assert.equal(await pruefeToken("tok", { ...basis, jetzt: 20_000 }), "unbekannt");
  const zweite = performance.now() - t0;
  assert.equal(rundlaeufe, 1);
  assert.ok(erste >= 140, `erste ${erste.toFixed(1)} ms`);
  assert.ok(zweite < 20, `zweite ${zweite.toFixed(1)} ms — vorher ebenfalls ${erste.toFixed(0)} ms`);
  // Nach der Pause wird wieder gefragt; ein 5xx (schnell) wird wie bisher nicht gemerkt.
  assert.equal(await pruefeToken("tok", { ...basis, jetzt: 26_000 }), "unbekannt");
  assert.equal(rundlaeufe, 2);
});

test("ein Rundlauf fuer Messung und Wache derselben Anfrage", async () => {
  _leereAuthCache();
  let rundlaeufe = 0;
  const fetchFn = async () => { rundlaeufe += 1; await new Promise((w) => setTimeout(w, 30)); return { ok: true, status: 200, json: async () => ({ authenticated: true, user: { email: "a@b.c" } }) }; };
  const req = { headers: { authorization: "Bearer geteilt" } };
  const messung = beobachteAnmeldung(req, { controlOrigin: "https://control.test", fetchFn });
  const durch = await allowAuthenticated(req, {}, { json: () => {}, controlOrigin: "https://control.test", fetchFn });
  await messung;
  assert.equal(durch, true);
  assert.equal(rundlaeufe, 1, "vorher 2 parallele Rundlaeufe");
});

test("Websuche-Rueckfall hat eine Frist", async () => {
  let signal = null;
  await buildWebContext("Wetter heute", "https://control.test", { fetchFn: async (_u, init) => { signal = init.signal; return { ok: false }; } });
  assert.ok(signal instanceof AbortSignal, "fetch bekommt ein Abbruchsignal");
  assert.equal(WEB_KONTEXT_FRIST_MS, 15_000);
});

test("pipeMitInhalt: leer => nichts geschrieben; Inhalt => Kopf genau mit dem ersten Zeichen", async () => {
  const geschrieben = [];
  const res = { write: (t) => { geschrieben.push(t); return true; } };
  let starts = 0;
  const leer = await pipeMitInhalt(strom("data: [DONE]\n\n"), res, () => { starts += 1; });
  assert.deepEqual([leer.inhalt, starts, geschrieben.length], [false, 0, 0]);
  const voll = await pipeMitInhalt(strom(sse("Hallo"), "data: [DONE]\n\n"), res, () => { starts += 1; geschrieben.push("KOPF"); });
  assert.equal(voll.inhalt, true);
  assert.equal(starts, 1);
  assert.equal(geschrieben[0], "KOPF");
  assert.match(geschrieben.join(""), /Hallo[\s\S]*\[DONE\]/);
});

test("pipeMitInhalt: der Kopf geht spaetestens nach festlegenNachMs raus, auch wenn das Modell noch denkt", async () => {
  const res = { write: () => true };
  let kopfNachMs = null;
  const t0 = performance.now();
  const langsam = new ReadableStream({ async start(c) { await new Promise((w) => setTimeout(w, 120)); c.enqueue(new TextEncoder().encode(sse("spaet"))); c.close(); } });
  const { inhalt } = await pipeMitInhalt(langsam, res, () => { kopfNachMs = performance.now() - t0; }, { festlegenNachMs: 30 });
  assert.equal(inhalt, true);
  assert.ok(kopfNachMs >= 25 && kopfNachMs < 110, `Kopf nach ${kopfNachMs?.toFixed(1)} ms`);
});

// --- lokale Messung gegen gestellte Anbieter --------------------------------------------
const listen = (s) => new Promise((r, j) => { s.once("error", j); s.listen(0, "127.0.0.1", r); });
const freePort = () => new Promise((r, j) => { const s = net.createServer(); s.once("error", j); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });

test("Messung: Control-Anmeldung haengt — erstes Zeichen ab der 2. Anfrage ohne 5-s-Wartezeit; leere Schnellspur geht an die Reserve", { timeout: 40_000 }, async () => {
  const lage = { groqLeer: false, groqAufrufe: 0 };
  const offen = new Set();
  const stub = http.createServer(async (req, res) => {
    let roh = ""; for await (const c of req) roh += c;
    if (req.url === "/api/auth/me") { offen.add(res); return; } // haengt: Zeitgrenze der Bruecke (5 s) greift
    if (req.url.startsWith("/v1/")) {
      lage.groqAufrufe += 1;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(lage.groqLeer ? "data: [DONE]\n\n" : `${sse("SCHNELL")}data: [DONE]\n\n`);
    }
    if (req.url.startsWith("/legacy")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      return res.end(`${sse("RESERVE")}data: [DONE]\n\n`);
    }
    res.writeHead(404); res.end();
  });
  await listen(stub);
  const up = stub.address().port;
  const port = await freePort();
  const bruecke = spawn(process.execPath, ["public/chat-bridge.js"], {
    env: { ...process.env, SMEJJ_CHAT_BRIDGE_NO_START: "0", PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${up}/v1`,
      SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${up}`, SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "NO", SMEJJ_EVOLUTION_TOKEN: "",
      SMEJJ_LLM_BASE_URL: `http://127.0.0.1:${up}/legacy`, SMEJJ_LLM_API_KEY: "k", SMEJJ_LLM_MODEL: "glm-5.2" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const erstesZeichen = async (frage) => {
    const t0 = performance.now();
    const r = await echterFetch(`http://127.0.0.1:${port}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer mess-token" }, body: JSON.stringify({ message: frage }) });
    const leser = r.body.getReader();
    let text = ""; let ms = null;
    for (;;) {
      const { value, done } = await leser.read();
      if (done) break;
      text += new TextDecoder().decode(value);
      if (ms === null && /"content"/.test(text)) ms = performance.now() - t0;
    }
    return { ms, text };
  };
  try {
    await new Promise((fertig, fehler) => {
      const uhr = setTimeout(() => fehler(new Error("Bruecke startet nicht")), 10_000);
      bruecke.stdout.on("data", (c) => { if (String(c).includes("chat-bridge: http")) { clearTimeout(uhr); fertig(); } });
    });
    const zeiten = [];
    for (const frage of ["Nenne drei Farben.", "Nenne drei Tiere.", "Nenne drei Staedte."]) {
      const { ms, text } = await erstesZeichen(frage);
      assert.match(text, /SCHNELL/);
      zeiten.push(Math.round(ms));
    }
    console.log(`Erste-Zeichen-Zeit bei haengender Anmeldepruefung (ms): ${zeiten.join(", ")} — vor v157 jede ~5000`);
    assert.ok(zeiten[0] >= 4500, `erste Anfrage traegt die Zeitgrenze: ${zeiten[0]} ms`);
    assert.ok(zeiten[1] < 1000 && zeiten[2] < 1000, `folgende Anfragen: ${zeiten.slice(1).join(", ")} ms`);
    // Leere Schnellspur: kein leerer Erfolg, die Reserve antwortet.
    lage.groqLeer = true;
    const { text } = await erstesZeichen("Nenne drei Farben.");
    assert.match(text, /RESERVE/);
    assert.equal((text.match(/data: \[DONE\]/g) || []).length, 1, "genau ein [DONE]");
  } finally {
    bruecke.kill("SIGTERM");
    for (const r of offen) r.destroy();
    stub.closeAllConnections?.();
    stub.close();
  }
});

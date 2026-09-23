// v157 (A-bis-Z-Live-Test 15.09.2026): Sicherheits-Kopfzeilen (HSTS, Frame-Schutz) und
// eine anonym knappe /health-Auskunft. Erst die Bausteine, dann die echte Bruecke.
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { gesundheitAnonym, gesundheitFuer, istWaechterAusweis, securityHeaders, GESUNDHEIT_PRUEFUNGEN_JE_MINUTE } from "../public/chat-bridge-sicherheit.js";
import { _leereAuthCache } from "../public/chat-bridge-auth.js";

const VOLL = { ok: true, app: "smejj.com chat-bridge", version: "v-test", earConfigured: true, anmeldung: { gesamt: 3 }, publicRateLimit: { perClientPerMinute: 12 } };
const AUSWEIS = "waechter-ausweis-0123456789";

test("securityHeaders: HSTS, X-Frame-Options DENY, CSP frame-ancestors 'none' — und die bisherigen drei", () => {
  const kopf = securityHeaders();
  assert.equal(kopf["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
  assert.equal(kopf["X-Frame-Options"], "DENY");
  assert.equal(kopf["Content-Security-Policy"], "frame-ancestors 'none'");
  assert.equal(kopf["X-Content-Type-Options"], "nosniff");
  assert.equal(kopf["Referrer-Policy"], "no-referrer");
  assert.equal(kopf["Permissions-Policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(Object.keys(kopf).some((k) => /^access-control/i.test(k)), false, "CORS bleibt in corsHeaders");
});

test("anonym: nur ok, app, version", async () => {
  assert.deepEqual(gesundheitAnonym(VOLL), { ok: true, app: "smejj.com chat-bridge", version: "v-test" });
  const antwort = await gesundheitFuer({ headers: {} }, VOLL, { env: {}, fetchFn: async () => { throw new Error("kein Netz ohne Token"); } });
  assert.deepEqual(Object.keys(antwort).sort(), ["app", "ok", "version"]);
});

test("Waechter-Ausweis (x-smejj-evolution-token) bekommt die volle Antwort — ohne Rundlauf", async () => {
  const env = { SMEJJ_EVOLUTION_TOKEN: AUSWEIS };
  const fetchFn = async () => { throw new Error("darf nicht gerufen werden"); };
  assert.equal(await gesundheitFuer({ headers: { "x-smejj-evolution-token": AUSWEIS } }, VOLL, { env, fetchFn }), VOLL);
  assert.deepEqual(Object.keys(await gesundheitFuer({ headers: { "x-smejj-evolution-token": "falsch-falsch-falsch-00" } }, VOLL, { env, fetchFn })).sort(), ["app", "ok", "version"]);
  // Ohne gesetzten (oder zu kurzen) Ausweis gilt niemand als Waechter.
  assert.equal(istWaechterAusweis({ "x-smejj-evolution-token": "kurz" }, { SMEJJ_EVOLUTION_TOKEN: "kurz" }), false);
  assert.equal(istWaechterAusweis({ "x-smejj-evolution-token": "" }, { SMEJJ_EVOLUTION_TOKEN: "" }), false);
});

test("angemeldetes Konto: 'ja' => voll, 'nein' und 'unbekannt' => anonym", async () => {
  _leereAuthCache();
  const control = (urteil) => async () => urteil === "netz" ? Promise.reject(new Error("netz"))
    : { ok: urteil === "ja", status: urteil === "ja" ? 200 : 401, json: async () => ({ authenticated: urteil === "ja" }) };
  const basis = { env: {}, controlOrigin: "https://control.test" };
  assert.equal(await gesundheitFuer({ headers: { authorization: "Bearer gut" } }, VOLL, { ...basis, fetchFn: control("ja"), jetzt: 1_000 }), VOLL);
  assert.deepEqual(Object.keys(await gesundheitFuer({ headers: { authorization: "Bearer schlecht" } }, VOLL, { ...basis, fetchFn: control("nein"), jetzt: 1_000 })).sort(), ["app", "ok", "version"]);
  assert.deepEqual(Object.keys(await gesundheitFuer({ headers: { authorization: "Bearer wackel" } }, VOLL, { ...basis, fetchFn: control("netz"), jetzt: 1_000 })).sort(), ["app", "ok", "version"]);
  // Gemerktes "ja": kein zweiter Rundlauf.
  assert.equal(await gesundheitFuer({ headers: { authorization: "Bearer gut" } }, VOLL, { ...basis, fetchFn: async () => { throw new Error("kein Rundlauf"); }, jetzt: 2_000 }), VOLL);
});

test("erfundene Token machen /health nicht zum Verstaerker gegen den Control Server", async () => {
  _leereAuthCache();
  let rundlaeufe = 0;
  const fetchFn = async () => { rundlaeufe += 1; return { ok: false, status: 401, json: async () => ({}) }; };
  for (let i = 0; i < 100; i += 1) {
    await gesundheitFuer({ headers: { authorization: `Bearer erfunden-${i}` } }, VOLL, { env: {}, controlOrigin: "https://control.test", fetchFn, jetzt: 500_000 });
  }
  assert.ok(rundlaeufe <= GESUNDHEIT_PRUEFUNGEN_JE_MINUTE, `${rundlaeufe} Rundlaeufe`);
});

// --- echte Bruecke -------------------------------------------------------------------
const listen = (s) => new Promise((r, j) => { s.once("error", j); s.listen(0, "127.0.0.1", r); });
const freePort = () => new Promise((r, j) => { const s = net.createServer(); s.once("error", j); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });

test("Bruecke: Kopfzeilen auf /health, 404, Preflight und SSE; /health anonym knapp, mit Ausweis voll", { timeout: 20_000 }, async () => {
  const stub = http.createServer(async (req, res) => {
    let roh = ""; for await (const c of req) roh += c;
    if (req.url === "/api/auth/me") {
      const gut = req.headers.authorization === "Bearer gut";
      res.writeHead(gut ? 200 : 401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ authenticated: gut, user: { email: "t@smejj.com" } }));
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hallo." } }] })}\n\ndata: [DONE]\n\n`);
  });
  await listen(stub);
  const up = stub.address().port;
  const port = await freePort();
  const bruecke = spawn(process.execPath, ["public/chat-bridge.js"], {
    env: { ...process.env, SMEJJ_CHAT_BRIDGE_NO_START: "0", PORT: String(port), SMEJJ_HOST: "127.0.0.1", SMEJJ_LLM_GROQ_API_KEY: "k", SMEJJ_LLM_GROQ_BASE_URL: `http://127.0.0.1:${up}/v1`,
      SMEJJ_CONTROL_ORIGIN: `http://127.0.0.1:${up}`, SMEJJ_MULTI_MODEL_ROUTER_ENABLED: "NO", SMEJJ_EVOLUTION_TOKEN: AUSWEIS },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const basis = `http://127.0.0.1:${port}`;
  const pruefeKopf = (r, wo) => {
    assert.equal(r.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains", wo);
    assert.equal(r.headers.get("x-frame-options"), "DENY", wo);
    assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'", wo);
  };
  try {
    await new Promise((fertig, fehler) => {
      const uhr = setTimeout(() => fehler(new Error("Bruecke startet nicht")), 10_000);
      bruecke.stdout.on("data", (c) => { if (String(c).includes("chat-bridge: http")) { clearTimeout(uhr); fertig(); } });
    });
    let r = await fetch(`${basis}/health`);
    pruefeKopf(r, "/health");
    const anonym = await r.json();
    assert.deepEqual(Object.keys(anonym).sort(), ["app", "ok", "version"]);
    assert.match(anonym.version, /^20260923-v164-/);
    for (const verboten of ["anmeldung", "publicRateLimit", "premiumVoiceConfigured", "evolutionMelder", "projektwissen", "earConfigured"]) {
      assert.equal(verboten in anonym, false, `${verboten} anonym sichtbar`);
    }
    r = await fetch(`${basis}/health`, { headers: { "x-smejj-evolution-token": AUSWEIS } });
    const voll = await r.json();
    assert.equal(voll.earConfigured, true);
    assert.ok(voll.anmeldung && voll.publicRateLimit && voll.evolutionMelder, "Waechter sieht die Kennzahlen");
    r = await fetch(`${basis}/health`, { headers: { Authorization: "Bearer gut" } });
    assert.ok((await r.json()).anmeldung, "angemeldetes Konto sieht die Kennzahlen");
    r = await fetch(`${basis}/health`, { headers: { Authorization: "Bearer schlecht" } });
    assert.deepEqual(Object.keys(await r.json()).sort(), ["app", "ok", "version"]);
    r = await fetch(`${basis}/gibtsnicht`);
    pruefeKopf(r, "404"); await r.text();
    r = await fetch(`${basis}/api/chat`, { method: "OPTIONS", headers: { Origin: "https://smejj.com" } });
    pruefeKopf(r, "Preflight");
    assert.equal(r.headers.get("access-control-allow-origin"), "https://smejj.com", "CORS unveraendert");
    await r.text();
    r = await fetch(`${basis}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://smejj.com", Authorization: "Bearer gut" }, body: JSON.stringify({ message: "Hallo" }) });
    pruefeKopf(r, "SSE");
    assert.match(await r.text(), /Hallo\./);
  } finally {
    bruecke.kill("SIGTERM");
    stub.closeAllConnections?.();
    stub.close();
  }
});

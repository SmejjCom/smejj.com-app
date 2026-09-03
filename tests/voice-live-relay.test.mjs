// smejj.com — Sprachwelle LIVE: Relay-Bausteine (RFC 6455, Zugang, Uebersetzung).
// Ausfuehren: node --test tests/voice-live-relay.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  wsAcceptWert, kodiereRahmen, dekodiereRahmen, bewerteLiveZugang, baueSetup,
  baueAudioNachricht, uebersetzeServerNachricht, tokenAusUnterprotokoll,
  createLiveVerbrauch, createVoiceLiveUpgrade, liveKonfiguration
} from "../control-server/src/voice/liveRelay.js";

test("wsAcceptWert: bekannter Vektor aus RFC 6455", () => {
  assert.equal(wsAcceptWert("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("Rahmen: maskierter Browser-Rahmen wird entpackt, auch geteilt ueber zwei Stuecke", () => {
  const nutzlast = Buffer.from("hallo welle");
  const maske = Buffer.from([1, 2, 3, 4]);
  const maskiert = Buffer.from(nutzlast.map((b, i) => b ^ maske[i & 3]));
  const rahmen = Buffer.concat([Buffer.from([0x81, 0x80 | nutzlast.length]), maske, maskiert]);
  const erst = dekodiereRahmen(rahmen.subarray(0, 5));
  assert.equal(erst.rahmen.length, 0);
  assert.equal(erst.rest.length, 5);
  const ganz = dekodiereRahmen(Buffer.concat([erst.rest, rahmen.subarray(5)]));
  assert.equal(ganz.rahmen.length, 1);
  assert.equal(ganz.rahmen[0].opcode, 0x1);
  assert.equal(ganz.rahmen[0].nutzlast.toString(), "hallo welle");
  assert.equal(ganz.rest.length, 0);
});

test("Rahmen: grosse Binaer-Nutzlast (16-Bit-Laenge) roundtrip", () => {
  const daten = Buffer.alloc(3000, 7);
  const kodiert = kodiereRahmen(0x2, daten);
  assert.equal(kodiert[1], 126);
  const { rahmen } = dekodiereRahmen(kodiert);
  assert.equal(rahmen[0].nutzlast.length, 3000);
  assert.equal(rahmen[0].opcode, 0x2);
});

test("Zugang: fail-closed ohne Anmeldung, ohne Schluessel, ohne Upstream, bei Deckeln", () => {
  const env = { SMEJJ_VOICE_LIVE_API_KEY: "k" };
  assert.equal(bewerteLiveZugang({ env, benutzer: null }).status, 401);
  assert.equal(bewerteLiveZugang({ env: {}, benutzer: { id: "u" }, upstreamVerfuegbar: true }).grund, "voice_live_key_missing");
  assert.equal(bewerteLiveZugang({ env, benutzer: { id: "u" }, upstreamVerfuegbar: false }).grund, "upstream_websocket_unavailable");
  assert.equal(bewerteLiveZugang({ env: { ...env, SMEJJ_VOICE_LIVE_ENABLED: "false" }, benutzer: { id: "u" }, upstreamVerfuegbar: true }).grund, "voice_live_disabled");
  assert.equal(bewerteLiveZugang({ env, benutzer: { id: "u" }, upstreamVerfuegbar: true, verbrauch: { minutenHeute: 60, aktiveSitzungen: 0 } }).grund, "voice_live_daily_budget");
  assert.equal(bewerteLiveZugang({ env, benutzer: { id: "u" }, upstreamVerfuegbar: true, verbrauch: { minutenHeute: 0, aktiveSitzungen: 3 } }).grund, "voice_live_busy");
  const ok = bewerteLiveZugang({ env, benutzer: { id: "u" }, upstreamVerfuegbar: true, verbrauch: { minutenHeute: 1, aktiveSitzungen: 0 } });
  assert.equal(ok.ok, true);
  assert.equal(ok.konfiguration.modell, "gemini-3.1-flash-live-preview");
});

test("Konfiguration: Rueckfall auf den Router-Schluessel, Modell ohne models/-Praefix", () => {
  const k = liveKonfiguration({ SMEJJ_LLM_GEMINI_API_KEY: "alt", SMEJJ_VOICE_LIVE_MODEL: "models/x-live" });
  assert.equal(k.schluessel, "alt");
  assert.equal(k.modell, "x-live");
});

test("Setup + Audio: Nachrichten im Google-Vokabular", () => {
  const s = baueSetup({ modell: "m", stimme: "Kore" });
  assert.equal(s.setup.model, "models/m");
  assert.deepEqual(s.setup.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(s.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.ok(s.setup.inputAudioTranscription && s.setup.outputAudioTranscription);
  const a = baueAudioNachricht(Buffer.from([1, 2, 3]));
  assert.equal(a.realtimeInput.audio.mimeType, "audio/pcm;rate=16000");
  assert.equal(a.realtimeInput.audio.data, Buffer.from([1, 2, 3]).toString("base64"));
});

test("Uebersetzung: ready, Audio-Start einmal je Antwort, Transkripte, Unterbrechung, Ende", () => {
  const z = { antwortLaeuft: false };
  assert.deepEqual(uebersetzeServerNachricht({ setupComplete: {} }, z)[0].json, { type: "session.ready" });
  const audio = { serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.from("ab").toString("base64"), mimeType: "audio/pcm;rate=24000" } }] } } };
  const e1 = uebersetzeServerNachricht(audio, z);
  assert.equal(e1[0].json.type, "response.audio.start");
  assert.equal(e1[1].art, "binaer");
  assert.equal(e1[1].daten.toString(), "ab");
  const e2 = uebersetzeServerNachricht(audio, z);
  assert.equal(e2.length, 1, "zweiter Brocken ohne erneutes Start-Ereignis");
  const t = uebersetzeServerNachricht({ serverContent: { inputTranscription: { text: "hallo" }, outputTranscription: { text: "hi" } } }, z);
  assert.deepEqual(t.map((x) => x.json.rolle), ["user", "assistant"]);
  const u = uebersetzeServerNachricht({ serverContent: { interrupted: true } }, z);
  assert.equal(u[0].json.type, "response.interrupted");
  assert.equal(z.antwortLaeuft, false);
  uebersetzeServerNachricht(audio, z);
  const ende = uebersetzeServerNachricht({ serverContent: { turnComplete: true } }, z);
  assert.equal(ende[0].json.type, "response.audio.end");
  assert.equal(uebersetzeServerNachricht({ error: { message: "x" } }, z)[0].json.code, "upstream_error");
});

test("Unterprotokoll: Token nur aus smejj.sitzung.*, nie aus anderen Eintraegen", () => {
  assert.equal(tokenAusUnterprotokoll("foo, smejj.sitzung.abc.def , bar"), "abc.def");
  assert.equal(tokenAusUnterprotokoll("foo"), "");
});

test("Verbrauch: Minuten summieren sich und der Tag setzt zurueck", () => {
  let t = Date.parse("2026-09-03T10:00:00Z");
  const v = createLiveVerbrauch(() => t);
  const start = v.beginne();
  assert.equal(v.snapshot().aktiveSitzungen, 1);
  t += 90000;
  v.beende(start);
  assert.equal(Math.round(v.snapshot().minutenHeute * 10) / 10, 1.5);
  t = Date.parse("2026-09-04T00:00:01Z");
  assert.equal(v.snapshot().minutenHeute, 0);
});

function fakeSocket() {
  const s = new EventEmitter();
  s.geschrieben = [];
  s.write = (d) => { s.geschrieben.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d))); return true; };
  s.end = () => { s.beendet = true; };
  s.destroy = () => { s.zerstoert = true; };
  s.setNoDelay = () => {};
  return s;
}

test("Upgrade: fremder Pfad wird nicht behandelt, ohne Token 401 als HTTP-Absage", async () => {
  const h = createVoiceLiveUpgrade({ env: { SMEJJ_VOICE_LIVE_API_KEY: "k" }, readSession: () => null, WebSocketCtor: function () {} });
  assert.equal(await h({ url: "/api/anders", headers: { host: "x" } }, fakeSocket(), Buffer.alloc(0)), false);
  const s = fakeSocket();
  assert.equal(await h({ url: "/api/voice-realtime", headers: { host: "x" } }, s, Buffer.alloc(0)), true);
  assert.match(s.geschrieben[0].toString(), /^HTTP\/1\.1 401 /);
  assert.match(s.geschrieben[0].toString(), /authentication_required/);
  assert.equal(s.zerstoert, true);
});

test("Upgrade: angemeldet -> 101 mit Unterprotokoll, Setup geht raus, Audio wird weitergereicht, ready kommt zurueck", async () => {
  class FakeWs extends EventEmitter {
    constructor(url) { super(); FakeWs.url = url; this.readyState = 0; this.gesendet = []; FakeWs.instanz = this; setTimeout(() => { this.readyState = 1; this.emit("open", {}); }, 0); }
    addEventListener(n, f) { this.on(n, f); }
    send(d) { this.gesendet.push(d); }
    close() { this.readyState = 3; }
  }
  const h = createVoiceLiveUpgrade({
    env: { SMEJJ_VOICE_LIVE_API_KEY: "geheim", SMEJJ_VOICE_LIVE_UPSTREAM_URL: "wss://fake/ws" },
    readSession: (req) => (req.headers.authorization === "Bearer tok1" ? { id: "u1" } : null),
    sessionStillValid: async () => true,
    WebSocketCtor: FakeWs,
    log: { warn() {}, info() {} }
  });
  const s = fakeSocket();
  const req = { url: "/api/voice-realtime", headers: { host: "api", upgrade: "websocket", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-protocol": "smejj.sitzung.tok1" } };
  assert.equal(await h(req, s, Buffer.alloc(0)), true);
  const antwort = s.geschrieben[0].toString();
  assert.match(antwort, /^HTTP\/1\.1 101 /);
  assert.match(antwort, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
  assert.match(antwort, /Sec-WebSocket-Protocol: smejj\.sitzung\.tok1/);
  assert.ok(FakeWs.url.startsWith("wss://fake/ws?key=geheim"), "Schluessel nur zur Gegenseite");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(JSON.parse(FakeWs.instanz.gesendet[0]).setup.model, "models/gemini-3.1-flash-live-preview");
  // Browser schickt maskiertes Audio (2 Bytes) -> Gegenseite bekommt realtimeInput
  const maske = Buffer.from([9, 9, 9, 9]);
  const pcm = Buffer.from([0x10, 0x20]);
  s.emit("data", Buffer.concat([Buffer.from([0x82, 0x82]), maske, Buffer.from(pcm.map((b, i) => b ^ maske[i & 3]))]));
  const audio = JSON.parse(FakeWs.instanz.gesendet[1]);
  assert.equal(audio.realtimeInput.audio.data, pcm.toString("base64"));
  // Gegenseite meldet setupComplete -> Browser bekommt session.ready als Textrahmen
  FakeWs.instanz.emit("message", { data: JSON.stringify({ setupComplete: {} }) });
  const letzter = s.geschrieben[s.geschrieben.length - 1];
  const { rahmen } = dekodiereRahmen(letzter);
  assert.equal(JSON.parse(rahmen[0].nutzlast.toString()).type, "session.ready");
  // Browser beendet -> Schliess-Rahmen, Gegenseite zu
  s.emit("data", Buffer.concat([Buffer.from([0x88, 0x80]), maske]));
  assert.equal(FakeWs.instanz.readyState, 3);
  assert.equal(s.beendet, true);
});

import { createSchluesselPool, schluesselListe, istKontingentFehler } from "../control-server/src/voice/liveRelay.js";

test("Pool: Liste aus Einzel + Liste + Router-Rueckfall, ohne Doppel, Sperre ruht 10 min", () => {
  const liste = schluesselListe({ SMEJJ_VOICE_LIVE_API_KEY: "a", SMEJJ_VOICE_LIVE_API_KEYS: "b, c a", SMEJJ_LLM_GEMINI_API_KEY: "d" });
  assert.deepEqual(liste, ["a", "b", "c", "d"]);
  let t = 0;
  const pool = createSchluesselPool(["a", "b"], { jetzt: () => t, sperreMs: 1000 });
  assert.equal(pool.waehle(), "a");
  assert.equal(pool.waehle(), "b");
  pool.sperre("a");
  assert.deepEqual(pool.frei(), ["b"]);
  assert.equal(pool.waehle(["b"]), "", "kein freier Schluessel ausser den versuchten");
  t = 1001;
  assert.deepEqual(pool.frei(), ["a", "b"]);
  assert.ok(istKontingentFehler("RESOURCE_EXHAUSTED: quota exceeded"));
  assert.ok(istKontingentFehler("", 1008));
  assert.equal(istKontingentFehler("network down", 1006), false);
});

test("Upgrade: Kontingent beim ersten Schluessel -> zweiter Schluessel uebernimmt, Browser bekommt ready", async () => {
  const instanzen = [];
  class FakeWs extends EventEmitter {
    constructor(url) { super(); this.url = url; this.readyState = 0; this.gesendet = []; instanzen.push(this); setTimeout(() => { this.readyState = 1; this.emit("open", {}); }, 0); }
    addEventListener(n, f) { this.on(n, f); }
    send(d) { this.gesendet.push(d); }
    close() { this.readyState = 3; }
  }
  const h = createVoiceLiveUpgrade({
    env: { SMEJJ_VOICE_LIVE_API_KEY: "erster", SMEJJ_VOICE_LIVE_API_KEYS: "zweiter", SMEJJ_VOICE_LIVE_UPSTREAM_URL: "wss://fake/ws" },
    readSession: () => ({ id: "u1" }),
    WebSocketCtor: FakeWs,
    log: { warn() {}, info() {} }
  });
  const s = fakeSocket();
  const req = { url: "/api/voice-realtime", headers: { host: "api", upgrade: "websocket", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-protocol": "smejj.sitzung.tok1" } };
  assert.equal(await h(req, s, Buffer.alloc(0)), true);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(instanzen[0].url.includes("key=erster"));
  instanzen[0].emit("close", { code: 1008, reason: "RESOURCE_EXHAUSTED: quota" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(instanzen.length, 2, "zweite Gegenseite geoeffnet");
  assert.ok(instanzen[1].url.includes("key=zweiter"));
  assert.equal(s.beendet, undefined, "Browser-Verbindung bleibt offen");
  instanzen[1].emit("message", { data: JSON.stringify({ setupComplete: {} }) });
  const { rahmen } = dekodiereRahmen(s.geschrieben[s.geschrieben.length - 1]);
  assert.equal(JSON.parse(rahmen[0].nutzlast.toString()).type, "session.ready");
  // Nach ready zaehlt ein Kontingent-Schliessen als normales Ende (kein dritter Versuch)
  instanzen[1].emit("close", { code: 1008, reason: "quota" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(instanzen.length, 2);
  assert.equal(s.beendet, true);
});

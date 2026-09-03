// smejj.com — Sprachwelle LIVE: WebSocket-Relay zur Gemini Live API (Sprache-zu-Sprache).
//
// WARUM: Die bisherige Welle ist eine Kette (Ohr -> Whisper -> Router -> Stimme) und
// fuehlt sich nie wie ein Gespraech an. ChatGPT Advanced Voice und Gemini Live schicken
// das Mikrofon als Audiostrom direkt ins Modell, der Server erkennt Pausen selbst, man
// darf hineinreden, die Antwort kommt als Audio in unter einer halben Sekunde. Dieses
// Modul ist derselbe Weg mit derselben Technik wie Gemini: Browser -> (WebSocket) ->
// dieser Relay -> (WebSocket) -> generativelanguage.googleapis.com. Der Schluessel
// bleibt auf dem Server. Betreiber-Auftrag 2026-09-03: "wie mit einem Menschen reden".
//
// OHNE ABHAENGIGKEITEN: Das Projekt hat keine npm-Abhaengigkeiten. Der Browser-Teil
// (RFC 6455: Handshake, Rahmen mit Maske) steht deshalb hier von Hand; die Gegenseite
// nutzt den eingebauten WebSocket-Client von Node (ab Node 22). Fehlt er, lehnt der
// Relay sauber ab (503 upstream_websocket_unavailable) — der Browser faellt dann still
// auf die alte Kette zurueck, nichts bricht.
//
// FAIL-CLOSED, KOSTENSCHUTZ: Ohne SMEJJ_VOICE_LIVE_API_KEY (bewusst EIGENER Schluessel,
// damit der Modell-Router keine neue Kette bekommt; Rueckfall SMEJJ_LLM_GEMINI_API_KEY)
// gibt es kein Relay. Tagesdeckel in Minuten (SMEJJ_VOICE_LIVE_MAX_MINUTES_PER_DAY,
// Vorgabe 60 — bleibt im Gratis-Kontingent), Sitzungsdeckel (Vorgabe 14 min, Google
// kappt Audio-Sitzungen bei 15), hoechstens SMEJJ_VOICE_LIVE_MAX_SESSIONS gleichzeitig
// (Vorgabe 3). Nur angemeldete Sitzungen: der Browser kann bei WebSockets keine Header
// setzen, darum reist das Sitzungs-Token als Unterprotokoll "smejj.sitzung.<token>"
// — nie in der URL (Server-Logs, Proxys).
//
// Protokoll Browser <-> Relay (klein, eigenes Vokabular, unabhaengig von Google):
//   Browser -> Relay: Text {"type":"session.start"} | {"type":"session.stop"};
//                     Binaer = PCM 16 Bit, 16 kHz, mono, little-endian.
//   Relay -> Browser: Text {"type":"session.ready"} | {"type":"response.audio.start"} |
//                     {"type":"response.audio.end"} | {"type":"response.interrupted"} |
//                     {"type":"transcript","rolle":"user"|"assistant","text":"..."} |
//                     {"type":"error","code":"..."}; Binaer = PCM 16 Bit, 24 kHz, mono.
import { createHash } from "node:crypto";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const LIVE_PFAD = "/api/voice-realtime";
export const LIVE_SUBPROTOKOLL_PRAEFIX = "smejj.sitzung.";
export const LIVE_STANDARD_MODELL = "gemini-3.1-flash-live-preview";
const OPCODE = Object.freeze({ fortsetzung: 0x0, text: 0x1, binaer: 0x2, schliessen: 0x8, ping: 0x9, pong: 0xa });
const GOOGLE_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const SYSTEM_TEXT = "Du bist smejj, der Sprachassistent von smejj.com. Sprich Deutsch, es sei denn, "
  + "die Person spricht eine andere Sprache. Antworte kurz und natuerlich wie in einem Gespraech: "
  + "ein bis drei Saetze, keine Aufzaehlungen, kein Markdown. Wenn du etwas nicht verstanden hast, "
  + "frag kurz nach, statt zu raten.";

// ---------------------------------------------------------------- RFC 6455 --
export function wsAcceptWert(schluessel) {
  return createHash("sha1").update(String(schluessel || "") + WS_MAGIC).digest("base64");
}

/** Rahmen Server -> Browser (unmaskiert). */
export function kodiereRahmen(opcode, nutzlast = Buffer.alloc(0)) {
  const daten = Buffer.isBuffer(nutzlast) ? nutzlast : Buffer.from(nutzlast);
  const laenge = daten.length;
  let kopf;
  if (laenge < 126) {
    kopf = Buffer.from([0x80 | opcode, laenge]);
  } else if (laenge < 65536) {
    kopf = Buffer.alloc(4);
    kopf[0] = 0x80 | opcode; kopf[1] = 126; kopf.writeUInt16BE(laenge, 2);
  } else {
    kopf = Buffer.alloc(10);
    kopf[0] = 0x80 | opcode; kopf[1] = 127; kopf.writeBigUInt64BE(BigInt(laenge), 2);
  }
  return Buffer.concat([kopf, daten]);
}

/** Rahmen Browser -> Server (maskiert). Liefert vollstaendige Rahmen und den Rest. */
export function dekodiereRahmen(puffer) {
  const rahmen = [];
  let pos = 0;
  while (pos + 2 <= puffer.length) {
    const fin = (puffer[pos] & 0x80) !== 0;
    const opcode = puffer[pos] & 0x0f;
    const maskiert = (puffer[pos + 1] & 0x80) !== 0;
    let laenge = puffer[pos + 1] & 0x7f;
    let kopf = 2;
    if (laenge === 126) { if (pos + 4 > puffer.length) break; laenge = puffer.readUInt16BE(pos + 2); kopf = 4; }
    else if (laenge === 127) { if (pos + 10 > puffer.length) break; laenge = Number(puffer.readBigUInt64BE(pos + 2)); kopf = 10; }
    const maskeLaenge = maskiert ? 4 : 0;
    if (pos + kopf + maskeLaenge + laenge > puffer.length) break;
    const maske = maskiert ? puffer.subarray(pos + kopf, pos + kopf + 4) : null;
    const nutzlast = Buffer.from(puffer.subarray(pos + kopf + maskeLaenge, pos + kopf + maskeLaenge + laenge));
    if (maske) for (let i = 0; i < nutzlast.length; i++) nutzlast[i] ^= maske[i & 3];
    rahmen.push({ fin, opcode, nutzlast });
    pos += kopf + maskeLaenge + laenge;
  }
  return { rahmen, rest: puffer.subarray(pos) };
}

// ------------------------------------------------------------- Entscheidung --
function zahl(wert, vorgabe, min, max) {
  const n = Number(wert);
  if (!Number.isFinite(n)) return vorgabe;
  return Math.min(max, Math.max(min, n));
}

export function liveKonfiguration(env = {}) {
  return {
    schluessel: String(env.SMEJJ_VOICE_LIVE_API_KEY || env.SMEJJ_LLM_GEMINI_API_KEY || "").trim(),
    aktiv: env.SMEJJ_VOICE_LIVE_ENABLED !== "false",
    modell: String(env.SMEJJ_VOICE_LIVE_MODEL || LIVE_STANDARD_MODELL).replace(/^models\//, ""),
    stimme: String(env.SMEJJ_VOICE_LIVE_VOICE || "Kore"),
    tagesMinuten: zahl(env.SMEJJ_VOICE_LIVE_MAX_MINUTES_PER_DAY, 60, 0, 1440),
    sitzungsMinuten: zahl(env.SMEJJ_VOICE_LIVE_MAX_SESSION_MINUTES, 14, 1, 15),
    maxSitzungen: zahl(env.SMEJJ_VOICE_LIVE_MAX_SESSIONS, 3, 1, 50),
    upstreamUrl: String(env.SMEJJ_VOICE_LIVE_UPSTREAM_URL || GOOGLE_WS)
  };
}

/** Token aus dem Unterprotokoll-Header ziehen — nie aus der URL. */
export function tokenAusUnterprotokoll(headerWert = "") {
  for (const teil of String(headerWert || "").split(",")) {
    const t = teil.trim();
    if (t.startsWith(LIVE_SUBPROTOKOLL_PRAEFIX)) return t.slice(LIVE_SUBPROTOKOLL_PRAEFIX.length);
  }
  return "";
}

/**
 * Darf diese Anfrage ein Live-Gespraech oeffnen? Pur, ohne I/O.
 * Output: { ok, status, grund } — status ist der HTTP-Status fuer die Absage.
 */
export function bewerteLiveZugang({ env = {}, benutzer = null, verbrauch = { minutenHeute: 0, aktiveSitzungen: 0 }, upstreamVerfuegbar = typeof WebSocket === "function" } = {}) {
  const k = liveKonfiguration(env);
  if (!benutzer) return { ok: false, status: 401, grund: "authentication_required" };
  if (!k.aktiv) return { ok: false, status: 503, grund: "voice_live_disabled" };
  if (!k.schluessel) return { ok: false, status: 503, grund: "voice_live_key_missing" };
  if (!upstreamVerfuegbar) return { ok: false, status: 503, grund: "upstream_websocket_unavailable" };
  if (verbrauch.aktiveSitzungen >= k.maxSitzungen) return { ok: false, status: 429, grund: "voice_live_busy" };
  if (k.tagesMinuten > 0 && verbrauch.minutenHeute >= k.tagesMinuten) return { ok: false, status: 429, grund: "voice_live_daily_budget" };
  return { ok: true, status: 101, grund: "", konfiguration: k };
}

/** Erste Nachricht an Google — Modell, Audio raus, Stimme, Transkripte, Pausen-Erkennung. */
export function baueSetup({ modell = LIVE_STANDARD_MODELL, stimme = "Kore", systemText = SYSTEM_TEXT } = {}) {
  return {
    setup: {
      model: `models/${modell}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: stimme } } }
      },
      systemInstruction: { parts: [{ text: systemText }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { prefixPaddingMs: 200, silenceDurationMs: 700 } }
    }
  };
}

/** Audio Browser -> Google. */
export function baueAudioNachricht(pcm16k) {
  return { realtimeInput: { audio: { data: Buffer.from(pcm16k).toString("base64"), mimeType: "audio/pcm;rate=16000" } } };
}

/**
 * Google -> Browser uebersetzen. Pur: liefert eine Liste von Ereignissen
 * [{ art: "text", json } | { art: "binaer", daten }] in Sendereihenfolge.
 */
export function uebersetzeServerNachricht(nachricht, zustand = { antwortLaeuft: false }) {
  const aus = [];
  if (!nachricht || typeof nachricht !== "object") return aus;
  if (nachricht.setupComplete) aus.push({ art: "text", json: { type: "session.ready" } });
  const sc = nachricht.serverContent;
  if (sc) {
    if (sc.interrupted) { zustand.antwortLaeuft = false; aus.push({ art: "text", json: { type: "response.interrupted" } }); }
    const eingabe = sc.inputTranscription?.text;
    if (eingabe) aus.push({ art: "text", json: { type: "transcript", rolle: "user", text: String(eingabe) } });
    const ausgabe = sc.outputTranscription?.text;
    if (ausgabe) aus.push({ art: "text", json: { type: "transcript", rolle: "assistant", text: String(ausgabe) } });
    for (const teil of sc.modelTurn?.parts || []) {
      const daten = teil?.inlineData?.data;
      if (!daten) continue;
      if (!zustand.antwortLaeuft) { zustand.antwortLaeuft = true; aus.push({ art: "text", json: { type: "response.audio.start" } }); }
      aus.push({ art: "binaer", daten: Buffer.from(String(daten), "base64") });
    }
    if (sc.turnComplete && zustand.antwortLaeuft) { zustand.antwortLaeuft = false; aus.push({ art: "text", json: { type: "response.audio.end" } }); }
  }
  if (nachricht.goAway) aus.push({ art: "text", json: { type: "error", code: "upstream_go_away" } });
  if (nachricht.error) aus.push({ art: "text", json: { type: "error", code: "upstream_error", text: String(nachricht.error?.message || "") } });
  return aus;
}

// ---------------------------------------------------------------- Verbrauch --
export function createLiveVerbrauch(jetzt = () => Date.now()) {
  let tag = "";
  let minuten = 0;
  let aktive = 0;
  const tagVon = (ms) => new Date(ms).toISOString().slice(0, 10);
  return {
    snapshot() {
      if (tagVon(jetzt()) !== tag) { tag = tagVon(jetzt()); minuten = 0; }
      return { minutenHeute: minuten, aktiveSitzungen: aktive, tag };
    },
    beginne() { this.snapshot(); aktive += 1; return jetzt(); },
    beende(startMs) { aktive = Math.max(0, aktive - 1); this.snapshot(); minuten += Math.max(0, (jetzt() - startMs) / 60000); }
  };
}

// ------------------------------------------------------------------- Relay --
function schreibeAbsage(socket, status, grund) {
  const text = { 401: "Unauthorized", 403: "Forbidden", 429: "Too Many Requests", 503: "Service Unavailable" }[status] || "Bad Request";
  const koerper = JSON.stringify({ ok: false, error: grund });
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(koerper)}\r\nConnection: close\r\n\r\n${koerper}`);
  } catch { /* Gegenseite schon weg */ }
  try { socket.destroy(); } catch { /* egal */ }
}

/**
 * Eigenen Upgrade-Handler bauen. Input: env, readSession(req), sessionStillValid(user, env),
 * optional aiGate(env) -> boolean (Kostenschutz-Ampel), optional WebSocketCtor (Test).
 * Output: (req, socket, head) => Promise<boolean> — true, wenn der Pfad hier behandelt wurde.
 */
export function createVoiceLiveUpgrade({ env = process.env, readSession, sessionStillValid, aiGate = null, WebSocketCtor = globalThis.WebSocket, verbrauch = createLiveVerbrauch(), log = console } = {}) {
  return async function handleVoiceLiveUpgrade(req, socket, head) {
    let pfad = "";
    try { pfad = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname; } catch { pfad = ""; }
    if (pfad !== LIVE_PFAD) return false;

    const token = tokenAusUnterprotokoll(req.headers["sec-websocket-protocol"]);
    const benutzer = token ? readSession({ headers: { authorization: `Bearer ${token}` } }) : null;
    if (benutzer && sessionStillValid && !(await sessionStillValid(benutzer, env))) { schreibeAbsage(socket, 401, "session_revoked_or_expired"); return true; }
    if (aiGate && benutzer && !aiGate(env)) { schreibeAbsage(socket, 503, "server_ai_disabled"); return true; }
    const zugang = bewerteLiveZugang({ env, benutzer, verbrauch: verbrauch.snapshot(), upstreamVerfuegbar: typeof WebSocketCtor === "function" });
    if (!zugang.ok) { schreibeAbsage(socket, zugang.status, zugang.grund); return true; }
    const k = zugang.konfiguration;
    const schluessel = req.headers["sec-websocket-key"];
    if (!schluessel || String(req.headers.upgrade || "").toLowerCase() !== "websocket") { schreibeAbsage(socket, 400, "bad_upgrade"); return true; }

    // 1) Handshake zum Browser (Unterprotokoll bestaetigen, sonst schliesst der Browser).
    const gewaehlt = `${LIVE_SUBPROTOKOLL_PRAEFIX}${token}`;
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${wsAcceptWert(schluessel)}\r\nSec-WebSocket-Protocol: ${gewaehlt}\r\n\r\n`);
    socket.setNoDelay?.(true);

    // 2) Gegenseite oeffnen.
    const startMs = verbrauch.beginne();
    const zustand = { antwortLaeuft: false };
    let oben = null;
    let rest = Buffer.alloc(0);
    let zu = false;
    const sendeText = (json) => { if (!zu) try { socket.write(kodiereRahmen(OPCODE.text, JSON.stringify(json))); } catch { /* weg */ } };
    const sendeBinaer = (daten) => { if (!zu) try { socket.write(kodiereRahmen(OPCODE.binaer, daten)); } catch { /* weg */ } };
    const schliesse = (grund = "") => {
      if (zu) return;
      zu = true;
      verbrauch.beende(startMs);
      clearInterval(pingUhr); clearTimeout(deckelUhr);
      try { if (grund) socket.write(kodiereRahmen(OPCODE.text, JSON.stringify({ type: "error", code: grund }))); } catch { /* weg */ }
      try { socket.write(kodiereRahmen(OPCODE.schliessen, Buffer.from([0x03, 0xe8]))); } catch { /* weg */ }
      try { socket.end(); } catch { /* weg */ }
      try { oben?.close?.(); } catch { /* weg */ }
    };
    const pingUhr = setInterval(() => { if (!zu) try { socket.write(kodiereRahmen(OPCODE.ping)); } catch { /* weg */ } }, 20000);
    const deckelUhr = setTimeout(() => schliesse("session_time_limit"), k.sitzungsMinuten * 60000);

    try {
      oben = new WebSocketCtor(`${k.upstreamUrl}?key=${encodeURIComponent(k.schluessel)}`);
      oben.binaryType = "arraybuffer";
    } catch (fehler) {
      log.warn?.(`[voice-live] Gegenseite nicht erreichbar: ${fehler?.message || fehler}`);
      schliesse("upstream_connect_failed");
      return true;
    }
    oben.addEventListener("open", () => {
      try { oben.send(JSON.stringify(baueSetup({ modell: k.modell, stimme: k.stimme }))); } catch { schliesse("upstream_setup_failed"); }
    });
    oben.addEventListener("message", (ereignis) => {
      let text = "";
      if (typeof ereignis.data === "string") text = ereignis.data;
      else if (ereignis.data instanceof ArrayBuffer) text = Buffer.from(ereignis.data).toString("utf8");
      else if (Buffer.isBuffer(ereignis.data)) text = ereignis.data.toString("utf8");
      let nachricht = null;
      try { nachricht = JSON.parse(text); } catch { return; }
      for (const e of uebersetzeServerNachricht(nachricht, zustand)) {
        if (e.art === "binaer") sendeBinaer(e.daten); else sendeText(e.json);
      }
    });
    oben.addEventListener("error", (ereignis) => {
      log.warn?.(`[voice-live] Gegenseite Fehler: ${ereignis?.message || ereignis?.error?.message || "unbekannt"}`);
      schliesse("upstream_error");
    });
    oben.addEventListener("close", (ereignis) => {
      if (!zu) log.info?.(`[voice-live] Gegenseite zu: ${ereignis?.code || ""} ${String(ereignis?.reason || "").slice(0, 160)}`);
      schliesse(zu ? "" : "upstream_closed");
    });

    // 3) Browser -> Gegenseite.
    if (head?.length) rest = Buffer.concat([rest, head]);
    const verarbeite = () => {
      const { rahmen, rest: neu } = dekodiereRahmen(rest);
      rest = Buffer.from(neu);
      for (const r of rahmen) {
        if (r.opcode === OPCODE.schliessen) { schliesse(); return; }
        if (r.opcode === OPCODE.ping) { try { socket.write(kodiereRahmen(OPCODE.pong, r.nutzlast)); } catch { /* weg */ } continue; }
        if (r.opcode === OPCODE.pong) continue;
        if (r.opcode === OPCODE.binaer || (r.opcode === OPCODE.fortsetzung && r.nutzlast.length)) {
          if (oben?.readyState === 1) try { oben.send(JSON.stringify(baueAudioNachricht(r.nutzlast))); } catch { /* weg */ }
          continue;
        }
        if (r.opcode === OPCODE.text) {
          let json = null;
          try { json = JSON.parse(r.nutzlast.toString("utf8")); } catch { continue; }
          if (json?.type === "session.stop") { schliesse(); return; }
        }
      }
    };
    verarbeite();
    socket.on("data", (stueck) => { rest = Buffer.concat([rest, stueck]); verarbeite(); });
    socket.on("close", () => schliesse());
    socket.on("error", () => schliesse());
    return true;
  };
}

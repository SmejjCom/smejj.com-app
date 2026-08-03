// smejj.com — Stufe 4: das Groq-Ohr (2026-08-03).
//
// Praezises Server-Transkript (Groq Whisper ueber die Bridge) ersetzt das oft
// verhoerte Web-Speech-Ergebnis; faellt IRGENDETWAS aus (Route fehlt, Budget
// reisst, kein Mikrofon), bleibt die Sprachwelle exakt so gut wie vorher.
// Dieser Test prueft beide Seiten der Naht ohne Netz und ohne Mikrofon:
// die Bridge-Logik (chat-bridge-voice-ear.js) mit Fetch-Attrappe, den
// gemeinsamen Abschluss earSend (voice-ear.js) mit Ohr-Attrappe, und die
// Struktur der Verdrahtung in beiden Hosts.
// Standalone: node tests/voice-ear.test.mjs
import { readFileSync } from "node:fs";
import { normalizeAudioType, transcribeWithGroq, EAR_MAX_BYTES } from "../public/chat-bridge-voice-ear.js";
import { pickRecorderMime, createEarSend } from "../public/voice-ear.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- 1. Bridge-Seite: transcribeWithGroq (Fetch-Attrappe) --------------------
{
  check("1a MediaRecorder-Typ mit Codec wird normalisiert",
    normalizeAudioType("audio/webm;codecs=opus") === "audio/webm");
  check("1b fremder Typ wird abgelehnt", normalizeAudioType("text/html") === "");

  const audio = Buffer.from("x".repeat(2000));
  const gut = await transcribeWithGroq(audio, {
    contentType: "audio/webm;codecs=opus",
    apiKey: "test-key",
    baseUrl: "https://groq.example/openai/v1",
    fetchFn: async (url, init) => {
      check("1c Anfrage geht an /audio/transcriptions", url.endsWith("/audio/transcriptions"));
      check("1d Schluessel steht NUR im Authorization-Kopf",
        init.headers.Authorization === "Bearer test-key" && !String(url).includes("test-key"));
      check("1e Audio reist als multipart-FormData", init.body instanceof FormData);
      return { ok: true, json: async () => ({ text: "  Wie ist das Wetter in Berlin?  " }) };
    }
  });
  check("1f Transkript kommt getrimmt zurueck", gut.ok === true && gut.text === "Wie ist das Wetter in Berlin?");

  const ohneKey = await transcribeWithGroq(audio, { contentType: "audio/webm", apiKey: "", baseUrl: "x" });
  check("1g ohne Schluessel fail-closed 503", ohneKey.ok === false && ohneKey.status === 503);

  const upstreamWeg = await transcribeWithGroq(audio, {
    contentType: "audio/webm", apiKey: "k", baseUrl: "x",
    fetchFn: async () => { throw new Error("ECONNREFUSED"); }
  });
  check("1h Upstream-Ausfall wird zur klaren 502", upstreamWeg.ok === false && upstreamWeg.status === 502);

  check("1i Groessendeckel schuetzt den Free-Tier", EAR_MAX_BYTES <= 5_000_000);
}

// --- 2. Browser-Seite: earSend (Ohr-Attrappe) --------------------------------
function machHost() {
  return { gesendet: [], nachgefragt: 0, transkript: "", denken: 0, aktiv: true, stumm: false };
}
function machEarSend(host, serverText, { totesOhr = false } = {}) {
  return createEarSend({
    ear: totesOhr ? null : { finish: async () => serverText },
    istAktiv: () => host.aktiv,
    istStumm: () => host.stumm,
    zeigeDenken: () => { host.denken += 1; },
    zeigeTranskript: (text) => { host.transkript = text; },
    sollNachfragenFn: ({ text, confidence }) => Number.isFinite(confidence) && confidence < 0.5 && text.split(" ").length <= 2,
    nachfragen: () => { host.nachgefragt += 1; },
    senden: (task) => host.gesendet.push(task)
  });
}

{
  // Server liefert praezisen Text -> der gewinnt, auch wenn Web Speech wirr war.
  const host = machHost();
  await machEarSend(host, "Wie ist das Wetter in Berlin?")("smeeting nach", 0.3);
  check("2a Server-Transkript ersetzt das verhoerte Web-Speech-Ergebnis",
    host.gesendet.join("|") === "Wie ist das Wetter in Berlin?" && host.nachgefragt === 0);
  check("2b Anzeige zeigt das Server-Transkript", host.transkript === "Wie ist das Wetter in Berlin?");
  check("2c Denk-Status kommt sofort", host.denken === 1);
}
{
  // Server liefert nichts -> Stufe-3-Regel auf den Web-Speech-Text wie bisher.
  const host = machHost();
  await machEarSend(host, "")("smeeting nach", 0.3);
  check("2d ohne Server-Text greift die Rueckfrage-Regel", host.nachgefragt === 1 && host.gesendet.length === 0);
  const host2 = machHost();
  await machEarSend(host2, "")("kannst du mir das Wetter sagen", 0.8);
  check("2e ohne Server-Text wird guter Web-Speech-Text gesendet", host2.gesendet.length === 1);
}
{
  // Ohr existiert gar nicht (z. B. Route tot) -> identisches Verhalten.
  const host = machHost();
  await machEarSend(host, "", { totesOhr: true })("kannst du mir das Wetter sagen", 0.8);
  check("2f ohne Ohr voller Web-Speech-Weg (Non-Regression)", host.gesendet.length === 1);
}
{
  // Waehrend der Wartezeit stummgeschaltet oder geschlossen -> nichts senden.
  const host = machHost();
  host.stumm = true;
  await machEarSend(host, "Wie ist das Wetter?")("wie ist das wetter", 0.9);
  check("2g Mute waehrend der Wartezeit sendet nichts", host.gesendet.length === 0 && host.nachgefragt === 0);
  const host2 = machHost();
  host2.aktiv = false;
  await machEarSend(host2, "Wie ist das Wetter?")("wie ist das wetter", 0.9);
  check("2h Schliessen waehrend der Wartezeit sendet nichts", host2.gesendet.length === 0);
}
{
  check("2i MIME-Wahl nimmt den ersten unterstuetzten Kandidaten",
    pickRecorderMime((typ) => typ === "audio/mp4") === "audio/mp4");
  check("2j ohne Unterstuetzung bleibt das Ohr aus", pickRecorderMime(() => false) === "");
}

// --- 3. Struktur: Verdrahtung bleibt stehen ----------------------------------
{
  const composer = readFileSync(new URL("../public/composer-tools.js", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../public/voice-landing.js", import.meta.url), "utf8");
  const bridge = readFileSync(new URL("../public/chat-bridge.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const config = readFileSync(new URL("../public/config.js", import.meta.url), "utf8");
  const datenschutz = readFileSync(new URL("../public/datenschutz.html", import.meta.url), "utf8");
  const privacy = readFileSync(new URL("../public/en/privacy.html", import.meta.url), "utf8");

  for (const [name, quelle] of [["composer-tools", composer], ["voice-landing", landing]]) {
    check(`3a ${name} importiert voice-ear.js`, quelle.includes('from "./voice-ear.js"'));
    check(`3b ${name} schliesst beide Erkennungs-Pfade ueber earSend ab`,
      (quelle.match(/earSend\(task, bestConfidence\)/g) || []).length === 2);
    check(`3c ${name} startet die Aufnahme beim Zuhoeren`, quelle.includes("serverEar.start()"));
    check(`3d ${name} verwirft die Aufnahme beim Aufraeumen`, (quelle.match(/serverEar\.cancel\(\)/g) || []).length >= 2);
  }
  check("3e Bridge fuehrt die Route und haelt sie hinter dem Rate-Gate",
    bridge.includes('"/api/voice/transcribe"') && bridge.includes('url.pathname === "/api/voice/transcribe") && !allowModelRequest'.replace('&& !allowModelRequest', '') )
    && /"\/api\/voice\/transcribe"\) return await handleVoiceTranscribe/.test(bridge)
    && /"\/api\/voice\/transcribe"\s*\)\s*&&\s*!allowModelRequest/.test(bridge.replace(/\n/g, " ")));
  check("3f Bridge meldet earConfigured im /health", bridge.includes("earConfigured: Boolean(GROQ_API_KEY)"));
  check("3g sw.js fuehrt voice-ear.js im Precache", sw.includes('"/assets/voice-ear.js"'));
  check("3h config.js kennt die Transkriptions-Route", config.includes("voiceTranscribe:"));
  check("3i Datenschutz DE nennt Groq im Sprachmodus", datenschutz.includes("Groq"));
  check("3j Datenschutz EN nennt Groq im Sprachmodus", privacy.includes("Groq"));
}

// --- 5. Vokabular-Hinweis (Freigabe 2026-08-03) ------------------------------
{
  const { EAR_PROMPT } = await import("../public/chat-bridge-voice-ear.js");
  check("5a Hinweis nennt den Eigennamen", EAR_PROMPT.includes("smejj.com"));
  check("5b Hinweis bleibt kurz (Halluzinations-Schutz)", EAR_PROMPT.length <= 60);
  check("5c Hinweis enthaelt keine Fuellsaetze/Satzzeichen ausser Komma",
    !/[.!?]/.test(EAR_PROMPT.replace(/smejj\.com/g, "")));

  let gesehen = null;
  await transcribeWithGroq(Buffer.from("x".repeat(2000)), {
    contentType: "audio/webm", apiKey: "k", baseUrl: "https://x",
    fetchFn: async (_u, init) => { gesehen = init.body.get("prompt"); return { ok: true, json: async () => ({ text: "ok" }) }; }
  });
  check("5d Hinweis reist standardmaessig mit", gesehen === EAR_PROMPT);

  let ohne = "nicht gesetzt";
  await transcribeWithGroq(Buffer.from("x".repeat(2000)), {
    contentType: "audio/webm", apiKey: "k", baseUrl: "https://x", prompt: "",
    fetchFn: async (_u, init) => { ohne = init.body.get("prompt"); return { ok: true, json: async () => ({ text: "ok" }) }; }
  });
  check("5e leerer Hinweis => Feld wird weggelassen", ohne === null);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);

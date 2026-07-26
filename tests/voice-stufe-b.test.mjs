// smejj.com — Logik-Tests fuer Stufe A2+B (Ausfall-Neuversuch, Premium-Stimme).
// Abgedeckt: fetchStreamWithRetry (Neuversuch bei Timeout/5xx, kein Neuversuch
// bei 4xx, Aufgeben nach attempts) und die pure WAV/PCM-Logik des Premium-
// Stimmen-Players. Standalone: node tests/voice-stufe-b.test.mjs
import { fetchStreamWithRetry } from "../public/ai/fetch-retry.js";
import { parseWavHeader, pcm16ToFloat32 } from "../public/voice-premium-tts.js";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`ok   ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}

const okResponse = () => ({ ok: true, status: 200, body: {} });
const brokenResponse = (status) => ({ ok: false, status, body: null });
const hangingFetch = (url, init) => new Promise((resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
});

// --- Teil 1: fetchStreamWithRetry ---------------------------------------------------

// 1a: Erster Versuch haengt (tote Replika) -> zweiter Versuch liefert die Antwort.
{
  let calls = 0;
  const fetchFn = (url, init) => {
    calls += 1;
    if (calls === 1) return hangingFetch(url, init);
    return Promise.resolve(okResponse());
  };
  const response = await fetchStreamWithRetry("https://x/api", {}, { fetchFn, firstByteTimeoutMs: 80, retryDelayMs: 10 });
  check("1a Timeout auf toter Replika -> Neuversuch liefert Antwort", response.ok === true && calls === 2);
}

// 1b: 5xx wird neu versucht.
{
  let calls = 0;
  const fetchFn = () => {
    calls += 1;
    return Promise.resolve(calls === 1 ? brokenResponse(503) : okResponse());
  };
  const response = await fetchStreamWithRetry("https://x/api", {}, { fetchFn, firstByteTimeoutMs: 80, retryDelayMs: 10 });
  check("1b 503 wird neu versucht", response.ok === true && calls === 2);
}

// 1c: 400 ist endgueltig — KEIN Neuversuch, Antwort wird durchgereicht.
{
  let calls = 0;
  const fetchFn = () => {
    calls += 1;
    return Promise.resolve(brokenResponse(400));
  };
  const response = await fetchStreamWithRetry("https://x/api", {}, { fetchFn, firstByteTimeoutMs: 80, retryDelayMs: 10 });
  check("1c 400 wird nicht wiederholt", response.status === 400 && calls === 1);
}

// 1d: Alle Versuche scheitern -> Fehler mit klarem Grund.
{
  let calls = 0;
  let error = null;
  try {
    await fetchStreamWithRetry("https://x/api", {}, {
      fetchFn: (url, init) => { calls += 1; return hangingFetch(url, init); },
      firstByteTimeoutMs: 60,
      retryDelayMs: 10
    });
  } catch (e) { error = e; }
  check("1d nach allen Versuchen klarer Fehler", calls === 2 && /bridge_unreachable/.test(error?.message || ""));
}

// 1e: onRetry meldet den Grund (Telemetrie/Anzeige).
{
  const reasons = [];
  const fetchFn = (() => {
    let calls = 0;
    return () => {
      calls += 1;
      return Promise.resolve(calls === 1 ? brokenResponse(502) : okResponse());
    };
  })();
  await fetchStreamWithRetry("https://x/api", {}, { fetchFn, firstByteTimeoutMs: 80, retryDelayMs: 10, onRetry: (info) => reasons.push(info.reason) });
  check("1e onRetry meldet HTTP-Grund", reasons.length === 1 && reasons[0] === "HTTP 502");
}

// --- Teil 1b: Zwei-Wege-Betrieb (Stufe C) --------------------------------------------

// 1f: Liste von Endpunkten — toter Hauptserver, Reserve antwortet.
{
  const ziele = [];
  const fetchFn = (url, init) => {
    ziele.push(url);
    if (url.includes("salad")) return hangingFetch(url, init);
    return Promise.resolve(okResponse());
  };
  const response = await fetchStreamWithRetry(["https://x.salad.cloud/api", "https://x.zeabur.app/api"], {}, { fetchFn, firstByteTimeoutMs: 80, retryDelayMs: 10 });
  check("1f toter Hauptserver -> Reserve-Endpunkt antwortet", response.ok === true && ziele.length === 2 && ziele[1].includes("zeabur"));
}

// 1g: Hauptserver gesund -> Reserve wird gar nicht angefasst.
{
  const ziele = [];
  const fetchFn = (url) => { ziele.push(url); return Promise.resolve(okResponse()); };
  await fetchStreamWithRetry(["https://x.salad.cloud/api", "https://x.zeabur.app/api"], {}, { fetchFn, firstByteTimeoutMs: 80, retryDelayMs: 10 });
  check("1g gesunder Hauptserver -> kein Reserve-Aufruf", ziele.length === 1 && ziele[0].includes("salad"));
}

// 1h: Einzel-URL (bisherige Aufrufe) funktioniert unveraendert.
{
  const fetchFn = () => Promise.resolve(okResponse());
  const response = await fetchStreamWithRetry("https://x/api", {}, { fetchFn });
  check("1h Einzel-URL bleibt kompatibel", response.ok === true);
}

// --- Teil 2: WAV/PCM-Logik der Premium-Stimme ---------------------------------------

function wavHeader({ sampleRate = 24000, channels = 1, bits = 16 } = {}) {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);  // RIFF
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);  // WAVE
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint16(34, bits, true);
  return bytes;
}

// 2a: Gueltiger Kopf wird gelesen.
{
  const header = parseWavHeader(wavHeader({ sampleRate: 24000 }));
  check("2a WAV-Kopf: Abtastrate erkannt", header?.sampleRate === 24000 && header.channels === 1 && header.bitsPerSample === 16);
}

// 2b: Unvollstaendiger oder fremder Kopf wird abgelehnt.
{
  check("2b zu kurzer Kopf -> null", parseWavHeader(new Uint8Array(10)) === null);
  const falsch = wavHeader();
  falsch[0] = 0x58;
  check("2c fremdes Format -> null", parseWavHeader(falsch) === null);
}

// 2d: PCM-Umwandlung: bekannte Werte + ungerader Restbyte-Uebertrag.
{
  const bytes = new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0xab]); // 0, +32767, -32768, Rest
  const { samples, rest } = pcm16ToFloat32(bytes);
  check("2d PCM: Werte korrekt", samples.length === 3
    && samples[0] === 0
    && Math.abs(samples[1] - 32767 / 32768) < 1e-6
    && samples[2] === -1);
  check("2e PCM: ungerades Restbyte bleibt uebrig", rest.length === 1 && rest[0] === 0xab);
}

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) process.exit(1);

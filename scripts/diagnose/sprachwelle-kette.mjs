#!/usr/bin/env node
// smejj.com — laeuft die Sprachwelle wirklich durch? Kette statt Vermutung.
//
// WARUM: Der Betreiber hat die Sprachwelle als "nur eine einfache Animation mit
// anschliessendem Text-to-Speech" beschrieben. Ob das stimmt, laesst sich nicht
// am Code ablesen — die Bausteine SIND gebaut (voice-realtime.js, voice-vad.js,
// voice-echo-filter.js, voice-speech-queue.js). Die Frage ist, an welcher
// Stelle die Kette reisst.
//
// Gemessen wird mit einem ECHTEN Mikrofon-Testsignal: Chrome liefert mit
// --use-fake-device-for-media-stream einen Ton und ueberspringt mit
// --use-fake-ui-for-media-stream die Erlaubnisfrage. Ohne diese Schalter
// haengt getUserMedia headless ewig, und man haelt eine gesunde Sprachwelle
// fuer kaputt.
//
// SECHS GLIEDER, einzeln geprueft:
//   1. Mikrofon    getUserMedia liefert eine Spur
//   2. Pegel       der Ton kommt als messbarer Pegel im WebAudio an
//   3. VAD         die Unterbrechungs-Erkennung schlaegt beim Ton an
//   4. Aufnahme    MediaRecorder liefert Daten
//   5. Ohr         die Transkriptions-Adressen antworten (401 = lebt)
//   6. Stimme      /api/voice/status meldet die Premium-Stimme
//
// Aufruf: node scripts/diagnose/sprachwelle-kette.mjs [--url https://smejj.com/]
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const args = process.argv.slice(2);
const flag = (name, vorgabe) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : vorgabe;
};
const URL_UNTER_TEST = flag("url", "https://smejj.com/");
const ALS_JSON = args.includes("--json");

const MESSUNG = `(async () => {
  const befund = {};
  // --- 1. Mikrofon ---------------------------------------------------------
  let strom = null;
  try {
    strom = await navigator.mediaDevices.getUserMedia({ audio: true });
    befund.mikrofon = { ok: true, spuren: strom.getAudioTracks().length };
  } catch (f) {
    befund.mikrofon = { ok: false, grund: String(f && f.name || f) };
    return befund;
  }

  // --- 2. Pegel ------------------------------------------------------------
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const quelle = ctx.createMediaStreamSource(strom);
    const analyse = ctx.createAnalyser();
    analyse.fftSize = 512;
    quelle.connect(analyse);
    const daten = new Uint8Array(analyse.frequencyBinCount);
    let hoechster = 0;
    for (let i = 0; i < 25; i += 1) {
      analyse.getByteTimeDomainData(daten);
      for (const wert of daten) hoechster = Math.max(hoechster, Math.abs(wert - 128) / 128);
      await new Promise((r) => setTimeout(r, 40));
    }
    befund.pegel = { ok: hoechster > 0.01, hoechster: Math.round(hoechster * 1000) / 1000 };
    ctx.close();
  } catch (f) {
    befund.pegel = { ok: false, grund: String(f && f.name || f) };
  }

  // --- 3. VAD (Unterbrechung) ---------------------------------------------
  try {
    const vad = await import("/assets/voice-vad.js");
    const bauer = vad.createSpeechInterrupt;
    befund.vad = { ok: typeof bauer === "function", exportiert: Object.keys(vad) };
  } catch (f) {
    befund.vad = { ok: false, grund: String(f && f.message || f).slice(0, 80) };
  }

  // --- 4. Aufnahme ---------------------------------------------------------
  try {
    const ear = await import("/assets/voice-ear.js");
    const typ = ear.pickRecorderMime ? ear.pickRecorderMime() : "";
    const rec = new MediaRecorder(strom, typ ? { mimeType: typ } : undefined);
    const stuecke = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) stuecke.push(e.data); };
    rec.start();
    await new Promise((r) => setTimeout(r, 900));
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    const gesamt = stuecke.reduce((s, t) => s + t.size, 0);
    befund.aufnahme = { ok: gesamt > 0, typ: typ || "(Vorgabe)", bytes: gesamt };
  } catch (f) {
    befund.aufnahme = { ok: false, grund: String(f && f.message || f).slice(0, 80) };
  }

  // --- 5. Ohr (beide Adressen) --------------------------------------------
  try {
    const cfg = await import("/assets/config.js");
    const ear = await import("/assets/voice-ear.js");
    const adressen = ear.ohrAdressen ? ear.ohrAdressen(cfg.CLIENT_ROUTES.api) : [cfg.CLIENT_ROUTES.api.voiceTranscribe];
    const wege = [];
    for (const a of adressen) {
      try {
        const r = await fetch(a, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: new Blob([]) });
        // 401 heisst "lebt, will eine Anmeldung" — nur 404/503 sind harte Ausfaelle.
        wege.push({ adresse: a.replace(/^https:\\/\\//, ""), status: r.status, lebt: r.status !== 404 && r.status !== 503 });
      } catch (f) {
        wege.push({ adresse: a.replace(/^https:\\/\\//, ""), fehler: String(f && f.name || f) });
      }
    }
    befund.ohr = { ok: wege.some((w) => w.lebt), adressen: wege.length, wege };
  } catch (f) {
    befund.ohr = { ok: false, grund: String(f && f.message || f).slice(0, 80) };
  }

  // --- 6. Stimme -----------------------------------------------------------
  try {
    const cfg = await import("/assets/config.js");
    const r = await fetch(cfg.CLIENT_ROUTES.api.voiceStatus, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    const d = await r.json().catch(() => ({}));
    befund.stimme = { ok: Boolean(d && (d.premiumVoice || d.stimme)), status: r.status, antwort: d };
  } catch (f) {
    befund.stimme = { ok: false, grund: String(f && f.message || f).slice(0, 80) };
  }

  strom.getTracks().forEach((t) => t.stop());
  return befund;
})()`;

async function auswerten(page, ausdruck) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, returnByValue: true, awaitPromise: true
  });
  if (exceptionDetails) {
    const e = exceptionDetails.exception || {};
    throw new Error(e.description || e.value || exceptionDetails.text || "Auswertung fehlgeschlagen");
  }
  return result.value;
}

const client = await launchChrome({
  extraArgs: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required"
  ]
});
let befund = {};
try {
  const page = await openPage(client);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Page.navigate", { url: URL_UNTER_TEST });
  // Warten, bis die Seite steht — feste Fristen messen mal den Anfang.
  for (let i = 0; i < 50; i += 1) {
    const stand = await auswerten(page, `(() => {
      try { return (location.origin && location.origin !== "null" && document.readyState !== "loading") ? "bereit" : "wartet"; }
      catch { return "gesperrt"; }
    })()`);
    if (stand === "bereit") break;
    await sleep(400);
  }
  await sleep(3000); // die Module kommen gestaffelt nach (afterFirstPaint)
  befund = await auswerten(page, MESSUNG);
} finally {
  await client.close();
}

if (ALS_JSON) {
  console.log(JSON.stringify({ url: URL_UNTER_TEST, ...befund }, null, 2));
} else {
  console.log(`Sprachwellen-Kette auf ${URL_UNTER_TEST}`);
  const zeile = (nr, name, wert) => {
    const zeichen = wert?.ok ? "OK  " : "REISST";
    const rest = Object.entries(wert || {}).filter(([k]) => k !== "ok")
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join("  ");
    console.log(`  ${nr}. ${name.padEnd(10)} ${zeichen}  ${rest}`);
  };
  zeile(1, "Mikrofon", befund.mikrofon);
  zeile(2, "Pegel", befund.pegel);
  zeile(3, "VAD", befund.vad);
  zeile(4, "Aufnahme", befund.aufnahme);
  zeile(5, "Ohr", befund.ohr);
  zeile(6, "Stimme", befund.stimme);
}
const glieder = ["mikrofon", "pegel", "vad", "aufnahme", "ohr", "stimme"];
const gerissen = glieder.filter((g) => !befund[g]?.ok);
if (gerissen.length) console.error(`\nGerissene Glieder: ${gerissen.join(", ")}`);
process.exit(gerissen.length === 0 ? 0 : 1);

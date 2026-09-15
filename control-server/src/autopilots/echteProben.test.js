// TUEV fuer die echten Mini-Proben (Master-Audit 2026-09-15): je Dienst eine
// KAPUTTE und eine GESUNDE Probe mit gestellten Antworten — ohne Netz.
//
// Der Anlass: Nr. 12, Nr. 80 und Nr. 03 waren gruen, solange /health antwortete.
// Eine Probe, die nur an gesunden Antworten getestet wurde, waere dieselbe
// Selbsttaeuschung eine Ebene tiefer.
import test from "node:test";
import assert from "node:assert/strict";
import {
  audioArt, bildArt, mausProbePlan, probeBild, probeFernBrowser, probeImTakt, probeMaus, probeStimme,
  piperAdresse, warteAufProbe, PROBE_ABSTAND_MS, NACHPROBE_ABSTAND_MS
} from "./echteProben.js";
import { laufMedienQualitaet, laufVoiceRegion } from "./dienstSondenAutopilot.js";
import { laufAgentenSonde } from "./agentenSondeAutopilot.js";
import { validatePlan } from "../../../workers/maus-engine/plan-validator.mjs";

function antwort(status, koerper, typ = "application/json") {
  const bytes = Buffer.isBuffer(koerper) ? koerper : Buffer.from(typeof koerper === "string" ? koerper : JSON.stringify(koerper));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n) => (n.toLowerCase() === "content-type" ? typ : null) },
    json: async () => JSON.parse(bytes.toString("utf8")),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
  };
}

function speicherMock() {
  const daten = new Map();
  return { daten, lies: async (id) => daten.get(id) || null, schreib: async (d) => { daten.set(d.id, d); return d; } };
}

function png(breite = 512, hoehe = 512, bytes = 43_000) {
  const b = Buffer.alloc(bytes, 7);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(breite, 16); b.writeUInt32BE(hoehe, 20);
  return b;
}

function wav({ rate = 22_050, sekunden = 0.8 } = {}) {
  const datenBytes = Math.round(rate * sekunden) * 2;
  const b = Buffer.alloc(44 + datenBytes);
  b.write("RIFF", 0, "latin1"); b.writeUInt32LE(36 + datenBytes, 4); b.write("WAVE", 8, "latin1");
  b.write("fmt ", 12, "latin1"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36, "latin1"); b.writeUInt32LE(datenBytes, 40);
  for (let i = 44; i + 1 < b.length; i += 2) b.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i);
  return b;
}

const DEMO_SEITE = "<!DOCTYPE html><html><head><title>Piper</title></head><body>" + "x".repeat(4000) + "</body></html>";

// ---------------------------------------------------------------- Bytes

test("Bytes: PNG/JPEG/WAV/OGG werden an den Magic-Bytes erkannt, HTML nicht", () => {
  assert.deepEqual(bildArt(png(64, 32, 100)), { format: "PNG", breite: 64, hoehe: 32 });
  assert.equal(bildArt(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).format, "JPEG");
  assert.equal(bildArt(Buffer.from(DEMO_SEITE)), null);
  const w = audioArt(wav({ rate: 22_050, sekunden: 0.8 }));
  assert.equal(w.format, "WAV");
  assert.equal(w.rate, 22_050);
  assert.ok(Math.abs(w.dauerS - 0.8) < 0.01, `Dauer ${w.dauerS}`);
  assert.equal(audioArt(Buffer.from("OggS\0\0\0\0")).format, "OGG");
  assert.equal(audioArt(Buffer.from(DEMO_SEITE)), null);
});

// ---------------------------------------------------------------- 1. Bild

test("Bild-Probe GESUND: echtes PNG kommt zurück, Maße und Größe in der Meldung, Schlüssel im Kopf", async () => {
  let kopf = null;
  const r = await probeBild({
    url: "http://bild.intern:8080/", schluessel: "k",
    fetchImpl: async (url, init) => { assert.equal(url, "http://bild.intern:8080/erzeuge"); kopf = init.headers; return antwort(200, { ok: true, format: "png", b64: png().toString("base64") }); }
  });
  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /^Bild erzeugt: 512×512 PNG 42 KB in \d+,?\d* s$/);
  assert.equal(kopf["x-smejj-key"], "k");
});

test("Bild-Probe KAPUTT: kein Bild-Kopf, Winzbild, Fehlerstatus, Zeitlimit sind rot; belegt ist 'nicht messbar'", async () => {
  const html = await probeBild({ url: "http://b", fetchImpl: async () => antwort(200, { ok: true, b64: Buffer.from(DEMO_SEITE).toString("base64") }) });
  assert.equal(html.ok, false);
  assert.match(html.text, /ohne Bild-Kopf/);
  const winzig = await probeBild({ url: "http://b", fetchImpl: async () => antwort(200, { ok: true, b64: png(8, 8, 200).toString("base64") }) });
  assert.equal(winzig.ok, false);
  assert.match(winzig.text, /nur 200 Bytes/);
  const leer = await probeBild({ url: "http://b", fetchImpl: async () => antwort(200, { ok: true }) });
  assert.equal(leer.ok, false);
  const kaputt = await probeBild({ url: "http://b", fetchImpl: async () => antwort(500, { ok: false, fehler: "RuntimeError" }) });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.text, /HTTP 500/);
  const zeit = await probeBild({ url: "http://b", timeoutMs: 170_000, fetchImpl: async () => { const f = new Error("t"); f.name = "TimeoutError"; throw f; } });
  assert.equal(zeit.ok, false);
  assert.match(zeit.text, /Zeitlimit 170 s/);
  const belegt = await probeBild({ url: "http://b", fetchImpl: async () => antwort(429, { ok: false, fehler: "beschaeftigt" }) });
  assert.deepEqual([belegt.ok, belegt.nichtMessbar], [true, true], "ein Nutzerbild ist keine Störung");
  const ohneSchluessel = await probeBild({ url: "http://b", fetchImpl: async () => antwort(401, { ok: false }) });
  assert.deepEqual([ohneSchluessel.ok, ohneSchluessel.nichtMessbar], [true, true]);
  assert.match(ohneSchluessel.text, /SMEJJ_BILDER_WORKER_KEY fehlt/);
  const falscherSchluessel = await probeBild({ url: "http://b", schluessel: "alt", fetchImpl: async () => antwort(401, { ok: false }) });
  assert.equal(falscherSchluessel.ok, false);
});

// ---------------------------------------------------------------- 3. Browser

test("Maus-Probe: der feste Plan ist nach dem echten Engine-Validator gültig", () => {
  const plan = mausProbePlan(new Date("2026-09-15T10:00:00Z"));
  const urteil = validatePlan(plan);
  assert.equal(urteil.ok, true, JSON.stringify(urteil.errors));
  assert.equal(plan.policy.budget.maxPlannerRoundtrips, 0, "kein Planer-Modell, keine Kosten");
});

test("Maus-Probe GESUND und KAPUTT", async () => {
  const konfig = { workerUrl: "https://maus.test", token: "t" };
  let kopf = null;
  const gesund = await probeMaus({ konfig, fetchImpl: async (url, init) => { assert.equal(url, "https://maus.test/run"); kopf = init.headers; return antwort(200, { ok: true, extracted: { h1: "Example Domain" } }); } });
  assert.equal(gesund.ok, true, gesund.text);
  assert.match(gesund.text, /Maus-Engine öffnete example\.com: „Example Domain“ in \d/);
  assert.equal(kopf.authorization, "Bearer t");
  const abbruch = await probeMaus({ konfig, fetchImpl: async () => antwort(200, { ok: false, failedStep: "laden", abortReason: "net::ERR_NAME_NOT_RESOLVED" }) });
  assert.equal(abbruch.ok, false);
  assert.match(abbruch.text, /bei laden/);
  const falscheSeite = await probeMaus({ konfig, fetchImpl: async () => antwort(200, { ok: true, extracted: { h1: "Access denied" } }) });
  assert.equal(falscheSeite.ok, false);
  const token = await probeMaus({ konfig, fetchImpl: async () => antwort(401, { ok: false, error: "nicht_autorisiert" }) });
  assert.equal(token.ok, false);
  assert.match(token.text, /Token/);
  const abgelehnt = await probeMaus({ konfig, fetchImpl: async () => antwort(422, { ok: false, rejected: true, errors: ["steps: kaputt"] }) });
  assert.equal(abgelehnt.ok, false);
  const belegt = await probeMaus({ konfig, fetchImpl: async () => antwort(429, { ok: false }) });
  assert.deepEqual([belegt.ok, belegt.nichtMessbar], [true, true]);
});

test("Fern-Browser-Probe GESUND und KAPUTT", async () => {
  const konfig = { workerUrl: "http://fern.intern", token: "t" };
  const foto = `data:image/jpeg;base64,${Buffer.alloc(30_000, 1).toString("base64")}`;
  const gesund = await probeFernBrowser({ konfig, fetchImpl: async (url) => { assert.equal(url, "http://fern.intern/render"); return antwort(200, { ok: true, title: "Example Domain", screenshot: foto }); } });
  assert.equal(gesund.ok, true, gesund.text);
  assert.match(gesund.text, /Fern-Browser öffnete example\.com: „Example Domain“, Foto 29 KB in \d/);
  const titel = await probeFernBrowser({ konfig, fetchImpl: async () => antwort(200, { ok: true, title: "example.com", screenshot: foto }) });
  assert.equal(titel.ok, false);
  const ohneFoto = await probeFernBrowser({ konfig, fetchImpl: async () => antwort(200, { ok: true, title: "Example Domain", screenshot: "" }) });
  assert.equal(ohneFoto.ok, false);
  const tot = await probeFernBrowser({ konfig, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(tot.ok, false);
  assert.match(tot.text, /ECONNREFUSED/);
});

// ---------------------------------------------------------------- 4. Stimme

test("Stimm-Probe GESUND: WAV mit Rate und Dauer; KAPUTT: Demo-Seite mit 200, Fehlerstatus, Winz-WAV", async () => {
  const gesund = await probeStimme({ url: "http://piper", fetchImpl: async (url, init) => { assert.equal(url, "http://piper/synthesize"); assert.match(init.body, /Guten Tag/); return antwort(200, wav(), "audio/wav"); } });
  assert.equal(gesund.ok, true, gesund.text);
  assert.match(gesund.text, /^Stimme erzeugt: WAV 22,1 kHz 0,8 s 34 KB in \d/);
  const demo = await probeStimme({ url: "http://piper", fetchImpl: async () => antwort(200, DEMO_SEITE, "text/html") });
  assert.equal(demo.ok, false, "Status 200 mit HTML ist KEINE Stimme");
  assert.match(demo.text, /text\/html ohne WAV\/OGG-Kopf/);
  const fehler = await probeStimme({ url: "http://piper", fetchImpl: async () => antwort(500, "boom", "text/plain") });
  assert.equal(fehler.ok, false);
  const winzig = await probeStimme({ url: "http://piper", fetchImpl: async () => antwort(200, wav({ sekunden: 0.01 }), "audio/wav") });
  assert.equal(winzig.ok, false);
  assert.equal(piperAdresse({}), "http://smejj-voice-piper.zeabur.internal:8080");
  assert.equal(piperAdresse({ SMEJJ_VOICE_PIPER_HOST: "piper.host" }), "http://piper.host:8080");
});

// ---------------------------------------------------------------- Takt

test("Takt: höchstens einmal je 22 h, Stand neustartfest, 'nicht messbar' nach 2 h neu, ohne Netz keine Probe", async () => {
  const ablage = speicherMock();
  let aufrufe = 0;
  const probe = async () => { aufrufe += 1; return { ok: true, text: "Bild erzeugt: 512×512 PNG 43 KB in 3,2 s" }; };
  const ohneNetz = await probeImTakt({ kennung: "t-takt", probe, ablage, mitNetz: false });
  assert.equal(aufrufe, 0);
  assert.equal(ohneNetz.ok, null);
  const erst = await probeImTakt({ kennung: "t-takt", probe, ablage });
  assert.equal(aufrufe, 1);
  assert.equal(erst.ok, true);
  assert.match(erst.text, /gerade gemessen/);
  const zweit = await probeImTakt({ kennung: "t-takt", probe, ablage });
  assert.equal(aufrufe, 1, "innerhalb von 22 h keine neue Probe");
  assert.match(zweit.text, /Bild erzeugt: .* \(vor 0 h\)/);
  await probeImTakt({ kennung: "t-takt", probe, ablage, jetztMs: Date.now() + PROBE_ABSTAND_MS + 60_000 });
  assert.equal(aufrufe, 2, "nach 22 h wieder fällig");

  const ablage2 = speicherMock();
  let versuche = 0;
  const belegt = async () => { versuche += 1; return { ok: true, nichtMessbar: true, text: "Bild nicht messbar: Maler beschäftigt" }; };
  await probeImTakt({ kennung: "t-nm", probe: belegt, ablage: ablage2 });
  await probeImTakt({ kennung: "t-nm", probe: belegt, ablage: ablage2, jetztMs: Date.now() + 60_000 });
  assert.equal(versuche, 1);
  await probeImTakt({ kennung: "t-nm", probe: belegt, ablage: ablage2, jetztMs: Date.now() + NACHPROBE_ABSTAND_MS + 60_000 });
  assert.equal(versuche, 2, "nicht messbar wird nach 2 h neu versucht");
});

test("Takt: eine lange Probe läuft im Hintergrund, der Takt meldet danach den abgelegten roten Stand", async () => {
  const ablage = speicherMock();
  let los;
  const langsam = () => new Promise((f) => { los = f; });
  const r = await probeImTakt({ kennung: "t-lang", probe: langsam, ablage, sofortMs: 5 });
  assert.equal(r.ok, null);
  assert.match(r.text, /Hintergrund/);
  const nochmal = await probeImTakt({ kennung: "t-lang", probe: async () => assert.fail("nie parallel"), ablage, sofortMs: 5 });
  assert.match(nochmal.text, /läuft gerade/);
  los({ ok: false, text: "Bild-Probe gescheitert: HTTP 500 nach 1,0 s" });
  await warteAufProbe("t-lang");
  const danach = await probeImTakt({ kennung: "t-lang", probe: langsam, ablage });
  assert.equal(danach.ok, false);
  assert.match(danach.text, /HTTP 500/);
});

// ---------------------------------------------------------------- Anschluss an die Autopiloten

test("Nr. 12 multimodal-engine: gemaltes Bild macht grün, kaputtes Bild macht ROT, Video bleibt ehrlich 'nur /health'", async () => {
  const leiter = (erzeuge) => async (url) => (url.endsWith("/health") ? antwort(200, { ok: true, bereit: true, engine: "parallax" }) : erzeuge());
  const gesund = await laufMedienQualitaet({ env: {}, mitProbe: true, ablage: speicherMock(), fetchImpl: leiter(() => antwort(200, { ok: true, b64: png().toString("base64") })) });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /Bild erzeugt: 512×512 PNG/);
  assert.match(gesund.meldung, /Video: nur \/health/);
  const kaputt = await laufMedienQualitaet({ env: {}, mitProbe: true, ablage: speicherMock(), fetchImpl: leiter(() => antwort(200, { ok: true, b64: Buffer.from(DEMO_SEITE).toString("base64") })) });
  assert.equal(kaputt.ok, false, "/health grün, aber kein Bild = ROT");
  const gemalt = [];
  await laufMedienQualitaet({ env: {}, mitProbe: true, ablage: speicherMock(), fetchImpl: async (url) => { gemalt.push(url); return antwort(200, { ok: true, bereit: false }); } });
  assert.ok(gemalt.every((u) => u.endsWith("/health")), "ein nicht bereiter Maler wird nicht beauftragt");
});

test("Nr. 80 agenten-sonde: beide Browser öffnen example.com; kaputte Probe ROT; laufender Nutzerauftrag wird nicht gestört", async () => {
  const env = {
    SMEJJ_MAUS_ENGINE_ENABLED: "YES", SMEJJ_MAUS_ENGINE_WORKER_URL: "https://maus.test", SMEJJ_MAUS_ENGINE_TOKEN: "t",
    SMEJJ_REMOTE_BROWSER_ENABLED: "YES", SMEJJ_REMOTE_BROWSER_WORKER_URL: "http://fern.intern", SMEJJ_REMOTE_BROWSER_TOKEN: "t"
  };
  const foto = `data:image/jpeg;base64,${Buffer.alloc(30_000, 1).toString("base64")}`;
  const neueAblagen = () => ({ "agenten-sonde-mausprobe": speicherMock(), "agenten-sonde-fernbrowserprobe": speicherMock() });
  const welt = ({ mausH1 = "Example Domain", running = false } = {}) => async (url) => {
    if (url.endsWith("/health")) return antwort(200, { ok: true, running, sitzungen: 0 });
    if (url.endsWith("/run")) return antwort(200, { ok: true, extracted: { h1: mausH1 } });
    return antwort(200, { ok: true, title: "Example Domain", screenshot: foto });
  };
  const gesund = await laufAgentenSonde({ env, mitProbe: true, ablagen: neueAblagen(), fetchImpl: welt() });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /Maus-Engine öffnete example\.com/);
  assert.match(gesund.meldung, /Fern-Browser öffnete example\.com/);
  const kaputt = await laufAgentenSonde({ env, mitProbe: true, ablagen: neueAblagen(), fetchImpl: welt({ mausH1: "" }) });
  assert.equal(kaputt.ok, false, "/health grün, aber Seite nicht gelesen = ROT");
  const beauftragt = [];
  const belegt = await laufAgentenSonde({ env, mitProbe: true, ablagen: neueAblagen(), fetchImpl: async (url) => { beauftragt.push(url); return welt({ running: true })(url); } });
  assert.match(belegt.meldung, /Probe verschoben/);
  assert.ok(!beauftragt.some((u) => u.endsWith("/run")), "kein Probeauftrag neben einem Nutzerauftrag");
});

test("Nr. 03 voice-region-check: Piper spricht = grün; Demo-Seite statt Ton = ROT, auch bei freigeschalteter Stimme", async () => {
  const welt = (ton) => async (url) => (url.endsWith("/api/voice/status") ? antwort(200, { ok: true, premiumVoice: true }) : ton());
  const gesund = await laufVoiceRegion({ env: { SMEJJ_VOICE_PIPER_URL: "http://piper" }, mitProbe: true, ablage: speicherMock(), fetchImpl: welt(() => antwort(200, wav(), "audio/wav")) });
  assert.equal(gesund.ok, true, gesund.meldung);
  assert.match(gesund.meldung, /premiumVoice aktiv.*Stimme erzeugt: WAV/);
  const kaputt = await laufVoiceRegion({ env: { SMEJJ_VOICE_PIPER_URL: "http://piper" }, mitProbe: true, ablage: speicherMock(), fetchImpl: welt(() => antwort(200, DEMO_SEITE, "text/html")) });
  assert.equal(kaputt.ok, false);
  assert.match(kaputt.meldung, /Stimm-Probe gescheitert/);
});

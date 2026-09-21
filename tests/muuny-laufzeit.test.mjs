// muuny Laufzeit — Teil 4 (Owner-Auftrag 21.09.2026).
//
// Echte HTTP-Verbindungen gegen einen nachgebauten, absichtlich LANGSAMEN
// llama-server. Nur so laesst sich beweisen, dass Kopfzeilen und Kommentarzeilen
// wirklich VOR der Antwort ankommen und dass nie zwei Rechnungen gleichzeitig laufen.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Warteschlange } from "../workers/smejj-hausmodell/warteschlange.js";
import { FreigabeWaechter, GRUNDMODELL } from "../workers/muuny-laufzeit/freigabe.js";
import { baueBehandlung, kuerzeAnfrage, SYSTEM_KURZ, umschreiben } from "../workers/muuny-laufzeit/laufzeit.js";
import { startArgumente, WacherMotor, ZUSTAND } from "../workers/muuny-laufzeit/motor.js";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const still = { log() {}, warn() {}, error() {} };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Nachgebauter llama-server ------------------------------------------------
function falscherLlama({ verzoegerungMs = 300, gesund = () => true } = {}) {
  const stats = { gleichzeitig: 0, maxGleichzeitig: 0, anfragen: [] };
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") { res.writeHead(gesund() ? 200 : 503); return res.end(); }
    let t = ""; for await (const c of req) t += c;
    const body = JSON.parse(t);
    stats.anfragen.push(body);
    stats.gleichzeitig += 1; stats.maxGleichzeitig = Math.max(stats.maxGleichzeitig, stats.gleichzeitig);
    await warte(verzoegerungMs);
    stats.gleichzeitig -= 1;
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const wort of ["Hallo", " Welt"]) res.write(`data: ${JSON.stringify({ model: "fremd.gguf", choices: [{ delta: { content: wort } }] })}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model: "fremd.gguf", choices: [{ message: { role: "assistant", content: "Hallo Welt" } }] }));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, stats, hafen: server.address().port })));
}

async function dienst({ llama, bereit = true, version = "muuny-1.12", schlange, pulsMs = 50, wissen = null }) {
  const motor = { zustand: bereit ? "bereit" : "startet", basisUrl: `http://127.0.0.1:${llama.hafen}`, letzterFehler: null, bericht: () => ({}) };
  const waechter = { aktuell: bereit ? { version } : null, letzterGrund: bereit ? null : "grundmodell_gguf_fehlt",
    anwendenWennFrei: async () => ({}), bericht: () => ({}) };
  const behandle = baueBehandlung({ schluessel: "test-schluessel", motor, waechter,
    schlange: schlange || new Warteschlange({ deckel: 1, maxWartend: 8, wartefristMs: 5000, protokoll: still }), pulsMs, wissen });
  const server = http.createServer((req, res) => behandle(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const frage = (stream) => JSON.stringify({ messages: [{ role: "user", content: "Sag hallo" }], stream });
const auth = { authorization: "Bearer test-schluessel", "content-type": "application/json" };

/** Liest eine Antwort und merkt sich, WANN welcher Teil kam. */
async function mitZeiten(antwort) {
  const leser = antwort.body.getReader(); const d = new TextDecoder();
  const teile = []; const t0 = Date.now();
  for (;;) { const { value, done } = await leser.read(); if (done) break; teile.push({ ms: Date.now() - t0, text: d.decode(value) }); }
  return teile;
}

// --- Motor --------------------------------------------------------------------
test("Motor: genau ein Rechenplatz, Adapter nur wenn einer da ist, kein Start ohne Modell", () => {
  const ohne = startArgumente({ modellPfad: "/m.gguf", hafen: 8081 });
  assert.ok(ohne.includes("--parallel") && ohne[ohne.indexOf("--parallel") + 1] === "1");
  assert.equal(ohne.includes("--lora"), false);
  const mit = startArgumente({ modellPfad: "/m.gguf", adapterPfad: "/a.gguf", hafen: 8081, kontext: 4096 });
  assert.equal(mit[mit.indexOf("--lora") + 1], "/a.gguf");
  assert.equal(mit[mit.indexOf("-c") + 1], "4096");
  assert.throws(() => startArgumente({ hafen: 1 }));
});

test("Motor: bereit erst, wenn llama-server wirklich antwortet — und ein toter Prozess wird bemerkt", async () => {
  let gesund = false;
  const llama = await falscherLlama({ gesund: () => gesund });
  const kinder = [];
  const spawn = () => { const k = { handler: {}, on(e, f) { this.handler[e] = f; }, once(e, f) { this.handler[e] = f; }, kill() { this.handler.exit?.(0); } }; kinder.push(k); return k; };
  const motor = new WacherMotor({ hafen: llama.hafen, spawn, startFristMs: 2000, protokoll: still });
  setTimeout(() => { gesund = true; }, 400); // "laedt" erst eine Weile
  assert.equal(await motor.starte({ modellPfad: "/m.gguf", adapterPfad: null, version: "v" }), true);
  assert.equal(motor.zustand, ZUSTAND.BEREIT);
  kinder[0].handler.exit(137);
  assert.equal(motor.zustand, ZUSTAND.GESTORBEN, "ein abgestuerzter Prozess darf nicht als bereit gelten");
  llama.server.close();
});

test("Motor: startet er nicht innerhalb der Frist, gilt er als gestorben — nicht als bereit", async () => {
  const llama = await falscherLlama({ gesund: () => false });
  const spawn = () => ({ on() {}, once(e, f) { f(); }, kill() {} });
  const motor = new WacherMotor({ hafen: llama.hafen, spawn, startFristMs: 600, protokoll: still });
  assert.equal(await motor.starte({ modellPfad: "/m.gguf" }), false);
  assert.equal(motor.zustand, ZUSTAND.GESTORBEN);
  llama.server.close();
});

test("Wach halten: steht der Motor, wird er ueber den Waechter neu gestartet — sonst nie", async () => {
  let gesund = true; let neustarts = 0;
  const llama = await falscherLlama({ gesund: () => gesund });
  const motor = new WacherMotor({ hafen: llama.hafen, spawn: () => ({ on() {}, once() {}, kill() {} }), protokoll: still });
  motor.stand = { modellPfad: "/m" }; motor.zustand = ZUSTAND.BEREIT;
  const stop = motor.wachHalten({ intervallMs: 40, neustart: async () => { neustarts += 1; } });
  await warte(150);
  assert.equal(neustarts, 0, "ein gesunder Motor wird nicht angefasst — und NIE im Leerlauf entladen");
  gesund = false; await warte(150);
  assert.ok(neustarts >= 1);
  stop(); llama.server.close();
});

// --- Freigabe-Waechter ----------------------------------------------------------
async function waechterAufbau({ freigabe, grund = true, ladeFehler = null } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "muuny-laufzeit-"));
  const dateien = { "muuny/base-gguf/basis.gguf": Buffer.from("GRUNDMODELL-BYTES"), "muuny/versions/muuny-1.12/adapter-gguf/a.gguf": Buffer.from("ADAPTER-1-12") };
  const beschreibe = (k) => ({ datei: path.basename(k), sha256: sha(dateien[k]), sizeBytes: dateien[k].length, ablageort: path.dirname(k) });
  const objekte = {
    "muuny/grundmodell/gguf.json": grund ? beschreibe("muuny/base-gguf/basis.gguf") : undefined,
    "muuny/freigabe.json": freigabe === undefined ? { modell: "Qwen/Qwen3.8-27B", version: "muuny-1.12", punktzahl: 0.93,
      adapter: beschreibe("muuny/versions/muuny-1.12/adapter-gguf/a.gguf"), am: "2026-09-21" } : freigabe
  };
  let geladen = 0;
  const e2 = {
    liesJson: async (k) => { const v = objekte[k]; if (v instanceof Error) throw v; return v ?? null; },
    ladeInDatei: async (k, ziel) => {
      geladen += 1;
      const b = ladeFehler?.(k) ?? dateien[k];
      await writeFile(ziel, b);
      return { bytes: b.length, sha256: sha(b) };
    }
  };
  const starts = [];
  let startOk = true;
  const motor = { starte: async (s) => { starts.push(s); return startOk; } };
  let beschaeftigt = false;
  const w = new FreigabeWaechter({ e2, freigabeSchluessel: "muuny/freigabe.json", grundmodellSchluessel: "muuny/grundmodell/gguf.json",
    cacheVerzeichnis: dir, motor, istBeschaeftigt: () => beschaeftigt, protokoll: still });
  return { w, objekte, dateien, beschreibe, starts, dir, geladen: () => geladen,
    setBeschaeftigt: (b) => { beschaeftigt = b; }, setStartOk: (b) => { startOk = b; } };
}

test("Freigabe gueltig: Adapter geholt, per sha256 bewiesen, Motor mit --lora gestartet", async () => {
  const a = await waechterAufbau();
  const r = await a.w.pruefe();
  assert.deepEqual(r, { geaendert: true, version: "muuny-1.12" });
  assert.equal(a.starts.length, 1);
  assert.ok(a.starts[0].adapterPfad.endsWith("a.gguf"));
  assert.equal((await readFile(a.starts[0].adapterPfad)).toString(), "ADAPTER-1-12");
  assert.equal((await a.w.pruefe()).geaendert, false, "gleicher Stand -> kein unnoetiger Neustart");
  assert.equal(a.starts.length, 1);
  await rm(a.dir, { recursive: true });
});

test("Keine Freigabe (geloescht) = Grundmodell. Loeschen ist der Rueckweg ohne Deploy", async () => {
  const a = await waechterAufbau();
  await a.w.pruefe();
  delete a.objekte["muuny/freigabe.json"];
  const r = await a.w.pruefe();
  assert.equal(r.version, GRUNDMODELL);
  assert.equal(a.starts.at(-1).adapterPfad, null);
  await rm(a.dir, { recursive: true });
});

test("KAPUTT: halbe Adapterangabe wird ignoriert — der bisherige Stand bleibt", async () => {
  const a = await waechterAufbau();
  await a.w.pruefe(); // laeuft mit 1.12
  a.objekte["muuny/freigabe.json"] = { modell: "Q", version: "muuny-1.13", punktzahl: 0.95,
    adapter: { datei: "b.gguf", sizeBytes: 5, ablageort: "muuny/x" } }; // sha256 fehlt
  const r = await a.w.pruefe();
  assert.equal(r.geaendert, false);
  assert.match(r.grund, /freigabe_ignoriert:adapter_unvollstaendig/);
  assert.equal(a.w.aktuell.version, "muuny-1.12", "ein falscher Adapter ist schlimmer als keiner");
  assert.equal(a.starts.length, 1);
  await rm(a.dir, { recursive: true });
});

test("KAPUTT: unlesbare Freigabe ist KEINE Loeschung — nichts aendern", async () => {
  const a = await waechterAufbau();
  await a.w.pruefe();
  a.objekte["muuny/freigabe.json"] = new Error("e2 antwortet 503");
  const r = await a.w.pruefe();
  assert.equal(r.geaendert, false);
  assert.match(r.grund, /freigabe_unlesbar/);
  assert.equal(a.w.aktuell.version, "muuny-1.12", "sonst wuerde jeder e2-Aussetzer auf das Grundmodell zurueckfallen");
  await rm(a.dir, { recursive: true });
});

test("KAPUTT: Pruefsumme passt nicht -> Datei verworfen, nichts geladen", async () => {
  const a = await waechterAufbau({ ladeFehler: (k) => (k.endsWith("a.gguf") ? Buffer.from("ADAPTER-1-1X") : null) });
  const r = await a.w.pruefe();
  assert.equal(r.geaendert, false);
  assert.match(r.grund, /pruefung_fehlgeschlagen:a\.gguf/);
  assert.equal(a.starts.length, 0);
  await rm(a.dir, { recursive: true });
});

test("KAPUTT: gleich grosse, aber veraenderte Datei im Zwischenspeicher wird erkannt", async () => {
  const a = await waechterAufbau();
  await a.w.pruefe();
  const pfad = a.starts[0].adapterPfad;
  await writeFile(pfad, "ADAPTER-9-99"); // gleiche Laenge, anderer Inhalt
  assert.equal((await stat(pfad)).size, a.dateien["muuny/versions/muuny-1.12/adapter-gguf/a.gguf"].length);
  const vorher = a.geladen();
  // Neustart (Motor stand still): der Waechter beweist erneut und holt frisch.
  await a.w.neustart();
  assert.ok(a.geladen() > vorher, "die Groesse allein haette die Veraenderung nicht bemerkt");
  assert.equal((await readFile(a.w.aktuell.adapterPfad)).toString(), "ADAPTER-1-12");
  await rm(a.dir, { recursive: true });
});

test("Wechsel NUR, wenn gerade niemand rechnet", async () => {
  const a = await waechterAufbau();
  a.setBeschaeftigt(true);
  const r = await a.w.pruefe();
  assert.equal(r.wartet, true);
  assert.equal(a.starts.length, 0, "mitten in einer Antwort das Modell zu tauschen, zerreisst sie");
  assert.equal(a.w.bericht().ausstehend, "muuny-1.12");
  a.setBeschaeftigt(false);
  assert.equal((await a.w.anwendenWennFrei()).version, "muuny-1.12");
  await rm(a.dir, { recursive: true });
});

test("Ohne Grundmodell-GGUF ist die Laufzeit nicht bereit — und sagt warum", async () => {
  const a = await waechterAufbau({ grund: false });
  const r = await a.w.pruefe();
  assert.equal(r.grund, "grundmodell_gguf_fehlt");
  assert.equal(a.w.aktuell, null);
  await rm(a.dir, { recursive: true });
});

test("Startet der Motor mit dem Adapter nicht, laeuft lieber das Grundmodell als gar nichts", async () => {
  const a = await waechterAufbau();
  let n = 0;
  a.w.motor = { starte: async (s) => { a.starts.push(s); n += 1; return n > 1; } };
  const r = await a.w.pruefe();
  assert.equal(r.geaendert, false);
  assert.equal(a.w.aktuell.version, GRUNDMODELL);
  assert.equal(a.w.aktuell.adapterPfad, null);
  await rm(a.dir, { recursive: true });
});

// --- Anfragen ----------------------------------------------------------------
test("Kurze Systemrolle + nur die letzte Frage, keine Werkzeuge, Antwortlaenge begrenzt", () => {
  const k = kuerzeAnfrage({ messages: [{ role: "system", content: "x".repeat(20000) }, { role: "user", content: "alt" },
    { role: "assistant", content: "a" }, { role: "user", content: [{ type: "text", text: "neue Frage" }] }],
    tools: [{ type: "function" }], max_tokens: 99999, stream: true });
  assert.deepEqual(k.messages, [{ role: "system", content: SYSTEM_KURZ }, { role: "user", content: "neue Frage" }]);
  assert.equal(k.max_tokens, 512);
  assert.equal(k.tools, undefined);
  assert.equal(kuerzeAnfrage({ messages: [] }).fehler, "keine_frage");
});

test("Ohne Schluessel nur /health; /health sagt, welches Modell laeuft", async () => {
  const llama = await falscherLlama();
  const d = await dienst({ llama });
  const h = await (await fetch(`${d.url}/health`)).json();
  assert.equal(h.bereit, true);
  assert.equal(h.modell, "muuny-1.12");
  assert.equal((await fetch(`${d.url}/v1/chat/completions`, { method: "POST", body: frage(false) })).status, 401);
  assert.equal((await fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: { authorization: "Bearer falsch" }, body: frage(false) })).status, 401);
  d.server.close(); llama.server.close();
});

test("Nicht bereit: ehrliche 503 mit Grund — keine haengende Anfrage", async () => {
  const llama = await falscherLlama();
  const d = await dienst({ llama, bereit: false });
  const r = await fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(false) });
  assert.equal(r.status, 503);
  const j = await r.json();
  assert.equal(j.error.message, "modell_nicht_bereit");
  assert.equal(j.error.grund, "grundmodell_gguf_fehlt");
  assert.equal(llama.stats.anfragen.length, 0);
  d.server.close(); llama.server.close();
});

test("Stream: Kopfzeilen und Kommentarzeilen SOFORT, dann die Antwort — mit dem echten Modellnamen", async () => {
  const llama = await falscherLlama({ verzoegerungMs: 400 });
  const d = await dienst({ llama, pulsMs: 50 });
  const t0 = Date.now();
  const r = await fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(true) });
  const kopfMs = Date.now() - t0;
  assert.ok(kopfMs < 200, `Kopfzeilen kamen erst nach ${kopfMs} ms — Fristen laufen ab`);
  assert.equal(r.headers.get("x-muuny-modell"), "muuny-1.12");
  const teile = await mitZeiten(r);
  const erstesWarten = teile.find((t) => t.text.includes(": warten"));
  const ersteDaten = teile.find((t) => t.text.includes("data: {"));
  assert.ok(erstesWarten && erstesWarten.ms < ersteDaten.ms, "die Leitung muss VOR der Antwort offengehalten werden");
  const alles = teile.map((t) => t.text).join("");
  assert.ok(alles.includes('"model":"muuny-1.12"'), "die Antwort muss ausweisen, welches Modell geantwortet hat");
  assert.ok(!alles.includes("fremd.gguf"));
  assert.ok(alles.trimEnd().endsWith("data: [DONE]"));
  d.server.close(); llama.server.close();
});

test("Ohne Stream: Leerzeilen halten offen, danach gueltiges JSON mit Modellname", async () => {
  const llama = await falscherLlama({ verzoegerungMs: 300 });
  const d = await dienst({ llama, pulsMs: 50 });
  const r = await fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(false) });
  const roh = await r.text();
  assert.ok(roh.startsWith("\n"), "fuehrender Leerraum haelt die Leitung offen");
  const j = JSON.parse(roh);
  assert.equal(j.model, "muuny-1.12");
  assert.equal(j.choices[0].message.content, "Hallo Welt");
  assert.equal(llama.stats.anfragen[0].messages[0].content, SYSTEM_KURZ);
  d.server.close(); llama.server.close();
});

test("Deckel 1: drei gleichzeitige Fragen, das Modell rechnet nie zwei zugleich", async () => {
  const llama = await falscherLlama({ verzoegerungMs: 150 });
  const d = await dienst({ llama });
  const rs = await Promise.all([1, 2, 3].map(() => fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(false) }).then((r) => r.text())));
  assert.equal(rs.length, 3);
  assert.equal(llama.stats.maxGleichzeitig, 1);
  assert.equal(llama.stats.anfragen.length, 3);
  d.server.close(); llama.server.close();
});

test("Wer zu lange wartet, bekommt eine ehrliche Absage", async () => {
  const llama = await falscherLlama({ verzoegerungMs: 600 });
  const schlange = new Warteschlange({ deckel: 1, maxWartend: 8, wartefristMs: 150, protokoll: still });
  const d = await dienst({ llama, schlange });
  const [erste, zweite] = await Promise.all([1, 2].map(() => fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(false) }).then((r) => r.text())));
  const ergebnisse = [JSON.parse(erste), JSON.parse(zweite)];
  assert.ok(ergebnisse.some((j) => j.choices), "eine wird beantwortet");
  const absage = ergebnisse.find((j) => j.error);
  assert.equal(absage.error.message, "besetzt:wartefrist_abgelaufen");
  assert.equal(llama.stats.anfragen.length, 1, "die abgesagte Frage hat das Modell nie erreicht");
  d.server.close(); llama.server.close();
});

test("SSE: nur die Datenzeilen bekommen den Modellnamen, [DONE] bleibt unberuehrt", () => {
  assert.equal(umschreiben('data: {"model":"x","a":1}', "muuny-1.12"), 'data: {"model":"muuny-1.12","a":1}');
  assert.equal(umschreiben("data: [DONE]", "v"), "data: [DONE]");
  assert.equal(umschreiben(": warten", "v"), ": warten");
});

// --- Wissen von muuny ai radar -------------------------------------------------
test("Radar-Wissen: landet im Systemprompt, gezaehlt wird nur echte Verwendung, ein langsames Radar blockiert nichts", async () => {
  const llama = await falscherLlama({ verzoegerungMs: 10 });
  const gemeldet = [];
  const treffer = [{ id: "0123456789abcdef", titel: "Hallo Welt 2.0", kurz: "x", link: "https://a.example/hw", unsicherheit: { stufe: "niedrig", gruende: [] } }];
  const wissen = { suche: async () => ({ block: "[W1] Hallo Welt 2.0 — Quelle: https://a.example/hw", treffer }), melde: async (v) => { gemeldet.push(...v); } };
  const d = await dienst({ llama, wissen });
  try {
    const r = await fetch(`${d.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(false) });
    assert.equal(r.headers.get("x-muuny-wissen"), "1");
    await r.text();
    assert.match(llama.stats.anfragen.at(-1).messages[0].content, /\[W1\] Hallo Welt 2\.0/);
    await warte(20);
    // Das falsche Modell antwortet "Hallo Welt" OHNE [W1]: gefunden ja, verwendet nein.
    assert.equal(gemeldet.length, 0);
  } finally { d.server.close(); }

  const langsam = { suche: () => new Promise(() => {}), melde: async () => {} };
  const d2 = await dienst({ llama, wissen: langsam });
  try {
    const t0 = Date.now();
    const r = await fetch(`${d2.url}/v1/chat/completions`, { method: "POST", headers: auth, body: frage(false) });
    await r.text();
    assert.equal(r.headers.get("x-muuny-wissen"), "0");
    assert.ok(Date.now() - t0 < 3000, "Frist greift");
    assert.equal(llama.stats.anfragen.at(-1).messages[0].content, SYSTEM_KURZ);
  } finally { d2.server.close(); llama.server.close(); }
});

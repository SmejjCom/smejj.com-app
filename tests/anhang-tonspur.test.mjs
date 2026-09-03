// smejj.com — Tonspur transkribieren: reine Bausteine + Ablauf mit Fake-Decoder und Fake-Ohr.
// Ausfuehren: node --test tests/anhang-tonspur.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { monoAufRate, wavAus, stuecke, transkriptAus, transkribiereTonspur, STUECK_SEKUNDEN } from "../public/anhang-tonspur.js";

test("monoAufRate: zwei Kanaele werden gemittelt und 48 kHz -> 16 kHz gedrittelt", () => {
  const l = new Float32Array(480).fill(1), r = new Float32Array(480).fill(0);
  const aus = monoAufRate([l, r], 48000);
  assert.equal(aus.length, 160);
  assert.ok(Math.abs(aus[10] - 0.5) < 1e-6);
  assert.equal(monoAufRate([], 48000).length, 0);
});

test("wavAus: gueltiger 16-Bit-Mono-Kopf, Laenge stimmt", () => {
  const w = wavAus(new Float32Array([0, 1, -1]), 16000);
  const v = new DataView(w);
  assert.equal(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), "RIFF");
  assert.equal(v.getUint16(22, true), 1, "mono");
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(40, true), 6);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
  assert.equal(w.byteLength, 44 + 6);
});

test("stuecke: 150 s werden zu 60+60+30 s", () => {
  const s = stuecke(new Float32Array(16000 * 150));
  assert.deepEqual(s.map((x) => x.length / 16000), [60, 60, 30]);
});

test("transkriptAus: Zeitmarken je Stueck, leere Stuecke fallen weg, Kappung", () => {
  assert.equal(transkriptAus(["Hallo", "", "Ende"]), "[00:00] Hallo\n[02:00] Ende");
  assert.equal(STUECK_SEKUNDEN, 60);
  assert.ok(transkriptAus(["x".repeat(500)], 60, 100).endsWith("… [gekuerzt]"));
});

test("transkribiereTonspur: Fake-Decoder + Fake-Ohr -> zwei Stuecke, Bearer-Header, Transkript mit Zeitmarken", async () => {
  const aufrufe = [];
  const fetchImpl = async (url, init) => { aufrufe.push({ url, ct: init.headers["Content-Type"], groesse: init.body.size }); return { ok: true, status: 200, json: async () => ({ text: `Stueck ${aufrufe.length}` }) }; };
  const decode = async () => ({ kanaele: [new Float32Array(16000 * 90)], rate: 16000 });
  const fortschritt = [];
  const r = await transkribiereTonspur({ name: "a.mov" }, { url: "https://ohr/api/voice/transcribe", fetchImpl, decode, aufFortschritt: (f, g) => fortschritt.push(`${f}/${g}`) });
  assert.equal(r.ok, true);
  assert.equal(r.stuecke, 2);
  assert.equal(r.sekunden, 90);
  assert.equal(aufrufe.length, 2);
  assert.equal(aufrufe[0].ct, "audio/wav");
  assert.equal(aufrufe[0].groesse, 44 + 16000 * 60 * 2, "60-s-Stueck als WAV");
  assert.equal(r.text, "[00:00] Stueck 1\n[01:00] Stueck 2");
  assert.deepEqual(fortschritt, ["0/2", "1/2", "2/2"]);
});

test("transkribiereTonspur: zu lang, Format nicht lesbar, Ohr 503 und 401 werden sauber gemeldet", async () => {
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ text: "x" }) });
  const lang = await transkribiereTonspur({ name: "l.mp4" }, { url: "u", fetchImpl: ok, decode: async () => ({ kanaele: [new Float32Array(16000 * 60 * 16)], rate: 16000 }) });
  assert.equal(lang.grund, "zu_lang");
  const kaputt = await transkribiereTonspur({ name: "k.mov" }, { url: "u", fetchImpl: ok, decode: async () => { throw new Error("EncodingError"); } });
  assert.match(kaputt.grund, /^format_nicht_lesbar/);
  const dreiNullDrei = await transkribiereTonspur({ name: "a.mp3" }, { url: "u", fetchImpl: async () => ({ ok: false, status: 503 }), decode: async () => ({ kanaele: [new Float32Array(16000 * 5)], rate: 16000 }) });
  assert.equal(dreiNullDrei.grund, "ohr_503");
  const anmeldung = await transkribiereTonspur({ name: "a.mp3" }, { url: "u", fetchImpl: async () => ({ ok: false, status: 401 }), decode: async () => ({ kanaele: [new Float32Array(16000 * 5)], rate: 16000 }) });
  assert.equal(anmeldung.grund, "nicht_angemeldet");
});

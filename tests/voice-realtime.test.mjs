// smejj.com — Sprachwelle LIVE (Browser-Seite): reine Bausteine + Fail-safe der Sitzung.
// Ausfuehren: node --test tests/voice-realtime.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  createRealtimeAudioSession, rechneAufSechzehnKhz, pcmZuFloat, createWiedergabe, verdrahteLive
} from "../public/voice-realtime.js";

test("createRealtimeAudioSession: erzeugt gueltige Session mit Steuerung", () => {
  const session = createRealtimeAudioSession();
  assert.equal(typeof session.start, "function");
  assert.equal(typeof session.stop, "function");
  assert.equal(typeof session.setMuted, "function");
  assert.equal(session.isActive(), false);
  assert.equal(session.isReady(), false);
});

test("createRealtimeAudioSession: ohne Browser-Audio loest start() false und raeumt auf (kein Haenger)", async () => {
  const fehler = [];
  const geschlossen = [];
  const session = createRealtimeAudioSession({ onError: (e) => fehler.push(String(e?.message || e)), onClose: (g) => geschlossen.push(g) });
  const an = await session.start();
  assert.equal(an, false);
  assert.equal(session.isActive(), false);
  assert.equal(fehler.length, 1);
  assert.deepEqual(geschlossen, ["start_failed"]);
  session.stop();
  assert.equal(session.isActive(), false);
});

test("rechneAufSechzehnKhz: 48 kHz -> 16 kHz drittelt die Laenge und klemmt auf Int16", () => {
  const eingang = new Float32Array(480).fill(0.5);
  eingang[0] = 2; eingang[1] = -2; eingang[2] = 2;
  const aus = rechneAufSechzehnKhz(eingang, 48000);
  assert.equal(aus.length, 160);
  assert.ok(aus[0] <= 0x7fff && aus[0] >= -0x8000);
  assert.ok(Math.abs(aus[5] - 0.5 * 0x7fff) < 2, "Mittelwert bleibt 0,5");
  assert.equal(rechneAufSechzehnKhz(new Float32Array(0), 48000).length, 0);
  assert.equal(rechneAufSechzehnKhz(new Float32Array([1, -1]), 16000).length, 2);
});

test("pcmZuFloat: Int16 -> Float32, ungerade Restbytes werden verworfen", () => {
  const puffer = new ArrayBuffer(5);
  new DataView(puffer).setInt16(0, 0x4000, true);
  new DataView(puffer).setInt16(2, -0x8000, true);
  const aus = pcmZuFloat(puffer);
  assert.equal(aus.length, 2);
  assert.ok(Math.abs(aus[0] - 0.5) < 1e-6);
  assert.equal(aus[1], -1);
});

function fakeCtx() {
  const ctx = { currentTime: 1, destination: {}, gestartet: [], gestoppt: 0 };
  ctx.createBuffer = (_k, laenge, rate) => ({ duration: laenge / rate, daten: new Float32Array(laenge), getChannelData() { return this.daten; } });
  ctx.createBufferSource = () => {
    const q = { connect() {}, start(t) { ctx.gestartet.push(t); }, stop() { ctx.gestoppt += 1; } };
    return q;
  };
  return ctx;
}

test("createWiedergabe: Brocken werden lueckenlos eingeplant, unterbrechen() stoppt alle", () => {
  const ctx = fakeCtx();
  const w = createWiedergabe(ctx);
  w.spiele(new Float32Array(24000)); // 1 s
  w.spiele(new Float32Array(12000)); // 0,5 s
  assert.equal(ctx.gestartet.length, 2);
  assert.ok(Math.abs(ctx.gestartet[1] - (ctx.gestartet[0] + 1)) < 1e-9, "zweiter Brocken direkt hinter dem ersten");
  assert.equal(w.spieltNoch(), true);
  w.unterbrechen();
  assert.equal(ctx.gestoppt, 2);
  assert.equal(w.spieltNoch(), false);
  w.spiele(new Float32Array(0));
  assert.equal(ctx.gestartet.length, 2, "leerer Brocken wird nicht eingeplant");
});

test("verdrahteLive: starten() meldet false ohne Browser und laesst den alten Weg frei", async () => {
  const status = [];
  const live = verdrahteLive({ state: { voiceModeActive: true }, setStatus: (m, t) => status.push([m, t]) });
  assert.equal(await live.starten(), false);
  assert.equal(live.aktiv(), false);
  live.mute(true);
  live.stop();
  assert.equal(live.aktiv(), false);
});

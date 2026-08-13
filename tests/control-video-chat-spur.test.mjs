// Video-Spur der Control-Reserve: erkennt Auftraege, ruft den Worker,
// respektiert den Personenschutz — und bleibt fail-safe (false = kein Byte).
import test from "node:test";
import assert from "node:assert/strict";
import { createVideoChatRoutes, istVideoAuftrag, sichereVideoQuelle, videoHinweis } from "../control-server/src/routes/videoChatRoutes.js";

function sseAntwort(text) {
  const koerper = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  return {
    ok: true,
    response: { body: new Blob([koerper]).stream() }
  };
}

function fangRes() {
  const stuecke = [];
  return {
    stuecke,
    kopf: null,
    writeHead(status, headers) { this.kopf = { status, headers }; },
    write(teil) { stuecke.push(String(teil)); },
    end() { this.beendet = true; }
  };
}

function bauSpur({ workerAntworten, modellText }) {
  return createVideoChatRoutes({
    env: { SMEJJ_VIDEO_WORKER_URL: "http://worker.test", SMEJJ_VIDEO_WARTE_TAKT_MS: "1" },
    securityHeaders: {},
    resolveModelRequest: () => ({ chain: ["testmodell"] }),
    executeWithFallback: async () => sseAntwort(modellText)
  });
}

function mockFetch(workerAntworten) {
  return async (url) => {
    const pfad = String(url);
    if (pfad.endsWith("/health")) return { ok: true, json: async () => ({ bereit: true }) };
    if (pfad.endsWith("/erzeuge")) {
      const naechste = workerAntworten.shift();
      if (naechste === 429) return { status: 429, ok: false };
      return { status: 200, ok: true, json: async () => naechste };
    }
    throw new Error(`unerwartete Adresse: ${pfad}`);
  };
}

test("kein Video-Auftrag -> false, kein Byte gesendet", async () => {
  const spur = bauSpur({ modellText: "egal" });
  const res = fangRes();
  assert.equal(await spur.handle(res, "Was ist der Unterschied zwischen Video und Film?"), false);
  assert.equal(res.stuecke.length, 0);
});

test("Erkennung: Auftraege ja, Wissensfragen nein", () => {
  assert.equal(istVideoAuftrag("Mach ein Video von einem Segelboot"), true);
  assert.equal(istVideoAuftrag("Erstelle einen Clip aus meiner Szene"), true);
  assert.equal(istVideoAuftrag("Wie geht ein gutes Video?"), false);
  assert.equal(istVideoAuftrag(""), false);
});

test("voller Durchlauf: extern-Engine -> data:video ohne Kamerafahrt-Satz", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch([{ ok: true, format: "mp4", b64: "AAAA", engine: "extern:ltx-video", ton: true }]);
  t.after(() => { globalThis.fetch = original; });

  const spur = bauSpur({ modellText: "a sailboat in a storm" });
  const res = fangRes();
  assert.equal(await spur.handle(res, "Mach ein Video von einem Segelboot im Sturm"), true);
  const alles = res.stuecke.join("");
  assert.match(alles, /data:video\/mp4;base64,AAAA/);
  assert.doesNotMatch(alles, /Kamerafahrt/);
  assert.match(alles, /Erzählt von der Stimme/);
  assert.match(alles, /\[DONE\]/);
});

test("parallax-Engine behaelt den ehrlichen Kamerafahrt-Satz", () => {
  assert.match(videoHinweis("parallax:tiefe", false), /Kamerafahrt/);
  assert.equal(videoHinweis("extern:ltx-video", false), "");
});

test("PERSON_GESPERRT -> hoefliche Absage, kein Worker-Aufruf", async (t) => {
  const original = globalThis.fetch;
  let erzeugeGerufen = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/health")) return { ok: true, json: async () => ({ bereit: true }) };
    erzeugeGerufen = true;
    throw new Error("darf nicht");
  };
  t.after(() => { globalThis.fetch = original; });

  const spur = bauSpur({ modellText: "PERSON_GESPERRT" });
  const res = fangRes();
  assert.equal(await spur.handle(res, "Mach ein Video von Angela Merkel"), true);
  assert.match(res.stuecke.join(""), /Persönlichkeitsrechte/);
  assert.equal(erzeugeGerufen, false);
});

test("429 -> Geduld, zweiter Versuch gewinnt", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch([429, { ok: true, format: "mp4", b64: "BBBB", engine: "parallax:tiefe", ton: false }]);
  t.after(() => { globalThis.fetch = original; });

  const spur = bauSpur({ modellText: "a lighthouse" });
  const res = fangRes();
  assert.equal(await spur.handle(res, "Erzeuge ein Video von einem Leuchtturm"), true);
  assert.match(res.stuecke.join(""), /data:video\/mp4;base64,BBBB/);
});

test("sichereVideoQuelle lehnt fremde Formate und kaputtes base64 ab", () => {
  assert.equal(sichereVideoQuelle({ ok: true, format: "mp4", b64: "AAAA" }), "data:video/mp4;base64,AAAA");
  assert.equal(sichereVideoQuelle({ ok: true, format: "exe", b64: "AAAA" }), "");
  assert.equal(sichereVideoQuelle({ ok: true, format: "mp4", b64: "häh?" }), "");
  assert.equal(sichereVideoQuelle({ ok: false, format: "mp4", b64: "AAAA" }), "");
});

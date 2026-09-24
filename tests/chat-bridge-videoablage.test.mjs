// smejj.com — Bruecke gibt fertige Videos an den Control-Server ab (IDrive e2,
// 7-Tage-Link; Betreiber 24.09.2026). Fail-safe: jeder Fehler -> "" (Video
// bleibt eingebettet). Sicherheit: nur Adressen genau der e2-Form.
import test from "node:test";
import assert from "node:assert/strict";
import { E2_VIDEO_ADRESSE, e2VideoMeldung, legeVideoAb } from "../public/chat-bridge-videoablage.js";

const ENV = { SMEJJ_CONTROL_ORIGIN: "http://smejj-control.zeabur.internal:8080/", SMEJJ_EVOLUTION_TOKEN: "evolution-token-1234567890" };
const LINK = "https://s3.us-west-2.idrivee2.com/smejj-app/medien-video/2026-09-24/0123456789abcdef0123456789abcdef.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AK%2F20260924%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260924T100000Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=abc123";
const DATA = `data:video/mp4;base64,${Buffer.from("....ftypisom....").toString("base64")}`;
const ok = (daten) => async () => new Response(JSON.stringify(daten), { status: 200, headers: { "Content-Type": "application/json" } });

test("gibt das Video mit Ausweis an /api/medien/video und liefert den e2-Link", async () => {
  let gesehen = null;
  const fetchImpl = async (url, init) => { gesehen = { url, init }; return ok({ ok: true, url: LINK })(); };
  assert.equal(await legeVideoAb(DATA, { env: ENV, fetchImpl }), LINK);
  assert.equal(gesehen.url, "http://smejj-control.zeabur.internal:8080/api/medien/video");
  assert.equal(gesehen.init.headers["x-smejj-evolution-token"], ENV.SMEJJ_EVOLUTION_TOKEN);
  assert.deepEqual(Object.keys(JSON.parse(gesehen.init.body)).sort(), ["b64", "format"]);
});

test("fremde oder veraenderte Adressen werden verworfen (Video bleibt eingebettet)", async () => {
  for (const url of ["https://evil.example.com/x.mp4", LINK.replace("medien-video", "chat-medien"), LINK.replace("https://", "http://"), `${LINK}"><script>`]) {
    assert.equal(await legeVideoAb(DATA, { env: ENV, fetchImpl: ok({ ok: true, url }) }), "", url.slice(0, 50));
  }
});

test("fail-safe: ohne Ausweis/Ziel kein Aufruf; HTTP-Fehler, Netzfehler, kein Video -> leer", async () => {
  let aufrufe = 0;
  const zaehler = async () => { aufrufe += 1; return ok({ url: LINK })(); };
  assert.equal(await legeVideoAb(DATA, { env: {}, fetchImpl: zaehler }), "");
  assert.equal(await legeVideoAb(DATA, { env: { ...ENV, SMEJJ_EVOLUTION_TOKEN: "kurz" }, fetchImpl: zaehler }), "");
  assert.equal(await legeVideoAb("data:image/png;base64,AAAA", { env: ENV, fetchImpl: zaehler }), "");
  assert.equal(aufrufe, 0);
  assert.equal(await legeVideoAb(DATA, { env: ENV, fetchImpl: async () => new Response("", { status: 502 }) }), "");
  assert.equal(await legeVideoAb(DATA, { env: ENV, fetchImpl: async () => { throw new TypeError("netz"); } }), "");
});

test("Evolution-Messung erkennt ein Video mit e2-Link, ignoriert anderes", () => {
  assert.ok(E2_VIDEO_ADRESSE.test(LINK));
  assert.equal(e2VideoMeldung(`Hier ist dein Video:\n\n![Erzähltes Video](${LINK})`)?.art, "video");
  assert.equal(e2VideoMeldung("![x](https://example.com/a.mp4)"), null);
});

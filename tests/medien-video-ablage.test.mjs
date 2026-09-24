// smejj.com — Video-Ablage in IDrive e2 mit 7-Tage-Link (Betreiber 24.09.2026:
// "IDrive e2, 7 Tage"). Geprueft: Signatur, echte Ablage gegen einen Fake-
// Speicher, Ablehnung falscher Dateien, fail-closed ohne Konfiguration und
// ohne Ausweis.
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleVideoAblage, vorsignierteLeseAdresse, videoSchluessel, VIDEO_GUELTIG_S } from "../control-server/src/medien/videoAblage.js";
import { handleAutopilotHeartbeat } from "../control-server/src/routes/autopilotRoutes.js";

const ENV = {
  IDRIVE_E2_ENDPOINT: "https://s3.us-west-2.idrivee2.com", IDRIVE_E2_REGION: "us-west-2",
  IDRIVE_E2_ACCESS_KEY: "AKTESTTESTTEST", IDRIVE_E2_SECRET_KEY: "geheimgeheimgeheim", IDRIVE_E2_BUCKET: "smejj-test",
  SMEJJ_EVOLUTION_TOKEN: "evolution-token-1234567890"
};
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(200, 7)]);

function antwort() {
  const r = { status: 0, kopf: {}, text: "" };
  return Object.assign(r, {
    setHeader: (k, v) => { r.kopf[k] = v; }, writeHead: (s, k) => { r.status = s; Object.assign(r.kopf, k || {}); },
    end: (t) => { r.text = String(t || ""); }, daten: () => JSON.parse(r.text || "{}")
  });
}
function anfrage(body, kopf = {}) {
  const req = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  req.method = "POST"; req.headers = kopf; req.socket = { remoteAddress: "10.0.0.9" };
  return req;
}

test("7-Tage-Link: SigV4-Abfrage mit Obergrenze 604800 s, Pfad und Host stimmen", () => {
  const url = new URL(vorsignierteLeseAdresse({ endpoint: ENV.IDRIVE_E2_ENDPOINT, region: "us-west-2", accessKey: "AK", secretKey: "SK", bucket: "b", key: "medien-video/2026-09-24/abc.mp4", jetzt: new Date("2026-09-24T10:00:00Z") }));
  assert.equal(url.host, "s3.us-west-2.idrivee2.com");
  assert.equal(url.pathname, "/b/medien-video/2026-09-24/abc.mp4");
  assert.equal(url.searchParams.get("X-Amz-Expires"), String(VIDEO_GUELTIG_S));
  assert.equal(VIDEO_GUELTIG_S, 604800);
  assert.match(url.searchParams.get("X-Amz-Signature"), /^[0-9a-f]{64}$/);
  assert.equal(url.searchParams.get("X-Amz-Date"), "20260924T100000Z");
  assert.match(videoSchluessel("mp4", new Date("2026-09-24T10:00:00Z")), /^medien-video\/2026-09-24\/[0-9a-f]{32}\.mp4$/);
});

test("gueltiges MP4 wird abgelegt und als signierter 7-Tage-Link zurueckgegeben", async () => {
  const puts = [];
  const fetchImpl = async (url, init) => { puts.push({ url: String(url), method: init?.method, typ: init?.headers?.["Content-Type"] || init?.headers?.["content-type"] }); return new Response("", { status: 200 }); };
  const res = antwort();
  await handleVideoAblage(anfrage({ format: "mp4", b64: MP4.toString("base64") }), res, { env: ENV, fetchImpl });
  assert.equal(res.status, 200, res.text);
  const { url, gueltigBis } = res.daten();
  assert.match(url, /^https:\/\/s3\.us-west-2\.idrivee2\.com\/smejj-test\/medien-video\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{32}\.mp4\?/);
  assert.ok(Date.parse(gueltigBis) - Date.now() > 6.9 * 24 * 3600 * 1000);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].method, "PUT");
});

test("kein echtes Video, falsches Format oder kaputtes base64 -> 400, nichts abgelegt", async () => {
  let aufrufe = 0;
  const fetchImpl = async () => { aufrufe += 1; return new Response("", { status: 200 }); };
  for (const body of [{ format: "mp4", b64: Buffer.from("<html>kein video</html>").toString("base64") }, { format: "gif", b64: MP4.toString("base64") }, { format: "mp4", b64: "***" }, "kein json"]) {
    const res = antwort();
    await handleVideoAblage(anfrage(body), res, { env: ENV, fetchImpl });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal(aufrufe, 0);
});

test("fail-closed: ohne Speicher-Konfiguration 503", async () => {
  const res = antwort();
  await handleVideoAblage(anfrage({ format: "mp4", b64: MP4.toString("base64") }), res, { env: {} });
  assert.equal(res.status, 503);
});

test("Route verlangt den Maschinen-Ausweis der Bruecke (401 ohne, 405 bei GET)", async () => {
  const url = new URL("https://api.smejj.com/api/medien/video");
  const ohne = antwort();
  assert.equal(await handleAutopilotHeartbeat(anfrage({ format: "mp4", b64: "AA" }), url, ohne, { env: ENV }), true);
  assert.equal(ohne.status, 401);
  const get = antwort();
  const req = anfrage("");
  req.method = "GET";
  await handleAutopilotHeartbeat(req, url, get, { env: ENV });
  assert.equal(get.status, 405);
});

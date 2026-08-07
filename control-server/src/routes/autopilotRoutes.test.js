// smejj.com — Unit-Tests fuer den Herzschlag-Eingang der Autopiloten.
//
// Geprueft wird die HTTP-Haut, nicht die Logik (die hat ihre eigenen Tests in
// opsAutopiloten.test.js): falsche Methode, kaputter Body, durchgereichte
// Fehlcodes, und dass ein gueltiger Herzschlag mit 200 quittiert wird.
// Ausfuehren: node --test control-server/src/routes/autopilotRoutes.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleAutopilotHeartbeat } from "./autopilotRoutes.js";
import { _herzschlaegeZuruecksetzen } from "../admin/opsAutopiloten.js";

const ENV = { SMEJJ_AUTOPILOT_KEYS: "qualitaetsmessung:geheim1" };

function attrappe() {
  const res = { status: 0, headers: {}, body: "" };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (status, headers) => { res.status = status; Object.assign(res.headers, headers || {}); return res; };
  res.end = (body) => { res.body = body ? String(body) : ""; };
  return res;
}

async function anfrage({ method = "POST", body = "{}", ip = "198.51.100.1", env = ENV, pfad = "/api/autopilot/heartbeat" } = {}) {
  const req = Readable.from([Buffer.from(body)]);
  req.method = method;
  req.socket = { remoteAddress: ip };
  const res = attrappe();
  const behandelt = await handleAutopilotHeartbeat(req, new URL(`http://x${pfad}`), res, { env });
  return { behandelt, ...res, json: res.body ? JSON.parse(res.body) : null };
}

test("fremde Pfade werden nicht angefasst", async () => {
  const r = await anfrage({ pfad: "/api/irgendwas" });
  assert.equal(r.behandelt, false);
});

test("GET wird abgewiesen — Herzschlaege kommen per POST", async () => {
  const r = await anfrage({ method: "GET" });
  assert.equal(r.status, 405);
});

test("kaputtes JSON ist 400, kein Absturz", async () => {
  const r = await anfrage({ body: "{kaputt" });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, "autopilot_body_invalid");
});

test("gueltiger Herzschlag wird mit 200 und Zeitstempel quittiert", async () => {
  _herzschlaegeZuruecksetzen();
  const r = await anfrage({ body: JSON.stringify({ id: "qualitaetsmessung", key: "geheim1", status: "ok", dauerMs: 1200 }) });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.id, "qualitaetsmessung");
  assert.ok(r.json.gespeichertAm);
});

test("falscher Schluessel kommt als 403 durch, fehlende Umgebung als 503", async () => {
  assert.equal((await anfrage({ body: JSON.stringify({ id: "qualitaetsmessung", key: "falsch", status: "ok" }) })).status, 403);
  assert.equal((await anfrage({ body: JSON.stringify({ id: "qualitaetsmessung", key: "geheim1", status: "ok" }), env: {} })).status, 503);
});

test("die Drossel greift pro Absender", async () => {
  let letzte = null;
  for (let i = 0; i < 40; i++) {
    letzte = await anfrage({ ip: "203.0.113.99", body: JSON.stringify({ id: "qualitaetsmessung", key: "geheim1", status: "ok" }) });
  }
  assert.equal(letzte.status, 429);
  assert.ok(Number(letzte.headers["Retry-After"]) >= 1);
});

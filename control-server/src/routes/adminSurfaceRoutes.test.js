// smejj.com — Unit-Tests fuer die Vortuer des Adminbereichs (Rate-Limit pro IP
// VOR jeder Sitzungsaufloesung).
// Ausfuehren: node --test control-server/src/routes/adminSurfaceRoutes.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminSurface } from "./adminSurfaceRoutes.js";

function attrappe() {
  const res = { status: 0, headers: {}, body: "" };
  res.setHeader = (n, v) => { res.headers[n] = v; };
  res.writeHead = (status, headers) => { res.status = status; Object.assign(res.headers, headers || {}); return res; };
  res.end = (body) => { res.body = body ? String(body) : ""; };
  return res;
}

async function anfrage(pfad, ip, method = "GET") {
  const res = attrappe();
  const req = { method, headers: { "x-forwarded-for": ip } };
  const behandelt = await handleAdminSurface(req, new URL(`http://x${pfad}`), res, {
    readSession: () => null,
    sessionStillValid: async () => false,
    env: {}
  });
  return { behandelt, ...res };
}

test("die Vortuer drosselt unangemeldetes Abklopfen pro IP", async () => {
  let letzte = null;
  // Deutlich mehr Anfragen als das Budget (90 + Nachfuellung waehrend des Laufs).
  for (let i = 0; i < 140; i++) letzte = await anfrage("/admin", "203.0.113.7");
  assert.equal(letzte.status, 429);
  assert.equal(letzte.behandelt, true);
  assert.ok(Number(letzte.headers["Retry-After"]) >= 1);
  assert.match(letzte.body, /Zu viele Anfragen/);
});

test("auf der API antwortet die Vortuer mit JSON statt HTML", async () => {
  // Die IP aus dem ersten Test hat ihr Budget verbraucht.
  const res = await anfrage("/api/admin/me", "203.0.113.7");
  assert.equal(res.status, 429);
  const payload = JSON.parse(res.body);
  assert.equal(payload.error, "admin_vortuer_rate_limit");
  assert.ok(payload.retryAfterSec >= 1);
});

test("eine andere IP bleibt unberuehrt", async () => {
  const res = await anfrage("/admin", "198.51.100.9");
  assert.notEqual(res.status, 429);
});

test("/api/compliance zaehlt nicht gegen das Admin-Budget", async () => {
  const res = await anfrage("/api/compliance/ai-systems", "203.0.113.7");
  assert.notEqual(res.status, 429);
});

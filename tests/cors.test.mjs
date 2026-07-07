import test from "node:test";
import assert from "node:assert/strict";
import { allowedOriginsFromEnv, corsHeadersFor, handlePreflight } from "../control-server/src/http/cors.js";

function mockRes() {
  const state = { status: 0, headers: null, ended: false };
  return {
    state,
    writeHead(status, headers) { state.status = status; state.headers = headers; },
    end() { state.ended = true; }
  };
}

test("smejj.com and www are allowed by default; env adds validated extra origins", () => {
  assert.deepEqual(allowedOriginsFromEnv({}), ["https://smejj.com", "https://www.smejj.com"]);
  const withExtra = allowedOriginsFromEnv({ SMEJJ_ALLOWED_ORIGINS: "http://localhost:3000, kaputt, https://dev.example.test/" });
  assert.ok(withExtra.includes("http://localhost:3000"));
  assert.ok(withExtra.includes("https://dev.example.test"));
  assert.ok(!withExtra.includes("kaputt"));
});

test("cors headers are fail-closed for unknown origins and complete for allowed ones", () => {
  assert.equal(corsHeadersFor("https://boese.example.test", {}), null);
  assert.equal(corsHeadersFor("", {}), null);
  const headers = corsHeadersFor("https://smejj.com", {});
  assert.equal(headers["Access-Control-Allow-Origin"], "https://smejj.com");
  assert.equal(headers.Vary, "Origin");
  assert.ok(headers["Access-Control-Allow-Headers"].includes("Authorization"));
  assert.ok(headers["Access-Control-Expose-Headers"].includes("x-smejj-model-backend"));
});

test("preflight answers 204 for allowed origin, 403 for foreign, false for non-OPTIONS", () => {
  const ok = mockRes();
  assert.equal(handlePreflight({ method: "OPTIONS", headers: { origin: "https://smejj.com" } }, ok, {}), true);
  assert.equal(ok.state.status, 204);
  assert.equal(ok.state.headers["Access-Control-Allow-Origin"], "https://smejj.com");
  assert.equal(ok.state.ended, true);

  const bad = mockRes();
  assert.equal(handlePreflight({ method: "OPTIONS", headers: { origin: "https://boese.example.test" } }, bad, {}), true);
  assert.equal(bad.state.status, 403);
  assert.deepEqual(bad.state.headers, {});

  const get = mockRes();
  assert.equal(handlePreflight({ method: "GET", headers: {} }, get, {}), false);
  assert.equal(get.state.status, 0);
});

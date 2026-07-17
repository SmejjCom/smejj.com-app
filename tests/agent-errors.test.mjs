// smejj.com — Tests der Fehlertaxonomie (Phase 1).
import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_ERROR_CODES, AgentError, toAgentError, mapProviderStatus, agentErrorResponse } from "../src/agent/errors.js";

test("Fehlerklassen: Taxonomie ist vollstaendig und eingefroren", () => {
  assert.equal(AGENT_ERROR_CODES.length, 20);
  assert.ok(Object.isFrozen(AGENT_ERROR_CODES));
  for (const code of ["AUTHENTICATION_ERROR", "PROVIDER_UNAVAILABLE", "MODEL_NOT_AVAILABLE", "SECURITY_POLICY_VIOLATION", "INTERNAL_ERROR"]) {
    assert.ok(AGENT_ERROR_CODES.includes(code), `${code} fehlt`);
  }
});

test("Unbekannter Code faellt fail-closed auf INTERNAL_ERROR", () => {
  const error = new AgentError("NOT_A_REAL_CODE", "x");
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.status, 500);
});

test("Cline 401 wird zu AUTHENTICATION_ERROR ohne Rohmeldung", () => {
  const error = toAgentError({ name: "ClineApiError", status: 401, message: "invalid api key sk-abc123" });
  assert.equal(error.code, "AUTHENTICATION_ERROR");
  assert.ok(!error.message.includes("sk-abc123"), "Rohmeldung darf nicht durchsickern");
});

test("Cline 403 ENTITLEMENT wird zu MODEL_NOT_AVAILABLE (bekannter cline-pass-Fall)", () => {
  const error = toAgentError({ name: "ClineApiError", status: 403, code: "ENTITLEMENT_REQUIRED", message: "no entitlement" });
  assert.equal(error.code, "MODEL_NOT_AVAILABLE");
});

test("Cline 403 ohne ENTITLEMENT bleibt AUTHENTICATION_ERROR", () => {
  assert.equal(mapProviderStatus(403, ""), "AUTHENTICATION_ERROR");
});

test("Provider-Statuscodes werden korrekt abgebildet", () => {
  assert.equal(mapProviderStatus(402), "COST_LIMIT_REACHED");
  assert.equal(mapProviderStatus(429), "RATE_LIMITED");
  assert.equal(mapProviderStatus(503), "PROVIDER_UNAVAILABLE");
  assert.equal(mapProviderStatus(504), "TIMEOUT");
  assert.equal(mapProviderStatus(413), "CONTEXT_LIMIT_REACHED");
});

test("Legacy-String-Codes der Codebasis werden gemappt", () => {
  assert.equal(toAgentError(new Error("worker_token_rejected")).code, "AUTHENTICATION_ERROR");
  assert.equal(toAgentError(new Error("model_tool_not_allowed")).code, "TOOL_PERMISSION_DENIED");
  assert.equal(toAgentError(new Error("unsafe_path")).code, "SECURITY_POLICY_VIOLATION");
  assert.equal(toAgentError(new Error("cline_not_configured")).code, "MODEL_NOT_AVAILABLE");
  assert.equal(toAgentError(new Error("cline_insufficient_credits")).code, "COST_LIMIT_REACHED");
});

test("Retryable-Klassifizierung stimmt", () => {
  assert.equal(toAgentError({ name: "ClineApiError", status: 503 }).retryable, true);
  assert.equal(toAgentError({ name: "ClineApiError", status: 401 }).retryable, false);
});

test("toJSON gibt nur erlaubte Felder aus (keine cause/stack)", () => {
  const error = new AgentError("TIMEOUT", "zu lange", { cause: new Error("geheim") });
  const json = error.toJSON();
  assert.deepEqual(Object.keys(json).sort(), ["code", "message", "retryable"]);
  assert.ok(!JSON.stringify(json).includes("geheim"));
});

test("AgentError wird unveraendert durchgereicht", () => {
  const original = new AgentError("USER_CANCELLED", "abgebrochen");
  assert.equal(toAgentError(original), original);
});

test("agentErrorResponse liefert HTTP-Status und neutralen Koerper", () => {
  const { status, body } = agentErrorResponse(new Error("cline_rate_limit"));
  assert.equal(status, 429);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "RATE_LIMITED");
});

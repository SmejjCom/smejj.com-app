import test from "node:test";
import assert from "node:assert/strict";
import { isSafeMutatingControlRequest, requiresAuthenticatedControlAccess } from "../src/shared/controlAccessPolicy.js";

function protectedAccess(pathname, method = "GET") {
  return requiresAuthenticatedControlAccess({ method }, new URL(pathname, "https://smejj.com"));
}

test("control access policy protects repository and execution surfaces", () => {
  assert.equal(protectedAccess("/api/jobs"), true);
  assert.equal(protectedAccess("/api/jobs/queue"), true);
  assert.equal(protectedAccess("/api/auth/session-token"), true);
  assert.equal(protectedAccess("/api/auth/session-handoff/complete", "POST"), true);
  assert.equal(protectedAccess("/api/jobs/job-1"), true);
  assert.equal(protectedAccess("/api/auth/passkey/register/options", "POST"), true);
  assert.equal(protectedAccess("/api/auth/passkey/register/verify", "POST"), true);
  assert.equal(protectedAccess("/api/terminal/run", "POST"), true);
  assert.equal(protectedAccess("/api/files/read", "POST"), true);
  assert.equal(protectedAccess("/api/git/status"), true);
  assert.equal(protectedAccess("/api/storage/presign", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/status"), true);
  assert.equal(protectedAccess("/api/providers/cline/status"), true);
  assert.equal(protectedAccess("/api/providers/cline/chat", "POST"), true);
});

test("control access policy preserves signed callbacks and public read surfaces", () => {
  assert.equal(protectedAccess("/api/jobs/job-1/status", "POST"), false);
  assert.equal(protectedAccess("/api/chat", "POST"), false);
  assert.equal(protectedAccess("/api/health"), false);
  assert.equal(protectedAccess("/api/auth/passkey/login/options", "POST"), false);
  assert.equal(protectedAccess("/api/auth/passkey/login/verify", "POST"), false);
  assert.equal(protectedAccess("/api/auth/session-handoff/start", "POST"), false);
  assert.equal(protectedAccess("/api/auth/session-handoff/example"), false);
  assert.equal(protectedAccess("/api/workers/salad/gpu-classes"), false);
});

test("control access policy protects Salad mutations and the provider-status read", () => {
  assert.equal(protectedAccess("/api/workers/salad/create", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/start", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/stop", "POST"), true);
  assert.equal(protectedAccess("/api/workers/salad/start", "GET"), false);
});

test("control mutation origin accepts the HTTPS gateway host and rejects foreign origins", () => {
  const url = new URL("https://control.example/api/terminal/run");
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://control.example", "x-forwarded-proto": "https" }
  }, url), true);
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://evil.example", "x-forwarded-proto": "https" }
  }, url), false);
});

test("control mutation origin keeps local HTTP and Google callback exceptions scoped", () => {
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "x-forwarded-proto": "http" }
  }, new URL("http://127.0.0.1:3000/api/jobs")), true);
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://accounts.google.com", "x-forwarded-proto": "https" }
  }, new URL("https://control.example/api/auth/google")), true);
  assert.equal(isSafeMutatingControlRequest({
    method: "POST",
    headers: { host: "control.example", origin: "https://accounts.google.com", "x-forwarded-proto": "https" }
  }, new URL("https://control.example/api/jobs")), false);
});

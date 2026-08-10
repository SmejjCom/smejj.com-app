import test from "node:test";
import assert from "node:assert/strict";
import {
  registerSession, isSessionActive, revokeSession, newSessionId,
  sessionRegistryEnabled, __clearRegistryCacheForTests
} from "../control-server/src/auth/sessionRegistry.js";

const ENV = {
  IDRIVE_E2_ENDPOINT: "https://e2.example",
  IDRIVE_E2_ACCESS_KEY: "AK",
  IDRIVE_E2_SECRET_KEY: "SK",
  IDRIVE_E2_BUCKET: "b",
  SMEJJ_SESSION_REGISTRY: "1"
};

// Gemocktes IDrive e2 ueber globalThis.fetch (sessionRegistry ruft s3Signer ohne
// eigenen fetchImpl auf -> nutzt global fetch).
function installS3Mock() {
  const store = new Map();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const key = String(url).split("/b/")[1]?.split("?")[0];
    const method = (opts.method || "GET").toUpperCase();
    if (method === "PUT") {
      store.set(key, opts.body);
      return mkResponse(200, "");
    }
    return store.has(key) ? mkResponse(200, store.get(key)) : mkResponse(404, "");
  };
  return { store, restore() { globalThis.fetch = original; } };
}
function mkResponse(status, body) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: () => null },
    async text() { return body; },
    async arrayBuffer() { return Buffer.from(body); }
  };
}

test("Flag steuert die Registry", () => {
  assert.equal(sessionRegistryEnabled({ SMEJJ_SESSION_REGISTRY: "1" }), true);
  assert.equal(sessionRegistryEnabled({ SMEJJ_SESSION_REGISTRY: "true" }), true);
  assert.equal(sessionRegistryEnabled({}), false);
  assert.equal(sessionRegistryEnabled({ SMEJJ_SESSION_REGISTRY: "0" }), false);
});

test("sid hat ausreichende Entropie", () => {
  const a = newSessionId();
  const b = newSessionId();
  assert.notEqual(a, b);
  assert.ok(a.length >= 22, "144-bit base64url >= 22 Zeichen");
});

test("register -> aktiv; revoke -> inaktiv", async () => {
  const mock = installS3Mock();
  try {
    const sid = newSessionId();
    await registerSession({ sid, subject: "u1", method: "google", expiresAtMs: Date.now() + 3_600_000 }, ENV);
    __clearRegistryCacheForTests();
    assert.equal(await isSessionActive(sid, ENV), true);
    await revokeSession(sid, ENV);
    __clearRegistryCacheForTests();
    assert.equal(await isSessionActive(sid, ENV), false);
  } finally {
    mock.restore();
  }
});

test("abgelaufener Eintrag -> inaktiv", async () => {
  const mock = installS3Mock();
  try {
    const sid = newSessionId();
    await registerSession({ sid, subject: "u2", method: "passkey", expiresAtMs: Date.now() - 1000 }, ENV);
    __clearRegistryCacheForTests();
    assert.equal(await isSessionActive(sid, ENV), false);
  } finally {
    mock.restore();
  }
});

test("kein Eintrag -> aktiv (kein Aussperren waehrend der best-effort-Registrierung)", async () => {
  const mock = installS3Mock();
  try {
    __clearRegistryCacheForTests();
    assert.equal(await isSessionActive(newSessionId(), ENV), true);
  } finally {
    mock.restore();
  }
});

test("sid-los -> aktiv (Legacy-Tokens ohne sid bleiben gueltig)", async () => {
  assert.equal(await isSessionActive("", ENV), true);
});

test("Registry nicht konfiguriert -> nicht sperren", async () => {
  __clearRegistryCacheForTests();
  assert.equal(await isSessionActive(newSessionId(), { SMEJJ_SESSION_REGISTRY: "1" }), true);
});

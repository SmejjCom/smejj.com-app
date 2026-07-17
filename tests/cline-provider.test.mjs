import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";
import {
  __clearProviderCredentialMemoryForTests,
  decryptProviderCredential,
  encryptProviderCredential,
  providerCredentialEncryptionConfig,
  putProviderCredential
} from "../control-server/src/providers/providerCredentialVault.js";
import { __clearClineCatalogCacheForTests, fetchClineModels } from "../control-server/src/providers/clineClient.js";
import { handleProviderRoute } from "../control-server/src/routes/providerRoutes.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/jobApi.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const ENV = Object.freeze({
  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-cline-key-v1",
  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: KEY,
  SMEJJ_PROVIDER_CREDENTIAL_ALLOW_MEMORY: "YES"
});

test("Cline credential envelope uses scoped AES-256-GCM and rejects tampering", () => {
  const config = providerCredentialEncryptionConfig(ENV);
  assert.equal(config.ready, true);
  const record = {
    subjectId: "user_12345678",
    providerId: "cline",
    enabled: true,
    apiKey: "cline-secret-key-value",
    selectedModel: "cline-pass/glm-5.2"
  };
  const envelope = encryptProviderCredential(record, config, () => Buffer.alloc(12, 9));
  assert.equal(envelope.algorithm, "AES-256-GCM");
  assert.equal(JSON.stringify(envelope).includes(record.apiKey), false);
  assert.deepEqual(decryptProviderCredential(envelope, config), record);
  assert.throws(() => decryptProviderCredential({ ...envelope, authTag: Buffer.alloc(16).toString("base64") }, config));
});

test("credential storage fails closed without IDrive e2 unless memory fallback is explicitly allowed", async () => {
  const productionLikeEnv = Object.freeze({
    SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-cline-key-v1",
    SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: KEY
  });
  await assert.rejects(
    putProviderCredential("user_guard", "cline", { enabled: true, apiKey: "cline-secret-key-value" }, productionLikeEnv),
    /provider_credential_storage_not_configured/
  );
});

test("master key rotation decrypts previous-key envelopes and re-encrypts with the current key", () => {
  const previousConfig = providerCredentialEncryptionConfig(ENV);
  const record = { subjectId: "user_rotate", providerId: "cline", enabled: true, apiKey: "cline-secret-key-value" };
  const envelope = encryptProviderCredential(record, previousConfig, () => Buffer.alloc(12, 3));

  const rotatedEnv = Object.freeze({
    SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-cline-key-v2",
    SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: Buffer.alloc(32, 8).toString("base64"),
    SMEJJ_PROVIDER_CREDENTIAL_PREVIOUS_KEY_ID: "test-cline-key-v1",
    SMEJJ_PROVIDER_CREDENTIAL_PREVIOUS_KEY_B64: KEY
  });
  const rotatedConfig = providerCredentialEncryptionConfig(rotatedEnv);
  assert.equal(rotatedConfig.previousKeyId, "test-cline-key-v1");
  assert.deepEqual(decryptProviderCredential(envelope, rotatedConfig), record);

  const reEncrypted = encryptProviderCredential(record, rotatedConfig, () => Buffer.alloc(12, 4));
  assert.equal(reEncrypted.keyId, "test-cline-key-v2");

  const unknownConfig = providerCredentialEncryptionConfig({
    SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-cline-key-v3",
    SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: Buffer.alloc(32, 9).toString("base64")
  });
  assert.throws(() => decryptProviderCredential(envelope, unknownConfig), /provider_credential_envelope_invalid/);
});

test("catalog falls back to the last good cache when the live endpoint fails", async () => {
  __clearClineCatalogCacheForTests();
  const failingFetch = async () => new Response("{}", { status: 503 });
  await assert.rejects(fetchClineModels({ fetchImpl: failingFetch }));

  const fresh = await fetchClineModels({ fetchImpl: mockClineFetch() });
  assert.equal(fresh.stale, false);
  assert.ok(fresh.models.length > 0);

  const cached = await fetchClineModels({ fetchImpl: failingFetch });
  assert.equal(cached.stale, true);
  assert.deepEqual(cached.models, fresh.models);
  __clearClineCatalogCacheForTests();
});

test("Cline catalog is dynamic and preserves pass, free and recommended categories", async () => {
  const result = await fetchClineModels({ fetchImpl: mockClineFetch() });
  assert.deepEqual(result.models.map((model) => [model.id, model.category]), [
    ["zai/glm-5.2", "recommended"],
    ["deepseek/deepseek-v4-flash", "free"],
    ["cline-pass/kimi-k2.7-code", "cline-pass"],
    ["cline-pass/qwen3.7-plus", "cline-pass"]
  ]);
  assert.match(result.source, /recommended-models$/);
});

test("authenticated Cline route tests before encrypted save and streams without exposing the key", async (t) => {
  __clearProviderCredentialMemoryForTests();
  const observed = [];
  const fetchImpl = mockClineFetch(observed);
  const server = http.createServer(async (req, res) => {
    req.authUser = { userId: "user_test" };
    await handleProviderRoute(req, new URL(req.url, "http://127.0.0.1"), res, { env: ENV, fetchImpl });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  const saved = await request(origin, "/api/providers/cline/credentials", {
    apiKey: "cline-valid-key-123456789",
    selectedModel: "cline-pass/kimi-k2.7-code"
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.configured, true);
  assert.equal(saved.body.selectedModel, "cline-pass/kimi-k2.7-code");
  assert.equal(JSON.stringify(saved.body).includes("cline-valid-key"), false);

  const status = await request(origin, "/api/providers/cline/status");
  assert.equal(status.body.configured, true);
  assert.equal(status.body.keyHint, "••••6789");
  assert.equal(Object.hasOwn(status.body, "apiKey"), false);

  const switched = await request(origin, "/api/providers/cline/select", { model: "cline-pass/qwen3.7-plus" });
  assert.equal(switched.body.restartRequired, false);
  assert.equal(switched.body.selectedModel, "cline-pass/qwen3.7-plus");

  const streamed = await request(origin, "/api/providers/cline/chat", {
    messages: [{ role: "user", content: [{ type: "text", text: "Screenshot prüfen" }, { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }] }]
  }, { raw: true });
  assert.equal(streamed.status, 200);
  assert.match(streamed.text, /data:.*OK/);
  assert.ok(observed.every((entry) => entry.authorization === "Bearer cline-valid-key-123456789" || !entry.authorization));
});

test("job capsule carries only the Cline model reference, never the credential", () => {
  const envelope = createStorageFirstJobEnvelope({
    body: {
      jobId: "job_cline_test",
      projectId: "project_cline",
      task: "Fix UI",
      providerRuntime: { id: "cline", modelId: "cline-pass/kimi-k2.7-code" }
    }
  });
  assert.deepEqual(envelope.job.providerRuntime, {
    id: "cline",
    modelId: "cline-pass/kimi-k2.7-code",
    credentialHandling: "control-server-encrypted-vault",
    keyForwardedToWorker: false
  });
  const input = JSON.parse(envelope.taskCapsuleWritePlan.objects.find((item) => item.key.endsWith("input.json")).body);
  assert.equal(input.providerRuntime.modelId, "cline-pass/kimi-k2.7-code");
  assert.equal(JSON.stringify(input).includes("apiKey"), false);
});

function mockClineFetch(observed = []) {
  return async (url, options = {}) => {
    observed.push({ url: String(url), authorization: options.headers?.Authorization || "", body: options.body || "" });
    if (String(url).endsWith("/recommended-models")) {
      return Response.json({
        recommended: [{ id: "zai/glm-5.2", name: "GLM 5.2" }],
        free: [{ id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
        clinePass: [
          { id: "cline-pass/kimi-k2.7-code", name: "Kimi K2.7 Code" },
          { id: "cline-pass/qwen3.7-plus", name: "Qwen 3.7 Plus" }
        ]
      });
    }
    const payload = JSON.parse(options.body || "{}");
    if (payload.stream === true) {
      return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream", "x-request-id": "req-stream" }
      });
    }
    return Response.json({ choices: [{ message: { content: "OK" } }] }, { headers: { "x-request-id": "req-test" } });
  };
}

async function request(origin, pathname, body, { raw = false } = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  return raw ? { status: response.status, text } : { status: response.status, body: JSON.parse(text) };
}

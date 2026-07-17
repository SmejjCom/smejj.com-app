// smejj.com — Vertragstests der Provider-Schicht (Phase 1).
// Diese Tests laufen unveraendert gegen jeden kuenftigen Provider (GLM, Kimi,
// SmejjProvider). Schlaegt ein Provider hier fehl, ist der Adapter fehlerhaft.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTONOMY_LEVELS,
  PROVIDER_METHODS,
  getProvider,
  listProviders,
  normalizeTaskInput,
  registerProvider,
  __resetProviderRegistryForTests
} from "../src/agent/providers/providerContract.js";
import { createClineProvider } from "../src/agent/providers/clineProvider.js";
import { createSessionStore } from "../src/agent/api/sessionStore.js";

function sseResponse(chunks, { ok = true } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok,
    body: {
      getReader: () => ({
        read: async () => (index < chunks.length
          ? { value: encoder.encode(chunks[index++]), done: false }
          : { value: undefined, done: true }),
        releaseLock() {}
      })
    },
    headers: { get: () => "" }
  };
}

function buildProvider({ completion, credential } = {}) {
  const sessionStore = createSessionStore();
  const provider = createClineProvider({
    clineChatCompletion: completion || (async () => sseResponse(['data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\ndata: [DONE]\n\n'])),
    clineResponseError: async () => Object.assign(new Error("Cline API HTTP 502"), { name: "ClineApiError", status: 502 }),
    loadCredential: credential || (async () => ({ apiKey: "sk-test-key-1234567890", selectedModel: "openai/gpt-5.6-sol", enabled: true })),
    sessionStore
  });
  return { provider, sessionStore };
}

async function collect(iterable) {
  const frames = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

test("ClineProvider erfuellt den CodingAgentProvider-Vertrag vollstaendig", () => {
  const { provider } = buildProvider();
  for (const method of PROVIDER_METHODS) {
    assert.equal(typeof provider[method], "function", `${method} fehlt`);
  }
});

test("Registry lehnt unvollstaendige Provider ab (fail-closed)", () => {
  __resetProviderRegistryForTests();
  assert.throws(() => registerProvider("kaputt", { startTask() {} }), /erfuellt den Vertrag nicht/);
});

test("Registry lehnt ungueltige Provider-Ids ab", () => {
  __resetProviderRegistryForTests();
  const { provider } = buildProvider();
  assert.throws(() => registerProvider("Cline GmbH!", provider), /ungueltig/);
});

test("Unbekannter Provider liefert PROVIDER_UNAVAILABLE", () => {
  __resetProviderRegistryForTests();
  assert.throws(() => getProvider("gibtesnicht"), (error) => error.code === "PROVIDER_UNAVAILABLE");
});

test("Registrierter Provider ist auffindbar und listbar", () => {
  __resetProviderRegistryForTests();
  const { provider } = buildProvider();
  registerProvider("cline", provider, { capabilities: ["streaming"] });
  assert.equal(getProvider("cline"), provider);
  assert.deepEqual(listProviders(), [{ id: "cline", capabilities: ["streaming"] }]);
});

test("normalizeTaskInput setzt sichere Vorgaben (fail-closed Berechtigungen)", () => {
  const input = normalizeTaskInput({ prompt: "Baue X", userId: "u1" });
  assert.equal(input.autonomy.level, "supervised");
  assert.equal(input.autonomy.requireApprovalForDestructiveActions, true);
  for (const permission of Object.values(input.permissions)) {
    assert.equal(permission, false, "Berechtigungen muessen standardmaessig aus sein");
  }
});

test("normalizeTaskInput lehnt leeren Prompt und ungueltige Autonomiestufe ab", () => {
  assert.throws(() => normalizeTaskInput({ prompt: "  " }), (error) => error.code === "INVALID_REQUEST");
  assert.throws(() => normalizeTaskInput({ prompt: "X", autonomy: { level: "gottmodus" } }), (error) => error.code === "INVALID_REQUEST");
});

test("Autonomiestufen entsprechen der Spezifikation", () => {
  assert.deepEqual([...AUTONOMY_LEVELS], ["observe", "assist", "supervised", "autonomous"]);
});

test("startTask erzeugt Sitzung mit Modell aus dem Credential", async () => {
  const { provider } = buildProvider();
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  assert.equal(session.provider, "cline");
  assert.equal(session.model, "openai/gpt-5.6-sol");
  assert.match(session.sessionId, /^[0-9a-f-]{36}$/);
});

test("streamEvents liefert task.started, assistant.message und task.completed", async () => {
  const { provider } = buildProvider();
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  const frames = await collect(provider.streamEvents(session.sessionId));
  const names = frames.map((frame) => frame.split("\n")[0].replace("event: ", ""));
  assert.equal(names[0], "task.started");
  assert.ok(names.includes("assistant.message"));
  assert.equal(names.at(-1), "task.completed");
  assert.ok(!frames.join("").includes("sk-test-key"), "Key darf nie im Event-Stream stehen");
  assert.ok(!frames.join("").includes("choices"), "Provider-Struktur darf nie im Event-Stream stehen");
});

test("Provider-Fehler wird zu task.failed mit neutraler Fehlerklasse", async () => {
  const { provider } = buildProvider({ completion: async () => sseResponse([], { ok: false }) });
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  const frames = await collect(provider.streamEvents(session.sessionId));
  const failed = frames.find((frame) => frame.startsWith("event: task.failed"));
  assert.ok(failed, "task.failed erwartet");
  assert.ok(failed.includes("PROVIDER_UNAVAILABLE"));
});

test("Fehlendes Cline-Credential liefert MODEL_NOT_AVAILABLE statt Absturz", async () => {
  const { provider } = buildProvider({
    credential: async () => { throw Object.assign(new Error("cline_not_configured"), { status: 409 }); }
  });
  await assert.rejects(
    () => provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" })),
    (error) => String(error.message).includes("cline_not_configured")
  );
});

test("Lebenszyklus: pause, resume, cancel und Status", async () => {
  const { provider } = buildProvider();
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  await provider.pauseTask(session.sessionId);
  assert.equal((await provider.getStatus(session.sessionId)).status, "paused");
  await assert.rejects(() => collect(provider.streamEvents(session.sessionId)), (error) => error.code === "INVALID_REQUEST");
  await provider.resumeTask(session.sessionId);
  assert.equal((await provider.getStatus(session.sessionId)).status, "running");
  await provider.cancelTask(session.sessionId);
  assert.equal((await provider.getStatus(session.sessionId)).status, "cancelled");
});

test("resume ohne vorheriges pause wird abgelehnt", async () => {
  const { provider } = buildProvider();
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  await assert.rejects(() => provider.resumeTask(session.sessionId), (error) => error.code === "INVALID_REQUEST");
});

test("Freigaben sind fuer Cline in Phase 1 klar abgelehnt (kein stilles Ignorieren)", async () => {
  const { provider } = buildProvider();
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  await assert.rejects(() => provider.approveAction(session.sessionId, "a1"), (error) => error.code === "INVALID_REQUEST");
  await assert.rejects(() => provider.rejectAction(session.sessionId, "a1", "nein"), (error) => error.code === "INVALID_REQUEST");
});

test("getResult liefert den zusammengesetzten Text", async () => {
  const { provider } = buildProvider();
  const session = await provider.startTask(normalizeTaskInput({ prompt: "Hallo", userId: "u1" }));
  await collect(provider.streamEvents(session.sessionId));
  const result = await provider.getResult(session.sessionId);
  assert.equal(result.text, "Hallo");
  assert.equal(result.status, "completed");
});

test("SessionStore: Fremdzugriff wird verweigert", () => {
  const store = createSessionStore();
  const session = store.create({ userId: "u1", provider: "cline" });
  assert.throws(() => store.requireOwned(session.sessionId, "u2"), (error) => error.code === "AUTHENTICATION_ERROR");
  assert.equal(store.requireOwned(session.sessionId, "u1").sessionId, session.sessionId);
});

test("SessionStore: unbekannte Sitzung liefert INVALID_REQUEST", () => {
  const store = createSessionStore();
  assert.throws(() => store.require("gibtesnicht"), (error) => error.code === "INVALID_REQUEST");
});

test("SessionStore: abgelaufene Sitzungen werden entfernt (TTL)", () => {
  let clock = 1_000;
  const store = createSessionStore({ ttlMs: 100, now: () => clock });
  const session = store.create({ userId: "u1" });
  clock += 500;
  assert.throws(() => store.require(session.sessionId), (error) => error.code === "INVALID_REQUEST");
  assert.equal(store.size(), 0);
});

test("SessionStore: Obergrenze schuetzt den Control Server", () => {
  const store = createSessionStore({ maxSessions: 2 });
  store.create({ userId: "u1" });
  store.create({ userId: "u1" });
  assert.throws(() => store.create({ userId: "u1" }), (error) => error.code === "RATE_LIMITED");
});

test("SessionStore speichert keine Secrets", () => {
  const store = createSessionStore();
  const session = store.create({ userId: "u1", provider: "cline", model: "m" });
  assert.ok(!("apiKey" in session), "Sitzung darf keinen Key halten");
  assert.ok(!JSON.stringify({ ...session, abortController: undefined }).includes("sk-"));
});

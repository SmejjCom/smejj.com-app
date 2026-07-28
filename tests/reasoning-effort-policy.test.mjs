import test from "node:test";
import assert from "node:assert/strict";
import { chatReasoningEffort, latestUserPrompt, mapUserEffort } from "../src/ai/reasoningEffortPolicy.js";
import {
  backendSupportsReasoningEffort,
  classifyProfile,
  executeWithFallback
} from "../control-server/src/llm/modelRouter.js";

const K3 = { name: "kimi", baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k3", apiKey: "k", apiKeyHeader: "Authorization" };
const GLM = { name: "zhipu", baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-5.2", apiKey: "k", apiKeyHeader: "Authorization" };

function fakeFetch(aufgezeichnet) {
  return async (_url, init) => {
    aufgezeichnet.push(JSON.parse(init.body));
    return { ok: true, body: {}, headers: new Map() };
  };
}

test("nur K3 bekommt reasoning_effort, GLM nicht", () => {
  assert.equal(backendSupportsReasoningEffort(K3), true);
  assert.equal(backendSupportsReasoningEffort(GLM), false);
  assert.equal(backendSupportsReasoningEffort({ model: "kimi-k2.7-code" }), false);
  assert.equal(backendSupportsReasoningEffort({}), false);
});

test("reasoning_effort landet im Anfragekoerper an K3", async () => {
  const koerper = [];
  await executeWithFallback([K3], [{ role: "user", content: "Hallo" }], {
    fetchImpl: fakeFetch(koerper),
    reasoningEffort: "low"
  });
  assert.equal(koerper[0].reasoning_effort, "low");
  assert.equal(koerper[0].model, "kimi-k3");
});

test("GLM bekommt das Feld NICHT — unbekannte Felder koennen abgelehnt werden", async () => {
  const koerper = [];
  await executeWithFallback([GLM], [{ role: "user", content: "Hallo" }], {
    fetchImpl: fakeFetch(koerper),
    reasoningEffort: "low"
  });
  assert.equal("reasoning_effort" in koerper[0], false);
});

test("ein ungueltiger Wert wird nicht durchgereicht (fail-closed)", async () => {
  const koerper = [];
  await executeWithFallback([K3], [{ role: "user", content: "Hallo" }], {
    fetchImpl: fakeFetch(koerper),
    reasoningEffort: "turbo"
  });
  assert.equal("reasoning_effort" in koerper[0], false);
});

test("ohne Angabe bleibt die Voreinstellung des Modells unangetastet", async () => {
  const koerper = [];
  await executeWithFallback([K3], [{ role: "user", content: "Hallo" }], { fetchImpl: fakeFetch(koerper) });
  assert.equal("reasoning_effort" in koerper[0], false);
});

test("Alltagsfragen bekommen low, Coding behaelt die volle Tiefe", () => {
  const alltag = [{ role: "user", content: "Wie ist das Wetter in Berlin?" }];
  const coding = [{ role: "user", content: "Schreibe eine Funktion, die zwei Zahlen addiert, als JavaScript-Code." }];
  const reasoning = [{ role: "user", content: "Begruende die Architektur und vergleiche beide Ansaetze im Detail." }];
  assert.equal(chatReasoningEffort(alltag, classifyProfile, {}), "low");
  assert.equal(chatReasoningEffort(coding, classifyProfile, {}), undefined);
  assert.equal(chatReasoningEffort(reasoning, classifyProfile, {}), undefined);
});

test("ohne erkennbare Nutzerfrage wird nichts umgestellt", () => {
  assert.equal(chatReasoningEffort([], classifyProfile, {}), undefined);
  assert.equal(chatReasoningEffort([{ role: "system", content: "x" }], classifyProfile, {}), undefined);
  assert.equal(chatReasoningEffort(null, classifyProfile, {}), undefined);
  assert.equal(chatReasoningEffort([{ role: "user", content: "hi" }], null, {}), undefined);
});

test("die Env uebersteuert die Regel, aber nur mit gueltigem Wert", () => {
  const alltag = [{ role: "user", content: "Wie ist das Wetter in Berlin?" }];
  assert.equal(chatReasoningEffort(alltag, classifyProfile, { SMEJJ_LLM_KIMI_K3_REASONING_EFFORT: "max" }), "max");
  assert.equal(chatReasoningEffort(alltag, classifyProfile, { SMEJJ_LLM_KIMI_K3_REASONING_EFFORT: "HIGH" }), "high");
  // Unsinn wird ignoriert, die Regel greift wieder.
  assert.equal(chatReasoningEffort(alltag, classifyProfile, { SMEJJ_LLM_KIMI_K3_REASONING_EFFORT: "turbo" }), "low");
});

// --- Die Einstellung "Reasoning-Aufwand" wird echt wirksam (2026-07-28) ---
// Vorher war der Wert nur ein Satz im Prompt. Jetzt steuert er bei K3 einen
// echten API-Parameter. Rangfolge: Env des Betreibers > Nutzerwunsch > Regel.

test("die Oberflaechen-Stufen werden auf die API-Werte abgebildet", () => {
  assert.equal(mapUserEffort("medium"), "low");
  assert.equal(mapUserEffort("high"), "high");
  assert.equal(mapUserEffort("max"), "max");
  assert.equal(mapUserEffort("MAX"), "max");
  assert.equal(mapUserEffort("turbo"), undefined);
  assert.equal(mapUserEffort(""), undefined);
  assert.equal(mapUserEffort(null), undefined);
});

test("der Nutzerwunsch schlaegt die Regel nach Aufgabentyp", () => {
  const alltag = [{ role: "user", content: "Wie ist das Wetter in Berlin?" }];
  // Ohne Wunsch greift die Regel: low.
  assert.equal(chatReasoningEffort(alltag, classifyProfile, {}), "low");
  // Mit Wunsch "Maximal" bekommt auch eine Alltagsfrage die volle Tiefe.
  assert.equal(chatReasoningEffort(alltag, classifyProfile, {}, "max"), "max");
  // Und umgekehrt: Coding mit ausdruecklichem "Mittel" wird flach.
  const coding = [{ role: "user", content: "Schreibe eine Funktion, die zwei Zahlen addiert, als JavaScript-Code." }];
  assert.equal(chatReasoningEffort(coding, classifyProfile, {}), undefined);
  assert.equal(chatReasoningEffort(coding, classifyProfile, {}, "medium"), "low");
});

test("die Env des Betreibers schlaegt auch den Nutzerwunsch (Notbremse)", () => {
  const alltag = [{ role: "user", content: "Wie ist das Wetter in Berlin?" }];
  const env = { SMEJJ_LLM_KIMI_K3_REASONING_EFFORT: "low" };
  assert.equal(chatReasoningEffort(alltag, classifyProfile, env, "max"), "low");
});

test("ein unsinniger Nutzerwunsch faellt auf die Regel zurueck (fail-safe)", () => {
  const alltag = [{ role: "user", content: "Wie ist das Wetter in Berlin?" }];
  assert.equal(chatReasoningEffort(alltag, classifyProfile, {}, "turbo"), "low");
  assert.equal(chatReasoningEffort(alltag, classifyProfile, {}, null), "low");
});

test("latestUserPrompt nimmt die juengste Nutzerfrage", () => {
  assert.equal(latestUserPrompt([
    { role: "user", content: "alt" },
    { role: "assistant", content: "antwort" },
    { role: "user", content: "neu" }
  ]), "neu");
});

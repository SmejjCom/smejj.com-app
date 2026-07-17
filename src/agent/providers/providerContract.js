// smejj.com — Vertrag und Registry fuer Coding-Agent-Provider.
// Zweck: Neutrale Schnittstelle, hinter der jeder Anbieter (Cline, GLM, Kimi,
// kuenftig smejj 1.0) gekapselt wird. Frontend, Orchestrator und Task-System
// kennen nur diesen Vertrag — nie einen Anbieter direkt.
// Input: Provider-Implementierung. Output: validierte Registrierung.

import { AgentError } from "../errors.js";

/**
 * Pflichtmethoden jedes Providers (CodingAgentProvider).
 * Ein Provider, der eine Methode nicht unterstuetzt, wirft AgentError INVALID_REQUEST —
 * niemals stillschweigend ignorieren (fail-closed).
 */
export const PROVIDER_METHODS = Object.freeze([
  "startTask",
  "continueTask",
  "pauseTask",
  "resumeTask",
  "cancelTask",
  "approveAction",
  "rejectAction",
  "getStatus",
  "getResult",
  "streamEvents"
]);

/** Autonomiestufen (Durchsetzung erfolgt im Tool-Bus, Phase 2). */
export const AUTONOMY_LEVELS = Object.freeze(["observe", "assist", "supervised", "autonomous"]);

const registry = new Map();

/**
 * Registriert einen Provider. Prueft den Vertrag vollstaendig (fail-closed).
 * Input: { id, capabilities, provider }. Output: void.
 */
export function registerProvider(id, provider, { capabilities = [] } = {}) {
  const providerId = String(id || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(providerId)) {
    throw new AgentError("INVALID_REQUEST", "Provider-Id ist ungueltig.");
  }
  for (const method of PROVIDER_METHODS) {
    if (typeof provider?.[method] !== "function") {
      throw new AgentError("INTERNAL_ERROR", `Provider "${providerId}" erfuellt den Vertrag nicht: ${method} fehlt.`);
    }
  }
  registry.set(providerId, { id: providerId, provider, capabilities: Object.freeze([...capabilities]) });
}

/** Liefert einen registrierten Provider oder wirft PROVIDER_UNAVAILABLE. */
export function getProvider(id) {
  const entry = registry.get(String(id || "").trim());
  if (!entry) throw new AgentError("PROVIDER_UNAVAILABLE", `Provider "${id}" ist nicht verfuegbar.`);
  return entry.provider;
}

/** Liste aller registrierten Provider (fuer das Frontend, ohne Interna). */
export function listProviders() {
  return Array.from(registry.values()).map((entry) => ({ id: entry.id, capabilities: entry.capabilities }));
}

/** Nur fuer Tests: Registry leeren. */
export function __resetProviderRegistryForTests() {
  registry.clear();
}

/** Validiert AgentTaskInput minimal und fail-closed. Output: normalisierter Input. */
export function normalizeTaskInput(input = {}) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw new AgentError("INVALID_REQUEST", "prompt ist erforderlich.");
  const autonomyLevel = String(input.autonomy?.level || "supervised");
  if (!AUTONOMY_LEVELS.includes(autonomyLevel)) {
    throw new AgentError("INVALID_REQUEST", "autonomy.level ist ungueltig.");
  }
  return Object.freeze({
    taskId: String(input.taskId || "").slice(0, 120),
    userId: String(input.userId || "").slice(0, 120),
    workspaceId: String(input.workspaceId || "").slice(0, 120),
    provider: String(input.provider || "cline").slice(0, 40),
    model: String(input.model || "").slice(0, 200),
    prompt,
    messages: Array.isArray(input.messages) ? input.messages : [],
    repository: input.repository && typeof input.repository === "object" ? { ...input.repository } : undefined,
    permissions: Object.freeze({
      readFiles: input.permissions?.readFiles === true,
      writeFiles: input.permissions?.writeFiles === true,
      terminal: input.permissions?.terminal === true,
      browser: input.permissions?.browser === true,
      network: input.permissions?.network === true,
      git: input.permissions?.git === true,
      deployment: input.permissions?.deployment === true
    }),
    autonomy: Object.freeze({
      level: autonomyLevel,
      requireApprovalForDestructiveActions: input.autonomy?.requireApprovalForDestructiveActions !== false
    }),
    limits: Object.freeze({
      maxRuntimeSeconds: positiveNumber(input.limits?.maxRuntimeSeconds),
      maxSteps: positiveNumber(input.limits?.maxSteps),
      maxRetries: positiveNumber(input.limits?.maxRetries),
      maxCost: positiveNumber(input.limits?.maxCost),
      maxTokens: positiveNumber(input.limits?.maxTokens)
    }),
    successCriteria: Array.isArray(input.successCriteria) ? input.successCriteria.slice(0, 20).map(String) : []
  });
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

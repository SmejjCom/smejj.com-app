// smejj.com — HTTP-Fassade der Agent API (/api/agent/*).
// Zweck: Einziger Einstieg des Frontends in die Agentenplattform. Liefert
// ausschliesslich neutrale smejj.com-Events und -Fehler. Provider werden hier
// nur ausgewaehlt, nie direkt aufgerufen.
// Fail-closed: ohne SMEJJ_AGENT_API_ENABLED=YES ist die Route nicht vorhanden;
// der bestehende Cline-Pfad bleibt dann unveraendert zustaendig (Dual-Run).

import { SECURITY_HEADERS } from "../../../src/shared/platform.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { privateJson, readJson } from "../http/respond.js";
import { authenticatedUserId } from "../jobs/jobAccess.js";
import { agentErrorResponse, AgentError } from "../../../src/agent/errors.js";
import { getProvider, normalizeTaskInput, listProviders } from "../../../src/agent/providers/providerContract.js";
import { createClineProvider } from "../../../src/agent/providers/clineProvider.js";
import { createSessionStore } from "../../../src/agent/api/sessionStore.js";
import { registerProvider } from "../../../src/agent/providers/providerContract.js";
import { clineChatCompletion, clineResponseError, isModelId } from "../providers/clineClient.js";
import { getProviderCredential } from "../providers/providerCredentialVault.js";

const PREFIX = "/api/agent";
const requestGate = createRateLimiter({ capacity: 12, refillPerSec: 0.2, maxKeys: 20_000 });
const sessionStore = createSessionStore();

let providersReady = false;

/** Prueft das Feature-Flag. Default NO (fail-closed, Non-Regression). */
export function agentApiEnabled(env = process.env) {
  return String(env.SMEJJ_AGENT_API_ENABLED || "").trim().toUpperCase() === "YES";
}

// Registriert die Provider einmalig. Cline wird ueber den Adapter gekapselt —
// keine direkten Cline-Aufrufe ausserhalb des Adapters.
function ensureProviders(env, fetchImpl) {
  if (providersReady) return;
  registerProvider("cline", createClineProvider({
    clineChatCompletion: (args) => clineChatCompletion({ ...args, fetchImpl }),
    clineResponseError,
    loadCredential: async (userId) => {
      const record = await getProviderCredential(userId, "cline", env);
      if (!record?.enabled || !record.apiKey || !isModelId(record.selectedModel)) {
        throw new AgentError("MODEL_NOT_AVAILABLE", "Cline ist nicht konfiguriert.");
      }
      return record;
    },
    sessionStore
  }), { capabilities: ["streaming", "tools", "reasoning", "images"] });
  providersReady = true;
}

export async function handleAgentRoute(req, url, res, { env = process.env, fetchImpl = fetch } = {}) {
  // Nur Unterpfade: "/api/agent" selbst gehoert dem bestehenden Modell-Router-
  // Endpoint und darf hier nicht uebernommen werden (Non-Regression).
  if (!url.pathname.startsWith(`${PREFIX}/`)) return false;
  if (!agentApiEnabled(env)) return false; // Route existiert nicht -> alter Pfad greift.

  // `|| {}` ist noetig: authenticatedUserId hat nur einen undefined-Default und
  // wuerde bei authUser === null werfen statt zu verweigern (fail-closed).
  const subjectId = authenticatedUserId(req.authUser || {});
  if (!subjectId) {
    privateJson(res, 401, { ok: false, error: { code: "AUTHENTICATION_ERROR", message: "Anmeldung erforderlich." } });
    return true;
  }
  const limit = requestGate.take(subjectId, url.pathname.endsWith("/stream") ? 2 : 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: { code: "RATE_LIMITED", message: "Zu viele Anfragen.", retryAfterSec: limit.retryAfterSec } });
    return true;
  }

  try {
    ensureProviders(env, fetchImpl);

    if (req.method === "GET" && url.pathname === `${PREFIX}/providers`) {
      privateJson(res, 200, { ok: true, providers: listProviders() });
      return true;
    }
    if (req.method === "POST" && url.pathname === `${PREFIX}/tasks`) {
      await startTask(subjectId, req, res);
      return true;
    }
    const sessionMatch = url.pathname.match(/^\/api\/agent\/sessions\/([A-Za-z0-9-]{8,64})(\/[a-z]+)?$/);
    if (sessionMatch) {
      await handleSession(subjectId, sessionMatch[1], sessionMatch[2] || "", req, res);
      return true;
    }
    privateJson(res, 404, { ok: false, error: { code: "INVALID_REQUEST", message: "Unbekannte Agent-Route." } });
    return true;
  } catch (error) {
    const mapped = agentErrorResponse(error);
    privateJson(res, mapped.status, mapped.body);
    return true;
  }
}

async function startTask(subjectId, req, res) {
  const body = await readJson(req);
  const input = normalizeTaskInput({ ...body, userId: subjectId });
  const provider = getProvider(input.provider);
  const session = await provider.startTask(input);
  return privateJson(res, 201, { ok: true, ...session });
}

async function handleSession(subjectId, sessionId, action, req, res) {
  const session = sessionStore.requireOwned(sessionId, subjectId);
  const provider = getProvider(session.provider);

  if (req.method === "GET" && action === "/stream") return streamSession(provider, sessionId, res);
  if (req.method === "GET" && action === "") {
    return privateJson(res, 200, { ok: true, ...(await provider.getStatus(sessionId)) });
  }
  if (req.method === "GET" && action === "/result") {
    return privateJson(res, 200, { ok: true, ...(await provider.getResult(sessionId)) });
  }
  if (req.method === "POST") {
    switch (action) {
      case "/continue": await provider.continueTask(sessionId, await readJson(req)); break;
      case "/pause": await provider.pauseTask(sessionId); break;
      case "/resume": await provider.resumeTask(sessionId); break;
      case "/cancel": await provider.cancelTask(sessionId); break;
      case "/approve": {
        const body = await readJson(req);
        await provider.approveAction(sessionId, String(body.actionId || ""));
        break;
      }
      case "/reject": {
        const body = await readJson(req);
        await provider.rejectAction(sessionId, String(body.actionId || ""), String(body.reason || ""));
        break;
      }
      default:
        return privateJson(res, 404, { ok: false, error: { code: "INVALID_REQUEST", message: "Unbekannte Aktion." } });
    }
    return privateJson(res, 200, { ok: true, ...(await provider.getStatus(sessionId)) });
  }
  return privateJson(res, 405, { ok: false, error: { code: "INVALID_REQUEST", message: "Methode nicht erlaubt." } });
}

/** Streamt ausschliesslich smejj.com-Events. Der Provider-Name steht im Header,
 *  damit das Frontend Provider-unabhaengig bleibt. */
async function streamSession(provider, sessionId, res) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    Connection: "keep-alive",
    "x-smejj-agent-api": "1"
  });
  try {
    for await (const frame of provider.streamEvents(sessionId)) {
      res.write(frame);
    }
  } catch (error) {
    const agentError = agentErrorResponse(error).body.error;
    res.write(`event: task.failed\ndata: ${JSON.stringify({ sessionId, error: agentError, failedAt: new Date().toISOString() })}\n\n`);
  } finally {
    res.end();
  }
}

/** Nur fuer Tests: Provider-Registrierung zuruecksetzen. */
export function __resetAgentRoutesForTests() {
  providersReady = false;
}

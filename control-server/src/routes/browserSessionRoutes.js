// smejj.com control-server — Live-Browser-Session-Bridge.
// Der Control Server fuehrt selbst keine Browser-Aktionen aus. Er prueft
// Origin, Ziel, Rate-Limit, Konfiguration und Budget-Gate und leitet dann an
// den Remote-Browser-Worker weiter (POST /session, /session/act,
// /session/close). Antworten werden defensiv uebernommen (nur erwartete
// Felder, nur gueltige Screenshots). Fail-closed in jedem Zweifelsfall.
import { json, readJson } from "../http/respond.js";
import { clientKeyFromRequest, createRateLimiter } from "../http/rateLimiter.js";
import { isAllowedBrowserCaller, parseBrowserTarget } from "./browserProxyRoutes.js";
import { buildRemoteBrowserPlan, readRemoteBrowserConfig } from "./browserRemoteRoutes.js";

const SESSION_TIMEOUT_MS = 45_000;
// Interaktion braucht deutlich mehr Requests als Einmal-Rendern (jeder Klick
// ist ein Request) — eigener, grosszuegigerer Limiter, weiterhin pro Client.
const RATE_CAPACITY = clampInt(process.env.SMEJJ_BROWSER_SESSION_RATE_CAPACITY, 90, 1, 600);
const RATE_REFILL_PER_SEC = clampFloat(process.env.SMEJJ_BROWSER_SESSION_RATE_REFILL_PER_SEC, 1.5, 0.01, 30);
const defaultLimiter = createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function sanitizeSessionId(value) {
  const id = String(value || "");
  return /^[a-f0-9]{16,64}$/i.test(id) ? id : "";
}

function isSessionScreenshot(value) {
  const text = String(value || "");
  return text.startsWith("data:image/jpeg;base64,") || text.startsWith("data:image/png;base64,");
}

// Worker-Antwort defensiv uebernehmen: nur bekannte Felder, nur gueltige Werte.
export function sanitizeSessionPayload(payload, fallbackUrl = "") {
  if (!payload || payload.ok !== true) return null;
  const sessionId = sanitizeSessionId(payload.sessionId);
  if (!sessionId || !isSessionScreenshot(payload.screenshot)) return null;
  const viewport = payload.viewport || {};
  return {
    ok: true,
    remote: true,
    interactive: true,
    sessionId,
    screenshot: String(payload.screenshot),
    finalUrl: typeof payload.finalUrl === "string" && /^https?:\/\//i.test(payload.finalUrl)
      ? payload.finalUrl.slice(0, 2000)
      : fallbackUrl,
    title: String(payload.title || "").slice(0, 300),
    viewport: {
      width: clampInt(viewport.width, 1365, 360, 1920),
      height: clampInt(viewport.height, 900, 360, 1200)
    },
    expiresInMs: clampInt(payload.expiresInMs, 0, 0, 3_600_000)
  };
}

// Body-Validierung pro Endpunkt (fail-closed). Die Engine im Worker validiert
// erneut — hier wird nur weitergegeben, was plausibel ist.
export function validateSessionRequest(kind, body = {}) {
  if (kind === "open") {
    const parsed = parseBrowserTarget(body.url);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const viewport = body.viewport || {};
    return {
      ok: true,
      forward: {
        url: parsed.url.toString(),
        viewport: {
          width: clampInt(viewport.width, 1365, 360, 1920),
          height: clampInt(viewport.height, 900, 360, 1200)
        }
      }
    };
  }
  const sessionId = sanitizeSessionId(body.sessionId);
  if (!sessionId) return { ok: false, error: "session_id_invalid" };
  if (kind === "close") return { ok: true, forward: { sessionId } };
  if (kind === "act") {
    const action = body.action;
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      return { ok: false, error: "action_missing" };
    }
    if (action.type === "navigate") {
      const parsed = parseBrowserTarget(action.url);
      if (!parsed.ok) return { ok: false, error: parsed.error };
    }
    return { ok: true, forward: { sessionId, action } };
  }
  return { ok: false, error: "session_endpoint_unknown" };
}

export async function handleBrowserSession(kind, req, res, {
  env = process.env,
  limiter = defaultLimiter,
  fetchImpl = fetch,
  activeWorkers = 0,
  body = null
} = {}) {
  if (req && !isAllowedBrowserCaller(req, env)) {
    return json(res, 403, { ok: false, error: "Origin nicht erlaubt.", remote: false });
  }
  if (req && limiter) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfterSec));
      return json(res, 429, { ok: false, error: "Zu viele Live-Browser-Anfragen. Bitte kurz warten.", retryAfterSec: verdict.retryAfterSec });
    }
  }

  let input = body;
  if (input === null) {
    try {
      input = await readJson(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message || "Invalid JSON"), remote: false });
    }
  }

  const request = validateSessionRequest(kind, input || {});
  if (!request.ok) return json(res, 400, { ok: false, error: request.error, remote: false });

  const plan = buildRemoteBrowserPlan({ env, activeWorkers });
  if (!plan.ok) {
    return json(res, 503, {
      ok: false,
      error: "Live-Browser ist noch nicht freigegeben oder nicht konfiguriert.",
      remote: false,
      plan
    });
  }

  const config = readRemoteBrowserConfig(env);
  const path = kind === "open" ? "/session" : kind === "act" ? "/session/act" : "/session/close";
  let response;
  try {
    response = await fetchImpl(`${config.workerUrl}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(request.forward)
    });
  } catch (error) {
    return json(res, 502, { ok: false, error: `Live-Browser nicht erreichbar: ${String(error?.message || error).slice(0, 200)}`, remote: false });
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return json(res, 502, { ok: false, error: "Live-Browser lieferte keine gueltige JSON-Antwort.", remote: false });
  }

  if (kind === "close") {
    return json(res, 200, { ok: true, closed: payload.closed === true });
  }
  if (!response.ok || payload.ok !== true) {
    const status = [400, 404, 409, 410, 429].includes(response.status) ? response.status : 502;
    return json(res, status, { ok: false, error: String(payload.error || "Live-Browser-Aktion fehlgeschlagen").slice(0, 200), remote: false });
  }
  const clean = sanitizeSessionPayload(payload, kind === "open" ? request.forward.url : "");
  if (!clean) return json(res, 502, { ok: false, error: "Live-Browser-Antwort unvollstaendig.", remote: false });
  return json(res, 200, clean);
}

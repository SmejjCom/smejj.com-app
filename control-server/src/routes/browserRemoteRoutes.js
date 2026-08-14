// smejj.com control-server — Remote-Browser-Bridge.
// Der Control Server rendert nicht selbst. Er prueft Origin, Ziel, Rate-Limit
// und Konfiguration, dann delegiert er an einen stateless Playwright-Worker.
import { json } from "../http/respond.js";
import { clientKeyFromRequest, createRateLimiter } from "../http/rateLimiter.js";
import { evaluateWorkerBudget } from "../budget/budgetGate.js";
import { isAllowedBrowserCaller, parseBrowserTarget } from "./browserProxyRoutes.js";

const REMOTE_TIMEOUT_MS = 30_000;
const RATE_CAPACITY = clampInt(process.env.SMEJJ_REMOTE_BROWSER_RATE_CAPACITY, 12, 1, 120);
const RATE_REFILL_PER_SEC = clampFloat(process.env.SMEJJ_REMOTE_BROWSER_RATE_REFILL_PER_SEC, 0.2, 0.01, 10);
const defaultLimiter = createRateLimiter({ capacity: RATE_CAPACITY, refillPerSec: RATE_REFILL_PER_SEC });

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function readRemoteBrowserConfig(env = process.env) {
  const workerUrl = String(env.SMEJJ_REMOTE_BROWSER_WORKER_URL || "").trim().replace(/\/$/, "");
  const token = String(env.SMEJJ_REMOTE_BROWSER_TOKEN || "").trim();
  const enabled = env.SMEJJ_REMOTE_BROWSER_ENABLED === "YES";
  const missing = [
    !enabled && "SMEJJ_REMOTE_BROWSER_ENABLED=YES",
    !workerUrl && "SMEJJ_REMOTE_BROWSER_WORKER_URL",
    !token && "SMEJJ_REMOTE_BROWSER_TOKEN"
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    enabled,
    workerUrl,
    tokenPresent: Boolean(token),
    token,
    missing
  };
}

export function buildRemoteBrowserPlan({ env = process.env, activeWorkers = 0 } = {}) {
  const config = readRemoteBrowserConfig(env);
  const budget = evaluateWorkerBudget({ env, activeWorkers });
  return {
    ok: config.configured && budget.ok,
    provider: "salad",
    worker: "remote-browser-playwright",
    mode: "stateless-render",
    startsCompute: false,
    secretsInBrowser: false,
    configured: config.configured,
    missing: config.missing,
    budget
  };
}

export function remoteBrowserViewportFromUrl(url) {
  return {
    width: clampInt(url.searchParams.get("viewportWidth"), 1365, 360, 1920),
    height: clampInt(url.searchParams.get("viewportHeight"), 900, 360, 1200)
  };
}

// Gesundheits-Relay fuer die Statusseite: Der Worker hat BEWUSST keine
// oeffentliche Domain (Zeabur-intern), also kann der Browser ihn nicht selbst
// messen. Dieser Endpunkt pingt /health des Workers serverseitig — kein
// Playwright-Render, kein Token noetig (die /health des Workers ist offen),
// kein Rate-Limit-Verbrauch. 200 = Kette steht, 503 = Worker fehlt/tot.
const HEALTH_TIMEOUT_MS = 5_000;

export async function handleBrowserRemoteHealth(res, { env = process.env, fetchImpl = fetch } = {}) {
  const config = readRemoteBrowserConfig(env);
  if (!config.configured) {
    return json(res, 503, { ok: false, konfiguriert: false, fehlt: config.missing });
  }
  try {
    const antwort = await fetchImpl(`${config.workerUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    if (!antwort.ok) return json(res, 503, { ok: false, konfiguriert: true, worker: `Antwort ${antwort.status}` });
    return json(res, 200, { ok: true, konfiguriert: true, worker: "erreichbar" });
  } catch {
    return json(res, 503, { ok: false, konfiguriert: true, worker: "nicht erreichbar" });
  }
}

export async function handleBrowserRemote(url, res, {
  req = null,
  env = process.env,
  limiter = defaultLimiter,
  fetchImpl = fetch,
  activeWorkers = 0
} = {}) {
  if (req && !isAllowedBrowserCaller(req, env)) {
    return json(res, 403, { ok: false, error: "Origin nicht erlaubt.", remote: false });
  }
  if (req && limiter) {
    const verdict = limiter.take(clientKeyFromRequest(req));
    if (!verdict.allowed) {
      res.setHeader?.("Retry-After", String(verdict.retryAfterSec));
      return json(res, 429, { ok: false, error: "Zu viele Remote-Browser-Anfragen. Bitte kurz warten.", retryAfterSec: verdict.retryAfterSec });
    }
  }

  const parsed = parseBrowserTarget(url.searchParams.get("url"));
  if (!parsed.ok) return json(res, 400, { ok: false, error: parsed.error, remote: false });

  const plan = buildRemoteBrowserPlan({ env, activeWorkers });
  if (!plan.ok) {
    return json(res, 503, {
      ok: false,
      error: "Remote-Browser ist noch nicht freigegeben oder nicht konfiguriert.",
      remote: false,
      plan
    });
  }

  const config = readRemoteBrowserConfig(env);
  const viewport = remoteBrowserViewportFromUrl(url);
  let response;
  try {
    response = await fetchImpl(`${config.workerUrl}/render`, {
      method: "POST",
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({ url: parsed.url.toString(), viewport })
    });
  } catch (error) {
    return json(res, 502, { ok: false, error: `Remote-Browser nicht erreichbar: ${String(error?.message || error).slice(0, 200)}`, remote: false });
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    return json(res, 502, { ok: false, error: "Remote-Browser lieferte keine gueltige JSON-Antwort.", remote: false });
  }
  if (!response.ok || payload.ok === false) {
    return json(res, response.ok ? 502 : response.status, { ok: false, error: payload.error || "Remote-Browser-Rendering fehlgeschlagen.", remote: false });
  }

  return json(res, 200, {
    ok: true,
    remote: true,
    finalUrl: payload.finalUrl || parsed.url.toString(),
    title: payload.title || parsed.url.hostname,
    screenshot: payload.screenshot || "",
    viewport,
    capture: sanitizeCapture(payload.capture, viewport),
    pageHeight: clampInt(payload.pageHeight, 0, 0, 100000),
    links: sanitizeLinks(payload.links),
    status: payload.status || "rendered"
  });
}

// Worker-Antwort defensiv uebernehmen: nur http(s)-Links, nur endliche Zahlen,
// harte Obergrenzen — der Client rendert daraus klickbare Bereiche.
export function sanitizeCapture(capture, viewport) {
  const width = clampInt(capture?.width, viewport.width, 1, 4000);
  const height = clampInt(capture?.height, viewport.height, 1, 40000);
  return { width, height };
}

export function sanitizeLinks(links, maxLinks = 200) {
  if (!Array.isArray(links)) return [];
  const out = [];
  for (const link of links) {
    if (out.length >= maxLinks) break;
    const href = String(link?.href || "");
    if (!/^https?:\/\//i.test(href)) continue;
    const x = clampInt(link?.x, NaN, 0, 100000);
    const y = clampInt(link?.y, NaN, 0, 100000);
    const w = clampInt(link?.w, NaN, 1, 100000);
    const h = clampInt(link?.h, NaN, 1, 100000);
    if ([x, y, w, h].some((value) => !Number.isFinite(value))) continue;
    out.push({ href: href.slice(0, 2000), x, y, w, h });
  }
  return out;
}

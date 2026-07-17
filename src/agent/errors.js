// smejj.com — Einheitliche Fehlertaxonomie der Agentenplattform.
// Zweck: Provider-spezifische Fehler (Cline, GLM, Kimi, kuenftige Anbieter) werden in
// genau eine neutrale smejj.com-Fehlerklasse uebersetzt. Frontend und Orchestrator
// kennen ausschliesslich diese Klassen — niemals Provider-Rohfehler.
// Input: beliebiger Fehler/Statuscode. Output: { code, status, message, retryable }.

/** Alle zulaessigen Fehlerklassen der smejj.com Agent API. */
export const AGENT_ERROR_CODES = Object.freeze([
  "AUTHENTICATION_ERROR",
  "PROVIDER_UNAVAILABLE",
  "MODEL_NOT_AVAILABLE",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "CONTEXT_LIMIT_REACHED",
  "WORKER_START_FAILED",
  "WORKER_CRASHED",
  "TOOL_PERMISSION_DENIED",
  "TOOL_EXECUTION_FAILED",
  "BROWSER_FAILED",
  "TEST_FAILED",
  "VERIFICATION_FAILED",
  "TIMEOUT",
  "COST_LIMIT_REACHED",
  "TOKEN_LIMIT_REACHED",
  "STEP_LIMIT_REACHED",
  "USER_CANCELLED",
  "SECURITY_POLICY_VIOLATION",
  "INTERNAL_ERROR"
]);

const RETRYABLE = new Set(["PROVIDER_UNAVAILABLE", "RATE_LIMITED", "TIMEOUT", "WORKER_CRASHED"]);

const HTTP_STATUS = Object.freeze({
  AUTHENTICATION_ERROR: 401,
  PROVIDER_UNAVAILABLE: 503,
  MODEL_NOT_AVAILABLE: 409,
  RATE_LIMITED: 429,
  INVALID_REQUEST: 400,
  CONTEXT_LIMIT_REACHED: 413,
  WORKER_START_FAILED: 503,
  WORKER_CRASHED: 503,
  TOOL_PERMISSION_DENIED: 403,
  TOOL_EXECUTION_FAILED: 500,
  BROWSER_FAILED: 500,
  TEST_FAILED: 500,
  VERIFICATION_FAILED: 500,
  TIMEOUT: 504,
  COST_LIMIT_REACHED: 402,
  TOKEN_LIMIT_REACHED: 413,
  STEP_LIMIT_REACHED: 409,
  USER_CANCELLED: 499,
  SECURITY_POLICY_VIOLATION: 403,
  INTERNAL_ERROR: 500
});

// Bestehende String-Codes der Codebasis -> neutrale Klasse. Fail-closed: was hier
// nicht steht, wird INTERNAL_ERROR und nie stillschweigend durchgereicht.
const LEGACY_CODE_MAP = Object.freeze({
  authentication_required: "AUTHENTICATION_ERROR",
  worker_token_rejected: "AUTHENTICATION_ERROR",
  cline_api_key_invalid: "AUTHENTICATION_ERROR",
  cline_api_key_rejected: "AUTHENTICATION_ERROR",
  provider_credential_scope_invalid: "AUTHENTICATION_ERROR",
  provider_credential_encryption_not_configured: "PROVIDER_UNAVAILABLE",
  provider_unavailable: "PROVIDER_UNAVAILABLE",
  cline_api_error: "PROVIDER_UNAVAILABLE",
  cline_not_configured: "MODEL_NOT_AVAILABLE",
  cline_model_not_in_catalog: "MODEL_NOT_AVAILABLE",
  cline_model_catalog_empty: "MODEL_NOT_AVAILABLE",
  cline_model_id_invalid: "INVALID_REQUEST",
  cline_rate_limit: "RATE_LIMITED",
  provider_rate_limit: "RATE_LIMITED",
  cline_insufficient_credits: "COST_LIMIT_REACHED",
  messages_required: "INVALID_REQUEST",
  provider_route_not_found: "INVALID_REQUEST",
  model_tool_not_allowed: "TOOL_PERMISSION_DENIED",
  model_tool_invalid: "INVALID_REQUEST",
  unsafe_path: "SECURITY_POLICY_VIOLATION",
  command_not_allowed: "SECURITY_POLICY_VIOLATION",
  control_origin_invalid: "SECURITY_POLICY_VIOLATION"
});

/** Fehlerklasse der smejj.com Agent API. Traegt nie Provider-Rohdaten oder Secrets. */
export class AgentError extends Error {
  constructor(code, message, { retryable, providerStatus, requestId, cause } = {}) {
    const safeCode = AGENT_ERROR_CODES.includes(code) ? code : "INTERNAL_ERROR";
    super(String(message || safeCode).slice(0, 500));
    this.name = "AgentError";
    this.code = safeCode;
    this.status = HTTP_STATUS[safeCode];
    this.retryable = typeof retryable === "boolean" ? retryable : RETRYABLE.has(safeCode);
    if (Number.isFinite(Number(providerStatus))) this.providerStatus = Number(providerStatus);
    if (requestId) this.requestId = String(requestId).slice(0, 120);
    if (cause) this.cause = cause;
  }

  /** Serialisierung fuer Events und HTTP-Antworten (Deny-by-Default: nur diese Felder). */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.providerStatus ? { providerStatus: this.providerStatus } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {})
    };
  }
}

/**
 * Uebersetzt einen beliebigen Fehler in eine AgentError-Instanz.
 * Erkennt: AgentError (durchreichen), ClineApiError, Legacy-String-Codes, HTTP-Status.
 */
export function toAgentError(error, { fallback = "INTERNAL_ERROR" } = {}) {
  if (error instanceof AgentError) return error;

  const status = Number(error?.status || error?.statusCode || 0);
  const rawMessage = String(error?.message || "").slice(0, 500);

  if (error?.name === "ClineApiError") {
    return new AgentError(mapProviderStatus(status, error?.code), providerMessage(status, rawMessage), {
      providerStatus: status,
      requestId: error?.requestId
    });
  }
  if (error?.name === "AbortError" || /timeout|timed out/i.test(rawMessage)) {
    return new AgentError("TIMEOUT", "Zeitueberschreitung bei der Provider-Anfrage.");
  }

  const legacy = LEGACY_CODE_MAP[rawMessage] || LEGACY_CODE_MAP[String(error?.code || "")];
  if (legacy) return new AgentError(legacy, rawMessage, { providerStatus: status || undefined });

  if (status) {
    const mapped = mapProviderStatus(status, error?.code);
    if (mapped !== "INTERNAL_ERROR") {
      return new AgentError(mapped, providerMessage(status, rawMessage), { providerStatus: status });
    }
  }
  return new AgentError(fallback, rawMessage || "Interner Fehler.", { cause: error });
}

/** HTTP-Status eines Providers -> neutrale Klasse. 403 mit ENTITLEMENT = Plan/Guthaben. */
export function mapProviderStatus(status, providerCode = "") {
  const code = String(providerCode || "").toUpperCase();
  switch (Number(status)) {
    case 400: return "INVALID_REQUEST";
    case 401: return "AUTHENTICATION_ERROR";
    case 402: return "COST_LIMIT_REACHED";
    case 403: return code.includes("ENTITLEMENT") ? "MODEL_NOT_AVAILABLE" : "AUTHENTICATION_ERROR";
    case 404: return "MODEL_NOT_AVAILABLE";
    case 408: return "TIMEOUT";
    case 413: return "CONTEXT_LIMIT_REACHED";
    case 429: return "RATE_LIMITED";
    case 500: case 502: case 503: return "PROVIDER_UNAVAILABLE";
    case 504: return "TIMEOUT";
    default: return "INTERNAL_ERROR";
  }
}

/** Nutzerlesbare, provider-neutrale Meldung. Enthaelt nie Keys oder Rohantworten. */
function providerMessage(status, rawMessage) {
  switch (Number(status)) {
    case 401: return "Der hinterlegte API-Key wurde abgelehnt. Bitte in den Einstellungen erneuern.";
    case 402: return "Das Guthaben des Anbieters reicht nicht aus.";
    case 403: return "Das gewaehlte Modell ist mit dem aktuellen Zugang nicht freigeschaltet.";
    case 429: return "Der Anbieter drosselt aktuell die Anfragen. Bitte kurz warten.";
    case 500: case 502: case 503: return "Der Anbieter ist derzeit nicht erreichbar.";
    default: return rawMessage || "Der Anbieter meldet einen Fehler.";
  }
}

/** HTTP-Antwortkoerper aus einem beliebigen Fehler. */
export function agentErrorResponse(error) {
  const agentError = toAgentError(error);
  return { status: agentError.status, body: { ok: false, error: agentError.toJSON() } };
}

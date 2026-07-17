// smejj.com — Sitzungsspeicher der Agent API.
// Zweck: Haelt den Lebenszyklus-Zustand einer Agent-Sitzung. Der Control Server
// bleibt minimal: nur fluechtiger Prozess-Zustand mit harter Obergrenze und TTL.
// Dauerhafte Wahrheit ist die Task Capsule auf IDrive e2 (Object Brain).
// Input: Sitzungsdaten. Output: Sitzungsobjekt (ohne Secrets).

import { randomUUID } from "node:crypto";
import { AgentError } from "../errors.js";

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 500;

/**
 * Erzeugt einen Sitzungsspeicher. Kein Secret wird gespeichert — Credentials
 * werden pro Anfrage frisch aus dem Vault geladen.
 */
export function createSessionStore({ ttlMs = DEFAULT_TTL_MS, maxSessions = DEFAULT_MAX_SESSIONS, now = Date.now } = {}) {
  const sessions = new Map();

  function evictExpired() {
    const cutoff = now() - ttlMs;
    for (const [id, session] of sessions) {
      if (session.updatedAtMs < cutoff) sessions.delete(id);
    }
  }

  return {
    /** Legt eine Sitzung an. Output: Sitzungsobjekt. */
    create(data = {}) {
      evictExpired();
      if (sessions.size >= maxSessions) {
        throw new AgentError("RATE_LIMITED", "Zu viele gleichzeitige Sitzungen. Bitte kurz warten.");
      }
      const sessionId = randomUUID();
      const session = {
        sessionId,
        taskId: data.taskId || sessionId,
        userId: String(data.userId || ""),
        provider: String(data.provider || ""),
        model: String(data.model || ""),
        status: "created",
        messages: Array.isArray(data.messages) ? data.messages : [],
        autonomy: data.autonomy || { level: "supervised", requireApprovalForDestructiveActions: true },
        limits: data.limits || {},
        usage: { tokensIn: 0, tokensOut: 0, costUsd: 0, runtimeSeconds: 0 },
        resultText: "",
        error: null,
        abortController: typeof AbortController === "function" ? new AbortController() : null,
        createdAtMs: now(),
        updatedAtMs: now()
      };
      sessions.set(sessionId, session);
      return session;
    },

    /** Liefert eine Sitzung oder wirft INVALID_REQUEST (fail-closed). */
    require(sessionId) {
      evictExpired();
      const session = sessions.get(String(sessionId || ""));
      if (!session) throw new AgentError("INVALID_REQUEST", "Sitzung ist unbekannt oder abgelaufen.");
      return session;
    },

    /** Prueft Eigentuemerschaft — verhindert Fremdzugriff auf Sitzungen. */
    requireOwned(sessionId, userId) {
      const session = this.require(sessionId);
      if (!userId || session.userId !== String(userId)) {
        throw new AgentError("AUTHENTICATION_ERROR", "Kein Zugriff auf diese Sitzung.");
      }
      return session;
    },

    update(sessionId, patch = {}) {
      const session = this.require(sessionId);
      Object.assign(session, patch, { updatedAtMs: now() });
      return session;
    },

    delete(sessionId) {
      return sessions.delete(String(sessionId || ""));
    },

    size() {
      evictExpired();
      return sessions.size;
    }
  };
}

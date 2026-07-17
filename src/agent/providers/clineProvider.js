// smejj.com — ClineProvider: kapselt die bestehende Cline-Integration.
// Zweck: Cline ist ausschliesslich ueber diesen Adapter erreichbar. Cline-Aufrufe,
// -Fehler und -Streams verlassen dieses Modul nur in neutraler smejj.com-Form.
// Bestehendes Verhalten bleibt unveraendert (Non-Regression); dies ist eine
// Kapselung, keine Neuimplementierung.
// Input: AgentTaskInput. Output: AgentSession + smejj.com-Events.

import { AgentError, toAgentError } from "../errors.js";
import { AGENT_EVENTS, formatAgentEvent } from "../events/index.js";
import { translateOpenAiStream } from "../events/eventTranslator.js";

/**
 * Erzeugt einen ClineProvider. Die Cline-Abhaengigkeiten werden injiziert, damit
 * dieses Modul testbar bleibt und keine Transport-Details kennt.
 * Input: { clineChatCompletion, clineResponseError, loadCredential, sessionStore }.
 */
export function createClineProvider({
  clineChatCompletion,
  clineResponseError,
  loadCredential,
  sessionStore
} = {}) {
  if (typeof clineChatCompletion !== "function" || typeof loadCredential !== "function" || !sessionStore) {
    throw new AgentError("INTERNAL_ERROR", "ClineProvider wurde unvollstaendig konfiguriert.");
  }

  return {
    /** Startet eine Cline-Sitzung. Cline hat keinen serverseitigen Task-Zustand — der
     *  Zustand liegt vollstaendig im smejj.com-SessionStore. */
    async startTask(input) {
      const credential = await loadCredential(input.userId);
      const model = input.model || credential.selectedModel;
      const session = sessionStore.create({
        provider: "cline",
        model,
        userId: input.userId,
        taskId: input.taskId,
        autonomy: input.autonomy,
        limits: input.limits,
        messages: input.messages
      });
      return { sessionId: session.sessionId, provider: "cline", model, status: session.status };
    },

    async continueTask(sessionId, input) {
      const session = sessionStore.require(sessionId);
      sessionStore.update(sessionId, { messages: [...session.messages, ...(input?.messages || [])] });
    },

    /** Cline streamt synchron; Pause/Resume wirken auf die smejj.com-Sitzung. */
    async pauseTask(sessionId) {
      sessionStore.update(sessionId, { status: "paused", pausedAt: new Date().toISOString() });
    },

    async resumeTask(sessionId) {
      const session = sessionStore.require(sessionId);
      if (session.status !== "paused") throw new AgentError("INVALID_REQUEST", "Sitzung ist nicht pausiert.");
      sessionStore.update(sessionId, { status: "running", resumedAt: new Date().toISOString() });
    },

    async cancelTask(sessionId) {
      const session = sessionStore.require(sessionId);
      session.abortController?.abort();
      sessionStore.update(sessionId, { status: "cancelled", cancelledAt: new Date().toISOString() });
    },

    /** Cline fuehrt in Phase 1 keine Tools aus — Freigaben greifen ab Phase 2 (Tool-Bus). */
    async approveAction(sessionId, actionId) {
      sessionStore.require(sessionId);
      throw new AgentError("INVALID_REQUEST", `Freigaben sind fuer Cline noch nicht aktiv (Aktion ${actionId}).`);
    },

    async rejectAction(sessionId, actionId) {
      sessionStore.require(sessionId);
      throw new AgentError("INVALID_REQUEST", `Freigaben sind fuer Cline noch nicht aktiv (Aktion ${actionId}).`);
    },

    async getStatus(sessionId) {
      const session = sessionStore.require(sessionId);
      return {
        sessionId,
        provider: "cline",
        model: session.model,
        status: session.status,
        usage: session.usage
      };
    },

    async getResult(sessionId) {
      const session = sessionStore.require(sessionId);
      return { sessionId, status: session.status, text: session.resultText || "", error: session.error || null };
    },

    /**
     * Fuehrt die Cline-Anfrage aus und liefert ausschliesslich smejj.com-Events.
     * Der Cline-SSE-Stream wird im Translator zerlegt — rohe Provider-Frames
     * verlassen diesen Adapter nicht.
     */
    async *streamEvents(sessionId) {
      const session = sessionStore.require(sessionId);
      if (session.status === "paused") throw new AgentError("INVALID_REQUEST", "Sitzung ist pausiert.");
      const credential = await loadCredential(session.userId);

      yield formatAgentEvent(AGENT_EVENTS.taskStarted, {
        sessionId,
        taskId: session.taskId,
        provider: "cline",
        model: session.model,
        startedAt: new Date().toISOString()
      });
      sessionStore.update(sessionId, { status: "running" });

      let response;
      try {
        response = await clineChatCompletion({
          apiKey: credential.apiKey,
          model: session.model,
          messages: session.messages,
          stream: true,
          temperature: 0.7,
          maxTokens: session.limits?.maxTokens || 8_192,
          taskId: session.taskId
        });
        if (!response.ok || !response.body) {
          throw clineResponseError ? await clineResponseError(response) : new AgentError("PROVIDER_UNAVAILABLE", "Cline antwortet nicht.");
        }
      } catch (error) {
        const agentError = toAgentError(error);
        sessionStore.update(sessionId, { status: "failed", error: agentError.toJSON() });
        yield formatAgentEvent(AGENT_EVENTS.taskFailed, {
          sessionId,
          error: agentError.toJSON(),
          failedAt: new Date().toISOString()
        });
        return;
      }

      let text = "";
      try {
        // Deltas werden sofort weitergereicht — kein Sammeln, echtes Streaming.
        yield* translateOpenAiStream({
          reader: response.body.getReader(),
          sessionId,
          onText: (value) => { text = value; }
        });
        sessionStore.update(sessionId, { status: "completed", resultText: text });
        yield formatAgentEvent(AGENT_EVENTS.taskCompleted, {
          sessionId,
          result: { text },
          completedAt: new Date().toISOString()
        });
      } catch (error) {
        const agentError = toAgentError(error);
        sessionStore.update(sessionId, { status: "failed", resultText: text, error: agentError.toJSON() });
        yield formatAgentEvent(AGENT_EVENTS.taskFailed, {
          sessionId,
          error: agentError.toJSON(),
          failedAt: new Date().toISOString()
        });
      }
    }
  };
}

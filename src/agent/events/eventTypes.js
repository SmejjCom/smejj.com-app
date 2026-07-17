// smejj.com — Neutrale Event-Taxonomie der Agentenplattform.
// Zweck: Einzige zulaessige Event-Namen zwischen Agent API und Frontend. Provider-
// spezifische Strukturen (z. B. OpenAI-Deltas) duerfen das Frontend nie erreichen.
// Input: keiner (Konstanten). Output: eingefrorene Namens- und Feld-Allowlisten.

export const AGENT_EVENTS = Object.freeze({
  taskCreated: "task.created",
  taskStarted: "task.started",
  taskPlanning: "task.planning",
  taskPlanUpdated: "task.plan.updated",
  taskProgress: "task.progress",
  taskPaused: "task.paused",
  taskResumed: "task.resumed",

  assistantMessage: "assistant.message",
  reasoningSummary: "reasoning.summary",

  toolRequested: "tool.requested",
  toolApproved: "tool.approved",
  toolRejected: "tool.rejected",
  toolStarted: "tool.started",
  toolOutput: "tool.output",
  toolCompleted: "tool.completed",
  toolFailed: "tool.failed",

  fileRead: "file.read",
  fileCreated: "file.created",
  fileChanged: "file.changed",
  fileDeleted: "file.deleted",

  terminalStarted: "terminal.started",
  terminalOutput: "terminal.output",
  terminalCompleted: "terminal.completed",
  terminalFailed: "terminal.failed",

  browserStarted: "browser.started",
  browserNavigated: "browser.navigated",
  browserScreenshot: "browser.screenshot",
  browserCompleted: "browser.completed",
  browserFailed: "browser.failed",

  testStarted: "test.started",
  testResult: "test.result",
  testFailed: "test.failed",

  gitCheckpointCreated: "git.checkpoint.created",
  gitDiff: "git.diff",
  gitCommitCreated: "git.commit.created",
  gitRollbackCompleted: "git.rollback.completed",

  approvalRequired: "approval.required",
  approvalAccepted: "approval.accepted",
  approvalRejected: "approval.rejected",

  verificationStarted: "verification.started",
  verificationPassed: "verification.passed",
  verificationFailed: "verification.failed",

  usageUpdated: "usage.updated",
  limitWarning: "limit.warning",
  limitReached: "limit.reached",

  taskCompleted: "task.completed",
  taskFailed: "task.failed",
  taskCancelled: "task.cancelled"
});

/** Menge aller gueltigen Event-Namen (fail-closed: unbekannte Namen werden verworfen). */
export const AGENT_EVENT_NAMES = Object.freeze(new Set(Object.values(AGENT_EVENTS)));

// Deny-by-Default: pro Event nur diese Felder verlassen den Server. Alles andere
// (Provider-Rohobjekte, Header, Keys) wird von sanitizeEventData() entfernt.
export const AGENT_EVENT_FIELDS = Object.freeze({
  "task.created": ["sessionId", "taskId", "provider", "model", "autonomy", "createdAt"],
  "task.started": ["sessionId", "taskId", "provider", "model", "startedAt"],
  "task.planning": ["sessionId", "message"],
  "task.plan.updated": ["sessionId", "plan"],
  "task.progress": ["sessionId", "stepId", "status", "message", "percent"],
  "task.paused": ["sessionId", "pausedAt"],
  "task.resumed": ["sessionId", "resumedAt"],
  "assistant.message": ["sessionId", "delta", "text", "done"],
  "reasoning.summary": ["sessionId", "summary"],
  "tool.requested": ["sessionId", "actionId", "tool", "riskLevel", "arguments"],
  "tool.approved": ["sessionId", "actionId"],
  "tool.rejected": ["sessionId", "actionId", "reason"],
  "tool.started": ["sessionId", "actionId", "tool"],
  "tool.output": ["sessionId", "actionId", "chunk"],
  "tool.completed": ["sessionId", "actionId", "tool", "result"],
  "tool.failed": ["sessionId", "actionId", "tool", "error"],
  "file.read": ["sessionId", "path"],
  "file.created": ["sessionId", "path"],
  "file.changed": ["sessionId", "path", "additions", "deletions"],
  "file.deleted": ["sessionId", "path"],
  "terminal.started": ["sessionId", "actionId", "command"],
  "terminal.output": ["sessionId", "actionId", "chunk"],
  "terminal.completed": ["sessionId", "actionId", "exitCode"],
  "terminal.failed": ["sessionId", "actionId", "exitCode", "error"],
  "browser.started": ["sessionId", "actionId"],
  "browser.navigated": ["sessionId", "url", "title"],
  "browser.screenshot": ["sessionId", "screenshotKey", "viewport"],
  "browser.completed": ["sessionId", "actionId"],
  "browser.failed": ["sessionId", "actionId", "error"],
  "test.started": ["sessionId", "suite"],
  "test.result": ["sessionId", "suite", "passed", "failed", "durationMs"],
  "test.failed": ["sessionId", "suite", "error"],
  "git.checkpoint.created": ["sessionId", "checkpointRef"],
  "git.diff": ["sessionId", "diffSha256", "filesChanged"],
  "git.commit.created": ["sessionId", "commitSha", "diffSha256"],
  "git.rollback.completed": ["sessionId", "checkpointRef"],
  "approval.required": ["sessionId", "actionId", "tool", "riskLevel", "reason"],
  "approval.accepted": ["sessionId", "actionId"],
  "approval.rejected": ["sessionId", "actionId", "reason"],
  "verification.started": ["sessionId", "stages"],
  "verification.passed": ["sessionId", "stages", "diffSha256"],
  "verification.failed": ["sessionId", "stage", "error"],
  "usage.updated": ["sessionId", "tokensIn", "tokensOut", "costUsd", "runtimeSeconds"],
  "limit.warning": ["sessionId", "limit", "used", "max"],
  "limit.reached": ["sessionId", "limit", "max"],
  "task.completed": ["sessionId", "result", "completedAt"],
  "task.failed": ["sessionId", "error", "failedAt"],
  "task.cancelled": ["sessionId", "cancelledAt"]
});

/**
 * Entfernt alle nicht ausdruecklich erlaubten Felder eines Events (Deny-by-Default).
 * Schuetzt gegen Secret-Leaks und Provider-Strukturen im Event-Stream.
 */
export function sanitizeEventData(eventName, data) {
  const allowed = AGENT_EVENT_FIELDS[eventName];
  if (!allowed) return {};
  const result = {};
  for (const field of allowed) {
    if (data?.[field] !== undefined) result[field] = data[field];
  }
  return result;
}

/** Prueft, ob ein Event-Name zur smejj.com-Taxonomie gehoert. */
export function isAgentEvent(eventName) {
  return AGENT_EVENT_NAMES.has(String(eventName));
}

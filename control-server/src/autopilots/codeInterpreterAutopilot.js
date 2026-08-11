// smejj.com — Code Interpreter KI-Autopilot
// Führt JavaScript/Berechnungen in einer isolierten Umgebung mit Timeouts und Ergebnis-Erfassung aus.

import vm from "node:vm";

export const INTERPRETER_CONFIG = Object.freeze({
  timeoutMs: 3000,
  maxLogs: 100,
  maxOutputLength: 10000
});

export function runCodeInterpreter(code, contextVariables = {}) {
  if (typeof code !== "string" || !code.trim()) {
    return {
      status: "error",
      error: "Kein gueltiger Code zum Ausführen übergeben.",
      logs: [],
      result: null
    };
  }

  const logs = [];
  const safeConsole = {
    log: (...args) => logs.push(args.map(formatArg).join(" ")),
    info: (...args) => logs.push("[INFO] " + args.map(formatArg).join(" ")),
    warn: (...args) => logs.push("[WARN] " + args.map(formatArg).join(" ")),
    error: (...args) => logs.push("[ERROR] " + args.map(formatArg).join(" "))
  };

  const sandbox = {
    console: safeConsole,
    Math,
    Date,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    ...contextVariables
  };

  const context = vm.createContext(sandbox);

  const startTime = Date.now();
  let result = null;
  let status = "success";
  let errorDetail = null;

  try {
    const script = new vm.Script(code, {
      filename: "sandbox-interpreter.js"
    });
    result = script.runInContext(context, {
      timeout: INTERPRETER_CONFIG.timeoutMs
    });
  } catch (err) {
    status = "error";
    errorDetail = String(err?.message || err);
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    status,
    result: serializeResult(result),
    logs: logs.slice(0, INTERPRETER_CONFIG.maxLogs),
    error: errorDetail,
    executionTimeMs,
    timestamp: new Date().toISOString()
  };
}

function formatArg(arg) {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function serializeResult(val) {
  if (val === undefined) return undefined;
  if (typeof val === "function") return "[Function]";
  if (typeof val === "symbol") return val.toString();
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return String(val);
  }
}

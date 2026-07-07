import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFatal, installCrashGuard } from "../control-server/src/http/crashGuard.js";

function fakeProc() {
  const proc = { events: {}, exitCalls: [] };
  proc.on = (name, fn) => {
    proc.events[name] = fn;
    return proc;
  };
  proc.exit = (code) => proc.exitCalls.push(code);
  return proc;
}

test("crash guard registriert beide Prozess-Events", () => {
  const proc = fakeProc();
  const handlers = installCrashGuard(proc, () => {});
  assert.equal(proc.events.uncaughtException, handlers.onUncaught);
  assert.equal(proc.events.unhandledRejection, handlers.onRejection);
});

test("uncaughtException loggt Message + Stack und beendet mit Exit 1", () => {
  const proc = fakeProc();
  const lines = [];
  installCrashGuard(proc, (line) => lines.push(line));
  const boom = new Error("boom-detail");
  proc.events.uncaughtException(boom);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /FATAL uncaughtException: boom-detail/);
  assert.match(lines[0], /crash-guard\.test\.mjs/); // Stack enthaelt Aufrufort
  assert.deepEqual(proc.exitCalls, [1]);
});

test("unhandledRejection mit Nicht-Error-Reason wird als String geloggt", () => {
  const proc = fakeProc();
  const lines = [];
  installCrashGuard(proc, (line) => lines.push(line));
  proc.events.unhandledRejection("nur-ein-string");
  assert.match(lines[0], /FATAL unhandledRejection: nur-ein-string/);
  assert.deepEqual(proc.exitCalls, [1]);
});

test("Logger-Fehler verhindert den kontrollierten Exit nicht (fail-closed)", () => {
  const proc = fakeProc();
  installCrashGuard(proc, () => {
    throw new Error("logger kaputt");
  });
  proc.events.uncaughtException(new Error("x"));
  assert.deepEqual(proc.exitCalls, [1]);
});

test("formatFatal ist deterministisch und markiert smejj.com", () => {
  const line = formatFatal("uncaughtException", "abc");
  assert.equal(line, "smejj.com control-server FATAL uncaughtException: abc");
});

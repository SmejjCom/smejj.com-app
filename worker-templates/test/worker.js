#!/usr/bin/env node
// smejj.com worker-templates — stateless Test-Worker
// (Single Responsibility: Task Capsule lesen → Verifikationskommandos ausfuehren → Ergebnis nach IDrive e2 → Status melden).
//
// Ablauf (vollstaendig zustandslos, idempotent):
//   1. Capsule-Input von IDrive e2 lesen (input.json unter SMEJJ_TASK_CAPSULE_PREFIX)
//   2. Status "running" signiert an den Control Server melden
//   3. Verifikationskommandos ausfuehren (Whitelist, Timeout)
//   4. test-results.json + status.json in die Capsule auf IDrive e2 schreiben
//   5. Endstatus "verifying" → "passed"/"failed" signiert melden
// Kein lokaler Zustand ueberlebt den Job. Memory lernt hier nichts — das entscheidet
// der Control Server nur nach bestandener Verification Pipeline.

// KEIN Unit-Test: Diese Datei ist die ausfuehrbare Test-Worker-VORLAGE. Der
// Ordner heisst "test/" (Worker-Art), darum sammelt `node --test` sie als
// vermeintliche Testdatei ein und startete sie ohne Capsule-Umgebung — seit
// jeher der eine rote Dauer-Fail der Suite (behoben 2026-08-25). Im
// Test-Runner-Kontext steigt sie deshalb sofort sauber aus.
if (process.env.NODE_TEST_CONTEXT) {
  console.log("worker-templates/test/worker.js ist die Worker-Vorlage, kein Test — uebersprungen.");
  process.exit(0);
}
import { spawn } from "node:child_process";
import { controlConfigFromEnv, reportStatus } from "../shared/controlClient.js";
import { e2ConfigFromEnv, getJson, putJson } from "../shared/e2Client.js";

const ALLOWED_BINARIES = new Set(["node", "npm", "pnpm", "yarn"]);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function loadTestWorkerConfig(env = process.env) {
  const e2 = e2ConfigFromEnv(env);
  const control = controlConfigFromEnv(env);
  const jobId = String(env.SMEJJ_JOB_ID || "").trim();
  const capsulePrefix = normalizePrefix(env.SMEJJ_TASK_CAPSULE_PREFIX || "");
  const missing = [
    ...e2.missing,
    ...control.missing,
    !jobId && "SMEJJ_JOB_ID",
    !capsulePrefix && "SMEJJ_TASK_CAPSULE_PREFIX"
  ].filter(Boolean);
  return {
    ok: missing.length === 0,
    missing,
    jobId,
    capsulePrefix,
    workDir: env.SMEJJ_WORKSPACE_DIR || process.cwd(),
    timeoutMs: boundedTimeout(env.SMEJJ_TEST_TIMEOUT_MS),
    e2,
    control
  };
}

export async function runTestWorker(config, { io = { getJson, putJson }, report = reportStatus, exec = execCommand, now = () => new Date().toISOString() } = {}) {
  if (!config.ok) return { ok: false, stage: "preflight", reasons: config.missing };

  const inputKey = `${config.capsulePrefix}input.json`;
  const resultsKey = `${config.capsulePrefix}test-results.json`;
  const statusKey = `${config.capsulePrefix}status.json`;

  let input;
  try {
    input = await io.getJson(config.e2, inputKey);
  } catch (error) {
    await report({ control: config.control, jobId: config.jobId, status: "failed", message: `capsule_input_unreadable: ${error.message}`.slice(0, 200) });
    return { ok: false, stage: "claim", reason: "capsule_input_unreadable" };
  }

  await report({ control: config.control, jobId: config.jobId, status: "running", message: "Test worker claimed task capsule" });

  const commands = sanitizeCommands(input.verificationCommands);
  if (commands.length === 0) {
    await report({ control: config.control, jobId: config.jobId, status: "failed", message: "no_allowed_verification_commands" });
    return { ok: false, stage: "plan", reason: "no_allowed_verification_commands" };
  }

  const results = [];
  let allPassed = true;
  for (const command of commands) {
    const result = await exec(command, config.workDir, config.timeoutMs);
    results.push({ command: command.join(" "), code: result.code, stdoutTail: result.stdout.slice(-4000), stderrTail: result.stderr.slice(-4000) });
    if (result.code !== 0) { allPassed = false; break; }
  }

  await report({ control: config.control, jobId: config.jobId, status: "verifying", message: "Writing test results to task capsule" });

  const finishedAt = now();
  const summary = {
    version: 1,
    jobId: config.jobId,
    worker: "worker-templates/test",
    stateless: true,
    ok: allPassed,
    commandsPlanned: commands.length,
    commandsRun: results.length,
    results,
    finishedAt
  };
  try {
    await io.putJson(config.e2, resultsKey, summary);
    await io.putJson(config.e2, statusKey, { version: 1, jobId: config.jobId, status: allPassed ? "passed" : "failed", updatedAt: finishedAt });
  } catch (error) {
    await report({ control: config.control, jobId: config.jobId, status: "failed", message: `capsule_write_failed: ${error.message}`.slice(0, 200) });
    return { ok: false, stage: "persist", reason: "capsule_write_failed" };
  }

  const finalStatus = allPassed ? "passed" : "failed";
  await report({ control: config.control, jobId: config.jobId, status: finalStatus, message: `Test worker finished: ${results.length}/${commands.length} commands, ok=${allPassed}` });
  return { ok: allPassed, stage: "done", status: finalStatus, resultsKey, statusKey, summary };
}

export function sanitizeCommands(rawCommands) {
  const list = Array.isArray(rawCommands) ? rawCommands : [];
  const safe = [];
  for (const raw of list.slice(0, 10)) {
    const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0 || !ALLOWED_BINARIES.has(parts[0])) continue;
    if (parts.some((part) => /[;&|><`$]/.test(part))) continue;
    safe.push(parts);
  }
  return safe;
}

function execCommand(parts, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(parts[0], parts.slice(1), { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: 127, stdout: "", stderr: error.message || "spawn failed" }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
  });
}

function normalizePrefix(value) {
  const prefix = String(value || "").trim();
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function boundedTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(60 * 60 * 1000, Math.max(10_000, number));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const config = loadTestWorkerConfig(process.env);
  runTestWorker(config).then((result) => {
    console.log(JSON.stringify({ worker: "worker-templates/test", ...summarize(result) }, null, 2));
    process.exit(result.ok ? 0 : 1);
  });
}

function summarize(result) {
  const { summary, ...rest } = result;
  return { ...rest, commandsRun: summary?.commandsRun };
}

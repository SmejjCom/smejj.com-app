// smejj.com Training-Loop-Worker — dauerhafter Prozess (Zeabur), der den
// Eval-Zyklus (scripts/evaluation/run_model_eval.mjs) und den Trainings-
// Warteschlangen-Zyklus (src/training/pipeline.js) auf eigenen Intervallen
// laufen laesst. Single Responsibility: HTTP-Health-Vertrag + Scheduler-Start.
//
// Fail-closed in zwei Stufen: ohne SMEJJ_TRAINING_LOOP_ENABLED=YES beantwortet
// der Server /health, tickt aber nie (sicher deploybar im Aus-Zustand). Der
// Trainingszyklus selbst bleibt zusaetzlich hinter SMEJJ_TRAINING_CAPTURE_ENABLED
// (src/training/constants.js#isCaptureEnabled) — der bestehenden, projektweiten
// Sperre fuer jede Trainingsdaten-Erfassung.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLoopConfig } from "./config.js";
import { createLoop } from "./loop.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TICK_POLL_MS = 30_000;

export function createServer({ config, loop, readyCheck = () => true }) {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const ready = readyCheck();
      const status = loop.getStatus();
      const body = JSON.stringify({
        ok: ready,
        loopEnabled: config.loopEnabled,
        evalCycleEnabled: config.evalCycleEnabled,
        trainingCycleEnabled: config.trainingCycleEnabled,
        ...status
      });
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
}

export function startTicking(loop, { intervalMs = TICK_POLL_MS, config, log = console.log, setIntervalImpl = setInterval } = {}) {
  if (!config.loopEnabled) {
    log("[smejj-training-loop] SMEJJ_TRAINING_LOOP_ENABLED != YES — Server laeuft, Loop bleibt aus (fail-closed).");
    return null;
  }
  const timer = setIntervalImpl(() => {
    loop.tick().catch((error) => log(`[smejj-training-loop] tick failed: ${String(error?.message || error).slice(0, 200)}`));
  }, intervalMs);
  if (typeof timer?.unref === "function") timer.unref();
  return timer;
}

async function main() {
  const config = loadLoopConfig(process.env);
  const loop = createLoop({ config, repoRoot: REPO_ROOT });
  const server = createServer({ config, loop });
  startTicking(loop, { config });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  console.log(`[smejj-training-loop] listening on ${config.host}:${config.port} (loopEnabled=${config.loopEnabled})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[smejj-training-loop] fatal: ${String(error?.stack || error)}`);
    process.exitCode = 1;
  });
}

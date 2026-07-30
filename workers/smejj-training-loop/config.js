// smejj.com training-loop worker — environment configuration (Single Responsibility: config parsing).
// Two independent gates, both fail-closed (default "NO"): the loop process itself
// (SMEJJ_TRAINING_LOOP_ENABLED) and the existing training-capture master gate
// (SMEJJ_TRAINING_CAPTURE_ENABLED, see src/training/constants.js#isCaptureEnabled).
// An unset or misconfigured environment never starts real work.

import { chatEndpointFromEnv } from "../../src/evaluation/evalTransport.js";

function flag(env, name) {
  return String(env[name] || "NO").trim().toUpperCase() === "YES";
}

function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function isTrainingLoopEnabled(env = process.env) {
  return flag(env, "SMEJJ_TRAINING_LOOP_ENABLED");
}

export function loadLoopConfig(env = process.env) {
  return Object.freeze({
    port: boundedInt(env.PORT, 8080, 1, 65535),
    host: env.SMEJJ_HOST || "0.0.0.0",
    loopEnabled: isTrainingLoopEnabled(env),
    // Each cycle has its own switch so eval-only operation is possible without
    // touching anything training/consent related.
    evalCycleEnabled: flag(env, "SMEJJ_TRAINING_LOOP_EVAL_ENABLED"),
    trainingCycleEnabled: flag(env, "SMEJJ_TRAINING_LOOP_TRAINING_ENABLED"),
    // Bridge rate limit is 12 req/min/client (measured 2026-07-28); default
    // delay keeps eval calls well under it without needing a live probe.
    evalDelayMs: boundedInt(env.SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS, 6000, 1000, 60000),
    evalIntervalMs: boundedInt(env.SMEJJ_TRAINING_LOOP_EVAL_INTERVAL_MS, 30 * 60 * 1000, 5 * 60 * 1000, 24 * 60 * 60 * 1000),
    trainingIntervalMs: boundedInt(env.SMEJJ_TRAINING_LOOP_TRAINING_INTERVAL_MS, 5 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    trainingBatchSize: boundedInt(env.SMEJJ_TRAINING_LOOP_BATCH_SIZE, 5, 1, 50),
    // Obergrenze fuer EINEN Zyklus. Ein Eval-Lauf braucht ~2 Minuten; 15 Minuten
    // sind reichlich Luft. Wird sie ueberschritten, gibt der Waechter in loop.js
    // die Sperre frei — ohne ihn koennte eine haengende Verbindung den Loop
    // dauerhaft und lautlos anhalten (Dauerbetrieb-Anforderung).
    tickMaxMs: boundedInt(env.SMEJJ_TRAINING_LOOP_TICK_MAX_MS, 15 * 60 * 1000, 60 * 1000, 60 * 60 * 1000),
    // Wie viele Messungen der Verlauf im Prozess behaelt. 60 reichen bei einem
    // 6-Stunden-Takt fuer gut zwei Wochen Trend. Begrenzt, weil der Prozess
    // unbefristet laeuft — eine unbegrenzte Liste waere ein Speicherleck.
    verlaufMax: boundedInt(env.SMEJJ_TRAINING_LOOP_VERLAUF_MAX, 60, 1, 500),
    // Gemessener Weg. Umstellen ist ein Zahlenwechsel, kein Release:
    //   SMEJJ_EVAL_CHAT_ENDPOINT=https://smejj-control.zeabur.app/api/chat
    // Ohne Angabe bleibt es bei der Schnellspur. Der Wechsel trennt bewusst die
    // Vergleichskette (siehe findBaselineReport) — zwei Spuren sind nicht
    // vergleichbar, und ein Wechsel darf nicht als Regression erscheinen.
    chatEndpoint: chatEndpointFromEnv(env),
    suiteId: env.SMEJJ_TRAINING_LOOP_SUITE_ID || "smejj-chat-core",
    suitePath: env.SMEJJ_TRAINING_LOOP_SUITE_PATH || "evals/suites/smejj-chat-core-v1.json",
    baselineDir: env.SMEJJ_TRAINING_LOOP_BASELINE_DIR || "docs/benchmarks",
    queuePrefix: "training/queue/v1/",
    checkpointKey: "ops/smejj-training-loop/checkpoint.json"
  });
}

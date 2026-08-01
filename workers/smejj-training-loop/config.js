// smejj.com training-loop worker — environment configuration (Single Responsibility: config parsing).
// Two independent gates, both fail-closed (default "NO"): the loop process itself
// (SMEJJ_TRAINING_LOOP_ENABLED) and the existing training-capture master gate
// (SMEJJ_TRAINING_CAPTURE_ENABLED, see src/training/constants.js#isCaptureEnabled).
// An unset or misconfigured environment never starts real work.

import { chatEndpointFromEnv } from "../../src/evaluation/evalTransport.js";
import { wiederholungenAusEnv } from "../../src/evaluation/evalScoring.js";

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

/**
 * Anteil von tickMaxMs, ab dem gewarnt wird. Bewusst unter 1: die Schaetzung
 * kennt nur die Abstaende, nicht die Antwortzeiten der Modellaufrufe. Bei 14
 * Faellen und 10 Wiederholungen sind allein die Abstaende 14 Minuten von 15 —
 * rechnerisch "passt" das, in Wirklichkeit laeuft der Zyklus in den Abbruch.
 */
export const ZYKLUS_SICHERHEITSANTEIL = 0.8;

/**
 * Grobe Dauer eines Eval-Zyklus, nur aus den Abstaenden — die Antwortzeiten der
 * Modellaufrufe kommen obendrauf. Zweck: der Waechter in loop.js bricht einen
 * Zyklus nach tickMaxMs ab. Bei 14 Faellen, 3 Wiederholungen und 6000 ms sind es
 * rund 4 Minuten gegen 15 Minuten Limit — das passt. Bei hoeheren Werten muss
 * die Rechnung erneut aufgehen, und genau das prueft diese Funktion.
 */
export function evalDauerSchaetzungMs({ faelle, wiederholungen, delayMs }) {
  const n = Math.max(0, Number(faelle) || 0);
  const w = Math.max(1, Number(wiederholungen) || 1);
  const d = Math.max(0, Number(delayMs) || 0);
  return n * w * d;
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
    // Bridge rate limit is 12 req/min/client (measured 2026-07-28). 6000 ms is
    // 10/min = 83 % of that — NOT "well under it", as this comment claimed until
    // 2026-07-31. Nachgemessen wurde es damals trotzdem: 0 mal HTTP 429 in einem
    // vollen Lauf. Der Abstand darf deshalb nicht verkleinert werden.
    evalDelayMs: boundedInt(env.SMEJJ_TRAINING_LOOP_EVAL_DELAY_MS, 6000, 1000, 60000),
    // Wie oft jeder Fall JE LAUF ausgefuehrt wird. Mehr Wiederholungen machen die
    // Messung ruhiger, nicht schneller: evalDelayMs bleibt zwischen JEDEM Aufruf,
    // die Ratenbegrenzung wird also nicht staerker belastet — nur die Gesamtzahl
    // der Aufrufe und damit die Dauer steigen (siehe evalDauerSchaetzungMs).
    evalWiederholungen: wiederholungenAusEnv(env),
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

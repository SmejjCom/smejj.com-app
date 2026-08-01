// smejj.com training-loop worker — scheduling (Single Responsibility: when to run what).
// `tick()` is cheap and idempotent: call it as often as you like (worker.mjs
// polls every 30s) and it only actually runs a cycle once its interval has
// elapsed since the last checkpointed run. This is what makes the process
// crash-safe — on restart the checkpoint (read from IDrive e2) tells it
// exactly where it left off, no in-memory-only state to lose.
import { defaultCheckpoint, readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { runEvalCycle } from "./evalCycle.js";
import { reportKey, readReportFromIdrive, writeReportToIdrive } from "./reportStore.js";
import { runTrainingCycle } from "./trainingCycle.js";

const MAX_CONSECUTIVE_FAILURES_LOGGED = 20;

export function createLoop({ config, env = process.env, repoRoot, log = console.log, deps = {} }) {
  let status = { state: "starting", lastTickAt: null, lastError: null };
  // Zwei Schutzmechanismen, beide im Livegang 2026-07-28 als noetig belegt:
  //   inFlight       — ein Eval-Lauf dauert laenger als der Tick-Abstand. Ohne
  //                    Sperre startet der Takt weitere Laeufe in den laufenden
  //                    hinein und vervielfacht die (kostenpflichtigen) Modellaufrufe.
  //   memoryCheckpoint — faellt die Ablage aus, liefert readCheckpoint immer die
  //                    Standardwerte; der Loop haelt sich dann bei JEDEM Tick fuer
  //                    faellig. Der Stand im Prozess haelt das Intervall trotzdem ein.
  let inFlight = false;
  let memoryCheckpoint = null;
  // Verlauf im Prozess. Grund: die Archivierung der vollen Berichte braucht
  // Zugangsdaten fuer die Ablage, die der Loop nicht zwingend hat. Der TREND —
  // wird das Modell besser oder schlechter — ist aber die eigentliche Frage und
  // darf davon nicht abhaengen. Bewusst begrenzt (config.verlaufMax), damit der
  // Speicherbedarf im Dauerbetrieb nicht waechst.
  const verlauf = [];
  function aufzeichnen(eintrag) {
    verlauf.push(eintrag);
    while (verlauf.length > config.verlaufMax) verlauf.shift();
  }

  async function tick(now = () => new Date()) {
    if (inFlight) return memoryCheckpoint || defaultCheckpoint();
    inFlight = true;
    // Waechter fuer den Dauerbetrieb: haengt ein Zyklus (z. B. eine Verbindung
    // ohne Timeout), bliebe inFlight sonst fuer immer gesetzt — der Loop waere
    // still tot, ohne Absturz und ohne Meldung. Nach der Obergrenze wird die
    // Sperre freigegeben, damit der naechste Takt wieder greifen kann.
    let freigegeben = false;
    const freigeben = () => { if (!freigegeben) { freigegeben = true; inFlight = false; } };
    const waechter = setTimeout(() => {
      log(`[smejj-training-loop] Zyklus laeuft laenger als ${config.tickMaxMs} ms — Sperre freigegeben, damit der Loop nicht dauerhaft stehenbleibt.`);
      status = { ...status, lastError: "zyklus_zeitueberschreitung" };
      freigeben();
    }, config.tickMaxMs);
    if (typeof waechter?.unref === "function") waechter.unref();
    try {
      status = { ...status, lastTickAt: now().toISOString() };
      const checkpoint = memoryCheckpoint
        || await readCheckpoint({ env, key: config.checkpointKey, request: deps.checkpointRequest });
      let next = checkpoint;

      if (config.evalCycleEnabled && dueFor(checkpoint.lastEvalRunAt, config.evalIntervalMs, now)) {
        next = await runEvalTick(next, { config, repoRoot, env, log, deps, now, aufzeichnen });
      }

      if (config.trainingCycleEnabled && dueFor(checkpoint.lastTrainingRunAt, config.trainingIntervalMs, now)) {
        next = await runTrainingTick(next, { config, env, log, deps, now });
      }

      memoryCheckpoint = next;
      if (next !== checkpoint) {
        await writeCheckpoint(next, { env, key: config.checkpointKey, request: deps.checkpointRequest });
      }
      status = { state: "running", lastTickAt: status.lastTickAt, lastError: status.lastError };
      return next;
    } finally {
      clearTimeout(waechter);
      freigeben();
    }
  }

  function getStatus() {
    return { ...status, verlaufAnzahl: verlauf.length };
  }

  function getVerlauf() {
    return verlauf.map((eintrag) => ({ ...eintrag }));
  }

  return Object.freeze({ tick, getStatus, getVerlauf });
}

function dueFor(lastRunAt, intervalMs, now) {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return true;
  return now().getTime() - last >= intervalMs;
}

async function runEvalTick(checkpoint, { config, repoRoot, env, log, deps, now, aufzeichnen = () => {} }) {
  try {
    const readReport = deps.readReport || readReportFromIdrive;
    const writeReport = deps.writeReport || writeReportToIdrive;
    const baseline = checkpoint.lastEvalReportKey
      ? await readReport(checkpoint.lastEvalReportKey, { env }).catch(() => null)
      : null;

    const fileName = `modeleval-${config.suiteId}-live-default-${now().toISOString().slice(0, 10)}.json`;
    const target = reportKey(fileName);

    // Eine nicht erreichbare Ablage darf eine bereits bezahlte Messung nicht
    // wertlos machen: der Bericht wird dann ins Protokoll geschrieben statt
    // verworfen. Die Messung selbst gilt weiter als gelaufen.
    let persistError = null;
    const result = await runEvalCycle({
      repoRoot,
      suitePath: config.suitePath,
      baseline,
      reportTarget: target,
      chatEndpoint: config.chatEndpoint,
      delayMs: config.evalDelayMs,
      wiederholungen: config.evalWiederholungen,
      tickMaxMs: config.tickMaxMs,
      log,
      callModel: deps.callModel,
      readSuite: deps.readSuite,
      writeReport: async (t, report) => {
        try {
          await writeReport(t, report, { env });
        } catch (error) {
          persistError = String(error?.message || error).slice(0, 160);
        }
      },
      now
    });
    if (!result.ok) {
      log(`[smejj-training-loop] eval cycle rejected: ${result.reason}`);
      return bumpFailure(checkpoint, "eval", now);
    }
    log(`[smejj-training-loop] eval cycle done: ${result.verdict}${result.regressed ? " (REGRESSION)" : ""}`);
    // Die Kennzahlen immer ins Protokoll — ohne Ablage sind sie sonst weg.
    if (result.summary) log(`[smejj-training-loop] ${String(result.summary).replace(/\n/g, " | ")}`);

    const eintrag = {
      zeitpunkt: now().toISOString(),
      urteil: result.verdict,
      abgelegt: !persistError,
      ...(result.kennzahlen || {})
    };
    aufzeichnen(eintrag);
    // EINE Zeile mit festen Feldnamen. Zweck: selbst wenn nur die Zeabur-
    // Protokolle uebrig sind, laesst sich der Trend mit `grep VERLAUF` in
    // Sekunden herausziehen. Freitext waere dafuer unbrauchbar.
    log(`[smejj-training-loop] VERLAUF zeitpunkt=${eintrag.zeitpunkt} urteil=${eintrag.urteil}`
      + ` punktzahl=${eintrag.punktzahl ?? "?"} bestanden=${eintrag.bestanden ?? "?"}/${eintrag.faelle ?? "?"}`
      + ` kritisch=${eintrag.kritischeFehler ?? "?"} p95ms=${eintrag.p95Ms ?? "?"}`
      + ` wiederholungen=${eintrag.wiederholungen ?? "?"} wackelig=${eintrag.wackelig ?? "?"}`
      + ` abgelegt=${eintrag.abgelegt}`);
    // Eigene Zeile fuer die wackeligen Faelle: sie sind die Erklaerung fuer jede
    // Schwankung der Gesamtpunktzahl. Ohne sie liest sich Rauschen wie ein Einbruch.
    if (Array.isArray(eintrag.wackeligeFaelle) && eintrag.wackeligeFaelle.length > 0) {
      log(`[smejj-training-loop] WACKELIG ${eintrag.wackeligeFaelle
        .map((f) => `${f.fall}=${f.bestanden}/${f.laeufe}`).join(" ")}`);
    }

    if (persistError) {
      log(`[smejj-training-loop] Bericht NICHT abgelegt (${persistError}) — Kennzahlen stehen im Verlauf (/verlauf) und im Protokoll. IDRIVE_E2_* pruefen.`);
    }
    return {
      ...checkpoint,
      lastEvalRunAt: now().toISOString(),
      lastEvalVerdict: result.verdict,
      // Nur einen tatsaechlich abgelegten Bericht als naechste Vergleichsbasis merken.
      lastEvalReportKey: persistError ? checkpoint.lastEvalReportKey : target,
      consecutiveEvalFailures: 0
    };
  } catch (error) {
    log(`[smejj-training-loop] eval cycle error: ${String(error?.message || error).slice(0, 200)}`);
    return bumpFailure(checkpoint, "eval", now);
  }
}

async function runTrainingTick(checkpoint, { config, env, log, deps, now }) {
  try {
    const result = await runTrainingCycle({
      env,
      queuePrefix: config.queuePrefix,
      batchSize: config.trainingBatchSize,
      alreadyProcessed: checkpoint.lastTrainingProcessedKeys,
      resolvers: deps.resolvers,
      getPlan: deps.getPlan,
      listImpl: deps.listImpl,
      writePlan: deps.writePlan
    });
    log(`[smejj-training-loop] training cycle: ${result.succeeded}/${result.attempted} written`);
    return {
      ...checkpoint,
      lastTrainingRunAt: now().toISOString(),
      // Bounded so the checkpoint object itself never grows without limit.
      lastTrainingProcessedKeys: result.processedKeys.slice(-2000),
      consecutiveTrainingFailures: result.ok ? 0 : checkpoint.consecutiveTrainingFailures + 1
    };
  } catch (error) {
    log(`[smejj-training-loop] training cycle error: ${String(error?.message || error).slice(0, 200)}`);
    return bumpFailure(checkpoint, "training", now);
  }
}

function bumpFailure(checkpoint, kind, now) {
  const field = kind === "eval" ? "consecutiveEvalFailures" : "consecutiveTrainingFailures";
  const runField = kind === "eval" ? "lastEvalRunAt" : "lastTrainingRunAt";
  const count = Math.min(MAX_CONSECUTIVE_FAILURES_LOGGED, (checkpoint[field] || 0) + 1);
  return { ...checkpoint, [field]: count, [runField]: now().toISOString() };
}

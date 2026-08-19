// smejj.com control-server — Buchhaltung der Maus-Laeufe im Hintergrund.
//
// WARUM ES DIESE DATEI GIBT (2026-08-19): mausEngineRoutes.js riss die
// 800-Zeilen-Regel. Hier steht alles, was einen Async-Lauf VERWALTET —
// Schluessel, Spiegel im Arbeitsspeicher, e2-Ablage und die
// Hintergrund-Ausfuehrung. Die Route selbst entscheidet nur noch, WANN.
//
// Die Trennung ist nicht kosmetisch: der In-Memory-Spiegel ist bewusst
// fluechtig, die e2-Ablage ist die einzige dauerhafte Wahrheit. Wer das
// verwechselt, baut genau den Fehler, gegen den der Kommentar unten warnt.
import { idriveConfigFromEnv } from "../../../workers/maus-engine/artifact-uploader.mjs";
import { signedS3Request } from "../../../workers/glm-salad/s3.js";

export const ASYNC_RUN_TIMEOUT_MS = 900_000;
const ASYNC_RUN_MEMORY_LIMIT = 50;

// Async-Laeufe (Salad-Gateway/Cloudflare kappt lange Antworten nach ~100 s):
// POST mit async:true antwortet sofort mit runId; das Ergebnis wird als
// e2-Objekt persistiert (Task Capsule First) und ueber GET ?runId= gepollt.
// In-Memory nur als schneller Status-Spiegel (Control laeuft mit 1 Replica);
// die einzige dauerhafte Wahrheit ist das e2-Objekt — fail-closed.
const asyncRuns = new Map();

function asyncRunKey(runId) {
  return `capsules/maus-engine/runs/${runId}.json`;
}

export function rememberAsyncRun(runId, entry) {
  asyncRuns.set(runId, { ...asyncRuns.get(runId), ...entry, updatedAt: new Date().toISOString() });
  while (asyncRuns.size > ASYNC_RUN_MEMORY_LIMIT) {
    asyncRuns.delete(asyncRuns.keys().next().value);
  }
}

export function countRunningAsyncRuns() {
  let running = 0;
  for (const entry of asyncRuns.values()) if (entry.status === "laeuft") running += 1;
  return running;
}

export function defaultRunStore(env) {
  return {
    async put(runId, payload) {
      const config = idriveConfigFromEnv(env);
      await signedS3Request(config, "PUT", asyncRunKey(runId), JSON.stringify(payload, null, 2), "application/json");
    },
    async get(runId) {
      const config = idriveConfigFromEnv(env);
      try {
        return JSON.parse(await signedS3Request(config, "GET", asyncRunKey(runId)));
      } catch {
        return null;
      }
    }
  };
}

// Hintergrund-Ausfuehrung eines Async-Laufs: Ergebnis-Payload bauen, als
// e2-Objekt persistieren (dauerhafte Wahrheit) und den In-Memory-Spiegel
// aktualisieren. Harte Zeitobergrenze, damit kein Lauf ewig "laeuft".
export async function runAsyncInBackground({ runId, capsuleRef, execute, store }) {
  let payload;
  // Sobald der Plan steht, wird die planId veroeffentlicht — im Spiegel UND
  // auf e2. Damit findet die Wiedergabe den Live-Pfad, waehrend der Lauf noch
  // laeuft. Fail-safe: schlaegt das Schreiben fehl, laeuft der Lauf weiter.
  const onPlan = async ({ planId }) => {
    rememberAsyncRun(runId, { status: "laeuft", capsuleRef, planId });
    try {
      await store.put(runId, { ok: true, status: "laeuft", runId, capsuleRef, planId, startedAt: new Date().toISOString() });
    } catch {
      // absichtlich still — der In-Memory-Spiegel traegt die Anzeige weiter
    }
  };
  try {
    const outcome = await Promise.race([execute(onPlan), asyncTimeoutMarker()]);
    if (outcome && outcome.ok) {
      const { artifacts, ...resultSummary } = outcome.result || {};
      payload = {
        ok: true,
        status: "fertig",
        runId,
        capsuleRef,
        planId: outcome.plan?.planId ?? null,
        plannerCalls: outcome.plannerCalls ?? null,
        history: outcome.history || [],
        result: resultSummary,
        finishedAt: new Date().toISOString()
      };
    } else {
      payload = {
        ok: false,
        status: "fehlgeschlagen",
        runId,
        capsuleRef,
        error: outcome?.error || "maus_engine_lauf_fehlgeschlagen",
        plannerCalls: outcome?.plannerCalls ?? null,
        history: outcome?.history || [],
        lastFailure: outcome?.lastFailure
          ? { failedStep: outcome.lastFailure.failedStep ?? null, aborted: outcome.lastFailure.aborted === true, abortReason: outcome.lastFailure.abortReason ?? null, error: outcome.lastFailure.error ?? null, errors: outcome.lastFailure.errors }
          : null,
        finishedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    payload = {
      ok: false,
      status: "fehlgeschlagen",
      runId,
      capsuleRef,
      error: String(error?.message || error).slice(0, 300),
      finishedAt: new Date().toISOString()
    };
  }
  try {
    await store.put(runId, payload);
  } catch (error) {
    payload.persistError = String(error?.message || error).slice(0, 200);
  }
  rememberAsyncRun(runId, { status: payload.status, capsuleRef, payload });
}

function asyncTimeoutMarker() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: "async_zeitueberschreitung" }), ASYNC_RUN_TIMEOUT_MS);
    timer.unref?.();
  });
}
// Der Spiegel wird nur GELESEN, nie von aussen beschrieben — sonst waere die
// Regel "e2 ist die Wahrheit" schon wieder aufgeweicht.
export function leseAsyncLauf(runId) {
  return asyncRuns.get(runId);
}

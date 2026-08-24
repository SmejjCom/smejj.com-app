// smejj.com control-server — Worker-Client der Maus-Engine: Bereitschafts-
// Gate und die beiden Dispatcher (Plan- und Loop-Pfad).
// Wortgleich aus mausEngineRoutes.js ausgelagert am 2026-08-24 (800-Zeilen-
// Regel); mausEngineRoutes.js re-exportiert, die Schnittstelle ist unveraendert.

export const WORKER_TIMEOUT_MS = 330_000;

export async function waitForWorkerReady({ config, fetchImpl = fetch, maxWaitMs = 240_000, pollMs = 5_000, sleep } = {}) {
  const pause = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + maxWaitMs;
  let attempts = 0;
  while (Date.now() <= deadline) {
    attempts += 1;
    try {
      const response = await fetchImpl(`${config.workerUrl}/health`, { method: "GET" });
      if (response?.ok === true || response?.status === 200) {
        const body = await response.json().catch(() => null);
        if (body?.ok === true) return { ready: true, attempts };
      }
    } catch {
      // Netz-/Gateway-Fehler zaehlen als "noch nicht bereit" — kein Abbruch.
    }
    if (Date.now() + pollMs > deadline) break;
    await pause(pollMs);
  }
  return { ready: false, attempts };
}

// Eine Deutung fuer Plan- und Loop-Pfad: zwei Rechenwege waeren zwei
// Wahrheiten. `error` bleibt maschinenlesbar (z. B. "nicht_autorisiert"),
// `abortReason` traegt den Status zusaetzlich fuer die Anzeige.
// Klartext-Regel: 401/403 heisst Token-Unterschied, nicht "Maus kaputt".
// Gibt den Fehlerstatus zurueck oder 0, wenn kein Fehler BELEGT ist.
// Bewusst vorsichtig: nur ein positiv erkannter Nicht-2xx-Status gilt als
// Fehler. `waitForWorkerReady` akzeptiert oben ebenso `ok` ODER `status` —
// wer hier strenger prueft, erklaert erfolgreiche Laeufe zu Fehlern, sobald
// eine Antwort nur eines von beiden Feldern traegt.
export function workerStatusFehler(response) {
  if (response?.ok === true) return 0;
  const status = Number(response?.status ?? 0);
  if (status >= 200 && status < 300) return 0;
  return status > 0 ? status : 0;
}

export function workerHttpFehler(status, summary) {
  const roh = summary && typeof summary === "object" ? summary.error ?? summary.abortReason : null;
  const error = String(roh || `worker_http_${status}`).slice(0, 160);
  const hinweis = status === 401 || status === 403
    ? " (Token von Control-Server und Maus-Engine stimmen nicht ueberein)"
    : "";
  return { infra: true, aborted: true, error, abortReason: `worker_http_${status}: ${error}${hinweis}` };
}

// Worker-Aufruf: Ausfuehrung ausschliesslich im stateless Salad-Worker.
// 422 (Plan abgelehnt) wird als Abbruch an den Roundtrip zurueckgemeldet.
export function buildRunPlan({ config, fetchImpl, saveAsMacro, readiness }) {
  return async (plan) => {
    const gate = await waitForWorkerReady({ config, fetchImpl, ...(readiness || {}) });
    if (!gate.ready) {
      return { ok: false, infra: true, aborted: true, abortReason: `worker_nicht_bereit_nach_${gate.attempts}_versuchen` };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.workerUrl}/run`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify({ plan, ...(saveAsMacro ? { saveAsMacro } : {}) })
      });
      const summary = await response.json().catch(() => null);
      if (!summary || typeof summary !== "object") {
        return { ok: false, infra: true, aborted: true, abortReason: `worker_antwort_ungueltig_http_${response.status}` };
      }
      if (summary.rejected === true) {
        return { ok: false, aborted: true, abortReason: `plan_abgelehnt: ${(summary.errors || []).slice(0, 3).join(" | ")}` };
      }
      // HTTP-Status pruefen. Eine 401/403/500 der Engine ist KEIN inhaltlich
      // gescheiterter Lauf: ohne diese Pruefung kam der Fehler-Body als
      // `summary` durch und erzeugte {ok:false} ohne failedStep, ohne aborted,
      // mit leerem actionLog — eine Signatur, die der Interpreter gar nicht
      // erzeugen kann. Der echte Grund (z. B. nicht_autorisiert) fiel weg.
      const fehlerStatus = workerStatusFehler(response);
      if (fehlerStatus) {
        return { ok: false, ...workerHttpFehler(fehlerStatus, summary) };
      }
      return summary;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "worker_timeout" : `worker_fehler: ${String(error?.message || error).slice(0, 160)}`;
      return { ok: false, infra: true, aborted: true, abortReason: reason };
    } finally {
      clearTimeout(timer);
    }
  };
}

// Interaktiver Loop-Modus (additiv 2026-07-15): der Loop laeuft IM Worker
// (dort lebt der Browser). Der Control Server dispatcht nur den loopTask
// und reicht das haerte Budget durch; der Worker lehnt ohne eigene
// Planer-Konfiguration fail-closed ab.
export function buildRunLoop({ config, fetchImpl, readiness }) {
  return async ({ task, policyInput }) => {
    const gate = await waitForWorkerReady({ config, fetchImpl, ...(readiness || {}) });
    if (!gate.ready) {
      return { ok: false, infra: true, aborted: true, abortReason: `worker_nicht_bereit_nach_${gate.attempts}_versuchen`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.workerUrl}/run`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify({ loopTask: { task, policyInput } })
      });
      const summary = await response.json().catch(() => null);
      if (!summary || typeof summary !== "object") {
        return { ok: false, infra: true, aborted: true, abortReason: `worker_antwort_ungueltig_http_${response.status}`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      if (summary.rejected === true) {
        return { ok: false, aborted: true, abortReason: `loop_abgelehnt: ${(summary.errors || []).slice(0, 3).join(" | ")}`, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      const fehlerStatusLoop = workerStatusFehler(response);
      if (fehlerStatusLoop) {
        return { ok: false, ...workerHttpFehler(fehlerStatusLoop, summary), loopSteps: 0, modelCalls: 0, recordedSteps: [] };
      }
      return summary;
    } catch (error) {
      const reason = error?.name === "AbortError" ? "worker_timeout" : `worker_fehler: ${String(error?.message || error).slice(0, 160)}`;
      return { ok: false, infra: true, aborted: true, abortReason: reason, loopSteps: 0, modelCalls: 0, recordedSteps: [] };
    } finally {
      clearTimeout(timer);
    }
  };
}


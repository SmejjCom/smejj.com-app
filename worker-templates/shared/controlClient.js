// smejj.com worker-templates — signierte Status-Callbacks an den Control Server
// (Single Responsibility: Worker→Control-Server-Kommunikation).
// Nutzt exakt dieselbe Signaturfunktion wie die Serverseite (kein Drift moeglich).
import {
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  signWorkerPayload
} from "../../control-server/src/auth/workerAuth.js";

export function controlConfigFromEnv(env = {}) {
  const controlUrl = String(env.SMEJJ_CONTROL_ROUTER_URL || "").replace(/\/$/, "");
  const secret = String(env.SMEJJ_WORKER_CALLBACK_SECRET || "").trim();
  const missing = [
    !controlUrl && "SMEJJ_CONTROL_ROUTER_URL",
    !secret && "SMEJJ_WORKER_CALLBACK_SECRET"
  ].filter(Boolean);
  return { ok: missing.length === 0, missing, controlUrl, secret };
}

export async function reportStatus({ control, jobId, status, message = "", fetchImpl = fetch, nowMs = Date.now() }) {
  if (!control?.ok) return { ok: false, skipped: true, reason: "control_config_incomplete", missing: control?.missing || [] };
  const rawBody = JSON.stringify({ status, message });
  try {
    const response = await fetchImpl(`${control.controlUrl}/api/jobs/${encodeURIComponent(jobId)}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [WORKER_TIMESTAMP_HEADER]: String(nowMs),
        [WORKER_SIGNATURE_HEADER]: signWorkerPayload(control.secret, nowMs, rawBody)
      },
      body: rawBody
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    // Telemetrie darf den Capsule-Fluss nie brechen — Quelle der Wahrheit bleibt IDrive e2.
    return { ok: false, skipped: false, reason: "control_unreachable", message: String(error?.message || error).slice(0, 200) };
  }
}

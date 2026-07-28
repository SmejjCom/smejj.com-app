import { createIdriveLiteCodingJob } from "../../../src/jobs/index.js";
import { parseS3Keys, signedS3Get, signedS3List } from "../storage/s3Signer.js";
import { getJob, saveJob } from "./jobStore.js";

const DURABLE_STATUSES = new Set(["queued", "planning", "running", "verifying", "passed", "failed", "cancelled", "blocked"]);

// QA-Welle 3, Befund W3-03: Ein Job stand 15 Tage auf "queued". Der Scheduler
// lebt nur im Speicher — ein laufender oder wartender Status, der aus IDrive
// hydriert wird, stammt zwingend aus einem FRUEHEREN Serverlauf und wird nie
// wieder aufgegriffen. Solche Zombie-Eintraege verwirren die Jobliste und
// lassen unklar, ob noch Budget reserviert ist. Zur doppelten Absicherung
// gegen Uhrenfehler gilt zusaetzlich eine Zeitschwelle deutlich oberhalb des
// Worker-Timeouts (65 min): erst nach 2 Stunden ohne Fortschritt wird der
// Status beim Hydrieren auf "failed" gesetzt. Idempotent — die Ablage auf
// IDrive bleibt unveraendert (Daten-Lock), nur die Sicht im Server aendert sich.
const STALE_IN_FLIGHT_MS = 2 * 60 * 60 * 1000;
const IN_FLIGHT_STATUSES = new Set(["queued", "planning", "running", "verifying"]);

export function staleInFlight(status, updatedAt, { nowMs = Date.now(), staleMs = STALE_IN_FLIGHT_MS } = {}) {
  if (!IN_FLIGHT_STATUSES.has(status)) return false;
  const parsed = Date.parse(String(updatedAt || ""));
  if (!Number.isFinite(parsed)) return true; // ohne Zeitstempel: fail-closed als verwaist behandeln
  return nowMs - parsed > staleMs;
}

export async function hydrateJobFromIdrive(jobId, { env = process.env, getObject } = {}) {
  if (!safeJobId(jobId) || !hasIdrive(env)) return null;
  const reader = getObject || ((key) => signedS3Get({
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region: env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_BUCKET,
    key
  }));
  try {
    const queue = parse(await reader(`jobs/open/${jobId}.json`));
    const root = String(queue.taskCapsuleRoot || "");
    if (!safeRoot(root, jobId)) return null;
    const input = parse(await reader(`${root}input.json`));
    const status = parse(await reader(`${root}status.json`));
    const [diff, finalReport, repository, approval, budget, actionLog, changeSet, errorsDoc] = await Promise.all([
      optionalText(reader, `${root}patch.diff`),
      optionalText(reader, `${root}final-report.md`),
      optionalJson(reader, `${root}repository.json`),
      optionalJson(reader, `${root}approval.json`),
      optionalJson(reader, `${root}budget.json`),
      optionalJson(reader, `${root}action-log.json`),
      optionalJson(reader, `${root}change-set.json`),
      optionalJson(reader, `${root}errors.json`)
    ]);
    const errors = compactHydratedErrors(errorsDoc);
    const job = createIdriveLiteCodingJob({
      jobId,
      projectId: input.projectId,
      userId: input.userId || "",
      task: input.task || "",
      modelId: input.model?.id || "glm-5-2",
      createdAt: input.createdAt,
      repository: input.repository || null,
      parentJobId: input.context?.parentJobId || "",
      preview: input.preview || { required: false },
      contextPaths: input.contextPaths || {},
      executionMode: input.executionMode || "edit",
      replay: input.replay || null
    });
    if (job.taskCapsule.rootPrefix !== root) return null;
    let durableStatus = DURABLE_STATUSES.has(status.status) ? status.status : "queued";
    let durableMessage = status.message || "Hydrated from IDrive e2";
    if (staleInFlight(durableStatus, status.updatedAt || input.createdAt)) {
      // W3-03: verwaister Lauf aus einem frueheren Serverprozess.
      durableMessage = `Wegen Inaktivitaet als fehlgeschlagen markiert — Job stand seit ${String(status.updatedAt || input.createdAt || "unbekannt").slice(0, 16)} ohne Fortschritt (frueherer Serverlauf). Bitte neu starten.`;
      durableStatus = "failed";
    }
    return saveJob({
      ...job,
      status: durableStatus,
      phase: durableStatus === "failed" && status.phase !== "failed" ? "failed" : (status.phase || durableStatus),
      progress: Number(status.progress || 0),
      message: durableMessage,
      updatedAt: status.updatedAt || input.createdAt,
      durableTaskCapsule: true,
      approval: approval?.status ? { ...job.approval, ...approval, mergeAllowed: false } : job.approval,
      executionBudget: {
        modelActions: Math.max(0, Number(budget?.execution?.modelActions || 0)),
        maxModelActions: Math.max(0, Number(budget?.execution?.maxModelActions || 0))
      },
      ...(queue.diffSha256 || diff || finalReport || errors.length ? {
        result: {
          ok: durableStatus === "passed",
          status: durableStatus,
          errors,
          diff,
          diffSha256: queue.diffSha256 || null,
          changeSet: changeSet?.schemaVersion === 1 ? changeSet : null,
          repository: repository || null,
          actionLog: actionLog?.status === "ready" ? actionLog.plan : null,
          actionLogSha256: actionLog?.actionLogSha256 || null,
          finalReport
        }
      } : {})
    });
  } catch {
    return null;
  }
}

export async function hydrateRecentJobsFromIdrive({
  env = process.env,
  limit = 50,
  listObjects,
  hydrateJob = hydrateJobFromIdrive
} = {}) {
  if (!hasIdrive(env)) return { ok: false, reason: "idrive_e2_not_configured", hydrated: [] };
  const listing = listObjects
    ? await listObjects("jobs/open/")
    : await signedS3List({
        endpoint: env.IDRIVE_E2_ENDPOINT,
        region: env.IDRIVE_E2_REGION || "us-west-2",
        accessKey: env.IDRIVE_E2_ACCESS_KEY,
        secretKey: env.IDRIVE_E2_SECRET_KEY,
        bucket: env.IDRIVE_E2_BUCKET,
        prefix: "jobs/open/"
      });
  const response = listing?.response || { ok: true, status: 200 };
  if (!response.ok) return { ok: false, reason: `idrive_list_failed_${response.status}`, hydrated: [] };
  const keys = Array.isArray(listing?.keys) ? listing.keys : parseS3Keys(String(listing?.body || ""));
  const jobIds = keys
    .map((key) => String(key).match(/^jobs\/open\/([a-zA-Z0-9][a-zA-Z0-9._-]{1,120})\.json$/)?.[1])
    .filter(Boolean)
    .slice(-Math.min(100, Math.max(1, Number(limit) || 50)))
    .reverse();
  const hydrated = [];
  for (let offset = 0; offset < jobIds.length; offset += 5) {
    const batch = jobIds.slice(offset, offset + 5);
    const results = await Promise.all(batch.map(async (jobId) => getJob(jobId) || hydrateJob(jobId, { env })));
    hydrated.push(...results.filter(Boolean).map((job) => job.id));
  }
  return { ok: true, hydrated, scanned: jobIds.length };
}

async function optionalText(reader, key) {
  try {
    const result = await reader(key);
    return String(typeof result === "string" ? result : result?.body || "");
  } catch {
    return "";
  }
}

async function optionalJson(reader, key) {
  const value = await optionalText(reader, key);
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function parse(result) {
  const body = typeof result === "string" ? result : result?.body;
  return JSON.parse(String(body || "{}"));
}

// Fehlerursachen aus errors.json der Task Capsule; gleiche Kappung wie resultForJob()
// im autonomousRunner (max. 20 Eintraege, source 100 / detail 500 Zeichen).
function compactHydratedErrors(errorsDoc) {
  return (Array.isArray(errorsDoc?.errors) ? errorsDoc.errors : []).slice(0, 20).map((error) => ({
    source: String(error?.source || "unknown").slice(0, 100),
    detail: String(error?.detail || "").slice(0, 500)
  }));
}

function hasIdrive(env) {
  return Boolean(env.IDRIVE_E2_ENDPOINT && env.IDRIVE_E2_ACCESS_KEY && env.IDRIVE_E2_SECRET_KEY && env.IDRIVE_E2_BUCKET);
}

function safeJobId(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(String(value || ""));
}

function safeRoot(value, jobId) {
  return new RegExp(`^jobs/\\d{4}/\\d{2}/\\d{2}/[a-f0-9]{2}/${escapeRegex(jobId)}/$`).test(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// smejj.com control-server — Job-Routen (Single Responsibility: Job-Lifecycle-API).
// POST /api/jobs             → Job-Envelope + Task-Capsule-Write-Plan (optional Persistenz auf IDrive e2)
// GET  /api/jobs/{id}        → Statusabfrage (Polling)
// GET  /api/jobs/{id}/events → Status-Streaming per SSE (event-driven)
// POST /api/jobs/{id}/status → Worker-Callback (HMAC-signiert, meldet Statusübergänge)
// POST /api/free-executor    → kostenfreier Executor ohne Inferenzstart
import { ROUTES } from "../../../src/shared/platform.js";
import {
  buildTaskCapsuleWritePlan,
  createStorageFirstJobEnvelope,
  runFreeAppExecutor,
  transitionIdriveLiteJob,
  writeJobEnvelopeToIdrive
} from "../../../src/jobs/index.js";
import { json, readJson, readRawBody } from "../http/respond.js";
import { signedS3Put } from "../storage/s3Signer.js";
import { getJob, replaceJob, saveJob, subscribeToJob } from "../jobs/jobStore.js";
import { openEventStream, sendEvent, startHeartbeat } from "../streaming/sse.js";
import { verifyWorkerSignature } from "../auth/workerAuth.js";
import { buildHttpDispatch, createAutonomousRunner } from "../orchestrator/autonomousRunner.js";

export function hasLocalIdriveConfig(env = process.env) {
  return Boolean(env.IDRIVE_E2_ENDPOINT && env.IDRIVE_E2_ACCESS_KEY && env.IDRIVE_E2_SECRET_KEY && env.IDRIVE_E2_BUCKET);
}

export async function handleCreateJob(req, res) {
  const body = await readJson(req);
  if (!String(body.task || "").trim()) return json(res, 400, { error: "Missing task" });
  const env = process.env;
  const envelope = createStorageFirstJobEnvelope({ body, env });
  saveJob(envelope.job);

  if (body.persistToIdrive === true) {
    if (!hasLocalIdriveConfig(env)) {
      return json(res, 503, {
        ...envelope,
        ok: false,
        error: "IDrive e2 env is not configured for server-side task capsule writes. Job remains available as write plan only."
      });
    }
    const result = await writeJobEnvelopeToIdrive(envelope, {
      putObject: (object) => signedS3Put({
        endpoint: env.IDRIVE_E2_ENDPOINT,
        region: env.IDRIVE_E2_REGION || "us-west-2",
        accessKey: env.IDRIVE_E2_ACCESS_KEY,
        secretKey: env.IDRIVE_E2_SECRET_KEY,
        bucket: env.IDRIVE_E2_BUCKET,
        key: object.key,
        body: object.body,
        contentType: object.contentType
      })
    });
    return json(res, 201, { ...envelope, persisted: result });
  }

  return json(res, 201, envelope);
}

export async function handleFreeExecutor(req, res) {
  const body = await readJson(req);
  if (!String(body.task || "").trim()) return json(res, 400, { error: "Missing task" });
  const envelope = createStorageFirstJobEnvelope({ body, env: process.env });
  const executor = runFreeAppExecutor({ task: body.task, jobEnvelope: envelope });
  saveJob(envelope.job);
  return json(res, 200, {
    ok: true,
    job: envelope.job,
    executor: {
      ...executor,
      idrive: await persistFreeExecutorToIdrive({ envelope, executor, env: process.env })
    },
    inferenceStarted: false,
    paidServicesStarted: false
  });
}

export async function persistFreeExecutorToIdrive({ envelope, executor, env = process.env, putObject } = {}) {
  if (!hasLocalIdriveConfig(env)) {
    return {
      ok: false,
      mode: "write-plan-only",
      reason: "idrive_e2_not_configured",
      objectCount: 0
    };
  }
  const writer = putObject || ((object) => signedS3Put({
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region: env.IDRIVE_E2_REGION || "us-west-2",
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_BUCKET,
    key: object.key,
    body: object.body,
    contentType: object.contentType
  }));
  try {
    const objects = [
      ...(envelope?.taskCapsuleWritePlan?.objects || []),
      ...(envelope?.queueWritePlan?.objects || []),
      ...(executor?.objects || [])
    ].filter((object) => object?.key && object?.body);
    const written = [];
    for (const object of objects) {
      assertSmallControlObject(object);
      await writer(object);
      written.push(object.key);
    }
    return {
      ok: true,
      provider: "idrive-e2",
      mode: "task-capsule-and-artifacts-persisted",
      objectCount: written.length,
      written
    };
  } catch (error) {
    return {
      ok: false,
      provider: "idrive-e2",
      mode: "persist-failed-write-plan-preserved",
      reason: "idrive_e2_write_failed",
      objectCount: 0,
      error: String(error?.message || error).slice(0, 240)
    };
  }
}

function assertSmallControlObject(object) {
  const key = String(object.key || "");
  const body = String(object.body || "");
  if (!key || key.startsWith("/") || key.includes("..") || /[\\]/.test(key)) throw new Error("Unsafe IDrive object key");
  if (!/^(jobs|projects|memory)\//.test(key)) throw new Error("IDrive object key outside allowed prefixes");
  if (body.length > 1_000_000) throw new Error("IDrive object body too large for control server");
}

export function handleJobStatus(url, res) {
  const jobId = decodeURIComponent(url.pathname.slice(`${ROUTES.api.jobs}/`.length));
  const job = getJob(jobId);
  if (!job) return json(res, 404, { ok: false, error: "Job not found in local memory. Durable source is the IDrive e2 Task Capsule." });
  return json(res, 200, {
    ok: true,
    job,
    taskCapsuleWritePlan: buildTaskCapsuleWritePlan(job),
    inferenceStarted: false
  });
}

export async function handleWorkerStatusUpdate(url, req, res, { env = process.env, nowMs = Date.now() } = {}) {
  const rawBody = await readRawBody(req);
  const auth = verifyWorkerSignature({ env, headers: req.headers || {}, rawBody, nowMs });
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.reason });

  const suffix = "/status";
  const rawId = url.pathname.slice(`${ROUTES.api.jobs}/`.length, url.pathname.length - suffix.length);
  const jobId = decodeURIComponent(rawId);
  const job = getJob(jobId);
  if (!job) return json(res, 404, { ok: false, error: "Job not found in local memory. Durable source is the IDrive e2 Task Capsule." });

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json(res, 400, { ok: false, error: "invalid_json" });
  }
  const status = String(body.status || "").trim();
  if (!status) return json(res, 400, { ok: false, error: "missing_status" });

  let transitioned;
  try {
    transitioned = transitionIdriveLiteJob(job, status, body.updatedAt || new Date(nowMs).toISOString());
  } catch (error) {
    return json(res, 400, { ok: false, error: "unsupported_status", message: error.message });
  }
  if (body.message) transitioned = { ...transitioned, message: String(body.message).slice(0, 500) };
  replaceJob(transitioned);

  return json(res, 200, { ok: true, job: transitioned, inferenceStarted: false });
}

export async function handleAutonomousRun(url, req, res, { env = process.env } = {}) {
  if (env.SMEJJ_AUTONOMOUS_LOOP_ENABLED !== "YES") {
    return json(res, 409, { ok: false, error: "autonomous_loop_disabled", required: "SMEJJ_AUTONOMOUS_LOOP_ENABLED=YES" });
  }
  const dispatch = buildHttpDispatch(env);
  if (!dispatch) {
    return json(res, 409, { ok: false, error: "worker_dispatch_not_configured", required: "SMEJJ_WORKER_DISPATCH_URL" });
  }
  const suffix = "/autonomous-run";
  const jobId = decodeURIComponent(url.pathname.slice(`${ROUTES.api.jobs}/`.length, url.pathname.length - suffix.length));
  if (!getJob(jobId)) return json(res, 404, { ok: false, error: "Job not found in local memory. Durable source is the IDrive e2 Task Capsule." });

  const body = await readJson(req);
  const runner = createAutonomousRunner({ dispatch });
  // Bewusst nicht awaited: Der Lauf streamt seinen Fortschritt ueber /events (SSE).
  const running = runner(jobId, body).catch(() => {});
  void running;
  return json(res, 202, { ok: true, started: true, jobId, followEvents: `${ROUTES.api.jobs}/${jobId}/events` });
}

export function handleJobEvents(url, req, res) {
  const suffix = "/events";
  const rawId = url.pathname.slice(`${ROUTES.api.jobs}/`.length, url.pathname.length - suffix.length);
  const jobId = decodeURIComponent(rawId);
  const job = getJob(jobId);
  if (!job) return json(res, 404, { ok: false, error: "Job not found in local memory. Durable source is the IDrive e2 Task Capsule." });

  openEventStream(res);
  sendEvent(res, "job.status", { ok: true, job, inferenceStarted: false });

  const unsubscribe = subscribeToJob(jobId, ({ event, job: updated }) => {
    sendEvent(res, event, { ok: true, job: updated });
  });
  const stopHeartbeat = startHeartbeat(res);

  req.on("close", () => {
    unsubscribe();
    stopHeartbeat();
  });
}

const QUEUE_STATUSES = new Set(["open", "running", "done", "failed", "blocked", "cancelled"]);

export function buildIdriveJobQueuePlan(job, { status = "open", now = new Date().toISOString() } = {}) {
  if (!job?.id || !job?.taskCapsule?.rootPrefix) throw new Error("Job with task capsule is required");
  if (!QUEUE_STATUSES.has(status)) throw new Error(`Unsupported queue status: ${status}`);

  const entry = {
    version: 1,
    jobId: job.id,
    projectId: job.projectId,
    status,
    taskCapsuleRoot: job.taskCapsule.rootPrefix,
    statusKey: job.taskCapsule.status,
    inputKey: job.taskCapsule.input,
    modelId: job.model?.id || "glm-5-2",
    updatedAt: now
  };

  return {
    ok: true,
    provider: "idrive-e2",
    mode: "manifest-queue-idrive-only",
    currentEntryKey: `jobs/${status}/${job.id}.json`,
    projectEntryKey: `projects/${job.projectId}/jobs/${status}/${job.id}.json`,
    indexKeys: [
      "jobs/open.json",
      "jobs/running.json",
      "jobs/done.json",
      "jobs/failed.json",
      "jobs/blocked.json"
    ],
    entry,
    objects: [
      jsonObject(`jobs/${status}/${job.id}.json`, entry),
      jsonObject(`projects/${job.projectId}/jobs/${status}/${job.id}.json`, entry)
    ]
  };
}

function jsonObject(key, value) {
  return {
    key,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(value, null, 2)}\n`
  };
}

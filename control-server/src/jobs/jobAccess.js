export function authenticatedUserId(user = {}) {
  const value = String(user.userId || user.sub || user.email || "").trim().toLowerCase();
  if (!value) return "";
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `user_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isJobOwnedByUser(job, user) {
  const ownerId = authenticatedUserId(user);
  const tenantId = String(job?.tenantId || job?.userId || "");
  return Boolean(ownerId && tenantId && ownerId === tenantId && (!job?.userId || ownerId === job.userId));
}

export function isProjectOwnedByUser(project, user) {
  const ownerId = authenticatedUserId(user);
  const tenantId = String(project?.tenantId || project?.ownerUserId || project?.userId || "");
  return Boolean(ownerId && tenantId && ownerId === tenantId);
}

export function filterJobsForUser(jobs, user) {
  return (Array.isArray(jobs) ? jobs : []).filter((job) => isJobOwnedByUser(job, user));
}

export function filterSchedulerSnapshot(snapshot = {}, user, loadJob) {
  const allowed = (jobId) => isJobOwnedByUser(loadJob?.(jobId), user);
  return {
    maxConcurrency: Math.max(1, Number(snapshot.maxConcurrency || 1)),
    active: (snapshot.active || []).filter(allowed),
    queued: (snapshot.queued || []).filter((item) => allowed(item.jobId))
  };
}

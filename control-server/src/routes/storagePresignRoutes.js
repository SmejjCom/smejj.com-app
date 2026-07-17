// smejj.com control-server — short-lived IDrive e2 presigned URL API.
// Large file bytes go directly browser/client -> IDrive e2; this route only signs.
import { createPresignedIdriveUrl } from "../../../gatekeeper/presignIdrive.js";
import { requireIdrivePresignConfig } from "../../../gatekeeper/policy.js";
import { evaluateQuota } from "../../../gatekeeper/quota.js";
import { json, readJson } from "../http/respond.js";

export async function handleStoragePresign(req, res, { env = process.env } = {}) {
  const config = requireIdrivePresignConfig(env);
  if (!config.ok) return json(res, config.status, config);

  const quota = evaluateQuota({ env, provider: "idrive-e2", operation: "presign-idrive" });
  if (!quota.ok) return json(res, quota.status, quota);

  const body = await readJson(req);
  const result = await createPresignedIdriveUrl({
    env,
    operation: body.operation,
    key: body.key,
    contentType: body.contentType,
    contentLength: body.contentLength
  });
  return json(res, result.status, result);
}

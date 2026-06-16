import { GATEKEEPER_POLICY, assertFreePolicy, block, evaluateProvider, requireIdrivePresignConfig } from "./policy.js";
import { createPresignedIdriveUrl } from "./presignIdrive.js";
import { evaluateQuota } from "./quota.js";

export default {
  async fetch(request, env = {}) {
    return handleGatekeeperRequest(request, env);
  }
};

export async function handleGatekeeperRequest(request, env = {}) {
  const policyCheck = assertFreePolicy(GATEKEEPER_POLICY);
  if (!policyCheck.ok) return json(policyCheck.status, policyCheck);

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/gatekeeper/health") {
    return json(200, {
      ok: true,
      role: "cloudflare-free-gatekeeper-design",
      policy: GATEKEEPER_POLICY
    });
  }

  if (request.method === "POST" && url.pathname === "/gatekeeper/presign") {
    const body = await readJson(request);
    const config = requireIdrivePresignConfig(env);
    if (!config.ok) return json(config.status, config);
    const quota = evaluateQuota({ env, provider: "idrive-e2", operation: "presign-idrive" });
    if (!quota.ok) return json(quota.status, quota);
    const result = await createPresignedIdriveUrl({
      env,
      operation: body.operation,
      key: body.key,
      contentType: body.contentType,
      contentLength: body.contentLength
    });
    return json(result.status, result);
  }

  if (request.method === "POST" && url.pathname === "/gatekeeper/demo") {
    const body = await readJson(request);
    const providerCheck = evaluateProvider(body.provider);
    if (!providerCheck.ok) return json(providerCheck.status, providerCheck);
    const quota = evaluateQuota({ env, provider: body.provider, operation: "free-demo" });
    if (!quota.ok) return json(quota.status, quota);
    return json(200, {
      ok: true,
      mode: "free-demo-hardlimit",
      inferencePerformed: false,
      note: "Gatekeeper allows only the hard-limit demo envelope. This skeleton performs no AI inference."
    });
  }

  return json(404, block("route_not_found", 404));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(status, data) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

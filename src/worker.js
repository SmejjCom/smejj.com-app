import { APP_INFO, COST_POLICY, ROUTES, SECURITY_HEADERS, STORAGE, responseHeaders } from "./shared/platform.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const readMethod = request.method === "GET" || request.method === "HEAD";

    if (url.hostname === "www.smejj.com") {
      url.hostname = "smejj.com";
      return Response.redirect(url.toString(), 301);
    }

    if (readMethod && url.pathname === ROUTES.api.gitStatus) {
      return json(200, {
        code: 0,
        stdout: "Online-Version: Git-Status ist nur lokal verfuegbar.",
        stderr: ""
      });
    }

    if (readMethod && url.pathname === ROUTES.api.health) {
      return json(200, {
        ok: true,
        app: APP_INFO.name,
        costPolicy: COST_POLICY,
        ai: Boolean(env.SMEJJ_LLM_API_KEY),
        storage: Boolean(env.IDRIVE_E2_ENDPOINT && env.IDRIVE_E2_ACCESS_KEY && env.IDRIVE_E2_SECRET_KEY && env.IDRIVE_E2_BUCKET)
      });
    }

    if (readMethod && url.pathname === ROUTES.api.storageStatus) {
      return storageStatus(env);
    }

    if (request.method === "POST" && url.pathname === ROUTES.api.terminalRun) {
      return json(200, {
        code: 0,
        stdout: "Online-Version: Terminal-Kommandos sind aus Sicherheitsgruenden deaktiviert.",
        stderr: ""
      });
    }

    if (request.method === "POST" && url.pathname === ROUTES.api.fileRead) {
      return json(403, { error: "Dateizugriff ist in der Online-Version deaktiviert." });
    }

    if (request.method === "POST" && url.pathname === ROUTES.api.fileWrite) {
      return json(403, { error: "Dateischreiben ist in der Online-Version deaktiviert." });
    }

    if (request.method === "POST" && (url.pathname === ROUTES.api.chat || url.pathname === ROUTES.api.agent)) {
      const body = await readJson(request);
      const messages = url.pathname === ROUTES.api.agent
        ? agentMessages(body)
        : Array.isArray(body.messages)
          ? body.messages
          : [{ role: "user", content: String(body.message || "") }];
      return streamLLM(env, messages);
    }

    return withSecurityHeaders(await env.ASSETS.fetch(assetRequest(request)));
  }
};

function assetRequest(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/assets/")) {
    url.pathname = url.pathname.replace(/^\/assets\//, "/");
    return new Request(url, request);
  }
  return request;
}

function agentMessages(body) {
  const task = String(body.task || "").trim();
  return [
    {
      role: "system",
      content: [
        "You are smejj.com Code Agent.",
        "Return concise, practical guidance.",
        "The deployed Cloudflare version cannot read local project files or run local commands."
      ].join("\n")
    },
    { role: "user", content: task || "Hallo" }
  ];
}

async function storageStatus(env) {
  const required = ["IDRIVE_E2_ENDPOINT", "IDRIVE_E2_ACCESS_KEY", "IDRIVE_E2_SECRET_KEY", "IDRIVE_E2_BUCKET"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) return json(503, { ok: false, missing });

  const region = env.IDRIVE_E2_REGION || "us-west-2";
  const prefix = env.MODEL_S3_PREFIX || "";
  const result = await signedS3List({
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region,
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_BUCKET,
    prefix,
    maxKeys: 1
  });

  if (!result.ok) {
    return json(502, {
      ok: false,
      provider: STORAGE.provider,
      bucket: env.IDRIVE_E2_BUCKET,
      status: result.status,
      error: result.body.slice(0, 240)
    });
  }

  return json(200, {
    ok: true,
    provider: STORAGE.provider,
    bucket: env.IDRIVE_E2_BUCKET,
    prefix,
    objectCountSample: parseKeyCount(result.body),
    storageRole: STORAGE.role
  });
}

async function signedS3List({ endpoint, region, accessKey, secretKey, bucket, prefix, maxKeys }) {
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const method = "GET";
  const canonicalUri = `/${bucket}`;
  const queryPairs = [
    ["list-type", "2"],
    ["max-keys", String(maxKeys)],
    ["prefix", prefix || ""]
  ];
  const canonicalQuery = queryPairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .sort()
    .join("&");
  const { amzDate, dateStamp } = awsDates(new Date());
  const payloadHash = await sha256Hex("");
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    ""
  ].join("\n");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = await signingSignature(secretKey, dateStamp, region, stringToSign);
  const authorization = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${canonicalUri}?${canonicalQuery}`, {
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    }
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

function awsDates(date) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

async function signingSignature(secretKey, dateStamp, region, stringToSign) {
  const kDate = await hmacBytes(utf8(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, "s3");
  const kSigning = await hmacBytes(kService, "aws4_request");
  return bytesToHex(await hmacBytes(kSigning, stringToSign));
}

async function hmacBytes(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(data)));
}

async function sha256Hex(data) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(data))));
}

function utf8(value) {
  return new TextEncoder().encode(value);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseKeyCount(xml) {
  return Array.from(xml.matchAll(/<Key>/g)).length;
}

async function streamLLM(env, messages) {
  const apiKey = env.SMEJJ_LLM_API_KEY || "";
  if (!apiKey) {
    const text = [
      "data: {\"choices\":[{\"delta\":{\"content\":\"Online-Shell aktiv. KI ist noch nicht verbunden, weil kein SMEJJ_LLM_API_KEY gesetzt ist. Fuer die Kostenregel: GitHub und Cloudflare bleiben Free; der KI-Endpunkt muss selbst kontrolliert oder kostenfrei angebunden werden.\"}}]}",
      "data: [DONE]",
      ""
    ].join("\n\n");
    return new Response(text, {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    });
  }

  const baseUrl = (env.SMEJJ_LLM_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/$/, "");
  const model = env.SMEJJ_LLM_MODEL || "kimi-k2.7-code";
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 1.0,
      top_p: 0.95
    })
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders("text/plain; charset=utf-8")
    });
  }

  return new Response(upstream.body, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders("application/json; charset=utf-8") });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

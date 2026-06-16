import { APP_INFO, CAPABILITIES, COST_POLICY, ROUTES, SECURITY_HEADERS, STORAGE, responseHeaders } from "./shared/platform.js";

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

    if (readMethod && url.pathname === ROUTES.api.capabilities) {
      return json(200, {
        ok: true,
        app: APP_INFO.name,
        costPolicy: COST_POLICY,
        capabilities: CAPABILITIES
      });
    }

    if (readMethod && url.pathname === ROUTES.api.authConfig) {
      return json(200, {
        configured: Boolean(env.GOOGLE_CLIENT_ID),
        clientId: env.GOOGLE_CLIENT_ID || "",
        allowedEmail: (env.GOOGLE_ALLOWED_EMAIL || "smejjCom@gmail.com").toLowerCase()
      });
    }

    if (readMethod && url.pathname === ROUTES.api.authMe) {
      const user = await readSession(request, env);
      return json(200, { authenticated: Boolean(user), user });
    }

    if (request.method === "POST" && url.pathname === ROUTES.api.authGoogle) {
      try {
        return await googleAuth(request, env);
      } catch (error) {
        return json(400, { error: error.message || "Google Login fehlgeschlagen." });
      }
    }

    if (request.method === "POST" && url.pathname === ROUTES.api.authLogout) {
      return json(200, { authenticated: false }, {
        "Set-Cookie": "smejj_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
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

async function googleAuth(request, env) {
  const clientId = env.GOOGLE_CLIENT_ID || "";
  const sessionSecret = normalizeSecret(env.SMEJJ_SESSION_SECRET || env.GOOGLE_SESSION_SECRET || "");
  if (!clientId) return json(503, { error: "Google Login ist noch nicht konfiguriert." });
  if (!sessionSecret) return json(503, { error: "Session Secret fehlt." });

  const body = await readJson(request);
  const payload = await verifyGoogleIdToken(String(body.credential || ""), clientId);
  const email = String(payload.email || "").toLowerCase();
  const allowedEmail = String(env.GOOGLE_ALLOWED_EMAIL || "smejjcom@gmail.com").toLowerCase();
  if (!payload.email_verified) return json(403, { error: "Google E-Mail ist nicht verifiziert." });
  if (allowedEmail && email !== allowedEmail) {
    return json(403, { error: "Dieses Google Konto ist fuer smejj.com nicht freigegeben." });
  }

  const user = {
    email,
    name: String(payload.name || email),
    picture: String(payload.picture || ""),
    sub: String(payload.sub || "")
  };
  return json(200, { authenticated: true, user }, {
    "Set-Cookie": await serializeSessionCookie(user, sessionSecret)
  });
}

async function verifyGoogleIdToken(token, clientId) {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Ungueltiges Google Token.");
  const header = parseJwtPart(headerPart);
  const payload = parseJwtPart(payloadPart);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Ungueltige Google Signatur.");
  if (payload.aud !== clientId) throw new Error("Google Client-ID passt nicht.");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) throw new Error("Ungueltiger Google Issuer.");
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) throw new Error("Google Token ist abgelaufen.");

  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Google Zertifikate konnten nicht geladen werden.");
  const { keys = [] } = await response.json();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Passendes Google Zertifikat fehlt.");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlDecode(signaturePart),
    utf8(`${headerPart}.${payloadPart}`)
  );
  if (!ok) throw new Error("Google Signatur konnte nicht geprueft werden.");
  return payload;
}

async function serializeSessionCookie(user, secret) {
  const payload = base64UrlEncode(utf8(JSON.stringify({ ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })));
  const signature = base64UrlEncode(await hmacBytes(utf8(secret), payload));
  return `smejj_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}

async function readSession(request, env) {
  const sessionSecret = normalizeSecret(env.SMEJJ_SESSION_SECRET || env.GOOGLE_SESSION_SECRET || "");
  const match = String(request.headers.get("cookie") || "").match(/(?:^|;\s*)smejj_session=([^;]+)/);
  if (!match || !sessionSecret) return null;
  const [payload, signature] = match[1].split(".");
  const expected = base64UrlEncode(await hmacBytes(utf8(sessionSecret), payload));
  if (!signature || !constantTimeEqual(signature, expected)) return null;
  try {
    const user = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (Number(user.exp || 0) <= Date.now()) return null;
    delete user.exp;
    return user;
  } catch {
    return null;
  }
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

function parseJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function normalizeSecret(value) {
  const secret = String(value || "").trim();
  if (!secret || secret === "replace_with_long_random_secret") return "";
  return secret;
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

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...responseHeaders("application/json; charset=utf-8"),
      ...extraHeaders
    }
  });
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

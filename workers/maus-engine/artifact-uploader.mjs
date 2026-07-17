// smejj.com Maus-Engine — Artefakt-Uploader nach IDrive e2.
// Single Responsibility: Aktionsprotokoll, Screenshots, Traces, HAR und
// Downloads komprimiert in die Task Capsule (result/) hochladen.
// Wiederverwendet die verifizierte SigV4-Schicht aus workers/glm-salad/s3.js.
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { signedS3Request, assertSafeObjectKey } from "../glm-salad/s3.js";

// Konfiguration ausschliesslich aus der Worker-Umgebung (Salad-Secrets).
// Fehlende Werte => fail-closed Fehler, kein stiller Verzicht auf Beweise.
export function idriveConfigFromEnv(env = process.env) {
  const config = {
    idrive: {
      endpoint: env.IDRIVE_E2_ENDPOINT || env.SMEJJ_IDRIVE_ENDPOINT || "",
      bucket: env.IDRIVE_E2_BUCKET || env.SMEJJ_IDRIVE_BUCKET || "",
      region: env.IDRIVE_E2_REGION || env.SMEJJ_IDRIVE_REGION || "us-east-1",
      accessKey: env.IDRIVE_E2_ACCESS_KEY || env.SMEJJ_IDRIVE_ACCESS_KEY || "",
      secretKey: env.IDRIVE_E2_SECRET_KEY || env.SMEJJ_IDRIVE_SECRET_KEY || ""
    }
  };
  const { endpoint, bucket, accessKey, secretKey } = config.idrive;
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error("idrive_konfiguration_unvollstaendig (Artefakt-Upload ist Pflicht, fail-closed)");
  }
  return config;
}

function capsuleResultPrefix(capsuleRef, planId) {
  const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return `capsules/maus-engine/${safe(capsuleRef)}/result/${safe(planId)}`;
}

// Laedt alle Artefakte gzip-komprimiert hoch und schreibt zum Schluss ein
// Manifest mit SHA-256 je Objekt. Rueckgabe: Manifest (fuer status.json).
export async function uploadRunArtifacts(runResult, { config, putObject } = {}) {
  const resolvedConfig = config || idriveConfigFromEnv();
  const put = putObject || ((key, body, contentType) => signedS3Request(resolvedConfig, "PUT", key, body, contentType));
  const prefix = capsuleResultPrefix(runResult.capsuleRef, runResult.planId);
  const entries = [];

  const files = [
    {
      name: "aktionsprotokoll.json",
      data: Buffer.from(JSON.stringify({
        ok: runResult.ok,
        planId: runResult.planId,
        capsuleRef: runResult.capsuleRef,
        stage: runResult.stage ?? 2,
        aborted: runResult.aborted,
        abortReason: runResult.abortReason,
        failedStep: runResult.failedStep,
        actionLog: runResult.actionLog,
        extracted: runResult.extracted,
        downloads: runResult.downloads
      }, null, 2)),
      contentType: "application/json"
    },
    ...runResult.artifacts
  ];

  for (const file of files) {
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const compressed = gzipSync(raw);
    const key = `${prefix}/${file.name}.gz`;
    assertSafeObjectKey(key);
    await put(key, compressed, "application/gzip");
    entries.push({
      key,
      bytes: compressed.length,
      rawBytes: raw.length,
      sha256: createHash("sha256").update(compressed).digest("hex"),
      contentType: file.contentType
    });
  }

  const manifest = { planId: runResult.planId, capsuleRef: runResult.capsuleRef, ok: runResult.ok, objects: entries };
  const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2));
  await put(`${prefix}/manifest.json`, manifestBody, "application/json");
  return manifest;
}

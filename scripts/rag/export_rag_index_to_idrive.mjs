#!/usr/bin/env node
// smejj.com — exportiert den RAG-Wissensindex als versioniertes Artefakt ins
// Object Brain (IDrive e2). Konzept: RAG-Daten/Wissensdatenbanken liegen auf e2,
// der Index ist reines JSON und damit auditierbar/replaybar.
//
// FAIL-CLOSED: Ohne vollstaendige IDRIVE_E2_*-Umgebung wird NICHTS hochgeladen —
// stattdessen wird das Artefakt lokal nach tmp/rag-index/ geschrieben und der
// Upload-Plan ausgegeben (write-plan-only, gleiche Semantik wie der Free Executor).
//
// Nutzung:  npm run rag:export           (baut Index aus dem Projektwissen)
// Objekte:  rag/knowledge-index/<YYYY-MM-DD>/index.json  (versioniert)
//           rag/knowledge-index/latest.json               (Zeiger, gleicher Inhalt)
import crypto from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildIndex } from "../../control-server/src/rag/bm25Index.js";
import { loadKnowledgeChunks } from "../../control-server/src/rag/knowledgeLoader.js";
import { signedS3Put } from "../../control-server/src/storage/s3Signer.js";

export function idriveConfigFromEnv(env = process.env) {
  const config = {
    endpoint: (env.IDRIVE_E2_ENDPOINT || "").replace(/\/$/, ""),
    region: env.IDRIVE_E2_REGION || "us-west-2",
    bucket: env.IDRIVE_E2_BUCKET || "",
    accessKey: env.IDRIVE_E2_ACCESS_KEY || "",
    secretKey: env.IDRIVE_E2_SECRET_KEY || ""
  };
  const complete = Boolean(config.endpoint && config.bucket && config.accessKey && config.secretKey);
  return { ...config, complete };
}

export async function buildRagIndexArtifact(projectRoot, now = new Date()) {
  const chunks = await loadKnowledgeChunks(projectRoot);
  const index = buildIndex(chunks);
  const body = JSON.stringify({
    artifact: "smejj.com-rag-knowledge-index",
    version: index.version,
    exportedAt: now.toISOString(),
    chunkCount: index.chunkCount,
    index
  });
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  const day = now.toISOString().slice(0, 10);
  return {
    body,
    sha256,
    chunkCount: index.chunkCount,
    objects: [
      { key: `rag/knowledge-index/${day}/index.json`, contentType: "application/json; charset=utf-8" },
      { key: "rag/knowledge-index/latest.json", contentType: "application/json; charset=utf-8" }
    ]
  };
}

export async function exportRagIndex({ projectRoot = process.cwd(), env = process.env, put = signedS3Put, now = new Date() } = {}) {
  const artifact = await buildRagIndexArtifact(projectRoot, now);
  const idrive = idriveConfigFromEnv(env);
  if (!idrive.complete) {
    const localDir = path.join(projectRoot, "tmp", "rag-index");
    mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, "index.json");
    writeFileSync(localPath, `${artifact.body}\n`);
    return {
      ok: false,
      mode: "write-plan-only",
      reason: "idrive_e2_not_configured",
      sha256: artifact.sha256,
      chunkCount: artifact.chunkCount,
      localArtifact: localPath,
      plannedObjects: artifact.objects.map((object) => object.key)
    };
  }
  const written = [];
  for (const object of artifact.objects) {
    await put({
      endpoint: idrive.endpoint,
      region: idrive.region,
      accessKey: idrive.accessKey,
      secretKey: idrive.secretKey,
      bucket: idrive.bucket,
      key: object.key,
      body: artifact.body,
      contentType: object.contentType
    });
    written.push(object.key);
  }
  return { ok: true, mode: "uploaded", sha256: artifact.sha256, chunkCount: artifact.chunkCount, written };
}

if (process.argv[1] && process.argv[1].endsWith("export_rag_index_to_idrive.mjs")) {
  exportRagIndex().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok || result.mode === "write-plan-only" ? 0 : 1);
  }).catch((error) => {
    console.error(`rag:export FEHLER: ${error.message}`);
    process.exit(1);
  });
}

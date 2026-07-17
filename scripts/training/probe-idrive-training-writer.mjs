#!/usr/bin/env node
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createImmutableTrainingObject } from "../../src/training/idrive-conditional-writer.js";
import { createTrainingIdriveWriter } from "../../src/training/training-writer.js";

const ENABLED = "YES";
const CONFIRMATION = "WRITE_ONE_IMMUTABLE_PROBE";

/** Runs one real immutable write plus an idempotent replay. Disabled unless doubly opted in. */
export async function main({ env = process.env } = {}) {
  if (String(env.SMEJJ_TRAINING_IDRIVE_PROBE_ENABLED || "NO").trim().toUpperCase() !== ENABLED) {
    throw probeError("training_idrive_probe_disabled");
  }
  if (String(env.SMEJJ_TRAINING_IDRIVE_PROBE_CONFIRM || "").trim() !== CONFIRMATION) {
    throw probeError("training_idrive_probe_confirmation_required");
  }
  const prefix = String(env.IDRIVE_E2_TRAINING_PROBE_PREFIX || "").trim();
  if (!/^training\/(?:[a-z0-9][a-z0-9._-]*\/)+$/.test(prefix)) {
    throw probeError("training_idrive_probe_prefix_invalid");
  }

  const writer = createTrainingIdriveWriter({ env });
  const now = new Date().toISOString();
  const object = createImmutableTrainingObject({
    key: `${prefix}${now.replace(/[^0-9]/g, "").slice(0, 14)}-${crypto.randomUUID()}.json`,
    body: `${JSON.stringify({
      schemaVersion: 1,
      kind: "smejj.com-training-conditional-writer-probe",
      createdAt: now,
      nonce: crypto.randomUUID(),
      containsTrainingData: false
    })}\n`
  });

  const created = await writer.putObject(object);
  if (created.createdNow !== true || created.proofStatus !== 412 || created.contentVerified !== true) {
    throw probeError("training_idrive_probe_creation_not_proven");
  }
  const replay = await writer.putObject(object);
  if (replay.idempotent !== true || replay.putStatus !== 412 ||
      replay.contentVerified !== true || replay.sha256 !== object.sha256) {
    throw probeError("training_idrive_probe_idempotency_not_proven");
  }
  const report = {
    ok: true,
    provider: "idrive-e2",
    key: object.key,
    sizeBytes: object.sizeBytes,
    sha256: object.sha256,
    firstWrite: { putStatus: created.putStatus, proofStatus: created.proofStatus, contentVerified: true },
    replay: { putStatus: replay.putStatus, idempotent: replay.idempotent, contentVerified: true },
    immutable: true
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

function probeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  main().catch((error) => {
    const code = /^training_idrive_[a-z0-9_:.-]+$/.test(String(error?.code || ""))
      ? error.code
      : "training_idrive_probe_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    process.exitCode = 1;
  });
}

import crypto from "node:crypto";
import {
  DATASET_DOMAINS,
  DATASET_SPLIT_SEED,
  DATASET_SPLITS
} from "./constants.js";
import { canonicalJson } from "./sanitize.js";

export function trainingFamilyFingerprint(candidate, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("training_fingerprint_key_invalid");
  const identity = {
    repository: String(candidate?.provenance?.repositoryFingerprint || "none"),
    baseCommit: String(candidate?.provenance?.baseCommit || "none"),
    affectedPaths: [...new Set(candidate?.provenance?.affectedPaths || [])].map(String).sort(),
    domain: normalizeDomain(candidate?.domain)
  };
  return crypto.createHmac("sha256", key).update(canonicalJson(identity)).digest("hex");
}

export function assignDatasetSplit(familyFingerprint, seed = DATASET_SPLIT_SEED) {
  if (!/^[a-f0-9]{64}$/.test(String(familyFingerprint || ""))) throw new Error("invalid_training_family_fingerprint");
  const digest = crypto.createHash("sha256").update(`${seed}:${familyFingerprint}`).digest();
  const bucket = digest.readUInt32BE(0) % 100;
  if (bucket < 80) return "train";
  if (bucket < 90) return "validation";
  return "test";
}

export function assertNoDatasetLeakage(records) {
  const familySplits = new Map();
  const recordIds = new Set();
  for (const record of records || []) {
    if (recordIds.has(record.recordId)) throw new Error(`duplicate_training_record:${record.recordId}`);
    recordIds.add(record.recordId);
    if (!DATASET_SPLITS.includes(record.split)) throw new Error(`invalid_dataset_split:${record.split}`);
    const previous = familySplits.get(record.familyFingerprint);
    if (previous && previous !== record.split) throw new Error(`dataset_family_leakage:${record.familyFingerprint}`);
    familySplits.set(record.familyFingerprint, record.split);
  }
  return true;
}

export function normalizeDomain(value) {
  const domain = String(value || "coding").trim().toLowerCase();
  if (!DATASET_DOMAINS.includes(domain)) throw new Error(`invalid_training_domain:${domain}`);
  return domain;
}

#!/usr/bin/env node
import fs from "node:fs";

const requiredFiles = [
  "idrive-layout/manifests/deployments/current.json",
  "schemas/deployment-manifest.schema.json",
  "docs/release/RELEASE_FREEZE_2026-06-16_PROMPT6.md",
  "docs/architecture/ROLLBACK_AND_BACKUP_POLICY.md"
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error(JSON.stringify({ ok: false, reason: "rollback_files_missing", missing }, null, 2));
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync("idrive-layout/manifests/deployments/current.json", "utf8"));
const freeze = fs.readFileSync("docs/release/RELEASE_FREEZE_2026-06-16_PROMPT6.md", "utf8");

const failures = [];
if (manifest.storage?.provider !== "idrive-e2") failures.push("deployment artifact storage must be idrive-e2");
if (manifest.release?.rollbackRequired !== true) failures.push("rollbackRequired must be true");
if (manifest.release?.requiresWrittenApproval !== true) failures.push("requiresWrittenApproval must be true");
if (manifest.release?.livePublished !== false) failures.push("example deployment manifest must not mark livePublished true");
if (manifest.costPolicy?.githubPaidAllowed !== false) failures.push("githubPaidAllowed must be false");
if (manifest.costPolicy?.cloudflarePaidAllowed !== false) failures.push("cloudflarePaidAllowed must be false");
if (manifest.costPolicy?.paidFallbackAllowed !== false) failures.push("paidFallbackAllowed must be false");
if (!/Rollback point exists at commit/i.test(freeze)) failures.push("release freeze must name rollback point");
if (!/IDrive e2 backup artifact/i.test(freeze)) failures.push("release freeze must name IDrive e2 backup artifact");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, reason: "rollback_simulation_failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  rollbackAvailable: true,
  productionChanged: false,
  liveDeployAttempted: false,
  storage: "idrive-e2",
  note: "Rollback simulation checks metadata and release guards only; it does not deploy or modify production."
}, null, 2));

import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPHEMERAL_WORKER_IMAGE } from "../../control-server/src/orchestrator/ephemeralWorker.js";
import { EPHEMERAL_RUNTIME_VERSIONS } from "./bootstrap-ephemeral-worker.mjs";
import { buildEphemeralRuntimeManifest } from "./build-ephemeral-runtime-manifest.mjs";

export async function buildEphemeralRuntimeBundle({
  projectRoot = process.cwd(),
  smokeEvidencePath = path.join(projectRoot, "docs/release/evidence/ephemeral-runtime-smoke-2026-07-13-browser-agent-rc1.json"),
  createdAt = null
} = {}) {
  const release = await buildEphemeralRuntimeManifest({ projectRoot });
  const smoke = JSON.parse(await readFile(smokeEvidencePath, "utf8"));
  validateSmoke(smoke, release.manifestSha256, release.bootstrapSha256);
  const effectiveCreatedAt = createdAt || smoke.testedAt;
  if (!Number.isFinite(Date.parse(effectiveCreatedAt))) throw new Error("ephemeral_runtime_created_at_invalid");
  const bootstrap = await readFile(path.join(projectRoot, "scripts/deploy/bootstrap-ephemeral-worker.mjs"), "utf8");
  const files = [];
  for (const entry of release.manifest.files) {
    const content = await readFile(path.join(projectRoot, "workers", entry.path), "utf8");
    if (sha256(content) !== entry.sha256) throw new Error(`ephemeral_runtime_bundle_source_changed:${entry.path}`);
    files.push({ ...entry, encoding: "base64", content: Buffer.from(content, "utf8").toString("base64") });
  }
  const bundle = {
    schemaVersion: 1,
    recordType: "smejj.com-immutable-ephemeral-runtime-bundle",
    createdAt: new Date(effectiveCreatedAt).toISOString(),
    baseImage: EPHEMERAL_WORKER_IMAGE,
    runtimeVersions: EPHEMERAL_RUNTIME_VERSIONS,
    runtimeProfiles: {
      default: "coding",
      browserVerification: "browser",
      browserInstall: "conditional-pinned-alpine-package"
    },
    entrypoint: "smejj-worker/worker.mjs",
    manifestSha256: release.manifestSha256,
    bootstrap: {
      path: "bootstrap.mjs",
      sha256: release.bootstrapSha256,
      encoding: "base64",
      content: Buffer.from(bootstrap, "utf8").toString("base64")
    },
    files,
    smokeEvidence: smoke,
    securityAttestation: {
      runtimeSmokeSha256: sha256(`${JSON.stringify(smoke, null, 2)}\n`),
      privileged: false,
      authenticatedRunIngressRequired: true,
      containerEnvironmentContainsPlatformSecrets: false,
      repositoryScope: "trusted-owner-and-repository-allowlist-only",
      providerOutboundNetworkRestrictionAvailable: false,
      globalCapacityCasRequiredBeforeStart: true,
      nativeAmd64ProviderVerified: smoke.nativeAmd64ProviderVerified === true,
      deletionPerformed: false
    },
    productionEligible: smoke.nativeAmd64ProviderVerified === true,
    trainingEligible: false,
    memoryMayLearn: false
  };
  const text = `${JSON.stringify(bundle, null, 2)}\n`;
  return {
    bundle,
    text,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text, "utf8"),
    fileCount: files.length
  };
}

function validateSmoke(value, expectedManifestSha256, expectedBootstrapSha256) {
  if (value?.recordType !== "smejj.com-ephemeral-runtime-smoke"
    || !Number.isFinite(Date.parse(value.testedAt))
    || value.sourceManifestSha256 !== expectedManifestSha256
    || value.bootstrapSha256 !== expectedBootstrapSha256
    || value.appRoot !== "/app"
    || value.exitCode !== 0
    || value.image !== "docker.io/library/node@sha256:09dbe0a53523c2482d85a037efc6b0e8e8bb16c6f1acf431fe36aa0ebc871c06"
    || value.targetImage !== EPHEMERAL_WORKER_IMAGE
    || value.runtimeProfile !== "browser"
    || value.testedPlatform !== "linux/arm64"
    || value.targetPlatform !== "linux/amd64"
    || value.targetImageManifestSha256 !== "c1f4f4e7afa4f73df11ad95392ff316a4af82df0cb5ca114de1fe7c4dc4dcd20"
    || value.targetAmd64CoreBootstrapVerified !== true
    || value.targetAmd64BrowserBlockedByLocalEmulation !== true
    || typeof value.nativeAmd64ProviderVerified !== "boolean"
    || value.privileged !== false
    || value.pytest?.ok !== true
    || value.screenshotCount !== 2
    || !Array.isArray(value.browserChecks)
    || value.browserChecks.length !== 2
    || value.browserChecks.some((check) => check.ok !== true)
    || JSON.stringify(value.runtime) !== JSON.stringify(EPHEMERAL_RUNTIME_VERSIONS)) {
    throw new Error("ephemeral_runtime_smoke_evidence_invalid");
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

const directPath = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (directPath) {
  const result = await buildEphemeralRuntimeBundle();
  const output = String(process.env.SMEJJ_EPHEMERAL_RUNTIME_BUNDLE_FILE || "").trim();
  if (output) await writeFile(path.resolve(output), result.text, { mode: 0o600 });
  console.log(JSON.stringify({
    ok: true,
    fileCount: result.fileCount,
    bytes: result.bytes,
    sha256: result.sha256,
    output: output ? path.resolve(output) : null
  }, null, 2));
}

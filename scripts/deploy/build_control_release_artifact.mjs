#!/usr/bin/env node
import crypto from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicTarGzip } from "./build_control_overlay_release.mjs";
// Eine Quelle der Wahrheit fuer den Artefakt-Inhalt (rc1-Crash-Klasse, 2026-07-17):
// Include-Liste und Laufzeit-Ressourcen werden zentral gepflegt, nie hier lokal.
import {
  CONTROL_RELEASE_INCLUDE_PATHS,
  CONTROL_RELEASE_RUNTIME_RESOURCES
} from "./release-include-paths.mjs";

export const DEFAULT_INCLUDE_PATHS = CONTROL_RELEASE_INCLUDE_PATHS;
const PRIVATE_NAMES = new Set([".env", ".netrc", ".npmrc", ".pypirc", "id_ed25519", "id_rsa"]);
const PRIVATE_DIRECTORIES = new Set([".aws", ".ssh"]);
const FORBIDDEN_EXTENSIONS = /\.(safetensors|gguf|bin|pt|pth|ckpt|onnx|parquet)$/i;
const SECRET_PATTERNS = Object.freeze([
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{16}\b/,
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  new RegExp("IDRIVE_E2_(?:(?:TRAINING|WATCHDOG)_)?" + "SECRET_KEY=" + "(?!$|replace_me|<set>|\\.\\.\\.)[^\\s]+"),
  new RegExp("IDRIVE_E2_(?:(?:TRAINING|WATCHDOG)_)?" + "ACCESS_KEY=" + "(?!$|replace_me|<set>|\\.\\.\\.)[^\\s]+"),
  new RegExp("SMEJJ_LLM_" + "API_KEY=" + "(?!$|replace_me|local)[^\\s]+")
]);
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 5_000;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;

export async function buildControlReleaseArtifact({
  rootDir = process.cwd(),
  releaseId = "smejj-control-release-candidate",
  createdAt = "2000-01-01T00:00:00.000Z",
  includePaths = DEFAULT_INCLUDE_PATHS,
  outputArchive,
  outputManifest,
  outputChecksum,
  overwrite = false
} = {}) {
  if (!/^[a-z0-9][a-z0-9.-]{7,120}$/.test(releaseId)) throw new Error("control_release_id_invalid");
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("control_release_timestamp_invalid");
  const root = path.resolve(rootDir);
  const fileMap = new Map();
  for (const includePath of includePaths) await collectPath(root, includePath, fileMap);
  if (!fileMap.has("package.json") || !fileMap.has("src/server.js")) {
    throw new Error("control_release_required_entrypoint_missing");
  }
  assertImportClosure(fileMap);
  assertRuntimeResources(fileMap);
  const records = [...fileMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([file, body]) => ({
    path: file,
    bytes: body.length,
    sha256: sha256(body)
  }));
  const uncompressedBytes = records.reduce((sum, record) => sum + record.bytes, 0);
  if (records.length > MAX_FILES || uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("control_release_content_limit_exceeded");
  }
  const contentRootSha256 = sha256(Buffer.from(JSON.stringify(records), "utf8"));
  const manifest = {
    schemaVersion: 1,
    releaseId,
    app: "smejj.com",
    type: "full-control-runtime-artifact",
    createdAt: new Date(createdAt).toISOString(),
    contentRootSha256,
    fileCount: records.length,
    uncompressedBytes,
    authorization: {
      stagingDeployAuthorized: false,
      productionDeployAuthorized: false,
      externalMutationAuthorized: false,
      separateApprovalEvidenceRequired: true
    },
    security: {
      secretsIncluded: false,
      privateEnvIncluded: false,
      privateKeyIncluded: false,
      modelWeightsIncluded: false,
      deterministicArchive: true
    },
    files: records
  };
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fileMap.set("release-artifact-manifest.json", manifestBody);
  const archive = createDeterministicTarGzip(fileMap);
  if (archive.length === 0 || archive.length > MAX_ARCHIVE_BYTES) throw new Error("control_release_archive_size_invalid");

  const archivePath = path.resolve(root, outputArchive || `${releaseId}.tar.gz`);
  const manifestPath = path.resolve(root, outputManifest || `${archivePath}.manifest.json`);
  const checksumPath = path.resolve(root, outputChecksum || `${archivePath}.sha256`);
  await mkdir(path.dirname(archivePath), { recursive: true, mode: 0o755 });
  await writeExact(archivePath, archive, overwrite);
  await writeExact(manifestPath, manifestBody, overwrite);
  const archiveSha256 = sha256(archive);
  await writeExact(checksumPath, Buffer.from(`${archiveSha256}  ${path.basename(archivePath)}\n`, "utf8"), overwrite);
  return {
    ok: true,
    releaseId,
    archive: archivePath,
    manifest: manifestPath,
    checksum: checksumPath,
    bytes: archive.length,
    sha256: archiveSha256,
    contentRootSha256,
    fileCount: records.length,
    secretsIncluded: false,
    productionDeployAuthorized: false
  };
}

// Fail-closed Import-Gate (rc1-Crash-Klasse, 2026-07-17): Bevor ein Artefakt
// entsteht, muessen ALLE von src/server.js transitiv erreichten relativen
// Imports IM Artefakt liegen. Fehlt ein Modul, bricht der Build ab —
// ein boot-kaputtes Release kann so gar nicht erst gebaut werden.
const IMPORT_PATTERN = /(?:^|\n)\s*(?:import\s[^"']*|import\s*\(|export\s[^"']*from\s*)["']([^"']+)["']/g;

function assertImportClosure(fileMap) {
  const entry = "src/server.js";
  const seen = new Set();
  const stack = [entry];
  const missing = [];
  const resolveRelative = (fromFile, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, path.posix.join(base, "index.js")]) {
      if (fileMap.has(candidate)) return candidate;
    }
    return null;
  };
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const body = fileMap.get(file);
    if (!body) continue;
    // Template-Literale entfernen: Imports in Code-VORLAGEN (Strings) sind
    // keine echten Modul-Imports (Beispiel: freeAppExecutor-Projektvorlagen).
    const source = body.toString("utf8").replace(/`(?:[^`\\]|\\[\s\S])*`/g, '""');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      const target = resolveRelative(file, spec);
      if (target === null) missing.push(`${file} -> ${spec}`);
      else stack.push(target);
    }
  }
  if (missing.length > 0) {
    throw new Error(`control_release_import_missing:${[...new Set(missing)].slice(0, 5).join(" | ")}`);
  }
}

// Zweites Gate (2026-07-17): Dateien, die zur LAUFZEIT per fs gelesen werden,
// findet kein Import-Graph-Check — sie muessen aber genauso im Artefakt liegen
// (Beispiel: schemas/maus-*.schema.json; rc2 bootete, der erste Maus-Lauf
// waere mit ENOENT gescheitert). Fail-closed vor dem Bauen.
function assertRuntimeResources(fileMap) {
  const missing = CONTROL_RELEASE_RUNTIME_RESOURCES
    .filter((entry) => fileMap.has(entry.whenPresent) && !fileMap.has(entry.resource))
    .map((entry) => `${entry.resource} (gelesen von ${entry.whenPresent})`);
  if (missing.length > 0) {
    throw new Error(`control_release_runtime_resource_missing:${missing.join(" | ")}`);
  }
}

async function collectPath(root, includePath, fileMap) {
  validateRelativePath(includePath);
  const absolute = path.resolve(root, includePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("control_release_source_escape");
  const info = await stat(absolute);
  if (info.isSymbolicLink()) throw new Error(`control_release_symlink_blocked:${includePath}`);
  if (info.isFile()) return addFile(root, absolute, fileMap);
  if (!info.isDirectory()) throw new Error(`control_release_unsupported_entry:${includePath}`);
  const entries = await readdir(absolute, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(absolute, entry.name);
    const relative = path.relative(root, child).split(path.sep).join("/");
    if (entry.isSymbolicLink()) throw new Error(`control_release_symlink_blocked:${relative}`);
    if (entry.isDirectory()) await collectPath(root, relative, fileMap);
    else if (entry.isFile()) await addFile(root, child, fileMap);
    else throw new Error(`control_release_unsupported_entry:${relative}`);
  }
}

async function addFile(root, absolute, fileMap) {
  const relative = path.relative(root, absolute).split(path.sep).join("/");
  validateRelativePath(relative);
  const basename = path.posix.basename(relative);
  // Vorlagen (.env.example) gehoeren nicht ins Release-Artefakt — auslassen,
  // damit Private- und Secret-Guards fuer echte Dateien unveraendert scharf bleiben.
  if (basename === ".env.example") return;
  const segments = relative.split("/");
  if (isPrivateName(basename) || segments.some((segment) => PRIVATE_DIRECTORIES.has(segment))) {
    throw new Error(`control_release_private_path_blocked:${relative}`);
  }
  if (basename === ".DS_Store" || basename.startsWith("._")) {
    throw new Error(`control_release_nonportable_path_blocked:${relative}`);
  }
  if (FORBIDDEN_EXTENSIONS.test(relative)) throw new Error(`control_release_model_artifact_blocked:${relative}`);
  const body = await readFile(absolute);
  if (body.length > MAX_FILE_BYTES) throw new Error(`control_release_file_too_large:${relative}`);
  if (!body.includes(0)) {
    const text = body.toString("utf8");
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new Error(`control_release_secret_like_content:${relative}`);
    }
  }
  fileMap.set(relative, body);
}

function isPrivateName(name) {
  return PRIVATE_NAMES.has(name) || name.startsWith(".env.");
}

function validateRelativePath(value) {
  const entry = String(value || "").split(path.sep).join("/");
  if (!entry || entry.startsWith("/") || entry.includes("\\") || entry.split("/").includes("..") || entry.includes("\0")) {
    throw new Error("control_release_path_invalid");
  }
}

async function writeExact(filePath, body, overwrite = false) {
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(body)) {
      if (!overwrite) throw new Error(`control_release_output_conflict:${filePath}`);
      await writeFile(filePath, body, { mode: 0o644 });
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(filePath, body, { mode: 0o644, flag: "wx" });
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function main() {
  const releaseId = process.env.SMEJJ_CONTROL_RELEASE_ID || "smejj-control-phase1-v41-2026-07-11-rc9";
  const outputArchive = process.argv[2]
    || `tmp/emergency-salad-status-release-2026-07-11/${releaseId}.tar.gz`;
  const result = await buildControlReleaseArtifact({
    releaseId,
    createdAt: process.env.SMEJJ_CONTROL_RELEASE_CREATED_AT || "2026-07-11T00:00:00.000Z",
    outputArchive,
    overwrite: true
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

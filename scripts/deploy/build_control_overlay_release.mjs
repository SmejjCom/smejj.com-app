#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const FIXED_MTIME_SECONDS = 946684800;
const SHA256 = /^[a-f0-9]{64}$/;
const RELEASE_ID = /^[a-z0-9][a-z0-9.-]{7,100}$/;

export async function buildControlOverlayRelease({
  rootDir = process.cwd(),
  spec,
  specPath,
  outputDirectory,
  outputArchive,
  outputChecksum
} = {}) {
  const loadedSpec = spec || JSON.parse(await readFile(resolveInside(rootDir, specPath), "utf8"));
  validateSpec(loadedSpec);
  const output = resolveOutput(rootDir, loadedSpec.output, {
    directory: outputDirectory,
    archive: outputArchive,
    checksum: outputChecksum
  });
  const files = [];
  for (const input of loadedSpec.inputs || []) {
    const body = await readFile(resolveInside(rootDir, input.source));
    if (body.length !== input.bytes || sha256(body) !== input.sha256) {
      throw new Error(`release_input_evidence_mismatch:${input.role}`);
    }
  }
  for (const item of loadedSpec.files) {
    const body = await readFile(resolveInside(rootDir, item.source));
    const actual = sha256(body);
    if (actual !== item.sha256) throw new Error(`release_source_sha256_mismatch:${item.path}`);
    files.push({ ...item, body });
  }
  const verification = loadedSpec.verificationMarkdown
    || await readFile(resolveInside(rootDir, loadedSpec.verificationSource), "utf8");
  const manifest = buildManifest(loadedSpec);
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const verificationBody = Buffer.from(String(verification).replace(/\s*$/, "\n"), "utf8");
  const archiveFiles = new Map([
    ...files.map((item) => [item.path, item.body]),
    ["release-manifest.json", manifestBody],
    ["STAGING-VERIFICATION.md", verificationBody]
  ]);

  for (const [relativePath, body] of archiveFiles) {
    const target = path.join(output.directory, relativePath);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await writeExact(target, body);
  }
  const archive = createDeterministicTarGzip(archiveFiles);
  await mkdir(path.dirname(output.archive), { recursive: true, mode: 0o755 });
  await writeExact(output.archive, archive);
  const archiveSha256 = sha256(archive);
  const checksumBody = Buffer.from(`${archiveSha256}  ${path.basename(output.archive)}\n`, "utf8");
  await writeExact(output.checksum, checksumBody);
  return {
    ok: true,
    releaseId: loadedSpec.releaseId,
    directory: output.directory,
    archive: output.archive,
    checksum: output.checksum,
    bytes: archive.length,
    sha256: archiveSha256,
    runtimeFileCount: files.length,
    secretsIncluded: false,
    productionDeployAuthorized: false
  };
}

export function createDeterministicTarGzip(fileMap) {
  const normalized = new Map();
  for (const [name, value] of fileMap) {
    validateArchivePath(name);
    normalized.set(name, Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
  }
  const directories = new Set();
  for (const name of normalized.keys()) {
    const parts = name.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`${parts.slice(0, index).join("/")}/`);
    }
  }
  const entries = [
    ...[...directories].sort().map((name) => ({ name, body: Buffer.alloc(0), mode: 0o755, type: "5" })),
    ...[...normalized.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([name, body]) => ({ name, body, mode: 0o644, type: "0" }))
  ];
  const blocks = [];
  for (const entry of entries) {
    blocks.push(ustarHeader(entry));
    if (entry.body.length > 0) {
      blocks.push(entry.body);
      const padding = (512 - (entry.body.length % 512)) % 512;
      if (padding) blocks.push(Buffer.alloc(padding));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 });
}

function buildManifest(spec) {
  const manifest = JSON.parse(JSON.stringify(spec));
  delete manifest.output;
  delete manifest.verificationMarkdown;
  delete manifest.verificationSource;
  manifest.inputs = (manifest.inputs || []).map(({ source: _source, ...item }) => item);
  manifest.files = manifest.files.map(({ source: _source, ...item }) => item);
  return manifest;
}

function validateSpec(spec) {
  if (!spec || spec.schemaVersion !== 1) throw new Error("release_spec_schema_invalid");
  if (!RELEASE_ID.test(String(spec.releaseId || ""))) throw new Error("release_id_invalid");
  if (spec.app !== "smejj.com") throw new Error("release_app_invalid");
  if (spec.authorization?.productionDeployAuthorized !== false) {
    throw new Error("release_builder_refuses_production_authorization");
  }
  if (spec.authorization?.externalMutationAuthorized !== false) {
    throw new Error("external_approval_must_be_recorded_separately");
  }
  if (!Array.isArray(spec.files) || spec.files.length < 1 || spec.files.length > 100) {
    throw new Error("release_files_invalid");
  }
  for (const input of spec.inputs || []) {
    if (!input.source || !input.role || !SHA256.test(input.sha256)
      || !Number.isSafeInteger(input.bytes) || input.bytes < 1) {
      throw new Error("release_input_evidence_invalid");
    }
  }
  const paths = new Set();
  for (const item of spec.files) {
    validateArchivePath(item.path);
    if (!item.path.startsWith("runtime/")) throw new Error("release_file_outside_runtime");
    if (paths.has(item.path)) throw new Error("release_file_duplicate");
    paths.add(item.path);
    if (!item.source || !SHA256.test(item.sha256) || !SHA256.test(item.baselineSha256)) {
      throw new Error(`release_file_metadata_invalid:${item.path}`);
    }
  }
  if (!spec.verificationMarkdown && !spec.verificationSource) {
    throw new Error("release_verification_required");
  }
}

function resolveOutput(rootDir, configured = {}, override = {}) {
  const directory = path.resolve(rootDir, override.directory || configured.directory || "");
  const archive = path.resolve(rootDir, override.archive || configured.archive || "");
  const checksum = path.resolve(rootDir, override.checksum || configured.checksum || `${archive}.sha256`);
  if (!directory || !archive || directory === path.resolve(rootDir) || archive === path.resolve(rootDir)) {
    throw new Error("release_output_invalid");
  }
  return { directory, archive, checksum };
}

function resolveInside(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, String(relativePath || ""));
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error("release_source_outside_project");
  return target;
}

async function writeExact(filePath, body) {
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(body)) throw new Error(`release_output_conflict:${filePath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(filePath, body, { mode: 0o644, flag: "wx" });
  }
  await fs.promises.chmod(filePath, 0o644);
}

function ustarHeader({ name, body, mode, type }) {
  const header = Buffer.alloc(512);
  const split = splitUstarName(name);
  writeAscii(header, split.name, 0, 100);
  writeAscii(header, octal(mode, 8), 100, 8);
  writeAscii(header, octal(0, 8), 108, 8);
  writeAscii(header, octal(0, 8), 116, 8);
  writeAscii(header, octal(body.length, 12), 124, 12);
  writeAscii(header, octal(FIXED_MTIME_SECONDS, 12), 136, 12);
  header.fill(0x20, 148, 156);
  writeAscii(header, type, 156, 1);
  writeAscii(header, "ustar\0", 257, 6);
  writeAscii(header, "00", 263, 2);
  writeAscii(header, "root", 265, 32);
  writeAscii(header, "root", 297, 32);
  if (split.prefix) writeAscii(header, split.prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeAscii(header, `${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
}

function splitUstarName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: "" };
  for (let index = name.lastIndexOf("/"); index > 0; index = name.lastIndexOf("/", index - 1)) {
    const prefix = name.slice(0, index);
    const suffix = name.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(suffix) <= 100) {
      return { name: suffix, prefix };
    }
  }
  throw new Error(`release_path_too_long:${name}`);
}

function writeAscii(buffer, value, offset, length) {
  const encoded = Buffer.from(value, "ascii");
  if (encoded.length > length) throw new Error("ustar_field_overflow");
  encoded.copy(buffer, offset);
}

function octal(value, length) {
  const encoded = Number(value).toString(8);
  if (encoded.length > length - 1) throw new Error("ustar_number_overflow");
  return `${encoded.padStart(length - 1, "0")}\0`;
}

function validateArchivePath(name) {
  const value = String(name || "");
  if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").includes("..") || value.includes("\0")) {
    throw new Error("release_archive_path_invalid");
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function main() {
  const specPath = process.argv[2];
  if (!specPath) throw new Error("Usage: build_control_overlay_release.mjs <relative-spec.json>");
  const result = await buildControlOverlayRelease({ specPath });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

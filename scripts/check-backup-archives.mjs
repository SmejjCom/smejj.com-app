import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAFE_ENV_EXAMPLE = ".env.example";
const PRIVATE_NAMES = new Set([
  ".env",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "id_ed25519",
  "id_rsa"
]);
const PRIVATE_DIRECTORIES = new Set([".aws", ".ssh"]);
const PORTABILITY_NAMES = new Set([".DS_Store"]);
const WORKSPACE_SCAN_IGNORES = new Set([".git", ".pnpm-store", "node_modules"]);

/** Returns secret, traversal, and portability violations from one gzip tar archive. */
export function inspectBackupArchive(archivePath, { tarBinary = "tar" } = {}) {
  const result = spawnSync(tarBinary, ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0 || result.error) {
    return [`archive_unreadable:${archivePath}`];
  }
  const findings = [];
  for (const rawEntry of String(result.stdout || "").split("\n")) {
    if (!rawEntry) continue;
    const entry = rawEntry.replace(/^\.\//, "");
    const segments = entry.split("/").filter(Boolean);
    const basename = segments.at(-1) || "";
    if (entry.startsWith("/") || segments.includes("..")) {
      findings.push(`archive_path_escape:${archivePath}:${rawEntry}`);
      continue;
    }
    if (isPrivateName(basename) || segments.some((segment) => PRIVATE_DIRECTORIES.has(segment))) {
      findings.push(`archive_secret_path:${archivePath}:${rawEntry}`);
    }
    if (PORTABILITY_NAMES.has(basename) || basename.startsWith("._")) {
      findings.push(`archive_nonportable_path:${archivePath}:${rawEntry}`);
    }
  }
  return findings;
}

/** Recursively verifies every checked-in gzip tar rollback archive. */
export async function scanBackupArchives(root = "backups") {
  const archives = await collectArchives(root);
  return archives.flatMap((archivePath) => inspectBackupArchive(archivePath));
}

/** Rejects live private env/credential files anywhere in the project tree. */
export async function scanWorkspaceSecretFiles(root = ".") {
  const findings = [];
  await walkWorkspace(root, findings);
  return findings.sort();
}

function isPrivateName(basename) {
  if (basename === SAFE_ENV_EXAMPLE) return false;
  return PRIVATE_NAMES.has(basename) || basename.startsWith(".env.");
}

async function collectArchives(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectArchives(target);
    if (entry.isFile() && (entry.name.endsWith(".tar.gz") || entry.name.endsWith(".tgz"))) return [target];
    return [];
  }));
  return nested.flat().sort();
}

async function walkWorkspace(directory, findings) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && WORKSPACE_SCAN_IGNORES.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkWorkspace(target, findings);
    else if (entry.isFile() && isPrivateName(entry.name)) findings.push(`workspace_secret_path:${target}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const findings = [
    ...await scanWorkspaceSecretFiles("."),
    ...await scanBackupArchives(process.argv[2] || "backups")
  ];
  if (findings.length > 0) {
    console.error(`Backup archive safety FAILED (${findings.length} violation(s)).`);
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
  } else {
    console.log("Workspace and backup safety OK: no private env, credential, traversal, or AppleDouble entries.");
  }
}

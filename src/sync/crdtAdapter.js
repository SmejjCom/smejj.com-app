import { createContentObject, normalizeRepoPath } from "../storage/contentAddressed.js";
import { sha256Hex } from "../storage/checksum.js";

export function createDocumentState({ projectId, files = {}, version = 0, appliedDeltas = [] } = {}) {
  return {
    projectId,
    version,
    files: { ...files },
    fileHashes: {},
    appliedDeltas: [...appliedDeltas],
    conflicts: []
  };
}

export async function hydrateStateHashes(state) {
  const next = cloneState(state);
  for (const [path, content] of Object.entries(next.files)) {
    next.fileHashes[path] = await sha256Hex(content);
  }
  return next;
}

export async function createDelta({ projectId, deviceId, baseState, changes, message = "" }) {
  const state = await hydrateStateHashes(baseState);
  const operations = [];
  for (const change of changes) {
    const path = normalizeRepoPath(change.path);
    const oldContent = state.files[path] ?? "";
    const newContent = String(change.content ?? "");
    const object = await createContentObject(path, newContent, change.contentType || "text/plain; charset=utf-8");
    operations.push({
      type: "set-file",
      path,
      baseSha256: state.fileHashes[path] || await sha256Hex(oldContent),
      newSha256: object.sha256,
      objectKey: object.objectKey,
      size: object.size,
      contentType: object.contentType,
      content: newContent,
      touchedLines: changedLineNumbers(oldContent, newContent)
    });
  }

  const body = {
    schema: "smejj.sync.delta.v1",
    projectId,
    deviceId,
    parentVersion: state.version,
    parentDeltas: [...state.appliedDeltas],
    createdAt: new Date().toISOString(),
    message,
    operations
  };
  const deltaSha256 = await sha256Hex(canonicalJson(body));
  return {
    ...body,
    deltaSha256,
    objectKey: `sync/projects/${projectId}/deltas/${deltaSha256}.json`
  };
}

export async function validateDelta(delta) {
  if (!delta || delta.schema !== "smejj.sync.delta.v1") throw new Error("Invalid delta schema.");
  if (!delta.projectId || !delta.deviceId || !Array.isArray(delta.operations)) throw new Error("Invalid delta metadata.");
  const { deltaSha256, objectKey, ...body } = delta;
  const actual = await sha256Hex(canonicalJson(body));
  if (actual !== deltaSha256) throw new Error("Delta checksum mismatch.");
  if (objectKey !== `sync/projects/${delta.projectId}/deltas/${deltaSha256}.json`) throw new Error("Delta object key mismatch.");
  for (const operation of delta.operations) {
    if (operation.type !== "set-file") throw new Error(`Unsupported delta operation: ${operation.type}`);
    normalizeRepoPath(operation.path);
    if (!operation.baseSha256 || !operation.newSha256 || !operation.objectKey) throw new Error(`Invalid operation for ${operation.path}`);
  }
  return delta;
}

export function cloneState(state) {
  return {
    projectId: state.projectId,
    version: Number(state.version || 0),
    files: { ...(state.files || {}) },
    fileHashes: { ...(state.fileHashes || {}) },
    touchedLines: Object.fromEntries(Object.entries(state.touchedLines || {}).map(([key, value]) => [key, [...value]])),
    appliedDeltas: [...(state.appliedDeltas || [])],
    conflicts: [...(state.conflicts || [])]
  };
}

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

export function changedLineNumbers(before, after) {
  const oldLines = String(before ?? "").split("\n");
  const newLines = String(after ?? "").split("\n");
  const max = Math.max(oldLines.length, newLines.length);
  const touched = [];
  for (let index = 0; index < max; index += 1) {
    if (oldLines[index] !== newLines[index]) touched.push(index);
  }
  return touched;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortKeys(child)]));
}

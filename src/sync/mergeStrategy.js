import { sha256Hex } from "../storage/checksum.js";
import { cloneState } from "./crdtAdapter.js";

export async function applyDeltaWithConflictProtection(state, delta) {
  const next = cloneState(state);
  next.touchedLines = { ...(state.touchedLines || {}) };
  const conflicts = [];

  for (const operation of delta.operations) {
    const currentContent = next.files[operation.path] ?? "";
    const currentSha = next.fileHashes[operation.path] || await sha256Hex(currentContent);
    if (currentSha === operation.baseSha256) {
      next.files[operation.path] = operation.content;
      next.fileHashes[operation.path] = operation.newSha256;
      next.touchedLines[operation.path] = operation.touchedLines;
      continue;
    }

    const merged = mergeDifferentLines({
      currentContent,
      remoteContent: operation.content,
      remoteTouchedLines: operation.touchedLines,
      localTouchedLines: next.touchedLines[operation.path] || []
    });
    if (!merged.ok) {
      conflicts.push({
        type: "line-conflict",
        path: operation.path,
        localSha256: currentSha,
        remoteSha256: operation.newSha256,
        baseSha256: operation.baseSha256,
        touchedLines: merged.overlap,
        message: "Same line changed on multiple devices."
      });
      continue;
    }
    next.files[operation.path] = merged.content;
    next.fileHashes[operation.path] = await sha256Hex(merged.content);
    next.touchedLines[operation.path] = [...new Set([...(next.touchedLines[operation.path] || []), ...operation.touchedLines])].sort((a, b) => a - b);
  }

  if (conflicts.length) {
    next.conflicts = [...next.conflicts, ...conflicts];
    return { ok: false, state: next, conflicts };
  }
  next.appliedDeltas = [...new Set([...next.appliedDeltas, delta.deltaSha256])];
  next.version += 1;
  return { ok: true, state: next, conflicts: [] };
}

function mergeDifferentLines({ currentContent, remoteContent, remoteTouchedLines, localTouchedLines }) {
  const overlap = remoteTouchedLines.filter((line) => localTouchedLines.includes(line));
  if (overlap.length) return { ok: false, overlap };
  const current = String(currentContent ?? "").split("\n");
  const remote = String(remoteContent ?? "").split("\n");
  const max = Math.max(current.length, remote.length);
  const merged = [];
  for (let index = 0; index < max; index += 1) {
    merged[index] = remoteTouchedLines.includes(index) ? (remote[index] ?? "") : (current[index] ?? "");
  }
  return { ok: true, content: merged.join("\n") };
}


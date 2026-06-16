import { sha256Hex } from "../storage/checksum.js";

export async function detectConflicts(state, delta) {
  const conflicts = [];
  for (const operation of delta.operations) {
    const currentContent = state.files[operation.path] ?? "";
    const currentSha = state.fileHashes[operation.path] || await sha256Hex(currentContent);
    const currentChangedFromBase = currentSha !== operation.baseSha256;
    if (!currentChangedFromBase) continue;

    const overlap = overlaps(operation.touchedLines, state.touchedLines?.[operation.path] || []);
    if (overlap || state.files[operation.path] !== operation.content) {
      conflicts.push({
        type: "same-file-concurrent-change",
        path: operation.path,
        localSha256: currentSha,
        remoteSha256: operation.newSha256,
        baseSha256: operation.baseSha256,
        touchedLines: operation.touchedLines,
        message: "Concurrent edits require visible review."
      });
    }
  }
  return conflicts;
}

export function overlaps(a = [], b = []) {
  const other = new Set(b);
  return a.some((item) => other.has(item));
}


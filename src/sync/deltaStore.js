import { validateDelta } from "./crdtAdapter.js";

export function createMemoryDeltaStore() {
  const deltas = new Map();
  return {
    kind: "memory-delta-store",
    async put(delta) {
      await validateDelta(delta);
      deltas.set(delta.objectKey, delta);
      return delta;
    },
    async get(objectKey) {
      const delta = deltas.get(objectKey);
      if (!delta) throw new Error(`Delta not found: ${objectKey}`);
      return validateDelta(delta);
    },
    async list(projectId) {
      return Array.from(deltas.values())
        .filter((delta) => delta.projectId === projectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async corrupt(objectKey, patch) {
      const delta = deltas.get(objectKey);
      if (!delta) throw new Error(`Delta not found: ${objectKey}`);
      deltas.set(objectKey, { ...delta, ...patch });
    }
  };
}


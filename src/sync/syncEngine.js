import { createDelta, hydrateStateHashes, validateDelta } from "./crdtAdapter.js";
import { applyDeltaWithConflictProtection } from "./mergeStrategy.js";
import { syncResult, SYNC_STATES } from "./syncStatus.js";

export function createSyncEngine({ deltaStore }) {
  if (!deltaStore) throw new Error("deltaStore is required.");

  async function prepareLocalChange({ state, deviceId, changes, message }) {
    const hydrated = await hydrateStateHashes(state);
    const delta = await createDelta({
      projectId: hydrated.projectId,
      deviceId,
      baseState: hydrated,
      changes,
      message
    });
    await deltaStore.put(delta);
    const applied = await applyDeltaWithConflictProtection(hydrated, delta);
    return syncResult(applied.ok, { delta, state: applied.state, conflicts: applied.conflicts });
  }

  async function applyRemoteDelta({ state, delta }) {
    await validateDelta(delta);
    const applied = await applyDeltaWithConflictProtection(await hydrateStateHashes(state), delta);
    return {
      ok: applied.ok,
      status: applied.ok ? SYNC_STATES.local : SYNC_STATES.conflict,
      state: applied.state,
      conflicts: applied.conflicts
    };
  }

  async function loadAndApply({ state, objectKey }) {
    const delta = await deltaStore.get(objectKey);
    return applyRemoteDelta({ state, delta });
  }

  return {
    prepareLocalChange,
    applyRemoteDelta,
    loadAndApply
  };
}


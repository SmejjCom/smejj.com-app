import { hydrateStateHashes } from "./crdtAdapter.js";
import { applyDeltaWithConflictProtection } from "./mergeStrategy.js";

export async function restoreFromDeltas({ baseState, deltas }) {
  let state = await hydrateStateHashes(baseState);
  for (const delta of deltas) {
    const result = await applyDeltaWithConflictProtection(state, delta);
    if (!result.ok) {
      return {
        ok: false,
        state: result.state,
        conflicts: result.conflicts
      };
    }
    state = result.state;
  }
  return { ok: true, state, conflicts: [] };
}


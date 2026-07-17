export const SYNC_STATES = Object.freeze({
  local: "local",
  synced: "synchronisiert",
  conflict: "konflikt",
  error: "fehler",
  blocked: "blockiert"
});

export function syncResult(ok, details = {}) {
  return {
    ok,
    status: ok ? SYNC_STATES.local : SYNC_STATES.blocked,
    ...details
  };
}


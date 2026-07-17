#!/bin/sh
# smejj.com — deterministic, secrets-free full Control runtime artifact.
# The result is uploaded immutably to IDrive e2 and consumed by the
# commit-pinned direct bootstrap. No GitHub Actions, Packages or registry push.
set -eu

OUT="${1:-tmp/emergency-salad-status-release-2026-07-11/smejj-control-phase1-v41-2026-07-11-rc9.tar.gz}"
NODE_BIN="${SMEJJ_NODE_BIN:-node}"

exec "$NODE_BIN" scripts/deploy/build_control_release_artifact.mjs "$OUT"

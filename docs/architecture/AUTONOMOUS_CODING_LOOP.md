# Autonomous Coding Loop

Status: implemented control contract
Date: 2026-07-01

This document defines what smejj may call autonomous in the coding OS.

## Definition

smejj is autonomous only when a coding task is handled as a replayable Task Capsule and the worker writes evidence for every gate:

- rollback prepared before patch finalization
- build passed
- typecheck passed
- tests passed
- browser verification with screenshots for UI changes
- errors recorded
- self-fix attempts recorded and capped
- benchmark data recorded
- verifier report written
- memory updated only after verified success

## Object Brain

IDrive e2 remains the durable object brain for:

- `input.json`
- `budget.json`
- `context-plan.json`
- `repo-pack-manifest.json`
- `patch.diff`
- `test-results.json`
- `browser-results.json`
- `browser-screenshots/`
- `errors.json`
- `self-fix-attempts.json`
- `benchmark-results.json`
- `verifier-report.md`
- `final-report.md`
- `memory-update.json`
- `rollback-manifest.json`
- `jobs/open/{jobId}.json`
- `jobs/running/{jobId}.json`
- `jobs/done/{jobId}.json`
- `jobs/failed/{jobId}.json`

The Control Router must not proxy model weights, large repositories, screenshots or logs.
Cloudflare Queues are not used. Job queues are small IDrive e2 manifests plus per-job Task Capsules.
When `persistToIdrive` is requested and IDrive credentials are configured, the Control Router writes the Task Capsule objects and the queue entry objects together. A job is not considered durably queued when only the local in-memory map contains it.

## Worker Role

Salad workers are compute-only. They claim a Task Capsule, run GLM-5.2 inference when explicitly approved, run verification, run browser checks for UI work, write evidence back to IDrive e2, and stop according to budget policy.

For UI work, browser evidence is fail-closed. A worker may run Playwright Chromium against local URLs, upload PNG screenshots under `browser-screenshots/`, accept local HTTP evidence or static HTML smoke evidence, but a UI task without browser evidence is failed and may not update memory. External browser URLs are blocked.

Patch work is treated as isolated by contract: the worker verifies a patch plan, safe relative paths, changed file hashes and rollback hashes before the result can pass. Unsafe paths, no-op patches or missing patch files fail closed and block memory learning.

Workers write queue transitions for `running` and the final `done` or `failed` state back to IDrive e2. Verified successful tasks also write a solved-error memory object under `projects/{projectId}/solved-errors/{jobId}.json` with evidence links, patch hashes, browser status, self-fix summary and benchmark metrics.

## Self-Correction

Self-fix is capped at three attempts. A failed run may store evidence and failed attempts, but memory learning remains blocked. Only a verified successful run may create memory proposals for solved errors or reusable patterns.

## Product Naming Rule

The product may use `smejj AI Autonomous Coding OS` when this loop is active for coding jobs. If GLM-5.2 compute is not approved, the system may still create autonomous Task Capsules and verification plans, but full model-driven autonomy remains blocked until worker compute is explicitly approved.

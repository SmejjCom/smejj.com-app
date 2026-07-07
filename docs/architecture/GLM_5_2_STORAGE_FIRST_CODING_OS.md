# GLM-5.2 Storage-First Coding OS

Status: locked target architecture
Date: 2026-07-01

This document defines the GLM-5.2-first target architecture for smejj.com. It replaces the older idea that a smaller coding model is the strategic core. Small models may help with embeddings, classification, UI assistance, filters or cheap pre-processing, but the quality-critical brain for architecture, agentic coding, long-horizon planning and final answers is GLM-5.2.

## Binding Operating Decision

smejj.com is an AI Coding OS, not a normal chatbot and not a classic big-server app.

- GLM-5.2 remains the main model, flagship brain and quality foundation.
- IDrive e2 does 99% of the durable work as the Object Brain for models, project knowledge, Task Capsules, logs, benchmarks, screenshots, rollbacks, backups, memory and artifacts.
- Salad workers do only real compute: GLM-5.2 inference, tests, browser verification, benchmarks, compression, indexing and heavy processing.
- The classic server remains a minimal Control Router for auth, job ids, budget checks, short-lived signed upload/download URLs, worker control and status streaming.
- Large files, model weights, repositories, logs, screenshots and heavy tasks must not flow through the Control Router.
- Every coding task must become a Task Capsule that is stored, verifiable, replayable and auditable.
- No patch is final without rollback preparation, build, typecheck and tests. UI changes additionally require browser verification with screenshots.
- Memory may learn only from successfully verified results with evidence.
- The long-term quality target is Fable-level or better through GLM-5.2 plus Object Brain, worker-on-demand, Repo-Packs, Context Planner, real tests, benchmark replay and self-correction.

## Source Facts

- Official model: `zai-org/GLM-5.2`.
- Official lighter vault target already used by smejj: `zai-org/GLM-5.2-FP8`.
- License: MIT.
- Reported model size for BF16/F32 model card: 753B parameters.
- Target context: solid 1M-token context for long-horizon work.
- Officially documented runtime paths: SGLang, vLLM, Transformers, KTransformers and Unsloth.
- Official GLM-5.2 capabilities include flexible effort levels, improved coding, IndexShare for long-context sparse attention and improved MTP for speculative decoding.
- Local smejj vault status: GLM-5.2 FP8 is verified as complete storage-only under IDrive e2 and remains inference-disabled until compute is explicitly approved.

References checked on 2026-06-25:

- https://huggingface.co/zai-org/GLM-5.2
- https://github.com/kvcache-ai/ktransformers
- https://docs.vllm.ai/en/latest/features/disagg_prefill/
- https://docs.sglang.io/docs/advanced_features/hicache
- https://www.idrive.com/s3-storage-e2/
- https://docs.salad.com/

## Non-Negotiable Roles

```text
PWA / Browser          = immediate interface, local state, OPFS cache
Control Router         = auth, budget, job id, signed URLs, status stream
IDrive e2              = 99% durable object brain and model vault
GLM-5.2                = flagship reasoning and coding brain
Salad Worker           = short-lived compute muscle after approval
GitHub Free            = source code only
Cloudflare Free        = DNS, static shell, small fail-closed edge gatekeeper
Tests                  = truth layer
Task Capsules          = replayable memory
Benchmarks             = quality meter
Rollbacks              = insurance before every patch
```

IDrive e2 is storage, not live RAM and not an inference server. GitHub and Cloudflare remain free-only. The Control Router must never proxy model weights, large files or long-running inference.

## Target Flow

```text
PWA opens instantly
  -> local app shell, service worker, OPFS state
  -> creates job draft locally
  -> Control Router checks auth, budget and abuse rules
  -> Control Router creates job id and short-lived signed IDrive e2 URLs
  -> Task Capsule is written to IDrive e2
  -> Worker Preflight checks hardware, cache, disk and manifest
  -> Worker validates GLM-5.2 cache manifest
  -> missing shards stream directly from IDrive e2 to worker SSD/NVMe
  -> SGLang / vLLM / KTransformers runtime starts
  -> Context Planner builds repo-pack, symbols and RAG shards
  -> GLM-5.2 produces plan, patch or answer
  -> rollback artifact is prepared before any patch is accepted
  -> worker runs build, typecheck, tests and Playwright checks
  -> screenshots, logs and benchmark data go to IDrive e2
  -> memory update is proposed, validated and stored
  -> result streams to user
  -> worker stays warm by policy or shuts down
```

## IDrive e2 Object Brain

Use small mutable manifests plus immutable content-addressed objects. Do not use bucket listings as the main database.

```text
app/
  releases/
  pwa-shell/
  static-assets/
  app-manifest.json
  service-worker/
  offline-shell/

models/
  glm-5-2/
    model-manifest.json
    shard-map.json
    checksums.json
    license.txt
    tokenizer/
    config/
    weights-bf16/
    weights-fp8/
    quantized/
    inference-tests/
    benchmark-results/
    runtime-notes/
      vllm-notes.md
      sglang-notes.md
      ktransformers-notes.md
    hardware-matrix.json
    cost-profile.json

model-cache-manifests/
  glm-5-2/
    prefix-blocks.json
    prompt-blocks.json
    kv-cache-policy.json
    prefill-cache-policy.json
    worker-cache-map.json
    hot-shards.json
    cold-shards.json

projects/
  smejj/
    current-manifest.json
    architecture-rules.md
    cost-rules.md
    security-rules.md
    repo-index/
    symbol-graph/
    file-shards/
    task-capsules/
    rollbacks/
    benchmarks/
    browser-screenshots/
    memory/
```

Every object larger than a small manifest is addressed by hash. Mutable files only point to immutable versions.

## GLM-5.2 Model Manifest

Example shape:

```json
{
  "schemaVersion": 1,
  "modelId": "glm-5-2",
  "displayName": "GLM-5.2",
  "primaryRole": "flagship-coding-brain",
  "source": {
    "provider": "huggingface",
    "repo": "zai-org/GLM-5.2-FP8",
    "fallbackRepo": "zai-org/GLM-5.2",
    "license": "mit"
  },
  "architecture": {
    "family": "glm_moe_dsa",
    "contextTokens": 1000000,
    "precision": "fp8-vault-primary-bf16-reference",
    "supportsEffortLevels": true,
    "supportsMtpSpeculation": true,
    "supportsIndexShare": true
  },
  "storage": {
    "provider": "idrive-e2",
    "prefix": "models/glm-5-2",
    "contentAddressed": true,
    "multipartUploadRequired": true
  },
  "verification": {
    "requiredBeforeInference": [
      "manifest-signature-ok",
      "all-shards-present",
      "sha256-ok",
      "license-archived",
      "runtime-preflight-ok"
    ]
  },
  "runtimePriority": [
    "sglang-first",
    "vllm-second",
    "ktransformers-for-consumer-gpu-offload"
  ],
  "inferenceDefault": "disabled-until-explicit-compute-approval"
}
```

## Shards, Hashes And Cache Validation

- Shard by upstream file and by content hash. Keep upstream filename, size, ETag, sha256 and byte count in `shard-map.json`.
- Verify every worker cache entry against model manifest, shard hash and file length before runtime startup.
- Keep hot shards on worker SSD/NVMe when the platform allows warm reuse.
- Never trust cache by path alone. Trust only hash plus manifest version.
- Use prefix-sharded object keys such as `objects/sha256/ab/abcdef...` for high object counts.
- Store transfer logs and verification reports under immutable run ids.

## Worker Loading Strategy

The worker should not cold-download GLM-5.2 for every job.

1. Pull the small model manifest.
2. Check local SSD/NVMe cache manifest.
3. Validate cached shards by sha256 and size.
4. Download only missing or invalid shards directly from IDrive e2.
5. Keep runtime image separate from model cache.
6. Write `worker-cache-map.json` after successful validation.
7. Start inference only after preflight passes.

Warm-cache policy:

- keep warm for short TTL after expensive jobs,
- terminate immediately after budget or abuse risk,
- reuse only cache entries that match the current manifest,
- never keep user secrets or task data in reusable cache.

## Runtime Recommendation

Production-serving baseline test order:

1. SGLang for GLM-5.2 serving, OpenAI-compatible API, long-context work, speculative decoding, PD/EPD options and HiCache path.
2. vLLM for OpenAI-compatible serving, broad production ecosystem, prefix caching, chunked prefill, MTP/speculative decoding and later experimental disaggregated prefill.
3. KTransformers / KT-Kernel for CPU/GPU heterogeneous MoE inference, consumer-GPU experiments and expert placement research.

Reason: SGLang and vLLM are the most direct server routes. KTransformers is strategically important for limited VRAM and MoE expert offload, but should be benchmarked after the baseline serving path is stable.

Single RTX 4090 feasibility test order:

1. KTransformers / KT-Kernel for CPU/GPU/NVMe offload and consumer-GPU reality checks.
2. SGLang for serving compatibility and cache behavior when hardware allows a meaningful smoke test.
3. vLLM for ecosystem comparison and future multi-GPU serving, not as the first 4090 bet.

This split keeps the production path clean while still testing the most realistic limited-VRAM path first on a single consumer GPU.

## RTX 4090 Reality

One RTX 4090 is not a realistic target for full-quality GLM-5.2 BF16 or FP8 serving with large context. It can be useful for:

- cache and startup experiments,
- tiny context smoke tests only if the runtime supports aggressive offload,
- KTransformers heterogeneous experiments,
- validating manifests, shard loading and control flow,
- measuring how far CPU/GPU/NVMe offload can go.

It is not the production target for 1M-context GLM-5.2 coding. For serious serving, plan multi-GPU workers with enough RAM, fast local NVMe and runtime support for tensor/expert/context parallelism.

## Multi-GPU Path

- 2 GPUs: runtime compatibility and shorter-context tests.
- 4 GPUs: limited useful coding workloads, still measure context and latency carefully.
- 8 GPUs: first serious target for flagship GLM-5.2 serving.
- Later: split prefill/decode pools only after baseline monolithic serving is benchmarked.

Disaggregated prefill helps control TTFT and tail inter-token latency, but vLLM documents it as experimental and not a throughput improvement by itself. Treat it as phase 3 optimization, not phase 1 foundation.

## Cache And Long-Context Techniques

- Prefix cache: reuse stable system prompts, project rules, architecture rules and common repo packs.
- Prompt block cache: hash prompt sections independently and reuse validated blocks.
- Chunked prefill: reduce latency spikes for long prompts.
- Hierarchical KV cache: evaluate through SGLang HiCache for repeated agent workflows and long sessions.
- KV cache manifests: record which prompt hashes produced reusable cache state, runtime version, model manifest and invalidation rules.
- Speculative decoding: use GLM-5.2 MTP support where runtime support proves correct and faster.
- IndexShare: treat as model-internal advantage; do not build external assumptions that depend on undocumented internals.

## Effort Router

Use GLM-5.2 effort levels as a cost and latency control, not as different core models.

```text
fast:
  small edits, summaries, route decisions, status explanations

high:
  normal coding, multi-file changes, architecture checks, test repair

max:
  critical architecture, security-sensitive patches, failed self-fix,
  benchmark regressions, long-horizon tasks, release decisions
```

Routing inputs:

- task risk,
- touched file count,
- test blast radius,
- security or cost sensitivity,
- expected context length,
- previous failure count,
- user-selected quality mode,
- remaining job budget.

Self-fix is capped at 2-3 attempts. After that the task returns evidence, failed tests and recommended human decision.

## Task Capsules

Every job creates a replayable capsule:

```text
task-capsules/{yyyy}/{mm}/{jobId}/
  input.json
  budget.json
  selected-effort.json
  context-plan.json
  repo-pack-manifest.json
  prompt-blocks.json
  model-output.json
  patch.diff
  test-results.json
  browser-results.json
  screenshots/
  benchmark.json
  memory-proposals.json
  final-answer.md
```

Replay must work without trusting model claims. It reuses the same repo state, context plan, prompt blocks, runtime version, tests and browser checks where possible.

## Context Planner

The agent must not blindly load the whole repo.

Context Planner steps:

1. Read project manifest and architecture rules.
2. Classify task type and risk.
3. Select only relevant files through path hints, symbol graph and search.
4. Build repo-pack with file hashes, snippets, dependency edges and tests.
5. Add RAG shards only when they affect the task.
6. Reserve token budget for reasoning, patch and verification.
7. Store the context plan in the Task Capsule.

Repo-pack contents:

- selected files,
- compact symbol graph,
- imports/exports,
- relevant tests,
- package scripts,
- local policies,
- recent solved errors,
- exact exclusion list for skipped large or irrelevant paths.

## Verification Policy

No patch is trusted or final without rollback preparation and verification.

Minimum:

- apply patch in isolated workspace,
- prepare rollback artifact before accepting the patch,
- run build,
- run typecheck,
- run relevant tests,
- run architecture/cost checks when architecture or provider logic changes,
- run Playwright/browser screenshot checks for UI changes,
- store logs and screenshots in IDrive e2,
- write the verifier report into the Task Capsule.

Browser verification is standard for user-visible changes. Screenshots are stored by job id and compared against known-good baselines when available.

## Memory Policy

Memory is proposed, not blindly learned.

Allowed memory:

- stable architecture rules,
- verified solved errors,
- successful benchmark/task patterns,
- user-approved project preferences,
- proven test fixes.

Blocked memory:

- unverified model guesses,
- secrets,
- private paths,
- failed patch assumptions,
- one-off logs without validation,
- user data outside explicit project scope.

Memory entries need source capsule id, evidence, confidence, expiry policy and rollback path.

## Minimal Control Router APIs

```text
GET  /health/live
GET  /capabilities
POST /jobs
GET  /jobs/{jobId}
GET  /jobs/{jobId}/events
POST /jobs/{jobId}/cancel
POST /storage/presign-upload
POST /storage/presign-download
POST /workers/salad/start
POST /workers/{workerId}/heartbeat
POST /workers/{workerId}/complete
POST /budget/estimate
GET  /models/glm-5-2/status
```

All endpoints fail closed if auth, budget, storage, worker state or policy is unclear.

## Security Rules

- Browser never receives IDrive e2 root credentials.
- Use short-lived, scoped pre-signed URLs.
- Per-job tokens are bound to user id, job id, object prefix, method and TTL.
- Workers receive only job-scoped access.
- No unbounded bucket listing.
- No open internet inside evaluation containers unless explicitly required and logged.
- No secret persistence in Task Capsules.
- Build/test/browser execution runs in isolated sandboxes.
- All patches have rollback snapshots.

## Cost Rules

- GitHub Free and Cloudflare Free stay free-only.
- No Cloudflare paid storage, queues, databases, images, stream or Workers AI.
- No GitHub Actions, Codespaces, Packages, LFS or paid runner dependency.
- Salad is only approved compute muscle after explicit budget approval.
- IDrive e2 is storage and artifact brain, not compute.
- Download missing model shards only; never redownload verified cache.
- Keep workers warm only when the saved cold-start cost is greater than warm runtime cost.
- Store cost ledger per job.

## Anti-Patterns

- Treating IDrive e2 as a live app server or database.
- Proxying large files through the Control Router.
- Using bucket listings as the primary index.
- Letting small models replace GLM-5.2 for quality-critical coding.
- Running full repo ingestion by default.
- Updating memory from unverified model text.
- Applying patches without tests.
- Skipping browser checks after UI changes.
- Silent fallback to paid GitHub or Cloudflare features.
- Starting GLM inference without manifest and checksum verification.

## Development Phases

Phase 1: lock the brain and evidence layer.

- GLM-5.2-first architecture policy.
- Model manifest and shard map schema.
- Task Capsule schema.
- Context Planner prototype.
- Rollback-before-patch rule.
- Cost ledger.
- IDrive e2 object layout for jobs, caches, benchmarks and screenshots.

Phase 2: worker proof.

- Salad worker preflight.
- Direct IDrive e2 shard download.
- Worker SSD/NVMe cache manifest.
- SGLang baseline smoke test.
- vLLM baseline smoke test.
- KTransformers feasibility test on consumer GPU.
- Minimal OpenAI-compatible inference endpoint behind job auth.

Phase 3: verified coding loop.

- GLM-5.2 effort router.
- Repo-pack and symbol graph.
- Patch generation.
- Build/typecheck/test execution.
- Playwright verification and screenshots.
- Replay old tasks.
- Solved errors database.

Phase 4: performance and scale.

- Prefix and prompt block cache.
- HiCache/KV cache experiments.
- Chunked prefill tuning.
- Speculative decoding/MTP benchmark.
- Multi-GPU matrix.
- Prefill/decode disaggregation only after baseline data.
- Worker warm-pool budget scheduler.

Phase 5: product expansion.

- iPhone, Android, desktop, browser extension and CLI.
- Shared Task Capsules across devices.
- Team/project permissions.
- More benchmarks and regression gates.
- Optional helper models for embeddings and classification.

## What Makes smejj Special

smejj should win by system intelligence, not only raw model size:

- GLM-5.2 is the flagship brain.
- IDrive e2 makes every task durable, replayable and auditable.
- Context Planner prevents context waste.
- Task Capsules turn work into memory.
- Tests and browser screenshots decide truth.
- Benchmark replay prevents quality drift.
- Rollbacks make agentic coding reversible.
- Cache manifests make large-model UX feel fast.
- Effort routing spends compute only where quality needs it.

The UX goal is that the app feels instant even when the flagship model is large: the shell opens immediately, the job appears immediately, context and cache checks stream status immediately, and only the expensive thinking path is asynchronous.

## End Recommendation

Build smejj.com as a GLM-5.2-first Storage-First AI Coding OS. Keep IDrive e2 as the durable object brain, Salad as approved on-demand compute, the Control Router as a tiny fail-closed coordinator, and the PWA as the instant surface. Do not make a smaller model the strategic core. Use smaller models only as helpers around GLM-5.2. The route to Fable-level quality is the combination of GLM-5.2, replayable Task Capsules, strict context planning, verified patches, browser evidence, benchmark replay, cache-aware serving and rollback discipline.

# smejj GLM-5.2 Salad Worker

This worker is the compute layer for the smejj.com GLM-5.2 AI Coding OS.

Responsibilities:

- load verified GLM-5.2 FP8 model objects from IDrive e2
- claim one Task Capsule at a time
- write status transitions, queue entries, tests, browser evidence, errors, self-fix attempts, benchmarks, verifier report, final report, and memory proposals back to IDrive e2
- run Playwright Chromium checks for local UI URLs and upload screenshot PNGs to the Task Capsule
- write verified solved-error memory only after all gates pass
- expose an OpenAI-compatible `/v1/chat/completions` endpoint when a GLM runtime is running
- keep the classic server as a control router only

It must not:

- store IDrive or Salad secrets in the image
- move model files through the classic server
- learn memory from unverified model output
- mark UI work successful without browser evidence
- accept unsafe patch paths or patches without rollback hashes
- start paid compute without explicit operator confirmation

Runtime order:

1. `sglang`
2. `vllm`
3. `ktransformers`

Default command:

```sh
node /app/worker.js
```

Preflight:

```sh
node /app/worker.js --preflight
```


## Salad env minimum

The container must receive these values at runtime, preferably as Salad secrets or protected environment values:

- `IDRIVE_E2_ENDPOINT`
- `IDRIVE_E2_REGION`
- `IDRIVE_E2_BUCKET`
- `IDRIVE_E2_ACCESS_KEY`
- `IDRIVE_E2_SECRET_KEY`
- `SMEJJ_TASK_CAPSULE_PREFIX`
- `GLM_5_2_FP8_PREFIX=model-files/glm-5-2-fp8/original/`
- `SMEJJ_GLM_RUNTIME=sglang`
- `SMEJJ_START_GLM_RUNTIME=YES` only when GPU spend is explicitly approved

For UI verification, the Task Capsule may include:

- `browserRunner=playwright`
- `browserUrl=http://127.0.0.1:<port>/...`

Only local browser URLs are accepted. External URLs fail closed.

Local verification commands:

```sh
npm run worker:glm:preflight
npm run check:salad
```

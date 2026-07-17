# Phase 1 GLM Completion Checklist

Status: implemented baseline artifacts
Date: 2026-06-25

Phase 1 is complete when these artifacts exist and are validated:

- GLM-5.2-first architecture policy.
- GLM model manifest schema and example manifest.
- GLM shard map schema and example shard map.
- GLM checksum schema and example checksum manifest.
- Worker/model cache manifest schema and examples.
- Context Plan schema and example.
- Task Capsule schema and example.
- Salad worker preflight schema validation.
- Manifest validator covers all of the above.
- JSON validator skips local package stores and office artifacts.

Next build target after Phase 1:

1. Generate real Context Plans from repo search and file hashes.
2. Generate real Task Capsules from user jobs.
3. Implement worker preflight execution against Salad runtime data.
4. Run SGLang/vLLM/KTransformers smoke tests only after compute approval.

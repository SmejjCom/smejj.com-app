# AI Model Router Roles

Status: active planning policy

The app uses model roles, not one always-on paid model.

## Role Split

- `glm-5-2-fp8-vault`: flagship brain for long-context planning, architecture, agentic coding, repository work, debugging, tests, implementation and Fable-level tasks.
- `kimi-k2-7-vault`: archived comparison/specialist candidate, not the strategic core and not a replacement strategy for GLM-5.2.
- `nex-n2-pro-idrive-lite`: later fallback candidate for small verified jobs only.
- `disabled`: free-safe default when no approved compute is available.

## Routing Policy

```text
critical / architecture / long context -> GLM-5.2 FP8
code change / bug / test / repo work   -> GLM-5.2 FP8
small helper task                       -> helper model only if non-critical
small fallback task                     -> disabled or later Nex after verification
```

The router may select a vault role, but it must not start inference from a vault model by default. Vault models require separately approved compute, checksum verification, and no GitHub or Cloudflare paid services.

Effort routing happens inside GLM-5.2:

- `fast`: low-risk summaries, routing, status and small local edits.
- `high`: normal coding and multi-file implementation.
- `max`: critical architecture, security, failed self-fix, benchmarks and long-horizon jobs.

## Cost Guard

- GitHub and Cloudflare remain permanently free-tier only.
- IDrive e2 stores model files, metadata, inventories, and checksums.
- IDrive e2 is not an inference server.
- No trial, billing fallback, Workers AI, R2, GitHub LFS, GitHub Packages, Actions minutes, or Codespaces dependency may be introduced.

See also: `docs/architecture/GLM_5_2_STORAGE_FIRST_CODING_OS.md`.

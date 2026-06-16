# Release Protection

## Pflichtblock

smejj.com must stay fast, stable, secure, scalable, and cost-controlled. GitHub
and Cloudflare are Free-plan-only infrastructure. IDrive e2 is the primary
storage location for files, media, models, backups, deployment artifacts, and
central data.

## Hard Release Rule

Before any release or Cloudflare deployment, run:

```bash
npm run release:preflight
```

This command performs:

- local syntax check
- GitHub/Cloudflare Free-tier guard
- IDrive e2 storage check
- IDrive e2 deployment artifact upload and download verification
- Cloudflare dry-run deployment

## What The Guard Blocks

- GitHub Actions workflows as core release automation
- Git LFS storage
- GitHub Codespaces commands
- Cloudflare R2, D1, KV, Queues, Vectorize, Durable Objects, Workflows,
  Pipelines, Images, Stream, Hyperdrive, AI, Browser, or paid-risk bindings
- secret-like values in tracked source files
- secret-like values in `wrangler.jsonc`
- missing IDrive e2 environment documentation
- removing the IDrive-backed storage status path

## Allowed Roles

- GitHub Free: source code, small documentation, manual collaboration.
- Cloudflare Free: DNS, public PWA shell, static assets, light edge routing.
- IDrive e2: authoritative object storage for durable files and artifacts.

## Scale Constraint

Millions or billions of daily users cannot be powered by GitHub Free and
Cloudflare Free as the compute core. The release guard keeps those services in
safe front-door roles. Heavy AI inference, central compute, and large user-scale
state must be handled by separately approved cost-controlled infrastructure,
BYOK provider accounts, user-owned compute, or self-owned GPU capacity.

The app must fail closed when a paid-risk provider is unavailable or not
explicitly approved.

# Release Protection

## Pflichtblock

smejj.com must stay fast, stable, secure, scalable, and cost-controlled. GitHub
Free is limited to source code and GitHub Pages static hosting. Cloudflare is
not used. IDrive e2 is the primary storage location for files, media, models,
backups, deployment artifacts, and central data.

## Hard Release Rule

Before any release or GitHub Pages deployment, run:

```bash
npm run release:preflight
```

This command performs:

- local syntax check
- GitHub Free-tier and Cloudflare-exit guard
- IDrive e2 storage check
- IDrive e2 deployment artifact upload and download verification
- static deployment safety checks

## What The Guard Blocks

- GitHub Actions workflows as core release automation
- Git LFS storage
- GitHub Codespaces commands
- any Cloudflare artifact, runtime binding, route, deployment config, or service
- secret-like values in tracked source files
- missing IDrive e2 environment documentation
- removing the IDrive-backed storage status path

## Allowed Roles

- GitHub Free: source code, small documentation, manual collaboration.
- GitHub Pages Free: static PWA shell for smejj.com.
- Spaceship: already-owned domain and DNS for smejj.com.
- IDrive e2: authoritative object storage for durable files and artifacts.

## Scale Constraint

Millions or billions of daily users cannot be powered by GitHub Free as the
compute core. The release guard keeps GitHub in source/static roles. Heavy AI
inference, central compute, and large user-scale state must use browser/local
device compute, IDrive-e2 object flows, or explicitly budget-approved stateless
worker compute. There is no hidden paid fallback and no GitHub paid path.

The app must fail closed when a paid-risk provider is unavailable or not
explicitly approved.

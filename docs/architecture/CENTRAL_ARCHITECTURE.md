# Central Architecture Map

## Purpose

This document is the single map for smejj.com architecture ownership. It keeps
the project free-safe, maintainable, and ready for later platform expansion
without adding paid GitHub or Cloudflare dependencies.

## Centralized Now

| Area | Owner |
| --- | --- |
| API route names | `src/shared/platform.js`, `public/config.js` |
| Cost policy | `src/shared/platform.js`, architecture docs |
| Cloudflare/Node security headers | `src/shared/platform.js` |
| Content types and static file serving | `src/shared/platform.js`, `src/server.js`, Cloudflare Assets |
| Client action routes | `public/config.js`, `public/app.js` |
| IDrive e2 storage status | `src/worker.js`, `src/server.js`, `scripts/model-management/check_idrive_e2_storage.mjs` |
| IDrive e2 deployment artifacts | `scripts/model-management/upload_project_artifact_to_idrive.mjs` |
| Release protection and free-tier guard | `scripts/release/free_tier_release_guard.mjs` |
| PWA cache versioning | `public/sw.js` |
| SEO/AIO/GEO/AEO/KI discovery basics | `public/index.html`, `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt` |

## Reserved Central Modules

These areas are not production features yet. They must be implemented centrally
before they are exposed to users:

| Area | Required future owner |
| --- | --- |
| User route and profile model | `src/shared/users.js` or successor module |
| Auth/session logic | `src/shared/auth.js` or successor module |
| Upload and file lifecycle | `src/shared/files.js` plus IDrive e2 object layout |
| Chat and agent persistence | IDrive e2 append-only object layout under `chats/` and `agents/` |
| Memory/RAG/search | IDrive e2 metadata plus separately approved compute/indexing |
| Icon components | a single client UI module before icons are introduced |
| Layout/design components | a single client UI module before the UI grows beyond this shell |
| Internationalization | a single i18n dictionary module before adding more languages |
| Native platform configuration | PWA manifest first; native wrappers later without paid GitHub/Cloudflare dependencies |

## Rules

- Do not introduce a second route table.
- Do not put secrets in `wrangler.jsonc`, tracked source, frontend files, docs, or GitHub.
- Do not add Cloudflare storage, queues, databases, AI, browser rendering, or paid-risk bindings.
- Do not add GitHub Actions, Codespaces, LFS, Packages, or paid-risk GitHub automation.
- New user data, files, media, models, backups, indexes, and deployment artifacts must use IDrive e2 or another explicitly approved free-safe external path.
- Online endpoints must fail closed when auth, storage, or inference is missing.
- Local-only file and terminal tools must stay local-only.

## Rollback

Every release must have:

1. a Git commit SHA,
2. an IDrive e2 deployment artifact,
3. a passing `npm run release:preflight`,
4. a Cloudflare deployment version.

Rollback order:

1. use Cloudflare rollback to the previous known-good version,
2. restore source from Git commit or IDrive e2 artifact if needed,
3. rerun `npm run release:preflight`,
4. redeploy only after the preflight passes.

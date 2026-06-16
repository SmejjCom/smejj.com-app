# No-Big-Server Kimi Strategy

## Expert Decision

IDrive e2 can be the storage foundation for Kimi K2.7 Code, but it cannot execute Kimi K2.7 Code. Object storage stores bytes; it does not provide GPU memory, model loading, token generation, tool execution, or low-latency inference.

The correct architecture without owning a large machine is therefore:

1. Keep Kimi K2.7 Code weights, metadata, license files, inventories, and future checksums in IDrive e2.
2. Treat Kimi K2.7 Code as a model vault and reference capability.
3. Run the app through a provider-neutral AI router.
4. Use only compute paths that are explicitly approved and cost-safe.
5. Never make GitHub Free or Cloudflare Free responsible for heavy inference, large storage, or central data.

## What The Research Shows

- Official Kimi API exists and is OpenAI-compatible, but it is a paid API path, so it cannot be the default core under the current cost rules.
- Cloudflare Workers AI offers `@cf/moonshotai/kimi-k2.7-code`, but Kimi K2.7 has per-token pricing and Workers AI has a daily free allocation. After that, more usage requires Workers Paid. This cannot be a core dependency.
- vLLM's Kimi K2.7 Code recipe lists INT4 hardware around `8x H200` or about `640 GB` aggregate VRAM. That confirms a large inference machine is needed for serious self-hosting.
- Unsloth-style aggressive quantization can reduce hardware needs, but practical useful speed still needs substantial RAM/VRAM. Tiny or heavily offloaded runs are too slow for the smejj.com target of instant, fluid coding assistance.
- Free third-party LLM APIs usually have strict quotas, unstable catalogs, credit systems, or no production guarantee. They can be demo fallbacks, not the core architecture.

## Recommended Architecture

### Layer 1: IDrive e2 Model Vault

IDrive e2 stores:

- original model weights when transfer hardware is available
- quantized variants
- tokenizer/config files
- license and third-party notices
- checksums and inventories
- user files, media, backups, and deployment artifacts

### Layer 2: AI Router

The app should route requests through a neutral OpenAI-compatible interface:

- `kimi-k2-7`: preferred high-quality profile
- `fast-code`: low-latency coding profile
- `local-browser`: client-side small model profile
- `byok`: user-provided API key profile
- `disabled`: hard stop when a provider would create cost risk

The router must fail closed. If a provider is missing, over quota, or paid-risk, the app returns a clear unavailable state instead of silently switching to a paid service.

### Layer 3: Free-Safe Compute Options

Allowed by default:

- browser-side small models on the user's device
- deterministic code tools that do not need LLM inference
- retrieval/search over IDrive-hosted metadata
- user-provided API keys where the user owns the cost relationship
- manually enabled demo providers with hard quotas

Not allowed as core:

- GitHub Actions for production compute
- GitHub Codespaces
- Cloudflare Workers Paid
- Cloudflare Workers AI beyond free hard limits
- Cloudflare R2, Images, Stream, Queues, D1 Paid, or KV Paid
- any trial API, auto-billing API, or quota that turns into charges

## Practical Product Path

### Phase 1: Free-Safe MVP

- PWA shell
- IDrive e2 storage status
- Kimi K2.7 metadata registry
- local project agent tools
- local-browser tools and disabled-by-default provider settings
- clear "provider unavailable" state when no cost-safe inference exists

### Phase 2: Useful Without Big Server

- client-side small coding model for simple tasks
- static code analysis and patch planning
- retrieval from IDrive-stored project files and docs
- no Cloudflare Workers AI core path
- no Kimi/Moonshot paid API core path

### Phase 3: Serious Scale

For millions or billions of users per day, free GitHub/Cloudflare plus IDrive storage cannot supply enough inference compute. Under the current project rule, serious scale must avoid paid GitHub/Cloudflare and avoid hidden paid add-ons. Compliant options are:

- user-owned compute federation
- browser/local-device compute
- self-owned compute explicitly approved outside GitHub/Cloudflare paid services
- partner compute only after a new written free-safe architecture review

Under the current rules, the fully compliant path is to keep central compute optional, fail-closed, and never silently paid.

## My Recommendation

Do not try to "run Kimi inside IDrive." That is technically impossible.

Build smejj.com as a fast, provider-neutral AI operating layer:

- IDrive e2 is the permanent storage and model vault.
- Kimi K2.7 is the premium reference model and future self-host target.
- The app works today through BYOK or hard-limited free/demo providers.
- Basic functionality remains usable without paid compute through local tools and small client-side models.
- Nothing silently depends on paid GitHub or Cloudflare features.

This is the strongest architecture that respects the no-big-server and no-hidden-cost constraints.

# smejj.com Free-Safe Architecture

## Non-Negotiable Cost Rules

- GitHub is only for source code and must remain on the Free plan.
- Cloudflare is only for DNS, static delivery, and light edge routing on the Free plan.
- No GitHub Actions, Codespaces, paid storage, paid runners, paid packages, or paid add-ons are core architecture.
- No Cloudflare Pro, Business, Enterprise, Workers Paid, R2 Paid, Images, Stream, Queues, D1 Paid, KV Paid, or paid add-ons are core architecture.
- IDrive e2 / S3-compatible storage is the primary store for files, media, model artifacts, backups, and central data.
- Any feature that becomes paid after a quota is not a core dependency.

## Practical Architecture

Cloudflare Free can host the public shell and DNS for smejj.com. It must not be treated as the unlimited backend for billions of users, because Free-plan dynamic limits are real.

The scalable shape is:

- Static/PWA shell on Cloudflare Free.
- Code repository on GitHub Free, without paid automation as a required path.
- Large files and durable user/model data in IDrive e2.
- AI inference behind a separately controlled OpenAI-compatible endpoint.
- Client and edge code designed to fail closed when paid/limited services are unavailable.

## Current Deployment

- Domain: `smejj.com`
- Cloudflare account: `smejjcom@gmail.com`
- Nameservers: `joyce.ns.cloudflare.com`, `plato.ns.cloudflare.com`
- Worker name: `smejj-com`
- Custom domains: `smejj.com`, `www.smejj.com`
- IDrive e2 health endpoint: `/api/storage/status`
- Runtime health endpoint: `/api/health`

## Done Criteria For The Free Shell

- Public root domain resolves through Cloudflare Free.
- Public shell is installable as a PWA.
- Worker APIs fail closed when secrets or paid-risk backends are absent.
- IDrive e2 is checked as primary storage through a signed S3-compatible request.
- No Cloudflare paid storage, queues, D1, KV, Images, Stream, or Workers Paid feature is required.
- No GitHub paid feature is required.

## Billion-User Constraint

Billions of users per day are not safely achievable with GitHub Free and Cloudflare Free as the backend core. The free-safe version must keep GitHub and Cloudflare in front-door/static roles and move compute, models, files, backups, and central state away from any paid Cloudflare or GitHub feature.

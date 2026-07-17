# smejj.com Free-Safe Architecture

Status: aktualisiert nach Cloudflare-Exit 2026-07-02. Verbindlich ist
`docs/architecture/FREE_ONLY_MASTER_POLICY.md`.

## Non-Negotiable Cost Rules

- GitHub is only for source code and GitHub Pages static hosting, and must remain on the Free plan.
- Cloudflare is not used by smejj.com.
- Spaceship is used only for the already-owned smejj.com domain and free DNS.
- No GitHub Actions, Codespaces, paid storage, paid runners, paid packages, or paid add-ons are core architecture.
- No Cloudflare service of any kind is core architecture.
- IDrive e2 / S3-compatible storage is the primary store for files, media, model artifacts, backups, and central data.
- Any feature that becomes paid after a quota is not a core dependency.

## Practical Architecture

GitHub Pages Free hosts the public static PWA shell for smejj.com. It must not be treated as an unlimited backend for billions of users, because it has no dynamic compute and must not become the central data plane.

The scalable shape is:

- Static/PWA shell on GitHub Pages Free.
- Code repository on GitHub Free, without paid automation as a required path.
- DNS at Spaceship for the smejj.com domain.
- Large files and durable user/model data in IDrive e2.
- AI inference only through explicitly budget-approved worker compute.
- Client and control-server code designed to fail closed when storage, auth, or compute is unavailable.

## Current Deployment

- Domain: `smejj.com`
- DNS: Spaceship, pointing at GitHub Pages.
- Static hosting: GitHub Pages Free.
- Control server: Node service (`src/server.js` plus `control-server/`) for `/api/*`, operated separately from static hosting.
- IDrive e2: primary object brain for durable objects and deployment artifacts.

## Done Criteria For The Free Shell

- Public root domain resolves through GitHub Pages.
- Public shell is installable as a PWA.
- Control APIs fail closed when secrets, auth, IDrive e2, or approved worker compute are absent.
- IDrive e2 remains the primary storage path through signed S3-compatible requests.
- No Cloudflare feature is required.
- No GitHub paid feature is required.

## Billion-User Constraint

Billions of users per day are not safely achievable with GitHub Free as the backend core. The free-safe version must keep GitHub in source/static roles and move compute, models, files, backups, and central state to IDrive e2 object flows plus explicitly budget-approved worker compute.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const masterPolicy = fs.readFileSync("docs/architecture/FREE_ONLY_MASTER_POLICY.md", "utf8");
const readme = fs.readFileSync("README.md", "utf8");
const platform = fs.readFileSync("src/shared/platform.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const agents = fs.readFileSync("AGENTS.md", "utf8");
const noBigServer = fs.readFileSync("docs/architecture/NO_BIG_SERVER_KIMI_STRATEGY.md", "utf8");
const releaseProtection = fs.readFileSync("docs/architecture/RELEASE_PROTECTION.md", "utf8");
const connectionAudit = fs.readFileSync("docs/architecture/CONNECTION_AUDIT_2026-06-16.md", "utf8");
const freeArchitecture = fs.readFileSync("docs/FREE_ARCHITECTURE.md", "utf8");
const centralArchitecture = fs.readFileSync("docs/architecture/CENTRAL_ARCHITECTURE.md", "utf8");
const deploymentGuardrails = fs.readFileSync("docs/deployment/FREE_TIER_DEPLOYMENT_GUARDRAILS.md", "utf8");

test("master policy locks GitHub to permanent free-only roles and bans Cloudflare", () => {
  assert.match(masterPolicy, /GitHub\.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden/);
  assert.match(masterPolicy, /Cloudflare\.com wird nicht genutzt/);
  assert.match(masterPolicy, /GitHub Pages \(Free\) ist das einzige Hosting/);
  assert.match(masterPolicy, /Keine Trial-Angebote/);
  assert.match(masterPolicy, /Keine Auto-Billing-Fallbacks/);
  assert.match(masterPolicy, /Keine kostenpflichtigen Zusatzdienste als Kernbestandteil/);
  assert.match(masterPolicy, /IDrive e2 \/ S3-kompatibler Storage ist der Hauptspeicher/);
});

test("README points to the master policy and does not recommend paid core paths", () => {
  assert.match(readme, /FREE_ONLY_MASTER_POLICY\.md/);
  assert.match(readme, /GitHub\.com bleibt dauerhaft Free-only/);
  assert.match(readme, /Cloudflare\.com wird nicht genutzt/);
  assert.match(readme, /Keine kostenpflichtigen Zusatzdienste/);
  assert.doesNotMatch(readme, /Schnellster Start: offizielle Moonshot\/Kimi API/);
  assert.doesNotMatch(readme, /dedizierter GPU-Cluster/);
  assert.doesNotMatch(readme, /Produktion mit eigener Infrastruktur: `moonshotai\/Kimi-K2\.7-Code`/);
});

test("platform constants state the free-only storage policy", () => {
  assert.match(platform, /GitHub Free and GitHub Pages only for code and hosting; IDrive e2 is primary storage; Salad is pay-per-use compute/);
  assert.match(platform, /provider: "idrive-e2"/);
  assert.match(platform, /role: "primary"/);
});

test("package checks include architecture guardrails", () => {
  assert.match(pkg.scripts["check:architecture"], /free-only-master-policy\.test\.mjs/);
  assert.match(pkg.scripts["check:all"], /check:architecture/);
  assert.match(pkg.scripts["release:preflight"], /check:all/);
});

test("local agent rules load the free-only policy for future work", () => {
  assert.match(agents, /FREE_ONLY_MASTER_POLICY\.md/);
  assert.match(agents, /GitHub\.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden/);
  assert.match(agents, /Cloudflare\.com wird nicht genutzt/);
  assert.match(agents, /START_DESIGN_LOCK\.md/);
});

test("architecture docs do not reintroduce paid core recommendations", () => {
  const joined = [noBigServer, releaseProtection, connectionAudit].join("\n");
  assert.doesNotMatch(joined, /separately approved paid/i);
  assert.doesNotMatch(joined, /approved paid path/i);
  assert.doesNotMatch(joined, /paid inference providers/i);
  assert.doesNotMatch(joined, /BYOK provider accounts/i);
  assert.doesNotMatch(joined, /separately approved cost-controlled infrastructure/i);
  assert.match(joined, /fail closed|fail-closed/i);
});

test("active architecture docs keep Cloudflare exited", () => {
  const activeDocs = [
    freeArchitecture,
    centralArchitecture,
    releaseProtection,
    deploymentGuardrails
  ].join("\n");

  assert.match(activeDocs, /Cloudflare is not used|Cloudflare\.com wird nicht genutzt/);
  assert.match(activeDocs, /GitHub Pages/);
  assert.match(activeDocs, /Spaceship/);
  assert.doesNotMatch(activeDocs, /Cloudflare Free: DNS|Cloudflare Free can host|Cloudflare is only for DNS/);
  assert.doesNotMatch(activeDocs, /Cloudflare deployment version|Cloudflare rollback|Cloudflare dry-run deployment/);
  assert.doesNotMatch(activeDocs, /src\/worker\.js/);
  assert.doesNotMatch(activeDocs, /wrangler\.jsonc/);
});

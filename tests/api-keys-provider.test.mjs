// smejj.com — Multi-Anbieter-API-Keys: Katalog, SSRF-Schutz, Frontend-Sicherheit.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PROVIDER_CATALOG, catalogProvider, selectableProviders } from "../public/ai/providers-catalog.js";
import { assertSafeProviderBaseUrl, resolveProviderBaseUrl, isCatalogProvider } from "../control-server/src/providers/genericProviderCatalog.js";
import { normalizeApiKey, isModelId } from "../control-server/src/providers/genericOpenAiClient.js";

const surface = fs.readFileSync("public/api-center-surface.js", "utf8");
const routes = fs.readFileSync("control-server/src/routes/apiKeysRoutes.js", "utf8");

test("Katalog: neuer Anbieter = ein Eintrag, mit Key- und Billing-Link", () => {
  const ids = PROVIDER_CATALOG.map((p) => p.id);
  for (const required of ["openai", "anthropic", "openrouter", "google", "mistral", "deepseek", "cline"]) {
    assert.ok(ids.includes(required), `fehlender Anbieter ${required}`);
  }
  for (const entry of PROVIDER_CATALOG) {
    assert.match(entry.baseUrl, /^https:\/\//, `${entry.id} baseUrl`);
    assert.ok(entry.keyUrl.startsWith("https://"), `${entry.id} keyUrl`);
  }
  assert.equal(catalogProvider("openai").name, "OpenAI");
  assert.ok(!selectableProviders().some((p) => p.id === "cline"), "Cline hat eigenen Fluss");
});

test("SSRF-Schutz: nur https, keine privaten Hosts, Allowlist fuer bekannte Anbieter", () => {
  assert.throws(() => assertSafeProviderBaseUrl("http://api.openai.com/v1"), /provider_https_required/);
  assert.throws(() => assertSafeProviderBaseUrl("https://evil.example.com/v1"), /provider_endpoint_not_allowlisted/);
  assert.throws(() => assertSafeProviderBaseUrl("https://127.0.0.1/v1", { allowCustom: true }), /provider_private_host_not_allowed/);
  assert.throws(() => assertSafeProviderBaseUrl("https://user:pass@api.openai.com/v1"), /provider_url_credentials_not_allowed/);
  assert.equal(assertSafeProviderBaseUrl("https://api.openai.com/v1"), "https://api.openai.com/v1");
  assert.equal(assertSafeProviderBaseUrl("https://api.example.com/v1", { allowCustom: true }), "https://api.example.com/v1");
});

test("resolveProviderBaseUrl: Katalog gewinnt, eigener Anbieter nutzt gepruefte URL", () => {
  assert.equal(resolveProviderBaseUrl("mistral"), "https://api.mistral.ai/v1");
  assert.equal(resolveProviderBaseUrl("custom-x-abc", "https://api.example.com/v1"), "https://api.example.com/v1");
  assert.ok(isCatalogProvider("openai"));
  assert.ok(!isCatalogProvider("custom-x-abc"));
});

test("Key-Normalisierung und Modell-ID-Validierung sind fail-closed", () => {
  assert.throws(() => normalizeApiKey("short"), /provider_api_key_invalid/);
  assert.throws(() => normalizeApiKey("has space in it xxxx"), /provider_api_key_invalid/);
  assert.equal(normalizeApiKey("sk-abcdef1234567890"), "sk-abcdef1234567890");
  assert.ok(isModelId("gpt-4o-mini"));
  assert.ok(!isModelId("bad id with spaces"));
});

test("Frontend speichert oder rendert niemals den Klartext-Key dauerhaft", () => {
  assert.match(surface, /type="password"/);
  assert.match(surface, /autocomplete="new-password"/);
  assert.doesNotMatch(surface, /localStorage\.setItem\([^\n]*apiKey/i);
  assert.doesNotMatch(surface, /sessionStorage\.setItem\([^\n]*apiKey/i);
  // Key-Feld wird nach dem Anlegen geleert; Vollanzeige nur einmal mit Hinweis.
  assert.match(surface, /\[data-ac-key\]"\)\.value = ""/);
  assert.match(surface, /wird danach nicht mehr angezeigt/);
  // In der Liste nur maskiert (keyHint), Klartext nie aus dem Server zurueck.
  assert.match(surface, /keyHint/);
});

test("Backend testet vor dem Speichern und bleibt fail-closed ohne Encryption", () => {
  assert.match(routes, /testProviderConnection/);
  assert.match(routes, /providerCredentialEncryptionConfig/);
  assert.match(routes, /provider_credential_encryption_not_configured/);
  assert.match(routes, /putProviderCredential/);
  // Cline-Routen werden nicht beruehrt (eigener Prefix).
  assert.match(routes, /const PREFIX = "\/api\/keys"/);
});

export const PROVIDER_REGISTRY = Object.freeze({
  cline: Object.freeze({
    id: "cline",
    name: "Cline",
    baseUrl: "https://api.cline.bot/api/v1",
    catalogUrl: "https://api.cline.bot/api/v1/ai/cline/recommended-models",
    protocol: "openai-chat-completions",
    authentication: "bearer",
    capabilities: Object.freeze(["streaming", "tools", "reasoning", "images", "autonomous-coding"]),
    userOwnedBilling: true,
    paidFallback: false
  })
});

export function getProviderDefinition(providerId) {
  return PROVIDER_REGISTRY[String(providerId || "").trim().toLowerCase()] || null;
}

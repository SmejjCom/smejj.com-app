export const APP_INFO = {
  name: "smejj.com Code",
  shortName: "smejj",
  origin: "https://smejj.com",
  description: "Free-safe KI- und Code-Assistent-Plattform mit IDrive e2 als Hauptspeicher."
};

export const COST_POLICY = "GitHub Free and Cloudflare Free only; IDrive e2 is primary storage.";

export const STORAGE = {
  provider: "idrive-e2",
  role: "primary",
  defaultModelPrefix: "model-files/kimi-k2-7"
};

export const ROUTES = {
  root: "/",
  manifest: "/manifest.webmanifest",
  serviceWorker: "/sw.js",
  robots: "/robots.txt",
  llms: "/llms.txt",
  sitemap: "/sitemap.xml",
  api: {
    health: "/api/health",
    capabilities: "/api/capabilities",
    chat: "/api/chat",
    agent: "/api/agent",
    gitStatus: "/api/git/status",
    gitCommit: "/api/git/commit",
    fileRead: "/api/files/read",
    fileWrite: "/api/files/write",
    terminalRun: "/api/terminal/run",
    storageStatus: "/api/storage/status"
  }
};

export const CAPABILITIES = {
  startPage: "ready",
  chat: "ready",
  codeAssistant: "ready",
  codeEditor: "client-ready",
  agents: "ready",
  localFiles: "local-only",
  uploads: "client-staged",
  modelFiles: "idrive-metadata-ready",
  idriveStorage: "ready",
  memory: "client-local",
  rag: "client-local",
  tools: "free-safe",
  browserSearchApi: "not-core-without-free-safe-provider",
  auth: "client-local-placeholder",
  profiles: "client-local",
  settings: "client-local",
  i18n: "client-local",
  database: "idrive-object-storage-planned",
  cache: "pwa-ready",
  errorPages: "client-ready",
  webPwa: "ready",
  iphoneAndroid: "pwa-ready"
};

export const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self'",
    "script-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join("; "),
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()"
};

export const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

export function responseHeaders(contentType) {
  return {
    ...SECURITY_HEADERS,
    "Content-Type": contentType
  };
}

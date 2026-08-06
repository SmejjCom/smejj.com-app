export const APP_INFO = {
  name: "smejj.com Code",
  shortName: "smejj",
  origin: "https://smejj.com",
  description: "Free-safe KI- und Code-Assistent-Plattform mit IDrive e2 als Hauptspeicher."
};

export const COST_POLICY = "GitHub Free and GitHub Pages only for code and hosting; IDrive e2 is primary storage; Salad is pay-per-use compute.";

export const STORAGE = {
  provider: "idrive-e2",
  role: "primary",
  defaultModelPrefix: "model-files/glm-5-2-fp8"
};

export const KIMI_K2_7_STATUS = {
  id: "kimi-k2-7",
  name: "Kimi K2.7",
  source: "moonshotai/Kimi-K2.7-Code",
  storage: {
    provider: "idrive-e2",
    prefix: "model-files/kimi-k2-7/original/"
  },
  verification: {
    status: "verified-complete",
    lastVerifiedAt: "2026-07-10T01:42:00.000Z",
    sourceFileCount: 86,
    originalFileCount: 86,
    idriveObjectCount: 102,
    safetensorsCount: 64,
    safetensorsWithMatchingSha256: 64,
    reportedBytes: 595_204_984_507,
    reportedGiB: 554.3,
    smallFilesContentChecked: 22,
    supportFilesChecked: 9,
    failures: []
  },
  capabilities: {
    contextTokens: 262_144,
    role: "agentic-coding-and-long-horizon-software-engineering"
  },
  files: {
    weights: ".safetensors",
    config: "present",
    tokenizer: "present",
    readme: "present",
    license: "present",
    thirdPartyNotices: "present",
    checksums: "present",
    manifest: "present",
    metadata: "present"
  },
  inference: {
    default: "disabled",
    freeDefault: false,
    allowedModes: ["byok", "partner-compute-later", "self-host-later"],
    notAllowedAsDefault: ["cloudflare-paid", "github-paid", "workers-ai-paid", "browser-free-full-model", "trial-api"]
  },
  security: {
    publicModelFiles: false,
    secretsInBrowser: false,
    githubPaidAllowed: false,
    paidHostingAllowed: false
  }
};

export const GLM_5_2_FP8_STATUS = {
  id: "glm-5-2-fp8",
  name: "GLM-5.2",
  source: "zai-org/GLM-5.2-FP8",
  storage: {
    provider: "idrive-e2",
    prefix: "model-files/glm-5-2-fp8/original/"
  },
  sourceArchive: {
    status: "verified-metadata-archived",
    lastVerifiedAt: "2026-06-22T00:00:00.000Z",
    prefix: "model-files/glm-5-2-fp8/",
    archivedObjects: [
      "checksums/upstream-file-inventory.json",
      "configs/huggingface-api-metadata.json",
      "configs/source-summary.json",
      "notes/LICENSE",
      "notes/README.md",
      "notes/TRANSFER_STATUS.txt"
    ]
  },
  verification: {
    status: "verified-complete",
    lastVerifiedAt: "2026-06-24T00:19:44Z",
    sourceFileCount: 149,
    originalFileCount: 149,
    idriveObjectCount: 157,
    safetensorsCount: 141,
    reportedGiB: 703.8,
    failures: []
  },
  capabilities: {
    contextTokens: 1000000,
    role: "flagship-coding-and-planning-brain"
  },
  files: {
    weights: "present",
    config: "present",
    tokenizer: "present",
    readme: "present",
    license: "present",
    checksums: "upstream-inventory-present",
    metadata: "present"
  },
  inference: {
    default: "disabled",
    freeDefault: false,
    allowedModes: ["byok", "partner-compute-later", "self-host-later"],
    notAllowedAsDefault: ["cloudflare-paid", "github-paid", "workers-ai-paid", "browser-free-full-model", "trial-api"]
  },
  security: {
    publicModelFiles: false,
    secretsInBrowser: false,
    githubPaidAllowed: false,
    paidHostingAllowed: false
  }
};

export const MODEL_STATUSES = Object.freeze({
  [KIMI_K2_7_STATUS.id]: KIMI_K2_7_STATUS,
  [GLM_5_2_FP8_STATUS.id]: GLM_5_2_FP8_STATUS
});

export const ROUTES = {
  root: "/",
  favicon: "/favicon.ico",
  appleTouchIcon: "/apple-touch-icon.png",
  socialImage: "/og-image.png",
  manifest: "/manifest.webmanifest",
  serviceWorker: "/sw.js",
  robots: "/robots.txt",
  llms: "/llms.txt",
  sitemap: "/sitemap.xml",
  status: "/status.html",
  verlauf: "/verlauf.html",
  verlaufMesswerte: "/verlauf-messwerte.json",
  hilfe: "/hilfe.html",
  impressum: "/impressum.html",
  datenschutz: "/datenschutz.html",
  // Englische Hoeflichkeitsfassungen (verbindlich bleibt der deutsche Text).
  legalNoticeEn: "/en/legal-notice.html",
  privacyEn: "/en/privacy.html",
  api: {
    health: "/api/health",
    capabilities: "/api/capabilities",
    chat: "/api/chat",
    ragSearch: "/api/rag/search",
    webSearch: "/api/search/web",
    authConfig: "/api/auth/config",
    authGoogle: "/api/auth/google",
    authGithub: "/api/auth/github",
    authGithubCallback: "/api/auth/github/callback",
    authMagicLinkRequest: "/api/auth/magic-link/request",
    authMagicLinkVerify: "/api/auth/magic-link/verify",
    authMe: "/api/auth/me",
    billingStatus: "/api/billing/status",
    billingStripeWebhook: "/api/billing/stripe/webhook",
    authLogout: "/api/auth/logout",
    authSessionToken: "/api/auth/session-token",
    authSessionHandoff: "/api/auth/session-handoff",
    authSessionHandoffStart: "/api/auth/session-handoff/start",
    authSessionHandoffComplete: "/api/auth/session-handoff/complete",
    passkeyRegisterOptions: "/api/auth/passkey/register/options",
    passkeyRegisterVerify: "/api/auth/passkey/register/verify",
    passkeyLoginOptions: "/api/auth/passkey/login/options",
    passkeyLoginVerify: "/api/auth/passkey/login/verify",
    agent: "/api/agent",
    gitStatus: "/api/git/status",
    gitCommit: "/api/git/commit",
    fileRead: "/api/files/read",
    fileWrite: "/api/files/write",
    terminalRun: "/api/terminal/run",
    storagePresign: "/api/storage/presign",
    storageStatus: "/api/storage/status",
    trainingConsent: "/api/training/consent",
    trainingConsentDecision: "/api/training/consent/decision",
    trainingConsentRevoke: "/api/training/consent/revoke",
    // Oeffentlich und ohne Anmeldung: die Oberflaeche kann sonst gar keine
    // Einwilligung absenden. Der Grant-Endpunkt vergleicht den vom Klienten
    // gesendeten Hash gegen die Umgebung und antwortet sonst 409 — ohne einen
    // Weg, den geltenden Hash zu erfahren, ist die Einwilligung unerreichbar.
    trainingConsentNotice: "/api/training/consent/notice",
    // Die Erfassung liegt bewusst NICHT unter /api/training/consent: dort faengt
    // ein startsWith() alles ab, und die Erfassung hat andere Regeln als die
    // Einwilligung (eigener Schalter, eigener Speicher, eigene Fehlerbilder).
    trainingCapture: "/api/training/capture",
    modelStatus: "/api/models/kimi-k2-7/status",
    glmModelStatus: "/api/models/glm-5-2-fp8/status",
    modelsStatus: "/api/models/status",
    workerPreflight: "/api/workers/preflight",
    browserFetch: "/api/browser/fetch",
    browserRemote: "/api/browser/remote",
    browserSession: "/api/browser/session",
    browserSessionAct: "/api/browser/session/act",
    browserSessionClose: "/api/browser/session/close",
    mausRun: "/api/maus/run",
    jobs: "/api/jobs",
    jobQueue: "/api/jobs/queue",
    freeExecutor: "/api/free-executor",
    workerValidate: "/api/workers/validate",
    workerModelAction: "/api/workers/model-action",
    saladPlan: "/api/workers/salad/plan",
    saladStatus: "/api/workers/salad/status",
    saladGpuClasses: "/api/workers/salad/gpu-classes",
    saladCreate: "/api/workers/salad/create",
    saladStart: "/api/workers/salad/start",
    saladStop: "/api/workers/salad/stop"
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
  modelFiles: "idrive-verified-vault-ready",
  modelRouter: "multi-model-registry-glm-5-2-primary-kimi-k2-7-optional",
  taskCapsules: "glm-idrive-write-plan-ready",
  freeExecutor: "static-mini-app-artifact-ready",
  workerPreflight: "salad-fail-closed-ready",
  idriveStorage: "ready",
  memory: "client-local",
  rag: "client-local",
  tools: "free-safe",
  browserSearchApi: "not-core-without-free-safe-provider",
  remoteBrowser: "salad-worker-ready-fail-closed",
  auth: "google-ready",
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
    // Die drei Betriebsdienste stehen hier, weil /status.html sie direkt aus
    // dem Browser abfragt. Ohne sie blockiert der eigene Server die Abfrage
    // und die Statusseite meldet falschen Alarm — live faellt das nicht auf,
    // weil GitHub Pages keine CSP-Kopfzeile setzt. Dieselben Hosts stehen in
    // der Meta-CSP von status.html; tests/statusseite.test.mjs erzwingt das.
    "connect-src 'self' https://accounts.google.com https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud https://smejj-chat-bridge.zeabur.app https://loganberry-fruit-e3n6k5n10h68cawn.salad.cloud",
    "frame-src https://accounts.google.com",
    "img-src 'self' data:",
    "style-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
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
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
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

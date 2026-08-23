import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_INFO, CAPABILITIES, COST_POLICY, ROUTES, SECURITY_HEADERS, STORAGE } from "./shared/platform.js";
import { SECURITY_LIMITS } from "./shared/securityPolicy.js";
import { createWerkstatt } from "./routes/werkstattRoutes.js";
import { json, readJson, fehlerAntwort, zuGrossFehler } from "../control-server/src/http/respond.js";
import { parseS3Keys, signedS3List } from "../control-server/src/storage/s3Signer.js";
import {
  handleApproveJob,
  handleAutonomousRun,
  handleCancelJob,
  handleCreateJob,
  handleFreeExecutor,
  handleJobEvents,
  handleJobQueue,
  handleJobStatus,
  handleListJobs,
  handleWorkerStatusUpdate
} from "../control-server/src/routes/jobRoutes.js";
import { handleSaladCreate, handleSaladGpuClasses, handleSaladPlan, handleSaladStart, handleSaladStatus, handleSaladStop } from "../control-server/src/routes/saladRoutes.js";
import { recoverWorkerRuntimeOnStartup } from "../control-server/src/orchestrator/startupRecovery.js";
import { handleStoragePresign } from "../control-server/src/routes/storagePresignRoutes.js";
import { handleBrowserFetch } from "../control-server/src/routes/browserProxyRoutes.js";
import { handleBrowserRemote, handleBrowserRemoteHealth } from "../control-server/src/routes/browserRemoteRoutes.js";
import { handleBrowserSession } from "../control-server/src/routes/browserSessionRoutes.js";
import { handleMausRun, handleMausStatus, istMausEngineToken } from "../control-server/src/routes/mausEngineRoutes.js";
import { handlePasskeyLoginOptions, handlePasskeyLoginVerify, handlePasskeyRegisterOptions, handlePasskeyRegisterVerify } from "../control-server/src/routes/passkeyRoutes.js";
import { handleVoiceRoute } from "../control-server/src/routes/voiceWorkerRoutes.js";
import { handleModelStatus, handleModelsStatus, handleWorkerPreflight } from "../control-server/src/routes/modelRoutes.js";
import { handleWorkerModelAction, handleWorkerValidate } from "../control-server/src/routes/workerModelRoutes.js";
import { refreshModelRuntimeHealth } from "../control-server/src/llm/modelRuntimeHealth.js";
import { buildRagContextBlock, searchKnowledge } from "../control-server/src/rag/agentContext.js";
import { keyProviderUsage, shouldSearchWeb } from "./search/webSearch.js";
import { buildAgentWebContext, handleWebSearch } from "./search/webSearchRoute.js";
import { answerLiveIntent, detectLiveInternetIntent } from "../control-server/src/live/liveInternet.js";
import { classifyProfile, executeWithFallback, resolveModelRequest } from "../control-server/src/llm/modelRouter.js";
import { evaluateAiAvailability, resolveServerAiGate } from "../control-server/src/llm/aiAvailability.js";
import { streamWithTools, withAgentTools, agentToolsEnabled } from "../control-server/src/llm/streamFilter.js";
import { localAssistantStream } from "../control-server/src/llm/localAssistant.js";
import { chatThinkingMode, denkBremse, latestUserPrompt } from "./ai/chatThinkingPolicy.js";
import { chatReasoningEffort } from "./ai/reasoningEffortPolicy.js";
import { allowedOriginsFromEnv, corsHeadersFor, handlePreflight } from "../control-server/src/http/cors.js";
import { installCrashGuard } from "../control-server/src/http/crashGuard.js";
import { createStaticHandlers } from "./http/staticServing.js";
import { loadSecureLocalEnv, normalizeSecret } from "./shared/env.js";
import { isSafeMutatingControlRequest, requiresAuthenticatedControlAccess } from "./shared/controlAccessPolicy.js";
import { createPublicModelRateGate } from "./shared/modelRatePolicy.js";
import { bearerSessionToken, issueSessionToken, issueAccessToken, verifySessionToken } from "../control-server/src/auth/sessionToken.js";
import { createSessionHandoffStore, isSessionHandoffId } from "../control-server/src/auth/sessionHandoff.js";
import { handleTrainingCaptureRoute } from "../control-server/src/routes/trainingCaptureRoutes.js";
import { handleTrainingConsentRoute } from "../control-server/src/routes/trainingConsentRoutes.js";
import { signGoogleAuthState, verifyGoogleAuthState, leseGoogleAuthState, verifyGoogleIdToken } from "./auth/googleAuth.js";
import { createGoogleAuthHandlers } from "./auth/googleAuthRoutes.js";
import { createAnmeldeProtokoll } from "../control-server/src/auth/anmeldeProtokoll.js";
import { createExtraAuthRouter } from "./auth/extraAuthRoutes.js";
import { mailerConfig } from "../control-server/src/auth/mailer.js";
import { emailSessionStillValid, handleEmailAuthRoutes, revokeCurrentEmailSession } from "../control-server/src/routes/emailAuthRoutes.js";
import { sessionRegistryEnabled, newSessionId, registerSession, isSessionActive, revokeSession } from "../control-server/src/auth/sessionRegistry.js";
import { handleProviderRoute } from "../control-server/src/routes/providerRoutes.js";
import { handleApiKeysRoute } from "../control-server/src/routes/apiKeysRoutes.js";
import { handlePublicApiRoute } from "../control-server/src/publicapi/publicApiRoutes.js";
import { handleDeveloperKeyRoute } from "../control-server/src/routes/developerKeyRoutes.js";
import { handleAdminSurface } from "../control-server/src/routes/adminSurfaceRoutes.js";
import { handleAutopilotHeartbeat } from "../control-server/src/routes/autopilotRoutes.js";
import { handleSupportRoute } from "../control-server/src/routes/supportRoutes.js";
import { handleFeedbackRoute } from "../control-server/src/routes/feedbackRoutes.js";
import { starteAutopiloten } from "../control-server/src/autopilots/start.js";
import { handleAgentRoute } from "../control-server/src/routes/agentRoutes.js";
import { createChatSyncRoutes } from "../control-server/src/routes/chatSyncRoutes.js";
// Medien des Verlaufs liegen NEBEN dem Chat, nicht in ihm (Befund 2026-08-14:
// Bilder sprengten MAX_CHAT_BYTES, Videos wurden als toter blob: gespeichert).
import { createChatMedienRoutes } from "../control-server/src/routes/chatMedienRoutes.js";
import { createProjektSyncRoutes } from "../control-server/src/routes/projektSyncRoutes.js";
import { buildChatMessages } from "./agent/conversationHistory.js";
import { leseUndKuerze } from "./agent/dateiKontext.js";
import { baueCacheLage, befrageCache, darfAusliefern, liefereAusCache, merkeFuerSpaeter } from "./agent/cacheSpur.js";
import { baueSystemregeln } from "./agent/systemregeln.js";
import { holeLiveKontext } from "./agent/liveKontext.js";

installCrashGuard(); // kein stiller Tod: unbehandelte Fehler -> Log mit Stack + Exit 1 (Probes uebernehmen)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const storageSourceDir = path.resolve(__dirname, "storage");
const aiSourceDir = path.resolve(__dirname, "ai");
const sharedSourceDir = path.resolve(__dirname, "shared");
const { isAppRoute, isPublicAsset, serveAiModule, serveFile, serveSharedModule, serveStorageModule } = createStaticHandlers({
  publicDir,
  storageSourceDir,
  aiSourceDir,
  sharedSourceDir
});

loadSecureLocalEnv();

const config = {
  port: Number(process.env.PORT || 3000),
  projectRoot: path.resolve(process.env.PROJECT_ROOT || process.cwd()),
  baseUrl: (process.env.SMEJJ_LLM_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || process.env.BRIRT_LLM_BASE_URL || "").replace(/\/$/, ""),
  apiKey: process.env.SMEJJ_LLM_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY || process.env.BRIRT_LLM_API_KEY || "",
  model: process.env.SMEJJ_LLM_MODEL || process.env.OPENAI_COMPATIBLE_MODEL || process.env.OPENAI_MODEL || process.env.BRIRT_LLM_MODEL || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  // Leere Allowlist = offenes Portal: jeder verifizierte Google-Account darf sich
  // anmelden. Eine explizit gesetzte GOOGLE_ALLOWED_EMAIL beschraenkt wieder.
  googleAllowedEmail: (process.env.GOOGLE_ALLOWED_EMAIL || "").toLowerCase(),
  // GitHub-Login: eigene OAuth-App, getrennt vom Repo-Publisher (SMEJJ_GITHUB_APP_*).
  // Fail-closed: ohne Client-ID/Secret liefert die Route 503, kein stiller Fallback.
  githubLoginClientId: process.env.SMEJJ_GITHUB_LOGIN_CLIENT_ID || "",
  githubLoginClientSecret: process.env.SMEJJ_GITHUB_LOGIN_CLIENT_SECRET || "",
  githubLoginAllowedEmail: (process.env.SMEJJ_GITHUB_LOGIN_ALLOWED_EMAIL || "").toLowerCase(),
  sessionSecret: normalizeSecret(process.env.SMEJJ_SESSION_SECRET || process.env.GOOGLE_SESSION_SECRET || "")
};

// H1-Haertung: schaltet kurzlebiges Cross-Origin-Access-Token + cross-site-
// faehiges Cookie ein. Standardmaessig AUS -> keine Verhaltensaenderung, bis
// der Betreiber das Flag setzt. SameSite=None verlangt Secure (ist gesetzt) und
// Partitioned (CHIPS), sonst blocken Drittanbieter-Cookie-Filter die Recovery.
const SHORT_ACCESS_TOKEN = ["1", "true", "yes"].includes(String(process.env.SMEJJ_SHORT_ACCESS_TOKEN || "").toLowerCase());
const SESSION_COOKIE_SAMESITE = SHORT_ACCESS_TOKEN ? "None; Partitioned" : "Lax";

const forbiddenSegments = new Set([".env", ".git", "node_modules", "dist", "build"]);
// Lesen, Schreiben, Terminal, Git — die einzige Gruppe, die ans Dateisystem
// geht. Steht seit 2026-08-08 in src/routes/werkstattRoutes.js (800-Zeilen-Regel).
// safeResolve/readLimited kommen mit heraus: der Agent-Weg unten liest damit
// ebenfalls Dateien und muss durch DIESELBE Sandbox.
const {
  handleRead, handleWrite, handleTerminal, handleGitStatus, handleGitCommit, safeResolve, readLimited
} = createWerkstatt({ projectRoot: config.projectRoot, forbiddenSegments });
const publicModelRateGate = createPublicModelRateGate(process.env);
const sessionHandoffStore = createSessionHandoffStore();
const chatSyncRoutes = createChatSyncRoutes({ env: process.env, readSession, json, readJson });
const chatMedienRoutes = createChatMedienRoutes({ env: process.env, readSession, json, readJson });
const projektSyncRoutes = createProjektSyncRoutes({ env: process.env, readSession, json, readJson });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (await handlePublicApiRoute(req, url, res)) return; // /v1: Bearer statt Sitzung, muss VOR allem stehen (Grund dort)
    if (url.pathname.startsWith("/api/")) {
      if (handlePreflight(req, res)) return; // OPTIONS-Preflight (204 erlaubt / 403 fremd)
      const cors = corsHeadersFor(req.headers.origin);
      if (cors) for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
    }
    if (!isSafeMutatingControlRequest(req, url)) return json(res, 403, { error: "Origin not allowed" });
    // Einzige Ausnahme vom Sitzungszwang: die Maus-Engine fragt den
    // Planer-Proxy mit ihrem Token statt mit einer Sitzung. Begruendung und
    // Grenzen stehen bei istMausEngineToken; der Waechter dahinter laesst einer
    // Token-Anfrage NUR den Proxy (alles andere fail-closed 403).
    const mausPlanerProxy = req.method === "POST"
      && url.pathname === ROUTES.api.mausRun
      && istMausEngineToken(req, process.env);
    if (!mausPlanerProxy && requiresAuthenticatedControlAccess(req, url)) {
      res.setHeader("Cache-Control", "private, no-store");
      const authenticatedUser = readSession(req);
      if (!authenticatedUser) return json(res, 401, { ok: false, error: "authentication_required" });
      if (!(await sessionStillValid(authenticatedUser, process.env))) {
        return json(res, 401, { ok: false, error: "session_revoked_or_expired" });
      }
      req.authUser = authenticatedUser;
    }
    const readMethod = req.method === "GET" || req.method === "HEAD";
    if (readMethod && url.pathname === ROUTES.root) return serveFile(res, "index.html");
    if (readMethod && (url.pathname === "/auth/login" || url.pathname === "/auth/login/")) return serveFile(res, "auth/login/index.html");
    if (readMethod && (url.pathname === "/auth/register" || url.pathname === "/auth/register/")) return serveFile(res, "auth/register/index.html");
    if (readMethod && url.pathname.startsWith("/assets/storage/")) return serveStorageModule(res, url.pathname.replace("/assets/storage/", ""));
    if (readMethod && url.pathname.startsWith("/assets/ai/")) return serveAiModule(res, url.pathname.replace("/assets/ai/", ""));
    if (readMethod && url.pathname.startsWith("/assets/shared/")) return serveSharedModule(res, url.pathname.replace("/assets/shared/", ""));
    if (readMethod && url.pathname.startsWith("/assets/")) return serveFile(res, url.pathname.replace("/assets/", ""));
    if (readMethod && isPublicAsset(url.pathname)) return serveFile(res, url.pathname.slice(1));
    if (readMethod && url.pathname === "/impressum") return serveFile(res, "impressum.html");
    if (readMethod && url.pathname === "/datenschutz") return serveFile(res, "datenschutz.html");
    if (readMethod && url.pathname === ROUTES.api.health) return handleHealth(res);
    if (readMethod && url.pathname === ROUTES.api.capabilities) return handleCapabilities(res);
    if (readMethod && url.pathname === ROUTES.api.authConfig) return handleAuthConfig(res);
    if (readMethod && url.pathname === ROUTES.api.authMe) return handleAuthMe(req, res);
    if (readMethod && url.pathname === ROUTES.api.authSessionToken) return handleAuthSessionToken(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.authSessionHandoffStart) return await handleSessionHandoffStart(req, res);
    if (["GET", "POST"].includes(req.method) && url.pathname === ROUTES.api.authSessionHandoffComplete) return await handleSessionHandoffComplete(req, url, res);
    if (readMethod && url.pathname.startsWith(`${ROUTES.api.authSessionHandoff}/`)) return handleSessionHandoffPoll(req, url, res);
    if (readMethod && url.pathname === ROUTES.api.authGoogle) {
      try {
        return await handleGoogleAuthStart(req, res, url);
      } catch (error) {
        return json(res, 400, { error: error.message || "Google Login konnte nicht gestartet werden." });
      }
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.authGoogle) {
      try {
        return await handleGoogleAuth(req, res);
      } catch (error) {
        return json(res, 400, { error: error.message || "Google Login fehlgeschlagen." });
      }
    }
    if (url.pathname.startsWith("/api/auth/github") || url.pathname.startsWith("/api/auth/magic-link") || url.pathname.startsWith("/api/billing/")) {
      if (await routeExtraAuth(req, res, url)) return;
    }
    // Verlauf-Sync (Stufe 3): eigene Routen-Datei, damit dieser Verteiler
    // schlank bleibt. Abgeschaltet, solange SMEJJ_CHAT_SYNC_ENABLED fehlt.
    if (url.pathname === "/api/chats" && await chatSyncRoutes.handle(req, res, url)) return;
    if (url.pathname === "/api/chat-medien" && await chatMedienRoutes.handle(req, res, url)) return;
    // Projekte-Sync (2026-08-13): benannte Sammlungen fuer Chats, gleiches Flag.
    if (url.pathname === "/api/projekte" && await projektSyncRoutes.handle(req, res, url)) return;
    if (req.method === "POST" && url.pathname === ROUTES.api.authLogout) return await handleAuthLogout(req, res);
    if (url.pathname.startsWith("/api/auth/")) {
      const handled = await handleEmailAuthRoutes(req, url, res, emailAuthContext(url));
      if (handled) return;
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.passkeyRegisterOptions) return await handlePasskeyRegisterOptions(req, res, { env: process.env });
    if (req.method === "POST" && url.pathname === ROUTES.api.passkeyRegisterVerify) return await handlePasskeyRegisterVerify(req, res, { env: process.env, makeSessionCookie: serializeSessionCookie, makeAccessToken: serializeAccessToken });
    if (req.method === "POST" && url.pathname === ROUTES.api.passkeyLoginOptions) return await handlePasskeyLoginOptions(req, res, { env: process.env });
    if (req.method === "POST" && url.pathname === ROUTES.api.passkeyLoginVerify) return await handlePasskeyLoginVerify(req, res, { env: process.env, makeSessionCookie: serializeSessionCookie, makeAccessToken: serializeAccessToken });
    // Agent API — fail-closed hinter SMEJJ_AGENT_API_ENABLED (aus => Provider-Pfad bleibt zustaendig).
    if (url.pathname.startsWith("/api/agent/")) {
      if (await handleAgentRoute(req, url, res)) return;
    }
    if (url.pathname.startsWith("/api/providers/")) return await handleProviderRoute(req, url, res);
    if (url.pathname === "/api/keys" || url.pathname.startsWith("/api/keys/")) return await handleApiKeysRoute(req, url, res);
    if (await handleDeveloperKeyRoute(req, url, res)) return; // eigene Schluessel: Gegenrichtung zu /api/keys
    // Sprachserver (Wecken/Idle-Stopp/Audio-Proxy, Token-gepflichtig) — voiceWorkerRoutes.js.
    if (await handleVoiceRoute(req, url, res)) return;
    // Herzschlag der Autopiloten (Maschinen-Absender, eigener Schluessel je Automatik) — autopilotRoutes.js.
    if (await handleAutopilotHeartbeat(req, url, res)) return;
    // Kundensupport Stufe 1: Ticket + KI-Sofortantwort (angemeldete Nutzer) — supportRoutes.js.
    if (await handleSupportRoute(req, url, res)) return;
    // Daten-Schwungrad Stufe 1: Daumen-Signale der Nutzer — feedbackRoutes.js.
    if (await handleFeedbackRoute(req, url, res)) return;
    // Adminbereich, Transparenzbericht, Einwilligung — Zustaendigkeit: adminSurfaceRoutes.js.
    if (await handleAdminSurface(req, url, res, { readSession, sessionStillValid })) return;
    // Adminbereich Stufe 1 (nur lesend): ohne frische Adminrolle aus dem Store => 403.
    if (readMethod && url.pathname === ROUTES.api.ragSearch) return await handleRagSearch(url, res);
    if (readMethod && url.pathname === ROUTES.api.webSearch) return await handleWebSearch(req, url, res);
    if (readMethod && url.pathname === ROUTES.api.browserFetch) return await handleBrowserFetch(url, res, { req });
    if (readMethod && url.pathname === `${ROUTES.api.browserRemote}/health`) return await handleBrowserRemoteHealth(res);
    if (readMethod && url.pathname === ROUTES.api.browserRemote) return await handleBrowserRemote(url, res, { req });
    if (req.method === "POST" && url.pathname === ROUTES.api.browserSession) return await handleBrowserSession("open", req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.browserSessionAct) return await handleBrowserSession("act", req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.browserSessionClose) return await handleBrowserSession("close", req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.mausRun) return await handleMausRun(req, res);
    if (readMethod && url.pathname === ROUTES.api.mausRun) return handleMausStatus(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.chat) {
      if (!allowPublicModelRequest(req, res)) return;
      return await handleChat(req, res);
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.agent) {
      if (!allowPublicModelRequest(req, res)) return;
      return await handleAgent(req, res);
    }
    if (req.method === "POST" && url.pathname === ROUTES.api.fileRead) return await handleRead(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.fileWrite) return await handleWrite(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.terminalRun) return await handleTerminal(req, res);
    if (readMethod && url.pathname === ROUTES.api.gitStatus) return handleGitStatus(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.gitCommit) return await handleGitCommit(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.storagePresign) return await handleStoragePresign(req, res);
    if (readMethod && url.pathname === ROUTES.api.storageStatus) return await handleStorageStatus(res);
    if (url.pathname.startsWith(ROUTES.api.trainingConsent)) return await handleTrainingConsentRoute(req, url, res);
    if (url.pathname === ROUTES.api.trainingCapture) return await handleTrainingCaptureRoute(req, url, res);
    if (readMethod && url.pathname === ROUTES.api.modelStatus) return await handleModelStatus(res, "kimi-k2-7");
    if (readMethod && url.pathname === ROUTES.api.glmModelStatus) return await handleModelStatus(res, "glm-5-2");
    if (readMethod && url.pathname === ROUTES.api.modelsStatus) return await handleModelsStatus(res);
    if (readMethod && url.pathname === ROUTES.api.workerPreflight) return await handleWorkerPreflight(url, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.workerValidate) return await handleWorkerValidate(req, res);
    if (req.method === "POST" && url.pathname === ROUTES.api.workerModelAction) return await handleWorkerModelAction(req, res);

    if (readMethod && url.pathname === ROUTES.api.saladPlan) return handleSaladPlan(res);
    if (readMethod && url.pathname === ROUTES.api.saladStatus) return await handleSaladStatus(res);
    if (readMethod && url.pathname === ROUTES.api.saladGpuClasses) return await handleSaladGpuClasses(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.saladCreate) return await handleSaladCreate(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.saladStart) return await handleSaladStart(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.saladStop) return await handleSaladStop(res);
    if (req.method === "POST" && url.pathname === ROUTES.api.jobs) return await handleCreateJob(req, res);
    if (readMethod && url.pathname === ROUTES.api.jobs) return await handleListJobs(url, res, { authUser: req.authUser });
    if (readMethod && url.pathname === ROUTES.api.jobQueue) return handleJobQueue(res, { authUser: req.authUser });
    if (req.method === "POST" && url.pathname === ROUTES.api.freeExecutor) return await handleFreeExecutor(req, res);
    if (req.method === "POST" && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/status")) return await handleWorkerStatusUpdate(url, req, res);
    if (req.method === "POST" && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/cancel")) return await handleCancelJob(url, req, res);
    if (req.method === "POST" && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/approve")) return await handleApproveJob(url, req, res);
    if (req.method === "POST" && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/autonomous-run")) return await handleAutonomousRun(url, req, res);
    if (readMethod && url.pathname.startsWith(`${ROUTES.api.jobs}/`) && url.pathname.endsWith("/events")) return await handleJobEvents(url, req, res);
    if (readMethod && url.pathname.startsWith(`${ROUTES.api.jobs}/`)) return await handleJobStatus(url, res, { authUser: req.authUser });
    if (readMethod && isAppRoute(url.pathname)) return serveFile(res, "index.html");
    json(res, 404, { error: "Not found" });
  } catch (error) {
    fehlerAntwort(res, error, req); // Status aus dem Fehler; Begruendung in respond.js
  }
});

// HOST bleibt lokal 127.0.0.1 (sicher); Container/Salad setzen SMEJJ_HOST=0.0.0.0.
const listenHost = process.env.SMEJJ_HOST || "127.0.0.1";
await recoverWorkerRuntimeOnStartup({ env: process.env });
server.listen(config.port, listenHost, () => {
  console.log(`smejj.com Code MVP: http://${listenHost}:${config.port}`);
  console.log(`Sandbox: ${config.projectRoot}`);
});

// Alle Autopilot-Hintergrunddienste (Sonden, Alarm, Laeufer, Heiler) starten
// aus EINEM Modul — Begruendungen und Reihenfolge dort (800-Zeilen-Regel).
starteAutopiloten();

// RAG: semantische Suche (BM25) ueber das Projektwissen. Nur lesend, Cache im agentContext-Modul.
async function handleRagSearch(url, res) {
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return json(res, 400, { ok: false, error: "Missing query parameter q" });
  const hits = await searchKnowledge(config.projectRoot, query, Number(url.searchParams.get("k") || 5));
  return json(res, 200, { ok: true, query, hits });
}

async function handleChat(req, res) {
  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [{ role: "user", content: String(body.message || "") }];
  // Dieselbe Regel wie in /api/agent (2026-07-27), die hier bisher fehlte: im Chat
  // kostet GLM-Thinking rund 6 s, in denen der Nutzer nichts sieht — die Denk-
  // Abschnitte verwirft der Stream-Filter ohnehin. Gemessen 2026-07-28: erstes
  // sichtbares Zeichen 12,1 s -> 7,3 s. Coding behaelt das Qualitaets-Reasoning.
  // Modellwahl und Routing-Profil bleiben unveraendert.
  // Gleiche Regel fuer Kimi K3: dort laesst sich das Denken nicht abschalten,
  // nur seine Tiefe steuern (reasoning_effort). Gemessen 2026-07-28: erstes
  // sichtbares Zeichen 12,0 s bei der Voreinstellung "max".
  //
  // Routing-Profil steuert ab 2026-07-29 auch die MODELLWAHL, nicht nur das
  // Denken. Vorher rief handleChat streamLLM ohne `profile` auf; damit lief
  // JEDE Chat-Anfrage auf "default" und eine Coding-Frage konnte das
  // Coding-Modell eines Anbieters nie erreichen, obwohl der Katalog es kennt
  // (deepseek, mistral, zhipu/GLM, qwen, openai). /api/agent macht es seit
  // immer richtig (classifyProfile(task) weiter unten) — die Ungleichheit
  // zwischen den beiden Wegen war ein Fehler, kein Entwurf.
  // Weisung des Betreibers: "Coding auf die tiefe Spur" (2026-07-29).
  // Fail-closed bleibt es: hat ein Anbieter kein Coding-Modell, greift wie
  // bisher sein Default (PROVIDER_CATALOG) — es wird nichts geraten und kein
  // Anbieter neu aktiviert.
  const prompt = latestUserPrompt(messages);
  return streamLLM(res, messages, {
    // Ohne erkennbare Nutzerfrage bleibt es beim bisherigen "default".
    ...(prompt ? { profile: classifyProfile(prompt) } : {}),
    requestedModel: body.model,
    thinking: chatThinkingMode(messages, classifyProfile),
    reasoningEffort: chatReasoningEffort(messages, classifyProfile, process.env, body?.preferences?.reasoningEffort),
    // Nur fuer die Token-Messung: streamWithTools macht daraus die pseudonyme
    // user_-Kennung. Ohne sie zaehlt der Bericht Anfragen, aber keine Nutzer.
    authUser: req.authUser
  });
}

// Seit wann laeuft DIESER Container? Ohne diese Marke ist nach einem Deploy
// nicht pruefbar, ob der neue Code wirklich live ist (Befund 2026-08-13: ein
// Mailer-Fix war gepusht, und es gab keinen einzigen Messpunkt am Server, um
// den Neubau zu bestaetigen — /api/health hatte keine Zeit- oder Versionsmarke).
const GESTARTET_AM = new Date().toISOString();

async function handleHealth(res) {
  // ai spiegelt den echten Router-Zustand: Gate + Budget + Provider-Kette (fail-closed).
  await refreshModelRuntimeHealth(process.env);
  const aiStatus = evaluateAiAvailability(process.env);
  json(res, 200, {
    ok: true,
    app: APP_INFO.name,
    gestartetAm: GESTARTET_AM,
    costPolicy: COST_POLICY,
    ai: aiStatus.ai,
    aiBackend: aiStatus.aiBackend,
    activeModelId: aiStatus.activeModelId,
    modelRegistry: aiStatus.registry,
    storage: Boolean(process.env.IDRIVE_E2_ENDPOINT && process.env.IDRIVE_E2_ACCESS_KEY && process.env.IDRIVE_E2_SECRET_KEY && process.env.IDRIVE_E2_BUCKET),
    // Suchquelle mit Schluessel: NUR Zustand und Verbrauch, nie der Schluessel.
    // Ohne diese Anzeige ist "konfiguriert" von "Kontingent aufgebraucht" nicht
    // zu unterscheiden — beides sieht im Chat wie "nichts gefunden" aus.
    suchquelle: keyProviderUsage(process.env)
  });
}

async function handleCapabilities(res) {
  json(res, 200, {
    ok: true,
    app: APP_INFO.name,
    costPolicy: COST_POLICY,
    capabilities: CAPABILITIES
  });
}

function handleAuthConfig(res) {
  json(res, 200, {
    configured: Boolean(config.googleClientId),
    clientId: config.googleClientId,
    allowedEmail: config.googleAllowedEmail,
    // Fail-closed-UX: nur konfigurierte Methoden werden im Frontend angeboten.
    methods: { email: true, passkey: true, google: Boolean(config.googleClientId), github: Boolean(config.githubLoginClientId && config.githubLoginClientSecret), magicLink: Boolean(mailerConfig(process.env)), apple: false }
  });
}

async function handleAuthMe(req, res) { // noStoreJson: Identitaet nie cachen (F-08)
  const user = readSession(req);
  const valid = user ? await sessionStillValid(user, process.env) : false;
  // Gleitende Verlaengerung (Freigabe C, 2026-08-05): jede Nutzung gibt ein
  // frisches Token mit voller Laufzeit zurueck. Der Client ersetzt sein
  // gespeichertes Token nur, wenn er selbst eines dauerhaft haelt —
  // Passkey-Sitzungen (session-only) bleiben session-only.
  noStoreJson(res, 200, {
    authenticated: Boolean(user) && valid,
    user: valid ? user : null,
    ...(valid ? { accessToken: serializeAccessToken(user) } : {})
  });
}

function handleAuthSessionToken(req, res) {
  const user = readSession(req);
  if (!user) return noStoreJson(res, 401, { authenticated: false, error: "authentication_required" });
  return noStoreJson(res, 200, {
    authenticated: true,
    user,
    accessToken: serializeAccessToken(user),
    tokenStorage: "session-only"
  });
}

async function handleSessionHandoffStart(req, res) {
  const origin = requestOrigin(req);
  const body = await readJson(req);
  const returnOrigin = String(body.returnOrigin || "").replace(/\/$/, "");
  if (!allowedOriginsFromEnv(process.env).includes(origin) || returnOrigin !== origin) {
    return noStoreJson(res, 403, { ok: false, error: "session_handoff_origin_not_allowed" });
  }
  const result = sessionHandoffStore.start(returnOrigin);
  return noStoreJson(res, result.status, result);
}

async function handleSessionHandoffComplete(req, url, res) {
  const handoffId = req.method === "GET"
    ? url.searchParams.get("handoffId")
    : (await readJson(req)).handoffId;
  const result = sessionHandoffStore.complete(handoffId, {
    token: serializeAccessToken(req.authUser),
    user: req.authUser
  });
  if (req.method === "GET" && result.ok) {
    res.writeHead(303, {
      ...SECURITY_HEADERS,
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      Location: "/profile?session-handoff-complete=1"
    });
    return res.end();
  }
  return noStoreJson(res, result.status, result.ok
    ? { ok: true, state: "completed", expiresAt: result.expiresAt }
    : result);
}

function handleSessionHandoffPoll(req, url, res) {
  const handoffId = decodeURIComponent(url.pathname.slice(`${ROUTES.api.authSessionHandoff}/`.length));
  if (!isSessionHandoffId(handoffId)) return noStoreJson(res, 404, { ok: false, error: "session_handoff_not_found" });
  const result = sessionHandoffStore.consume(handoffId, requestOrigin(req));
  return noStoreJson(res, result.status, result);
}

function noStoreJson(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return json(res, status, payload);
}

function requestOrigin(req) {
  return String(req.headers.origin || "").trim().replace(/\/$/, "");
}

// Google-Login-Handler: ausgelagert nach src/auth/googleAuthRoutes.js (2026-07-15).
// Verhalten unveraendert; Abhaengigkeiten werden injiziert (erstmals unit-testbar).
// Protokoll der Anmeldeversuche. EINE Instanz fuer alle Wege, damit die
// Zeilen im Log dasselbe Format haben und zusammen auswertbar bleiben.
const anmeldeProtokoll = createAnmeldeProtokoll({ env: process.env });

const { handleGoogleAuth, handleGoogleAuthStart } = createGoogleAuthHandlers({
  config,
  json,
  readAuthBody,
  SECURITY_HEADERS,
  serializeSessionCookie,
  // H1: Google-/GitHub-/Magic-Router nutzen diese Funktion NUR fuer den
  // Client-Bearer (das Cookie laeuft ueber serializeSessionCookie). Wir binden
  // sie deshalb an serializeAccessToken -> bei aktivem Flag minten auch diese
  // Login-Wege kurzlebige Bearer, ohne die Downstream-Module zu aendern.
  serializeSessionToken: serializeAccessToken,
  sessionHandoffStore,
  allowedOriginsFromEnv,
  signGoogleAuthState,
  verifyGoogleAuthState,
  leseGoogleAuthState,
  verifyGoogleIdToken,
  ROUTES,
  anmeldeProtokoll,
  env: process.env
});

// GitHub-Login + Magic Link: Handler-Erzeugung und Dispatch ausgelagert nach
// src/auth/extraAuthRoutes.js (schlanker Server, Flow ohne Boot testbar).
const routeExtraAuth = createExtraAuthRouter({
  config, json, readJson, SECURITY_HEADERS,
  // H1: nur Client-Bearer (siehe Google-Router oben) -> serializeAccessToken.
  serializeSessionCookie, serializeSessionToken: serializeAccessToken,
  sessionHandoffStore, allowedOriginsFromEnv, ROUTES, anmeldeProtokoll, env: process.env
});

async function handleAuthLogout(req, res) {
  // Serverseitig widerrufen (nicht nur Cookie loeschen): E-Mail ueber ihre eigene
  // Registry, alle anderen Methoden (H2) ueber die generalisierte sid-Registry.
  const sessionUser = readSession(req);
  await revokeCurrentEmailSession(sessionUser, process.env).catch(() => {});
  if (sessionUser?.sid && sessionUser.method !== "email") {
    await revokeSession(sessionUser.sid, process.env).catch(() => {});
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": `smejj_session=; Path=/; HttpOnly; Secure; SameSite=${SESSION_COOKIE_SAMESITE}; Max-Age=0`
  });
  res.end(JSON.stringify({ authenticated: false }, null, 2));
}

function emailAuthContext(url) {
  return {
    env: process.env,
    readJson,
    json,
    readSession,
    makeSessionCookie: serializeSessionCookie,
    makeAccessToken: serializeAccessToken,
    requestOrigin(req) {
      const proto = req.headers["x-forwarded-proto"] || (url.hostname === "localhost" ? "http" : "https");
      return `${String(proto).split(",")[0].trim()}://${req.headers.host}`;
    }
  };
}

function allowPublicModelRequest(req, res) {
  const gate = publicModelRateGate.check(req);
  if (gate.allowed) return true;
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil(gate.retryAfterMs / 1_000))));
  res.setHeader("Access-Control-Expose-Headers", "x-smejj-model-backend, Retry-After");
  json(res, 429, { error: "public_ai_rate_limit_reached" });
  return false;
}

// Erkennt echte Coding-Aufgaben (nur dann Code-Agent-Modus mit Plan/Diff).
// Alles andere gilt als Wissens-/Aktualitaetsfrage und wird live im Internet recherchiert.
function isCodingTask(task) {
  const t = String(task || "");
  if (/```/.test(t)) return true;
  if (/\b(refactor|debug|stack ?trace|compile|dockerfile|commit|deploy|npm |pnpm |yarn |git )\b/i.test(t)) return true;
  if (/\b(schreib\w*|erstell\w*|implementier\w*|programmier\w*|cod\w*|bau\w*|fix\w*|beheb\w*)\b/i.test(t)
      && /\b(funktion|function|klasse|class|script|komponente|component|endpoint|modul|module|css|html|javascript|typescript|python|react|node|bug|fehler|datei|file|repo)\b/i.test(t)) return true;
  return false;
}

async function handleAgent(req, res) {
  const body = await readJson(req);
  const task = String(body.task || "").trim();
  const files = Array.isArray(body.files) ? body.files.slice(0, 8) : [];
  // Sprachmodus-Flag des Frontends: Antwort wird vorgelesen -> kurz und gespraechig.
  const voiceMode = body?.preferences?.voiceMode === true;
  if (!task) return json(res, 400, { error: "Missing task" });

  // Kontext-Diaet: alle Dateien teilen sich EIN Budget statt je 120.000
  // Zeichen ohne Gesamtgrenze (das ergab bis zu 1,20 USD je Anfrage).
  // Lesen, Verteilen und Kuerzen stehen in src/agent/dateiKontext.js.
  const dateiKontext = await leseUndKuerze(files, safeResolve, readLimited);
  const fileBlocks = dateiKontext.bloecke;

  // Coding-Aufgabe -> Code-Agent. Sonst Wissens-/Aktualitaetsfrage -> Live-Websuche.
  const codingTask = fileBlocks.length > 0 || isCodingTask(task);
  // Tagesaktueller Kontext (Wetter, Websuche) — siehe src/agent/liveKontext.js.
  const webContext = await holeLiveKontext(task, {
    codingTask,
    erkenneAbsicht: detectLiveInternetIntent,
    beantworteLive: answerLiveIntent,
    sollSuchen: shouldSearchWeb,
    baueSuchkontext: buildAgentWebContext
  });
  // Projektwissen (RAG) ergaenzt, ersetzt aber nie die Live-Suche.
  const ragContext = await buildRagContextBlock(config.projectRoot, task, 3);

  const modus = ["plan", "manuell", "akzeptieren"].includes(String(body?.preferences?.modus || ""))
    ? body.preferences.modus
    : "auto";
  const systemLines = baueSystemregeln({ codingTask, webContext, voiceMode, modus });

  const userParts = [`Frage/Aufgabe:\n${task}`];
  if (webContext) userParts.push(webContext);
  if (ragContext) userParts.push(ragContext);
  if (fileBlocks.length) userParts.push(`Dateien:\n${fileBlocks.join("\n\n")}`);

  // Gespraechsgedaechtnis: der Verlauf des Clients wird streng validiert
  // eingefuegt (nur user/assistant, begrenzt) — ohne ihn startete jede Frage
  // bei null. Systemregeln bleiben ausschliesslich serverseitig.
  const messages = buildChatMessages({
    systemContent: systemLines.join("\n"),
    history: body.history,
    userContent: userParts.join("\n\n")
  });
  // Profilwahl: Web-Fragen nutzen das Web-Zusammenfassungsprofil des Routers.
  const profile = webContext ? "web" : classifyProfile(task);
  // Coding behaelt Qualitaets-Reasoning, aber nur bei echtem Kontext-Umfang.
  // Begruendung und Messwerte stehen in src/ai/chatThinkingPolicy.js.
  const thinking = codingTask
    ? denkBremse({ text: task, dateien: fileBlocks.length })
    : { type: "disabled" };
  // Semantischer Cache: Standard ist der Schatten-Modus — er misst, was er
  // getroffen HAETTE, und veraendert keine Antwort. Regeln, Protokoll und
  // Auslieferung stehen in src/agent/cacheSpur.js.
  const cacheLage = baueCacheLage({ task, req, body, fileBlocks, webContext, codingTask });
  const ausCache = befrageCache(cacheLage);
  if (darfAusliefern(ausCache)) return liefereAusCache(res, ausCache, SECURITY_HEADERS);

  // Denktiefe von K3: Wunsch aus den Einstellungen (Reasoning-Aufwand) schlaegt
  // die Regel nach Aufgabentyp; die Env des Betreibers schlaegt beides.
  const antwortText = await streamLLM(res, messages, {
    profile,
    requestedModel: body.model,
    thinking,
    reasoningEffort: chatReasoningEffort(messages, classifyProfile, process.env, body?.preferences?.reasoningEffort),
    authUser: req.authUser,
    spur: "agent",
    ...(voiceMode && !codingTask ? { maxTokens: 400 } : {})
  });
  merkeFuerSpaeter(cacheLage, antwortText);
}

async function handleStorageStatus(res) {
  const endpoint = process.env.IDRIVE_E2_ENDPOINT;
  const accessKey = process.env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = process.env.IDRIVE_E2_SECRET_KEY;
  const bucket = process.env.IDRIVE_E2_BUCKET;
  const region = process.env.IDRIVE_E2_REGION || "us-west-2";
  const prefix = process.env.MODEL_S3_PREFIX || STORAGE.defaultModelPrefix;
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    return json(res, 200, {
      configured: false,
      ok: false,
      message: "IDrive e2 is not configured in local environment."
    });
  }

  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const { response, body } = await signedS3List({
    endpoint,
    region,
    accessKey,
    secretKey,
    bucket,
    prefix: normalizedPrefix
  });
  if (!response.ok) {
    return json(res, 502, {
      configured: true,
      ok: false,
      provider: STORAGE.provider,
      bucket,
      prefix: normalizedPrefix,
      status: response.status,
      message: body.slice(0, 300),
      storageRole: STORAGE.role
    });
  }
  const keys = parseS3Keys(body);
  json(res, 200, {
    configured: true,
    ok: true,
    provider: STORAGE.provider,
    bucket,
    prefix: normalizedPrefix,
    objectCount: keys.length,
    keys,
    storageRole: STORAGE.role
  });
}

async function streamLLM(res, messages, { profile = "default", requestedModel = "", thinking, reasoningEffort, maxTokens, authUser = null, spur = "chat" } = {}) {
  // Eine Quelle der Wahrheit mit /api/health (resolveServerAiGate): sonst zeigt
  // die Ampel "ai: true / zhipu:glm-5.2", waehrend der Chat still in den
  // Rueckfall-Text faellt — genau der Fehler vom 2026-08-15.
  const tor = resolveServerAiGate(process.env, profile, requestedModel);
  // Aufgebrauchtes Budget bleibt ein sichtbarer 429 — aber nur dort, wo das
  // Budget ueberhaupt zaehlt. Im BYOK-Modus fuehrt der Anbieter (Zhipu/Kimi)
  // das Guthaben; ein lokaler Zaehler von 0 wuerde den Chat grundlos sperren.
  if (tor.gateEnabled && !tor.budgetOk && !tor.registryByokOk) {
    return json(res, 429, { error: "AI rate limit reached or unclear." });
  }
  if (!tor.ai) {
    return localAssistantStream(res, messages);
  }
  const { chain, selection } = tor;
  if (chain.length === 0) {
    return json(res, 400, {
      error: "AI mode disabled. No active model runtime or approved fallback is configured.",
      requestedModelId: selection.requestedModelId
    });
  }
  const modelOptions = withAgentTools({
    temperature: 1.0,
    maxTokens: maxTokens ?? boundedInteger(process.env.SMEJJ_PUBLIC_MODEL_MAX_TOKENS, 512, 8_192, 4_096),
    ...(thinking === undefined ? {} : { thinking }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort })
  });
  const result = await executeWithFallback(chain, messages, modelOptions);
  if (!result.ok || !result.response.body) return json(res, 502, { error: "All model backends failed.", attempts: result.attempts });
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "x-smejj-model-backend": `${result.backend}:${result.model}`,
    "x-smejj-model-id": result.logicalModelId,
    "x-smejj-requested-model-id": selection.requestedModelId,
    "x-smejj-model-fallback": String(result.logicalModelId !== selection.requestedModelId)
  });
  const sichtbar = await streamWithTools({ result, chain, messages, res, options: modelOptions, executeWithFallback, authUser, spur });
  res.end();
  return sichtbar;
}

function boundedInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}


function readAuthBody(req) {
  const contentType = String(req.headers["content-type"] || "");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > SECURITY_LIMITS.maxJsonBodyBytes) reject(zuGrossFehler());
    });
    req.on("end", () => {
      try {
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(raw);
          return resolve({
            credential: params.get("credential") || "",
            idToken: params.get("id_token") || "",
            state: params.get("state") || "",
            redirect: true
          });
        }
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid auth request"));
      }
    });
  });
}

function serializeSessionCookie(user) {
  // H2: genau HIER (Cookie wird nur beim Login gesetzt, nicht bei /me-Renewal)
  // bekommt eine Nicht-E-Mail-Sitzung ihre sid und einen Registry-Eintrag —
  // damit auch Google/Passkey/GitHub/Magic fern-widerrufbar werden.
  ensureRegistrySid(user);
  const maxAge = user?.permanent || user?.method === "google" ? 315360000 : 604800;
  return `smejj_session=${serializeSessionToken(user)}; Path=/; HttpOnly; Secure; SameSite=${SESSION_COOKIE_SAMESITE}; Max-Age=${maxAge}`;
}

// H2 (Flag SMEJJ_SESSION_REGISTRY): vergibt einer frisch angemeldeten
// Nicht-E-Mail-Sitzung eine sid und hinterlegt sie als aktiv. Synchron die sid
// (sie muss sofort in Cookie UND Access-Token), die Registrierung best-effort im
// Hintergrund (isSessionActive wertet "noch kein Eintrag" als aktiv -> kein
// Aussperren). E-Mail-Sitzungen haben ihre eigene Registry und werden hier
// ausgelassen. Ohne Flag passiert nichts (Rollback per Flag).
function ensureRegistrySid(user) {
  if (!sessionRegistryEnabled(process.env)) return;
  if (!user || user.method === "email" || user.sid) return;
  user.sid = newSessionId();
  registerSession({
    sid: user.sid,
    subject: user.userId || user.sub || user.email,
    method: user.method,
    expiresAtMs: Date.now() + 180 * 24 * 60 * 60 * 1000
  }, process.env).catch(() => {});
}

// Generalisierte Sitzungspruefung: E-Mail wie bisher; Nicht-E-Mail nur dann, wenn
// die Registry aktiv ist UND das Token eine sid traegt. Legacy-Tokens ohne sid
// (vor Flag-Aktivierung ausgestellt) bleiben gueltig.
async function sessionStillValid(user, env = process.env) {
  if (!user) return false;
  if (user.method === "email") return emailSessionStillValid(user, env);
  if (sessionRegistryEnabled(env) && user.sid) return isSessionActive(user.sid, env);
  return true;
}

function serializeSessionToken(user) {
  return issueSessionToken({ secret: config.sessionSecret, user });
}

// H1-Haertung (2026-08-09, Flag SMEJJ_SHORT_ACCESS_TOKEN): der JS-lesbare Bearer,
// den das Frontend an die Cross-Origin-Bridge schickt, ist bei aktivem Flag nur
// noch ein kurzlebiges Access-Token (10 min, kind:"access"). Das 180-Tage-Token
// bleibt ausschliesslich im HttpOnly-Cookie. verifySessionToken akzeptiert beide
// Arten -> keine bestehende Sitzung bricht. Flag aus = altes Verhalten (Bearer =
// Langzeit-Token), damit ist der Rollback ein einziges Env-Flag.
function serializeAccessToken(user) {
  if (user?.permanent || user?.method === "google") return serializeSessionToken(user);
  return SHORT_ACCESS_TOKEN
    ? issueAccessToken({ secret: config.sessionSecret, user })
    : serializeSessionToken(user);
}

function readSession(req) {
  const match = String(req.headers.cookie || "").match(/(?:^|;\s*)smejj_session=([^;]+)/);
  const token = bearerSessionToken(req.headers || {}) || match?.[1] || "";
  return verifySessionToken(token, { secret: config.sessionSecret });
}

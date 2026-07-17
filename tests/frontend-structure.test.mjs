import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyAutonomousRequest, routeAutonomousRequest } from "../public/autonomous-intent.js";

const html = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const leftMenuState = fs.readFileSync("public/left-menu-state.js", "utf8");
const searchModule = fs.readFileSync("public/search.js", "utf8");
const premiumSurfaces = fs.readFileSync("public/premium-surfaces.js", "utf8");
const autonomousCoding = fs.readFileSync("public/autonomous-coding.js", "utf8");
const autonomousIntent = fs.readFileSync("public/autonomous-intent.js", "utf8");
const premiumStyles = fs.readFileSync("public/app-surfaces.css", "utf8");
const settingsSurface = fs.readFileSync("public/settings-surface.js", "utf8");
const settingsRuntime = fs.readFileSync("public/settings-runtime.js", "utf8");
const accountPrivacy = fs.readFileSync("public/account-privacy.js", "utf8");
const settingsStyles = fs.readFileSync("public/settings-surface.css", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const brandingCss = fs.readFileSync("public/branding.css", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const startDesignLock = fs.readFileSync("docs/frontend/START_DESIGN_LOCK.md", "utf8");

const requiredViews = [
  "start",
  "search",
  "websites",
  "smejjClaw",
  "automation",
  "chatHistory",
  "browser",
  "code",
  "projects",
  "files",
  "storageView",
  "memory",
  "ai",
  "settings",
  "profile",
  "cost",
  "tools",
  "offline",
  "error"
];

test("all required pages exist", () => {
  for (const id of requiredViews) {
    assert.match(html, new RegExp(`id="${id}"`), `missing view ${id}`);
  }
});

test("navigation targets existing views", () => {
  const targets = Array.from(html.matchAll(/data-view="([^"]+)"/g)).map((match) => match[1]);
  for (const target of targets) {
    assert.ok(requiredViews.includes(target), `unknown nav target ${target}`);
  }
});

test("navigation icon and label contract stays idiotensicher", () => {
  const expectedNav = [
    ["start", "plus", "Neu"],
    ["search", "search", "Suche"],
    ["smejjClaw", "code", "Coding"],
    ["projects", "projects", "Projekte"],
    ["files", "files", "Dateien"],
    ["chatHistory", "history", "Verlauf"],
    ["settings", "settings", "Einstellungen"]
  ];
  for (const [view, icon, label] of expectedNav) {
    assert.match(
      html,
      new RegExp(`<button class="nav-button[^"]*" type="button" data-view="${view}" data-icon="${icon}" title="${label}"[^>]*>${label}</button>`),
      `navigation item ${view} must show ${icon} + ${label}`
    );
  }
  assert.doesNotMatch(html, /<button class="nav-button" type="button" data-view="websites"/);
  assert.doesNotMatch(html, /<button class="nav-button" type="button" data-view="automation"/);
  assert.doesNotMatch(html, /<button class="nav-button" type="button" data-view="cost"/);
  assert.doesNotMatch(html, /class="profile-dock nav-button"/);
  assert.match(html, /data-jump="websites"[\s\S]*>Browser<\/button>/);
  assert.match(html, /data-jump="cost"[\s\S]*>Kosten & Limits<\/button>/);
  assert.match(html, /data-jump="profile"[\s\S]*>Nutzer<\/button>/);
  assert.match(html, /data-jump="automation"[\s\S]*>Automatisierung<\/button>/);
  assert.doesNotMatch(html, /data-description=/);
  assert.doesNotMatch(html, /smejj claw/);
  assert.doesNotMatch(html, /Chat History/);
  assert.match(app, /smejj\.ui\.leftPanelWidth\.v9/);
  assert.match(app, /default: 200/);
  assert.match(css, /--menu-icon-color: rgba\(246, 243, 238, 0\.78\)/);
  assert.match(css, /--menu-icon-active-color: #00ffef/);
  assert.match(css, /\.sidebar \.nav-button\.is-active \.button-icon/);
  assert.match(css, /\.sidebar \.bottom-nav[\s\S]*margin-top: 8px/);
  assert.match(css, /\.nav-label/);
  assert.doesNotMatch(css, /\.nav-description/);
});

test("Codex-like global search stays protected", () => {
  assert.match(html, /<span>Globale Suche<\/span>/);
  assert.match(html, /placeholder="Chats, Projekte, Dateien, Code, Quellen suchen"/);
  assert.match(html, /Suche ueber alles in smejj\.com\. Enter oeffnet den besten Treffer\./);
  assert.match(app, /from "\.\/search\.js"/);
  assert.match(app, /initGlobalSearch\(\{ \$, goToView, showTaskIndicator, showToast, state, workspace \}\)/);
  for (const label of ["Chats", "Projekte", "Dateien", "Code", "Quellen"]) {
    assert.match(html, new RegExp(label), `search scope ${label} must stay visible`);
  }
  for (const token of ["Arbeitsbereiche", "Werkzeuge", "Einstellungen", "Memory", "data-search-view", "metaKey", "ctrlKey"]) {
    assert.match(searchModule, new RegExp(token), `global search contract missing ${token}`);
  }
  assert.match(sw, /\/assets\/search\.js/);
  // v121 -> v122 am 2026-07-16: View-Navigation (view-chrome.js/.css) in den
  // Shell-Precache aufgenommen; schriftliche Freigabe des Nutzers ("Ich finde
  // deinen Vorschlag gut mit X Icon schliessen und Zurueckpfeile ...").
  assert.match(sw, /smejj-shell-v128/);
});

test("brand follows closed, compact and expanded left-menu states without moving the workspace", () => {
  assert.match(html, /<body data-left-menu-state="closed">/);
  assert.match(html, /class="app-brand-icon"[^>]*\/icons\/smejj_icon\.svg/);
  assert.match(html, /class="app-brand-wordmark"[^>]*\/icons\/smejj_full_logo_on_dark\.svg/);
  assert.match(app, /Math\.max\(rawWidth, PANEL_WIDTHS\.compact\)/);
  assert.match(app, /PANEL_WIDTHS\.min - 1/);
  assert.match(app, /from "\.\/left-menu-state\.js"/);
  assert.match(leftMenuState, /function syncLeftMenuState\(/);
  assert.match(leftMenuState, /dataset\.leftMenuState = "opening"/);
  assert.match(leftMenuState, /event\.propertyName === "transform"/);
  assert.match(leftMenuState, /\? "closed"[\s\S]*\? "compact"[\s\S]*: "expanded"/);
  assert.match(leftMenuState, /document\.body\.dataset\.leftMenuState = menuState/);
  assert.match(brandingCss, /\.app-brand-logo[\s\S]*position: fixed/);
  assert.match(brandingCss, /box-sizing: border-box/);
  assert.match(brandingCss, /calc\(var\(--left-panel-width\) - 52px\)/);
  assert.doesNotMatch(brandingCss, /\.sidebar\.is-open/);
  assert.match(brandingCss, /\.app-brand-icon[\s\S]*visibility: visible/);
  assert.match(brandingCss, /\.app-brand-wordmark[\s\S]*visibility: hidden/);
  assert.match(brandingCss, /body\[data-left-menu-state="expanded"\] \.app-brand-icon[\s\S]*visibility: hidden/);
  assert.match(brandingCss, /body\[data-left-menu-state="expanded"\] \.app-brand-wordmark[\s\S]*visibility: visible/);
  assert.match(css, /body\.left-panel-open \.workspace \{\s*margin-left: 0;/);
  assert.doesNotMatch(brandingCss, /transition:/);
});

test("protected automation surface wires durable autonomous jobs without touching the start page", () => {
  assert.match(premiumSurfaces, /initAutonomousCodingSurface\(\)/);
  assert.match(sw, /\/assets\/autonomous-coding\.js/);
  assert.match(sw, /\/assets\/autonomous-coding\.css/);
  assert.match(autonomousCoding, /persistToIdrive: true/);
  assert.match(autonomousCoding, /autonomous-run/);
  assert.match(autonomousCoding, /Diff freigeben/);
  assert.match(autonomousCoding, /publishDraftPr: true/);
  assert.match(autonomousCoding, /sessionStorage\.setItem\(API_TOKEN_KEY/);
  assert.doesNotMatch(autonomousCoding, /localStorage\.setItem\([^)]*apiToken/);
  assert.match(app, /routeAutonomousRequest\(/);
  assert.match(autonomousIntent, /classifyAutonomousRequest\(task\)/);
  assert.match(autonomousIntent, /smejj:autonomous-request/);
  assert.match(autonomousCoding, /id="acExecutionMode"/);
  assert.match(autonomousCoding, /executionMode,\n    uiChange/);
  assert.match(autonomousCoding, /Read-only-Analyse/);
  assert.match(autonomousCoding, /syncExecutionModeControls\(\)/);
  assert.match(autonomousCoding, /const executionMode = options\.executionMode === "analyze"/);
  assert.match(autonomousCoding, /#acExecutionMode"\)\.value = request\.executionMode === "analyze" \? "analyze" : "edit"/);
  assert.match(sw, /\/assets\/autonomous-intent\.js/);
});

test("explicit autonomous intent routes action requests but preserves ordinary coding questions", () => {
  assert.equal(classifyAutonomousRequest("Erklaere mir eine JavaScript-Funktion."), null);
  assert.equal(classifyAutonomousRequest("Schreibe eine kleine add Funktion."), null);
  const browser = classifyAutonomousRequest("Pruefe https://example.com im Browser komplett und teste die Website.");
  assert.equal(browser.executionMode, "analyze");
  assert.equal(browser.uiChange, true);
  assert.equal(browser.previewUrl, "https://example.com/");
  const edit = classifyAutonomousRequest("Behebe den Fehler im Repository eigenstaendig und teste die App.");
  assert.equal(edit.executionMode, "edit");
  const directBrowser = classifyAutonomousRequest("Öffne https://example.com im Browser und lies die Hauptüberschrift.");
  assert.equal(directBrowser.executionMode, "analyze");
  assert.equal(directBrowser.previewUrl, "https://example.com/");
  const usedBrowser = classifyAutonomousRequest("Benutze den Browser und navigiere zu https://example.org/path.");
  assert.equal(usedBrowser.previewUrl, "https://example.org/path");
});

test("browser intent opens the visible browser before starting the durable agent flow", () => {
  const events = [];
  const views = [];
  const output = { textContent: "" };
  const handled = routeAutonomousRequest({
    task: "Öffne https://example.com im Browser und lies die Hauptüberschrift.",
    output,
    goToView: (view) => views.push(view),
    eventTarget: { dispatchEvent: (event) => events.push(event) }
  });
  assert.equal(handled, true);
  assert.deepEqual(views, ["automation"]);
  assert.match(output.textContent, /Browserauftrag/);
  assert.deepEqual(events.map((event) => event.type), ["smejj:browser-request", "smejj:autonomous-request"]);
  assert.equal(events[0].detail.url, "https://example.com/");
});

test("central UI component roots and module exist", () => {
  assert.match(html, /id="toastRoot"/);
  assert.match(html, /id="modalRoot"/);
  assert.match(app, /from "\.\/components\.js"/);
  assert.match(css, /\.toast-root/);
  assert.match(css, /\.modal-root/);
  assert.match(css, /\.skeleton/);
  assert.match(css, /\.empty-state/);
});

test("status views stay available outside the menus", () => {
  for (const id of ["storageStatusText", "workspaceStatusText", "idriveStatusText", "aiModeText", "kimiVaultStatusText", "costStatusText"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing status view field ${id}`);
  }
});

test("PWA shell caches app component modules", () => {
  for (const asset of ["/assets/app.js", "/assets/components.js", "/assets/styles.css", "/manifest.webmanifest"]) {
    assert.match(sw, new RegExp(asset.replace(/[/.]/g, "\\$&")));
  }
});

test("CSS does not force non-start views hidden", () => {
  assert.doesNotMatch(css, /view:not\(#start\)/);
});

test("smejj start design lock v1 stays protected", () => {
  assert.match(startDesignLock, /smejj start design lock v1/);
  assert.match(startDesignLock, /nicht ohne schriftliche Bestaetigung/);
  assert.match(css, /DESIGN LOCK: smejj start design lock v1/);
  assert.match(css, /END DESIGN LOCK: smejj start design lock v1/);
  assert.match(html, /<textarea id="startMessage" rows="1"/);
  assert.match(html, /id="modelPickerButton"[^>]*>smejj 1\.0<\/button>/);
  assert.match(css, /\.home-feed[\s\S]*background: linear-gradient\(180deg, rgba\(15, 17, 18, 0\.86\) 0%, #090a0c 72%, #050608 100%\)/);
  assert.match(css, /\.prompt-glass[\s\S]*background: #050608/);
  assert.match(css, /\.prompt-glass textarea[\s\S]*height: 48px/);
  assert.match(css, /\.prompt-glass textarea[\s\S]*max-height: 324px/);
  assert.match(css, /\.prompt-actions[\s\S]*min-height: 42px/);
  assert.match(css, /\.prompt-actions[\s\S]*border-top: 1px solid rgba\(255, 255, 255, 0\.16\)/);
  assert.match(css, /\.sidebar \.nav[\s\S]*gap: 0/);
  assert.match(css, /\.sidebar \.bottom-nav[\s\S]*gap: 0/);
  assert.match(css, /\.browser-panel-nav,[\s\S]*gap: 0/);
});

test("smejj composer tools and client chat stay protected (feature lock v2)", () => {
  const composerTools = fs.readFileSync("public/composer-tools.js", "utf8");
  const composerCss = fs.readFileSync("public/composer-tools.css", "utf8");
  const chatClient = fs.readFileSync("public/ai/chatClient.js", "utf8");
  // Plus-Menue auf derselben Seite
  assert.match(html, /id="composerPlusButton"/);
  assert.match(html, /id="composerPlusMenu"/);
  assert.match(html, /data-composer-action="attach-file"/);
  assert.match(html, /data-composer-action="attach-photo"/);
  // Sprachmodus-Overlay mit Zustaenden
  assert.match(html, /id="voiceModeOverlay"/);
  assert.match(html, /id="voiceModeStatus"/);
  assert.match(html, /id="voiceModeClose"/);
  assert.match(html, /\/assets\/composer-tools\.css/);
  // Verdrahtung in app.js
  assert.match(app, /initComposerTools\(\)/);
  assert.match(app, /runClientChat\(\{ task/);
  // Composer-Modul: Diktat-Toggle, Overlay-Schleife, Vorlesen
  assert.match(composerTools, /export function initComposerTools/);
  assert.match(composerTools, /is-recording/);
  assert.match(composerTools, /voiceModeListen/);
  assert.match(composerTools, /speechSynthesis/);
  assert.match(composerCss, /\.plus-menu/);
  assert.match(composerCss, /\.voice-mode-overlay/);
  // Client-Chat: BYOK fail-closed + lokale Browser-KI
  assert.match(chatClient, /export async function runClientChat/);
  assert.match(chatClient, /validateByokConfig/);
  assert.match(chatClient, /chat\/completions/);
  assert.match(chatClient, /local browser/);
  // Code-Uebernahme aus Chat-Antworten in den Workspace (via Workspace-Bruecke)
  const workspaceBridge = fs.readFileSync("public/workspace-bridge.js", "utf8");
  assert.match(chatClient, /export function attachCodeActions/);
  assert.match(chatClient, /smejj:workspace-save/);
  assert.match(chatClient, /export async function resolveWorkspaceReferences/);
  assert.match(chatClient, /Im Editor oeffnen/);
  assert.match(app, /initWorkspaceBridge\(\{ workspace, ensureProject, showToast \}\)/);
  assert.match(workspaceBridge, /smejj:workspace-save/);
  assert.match(workspaceBridge, /smejj:workspace-read/);
  assert.match(workspaceBridge, /smejj:workspace-list/);
  assert.match(html, /data-composer-action="attach-workspace"/);
  assert.match(composerCss, /\.chat-code-actions/);
  assert.match(composerCss, /\.chat-code-save/);
  assert.match(sw, /\/assets\/workspace-bridge\.js/);
  // Service-Worker-Precache der Module
  for (const asset of ["/assets/composer-tools.js", "/assets/composer-tools.css", "/assets/ai/chatClient.js"]) {
    assert.match(sw, new RegExp(asset.replace(/[/.]/g, "\\$&")));
  }
});

test("start composer keeps chat inside the start page", () => {
  assert.match(html, /id="startLog"/);
  assert.match(app, /function addEntry\(text, role, target = "#startLog"\)/);
  assert.match(app, /\$\(target\) \|\| \$\("#startLog"\)/);
  assert.doesNotMatch(app, /addEntry\(UI_COPY\.startup, "assistant"\)/);
  assert.match(app, /role === "user"\) \$\("#start"\)\?\.classList\.add\("has-start-chat"\)/);
  assert.match(css, /#start\.has-start-chat \.home-hero[\s\S]*display: none/);
  assert.match(css, /#start\.has-start-chat \.start-log[\s\S]*justify-content: flex-start/);
  assert.doesNotMatch(html, /id="chat"/);
  assert.doesNotMatch(html, /id="form"/);
  assert.doesNotMatch(html, /id="message"/);
  assert.doesNotMatch(html, /id="log"/);
  assert.doesNotMatch(html, /data-view="chat"/);
  assert.match(app, /submitTask\(task, \{ target: "#startLog" \}\)/);
  assert.match(html, /data-model="GLM-5\.2"/);
  assert.match(html, /data-model="Cline"/);
  assert.doesNotMatch(html, /data-model="BYOK"/);
  assert.doesNotMatch(html, /data-model="local browser"/);
  assert.doesNotMatch(html, /data-model="smejj Code"/);
  assert.match(app, /Object\.hasOwn\(MODEL_MODES, model\)/);
  assert.match(app, /"GLM-5\.2": AI_MODES\.glm52Vault/);
  assert.match(app, /"Cline": AI_MODES\.byok/);
  // Cline-Untermenue (Codex-Stil): Trigger mit Pfeil, eigenes Modul, Picker ignoriert Trigger.
  assert.match(html, /data-model="Cline" data-submenu-trigger="cline"/);
  assert.match(html, /class="model-submenu-arrow"/);
  assert.match(html, /\/assets\/cline-model-menu\.js\?v=cline-submenu-20260714/);
  assert.match(app, /item\.hasAttribute\("data-submenu-trigger"\)/);
  assert.match(app, /\[data-model\]:not\(\[data-submenu-trigger\]\)/);
  assert.match(fs.readFileSync("public/cline-model-menu.css", "utf8"), /\.model-submenu \{/);
  assert.match(html, /\/assets\/cline-model-menu\.css/);
  assert.match(sw, /\/assets\/cline-model-menu\.js/);
  assert.match(sw, /\/assets\/cline-model-menu\.css/);
  assert.match(app, /createFreeCodingJob\(task\)/);
  assert.match(app, /runFreeExecutorIfAppTask\(task\)/);
  assert.match(app, /CLIENT_ROUTES\.api\.jobs/);
  assert.match(app, /CLIENT_ROUTES\.api\.freeExecutor/);
  assert.match(app, /saveFreeExecutorArtifact\(executorResult\)/);
  assert.match(app, /smejj\.freeExecutor\.lastArtifact\.v1/);
  assert.match(app, /function isFreeCodingFallbackTask\(task\)/);
  assert.match(app, /if \(isFreeCodingFallbackTask\(task\)\) \{/);
  assert.match(app, /wetter\|heute\|aktuell\|nachricht/);
  assert.match(fs.readFileSync("public/config.js", "utf8"), /chatOffline: "Chat-Stream aktuell nicht erreichbar/);
  assert.match(app, /UI_COPY\.chatOffline/);
  assert.match(app, /Dateien im Plan:/);
  assert.match(app, /Patch-Plan:/);
  assert.match(app, /Free Executor fertig\./);
  assert.match(app, /Artefakte bereit:/);
  assert.match(app, /Browser-Smoke:/);
  assert.match(app, /Tests: \$\{passed\}\/\$\{tests\.length\} bestanden/);
  assert.match(app, /IDrive: \$\{executor\.idrive\?\.ok/);
  assert.match(app, /GPU\/Salad: \$\{worker\.inferenceStarted \? "gestartet" : "aus"\}/);
  assert.match(app, /await stream\(CLIENT_ROUTES\.api\.agent, \{/);
  assert.ok(
    app.indexOf("await stream(CLIENT_ROUTES.api.agent, {") <
      app.indexOf("const codingJob = await createFreeCodingJob(task)"),
    "real model stream must run before free fallback status output"
  );
  assert.match(app, /const codingJob = await createFreeCodingJob\(task\)/);
  assert.match(app, /nur code/);
  assert.match(app, /chat: "start"/);
  assert.match(app, /chat: "\/"/);
  assert.match(app, /"\/chat": "start"/);
  assert.doesNotMatch(app, /function bindChat/);
  assert.doesNotMatch(app, /bindChat\(\)/);
  assert.doesNotMatch(app, /goToView\("chat"\);\n\s*await submitTask\(task\)/);
  assert.doesNotMatch(html, /#start[\s\S]*data-jump="chat"/);
});

test("storage deep link resolves to storage view", () => {
  assert.match(app, /VIEW_ALIASES[\s\S]*storage: "storageView"/);
  assert.match(app, /const resolvedViewId = VIEW_ALIASES\[viewId\] \|\| viewId/);
  assert.match(html, /id="storageView"/);
});

test("Kimi K2.7 vault status is visible and uses the model status API", () => {
  assert.match(html, /id="kimiVaultStorageText"/);
  assert.match(html, /id="kimiStatusCheck"/);
  assert.match(html, /id="kimiStatusOutput"/);
  assert.match(app, /refreshKimiVaultStatus/);
  assert.match(app, /CLIENT_ROUTES\.api\.modelStatus/);
});

test("model area renders GLM-5.2 and feature-flagged Kimi K2.7 in the existing picker", () => {
  assert.match(app, /"Kimi K2\.7": AI_MODES\.kimiK27Vault/);
  assert.match(app, /smejj:model-selected/);
  assert.match(premiumSurfaces, /id = "systemModelSelect"/);
  assert.match(premiumSurfaces, /"GLM-5\.2"/);
  assert.match(premiumSurfaces, /"Kimi K2\.7"/);
  assert.match(premiumSurfaces, /health\.modelRegistry/);
  assert.match(premiumStyles, /\.model-registry-row/);
  assert.match(html, /data-model="GLM-5\.2"[\s\S]*data-model="Kimi K2\.7"/);
});

test("local browser checks use the local Control Server without weakening production HTTPS", () => {
  const config = fs.readFileSync("public/config.js", "utf8");
  assert.ok(config.includes("127\\.0\\.0\\.1|localhost|\\[::1\\]"));
  assert.ok(config.includes("return /^https:\\/\\/[a-z0-9.-]+$/i.test(candidate) ? candidate : \"\";"));
  assert.match(fs.readFileSync("public/app-surfaces.css", "utf8"), /\.view-header h2 \{[\s\S]*font-size: 32px/);
});

test("GLM 5.2 vault status is visible and uses the GLM status API", () => {
  assert.match(html, /id="glmVaultStorageText"/);
  assert.match(html, /id="glmStatusCheck"/);
  assert.match(html, /id="glmStatusOutput"/);
  assert.match(app, /refreshGlmVaultStatus/);
  assert.match(app, /CLIENT_ROUTES\.api\.glmModelStatus/);
});

test("provider deep links resolve to the AI mode view", () => {
  assert.match(app, /VIEW_ALIASES[\s\S]*providers: "ai"/);
  assert.match(app, /VIEW_ALIASES[\s\S]*provider: "ai"/);
  assert.match(html, /id="ai"/);
});

test("app navigation uses clean paths instead of hash routes", () => {
  assert.doesNotMatch(app, /location\.hash\s*=/);
  assert.doesNotMatch(app, /location\.search\}\s*#\$\{resolvedViewId\}/);
  assert.doesNotMatch(app, /chat: "\/chat"/);
  assert.match(app, /start:\s*"\/"/);
  assert.doesNotMatch(app, /start:\s*"\/home"/);
  for (const route of ["/profile", "/settings", "/projects", "/storage", "/ai"]) {
    assert.match(app, new RegExp(route.replace("/", "\\/")));
  }
});

test("buttons declare an explicit type", () => {
  const buttons = Array.from(html.matchAll(/<button\b[^>]*>/g)).map((match) => match[0]);
  const missingType = buttons.filter((button) => !/\stype=/.test(button));
  assert.deepEqual(missingType, []);
});

test("file upload advertises the same safe text-first formats that runtime validation allows", () => {
  assert.match(html, /id="upload"[^>]*accept="[^"]*application\/json[^"]*image\/svg\+xml[^"]*"/);
  assert.match(app, /maxBytes: 1_000_000/);
  assert.match(app, /allowedTypes: new Set/);
});

test("Codex-like settings stay modular, local-first and outside the protected start view", () => {
  for (const label of ["Allgemein", "Darstellung", "Verhalten", "Modelle", "Personalisierung", "Coding", "Berechtigungen", "Mitteilungen", "Speicher & Sync", "Erweitert"]) {
    assert.match(settingsSurface, new RegExp(label.replace("&", "&")));
  }
  assert.match(settingsSurface, /localStorage\.setItem\(STORAGE_KEYS\.settings/);
  assert.match(settingsSurface, /GLM-5\.2 bleibt das Qualitätsfundament/);
  assert.match(settingsSurface, /Netzwerkzugriff für Aufgaben/);
  assert.match(settingsStyles, /#settings \.settings-shell/);
  assert.doesNotMatch(settingsStyles, /#start|\.prompt-glass|\.home-feed/);
  assert.match(premiumSurfaces, /initSettingsSurface\(\)/);
  assert.match(sw, /settings-surface\.js/);
  assert.match(sw, /settings-surface\.css/);
});

test("settings preferences actively control non-start presentation and task contracts", () => {
  assert.match(settingsRuntime, /\.view:not\(#start\)/);
  assert.match(settingsRuntime, /taskPreferences/);
  assert.match(settingsRuntime, /buildPreferenceBlock/);
  assert.match(settingsRuntime, /autonomousNetworkAllowed/);
  assert.match(settingsRuntime, /Notification\.permission !== "granted"/);
  assert.match(settingsRuntime, /location\.pathname !== "\/"/);
  assert.doesNotMatch(settingsStyles, /#start|\.prompt-glass|\.home-feed/);
  // Stufe 1c: app.js merged Settings-Praeferenzen mit dem Sprachmodus-Flag.
  assert.match(app, /preferences: \{ \.\.\.\(window\.smejjSettingsRuntime\?\.task\?\.\(\) \|\| \{\}\), \.\.\.\(window\.smejjVoiceModePreferences \|\| \{\}\) \}/);
  assert.match(autonomousCoding, /preferences: window\.smejjSettingsRuntime/);
  assert.match(sw, /settings-runtime\.js/);
});

test("account and privacy center exports no secrets and keeps destructive actions confirmed", () => {
  for (const label of ["Profil", "Anmeldung & Sicherheit", "Datenschutz", "Berechtigungen", "Daten"]) assert.match(accountPrivacy, new RegExp(label.replace("&", "&")));
  assert.match(accountPrivacy, /secretsIncluded: false/);
  assert.match(accountPrivacy, /window\.confirm/);
  assert.match(accountPrivacy, /serverConsentGranted: false/);
  assert.match(accountPrivacy, /Training bleibt fail-closed/);
  assert.doesNotMatch(accountPrivacy, /sessionStorage\.getItem|apiToken|Authorization/);
  assert.match(premiumSurfaces, /initAccountPrivacySurface\(\)/);
  assert.match(sw, /account-privacy\.js/);
  assert.match(sw, /account-privacy\.css/);
});

test("all non-start surfaces share the protected start view design language", () => {
  const accountStyles = fs.readFileSync("public/account-privacy.css", "utf8");
  assert.match(premiumStyles, /Unified non-start design/);
  assert.match(premiumStyles, /\.premium-view \{[\s\S]*--premium-surface: #101216/);
  assert.match(premiumStyles, /\.premium-view \.toolbar,[\s\S]*border-radius: 8px/);
  assert.match(premiumStyles, /body:has\(\.premium-view\.is-active\) \.sidebar/);
  assert.match(settingsStyles, /Settings inherit the quiet, square geometry/);
  assert.match(settingsStyles, /#settings \.settings-list \{[\s\S]*border-radius:8px/);
  assert.match(premiumStyles, /\.premium-view\[data-settings-theme="light"\] \{[\s\S]*repeating-linear-gradient/);
  assert.match(settingsStyles, /#settings\.premium-view\[data-settings-theme="light"\] \.settings-nav-button\.is-active/);
  assert.match(accountStyles, /#profile \.account-list \{[\s\S]*border-radius: 8px/);
  assert.doesNotMatch(settingsStyles, /#start|\.prompt-glass|\.home-feed/);
  assert.doesNotMatch(accountStyles, /#start|\.prompt-glass|\.home-feed/);
});

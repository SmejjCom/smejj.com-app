import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const composerTools = fs.readFileSync("public/composer-tools.js", "utf8");
const composerCss = fs.readFileSync("public/composer-tools.css", "utf8");
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

test("central UI component roots and module exist", () => {
  assert.match(html, /id="toastRoot"/);
  assert.match(html, /id="modalRoot"/);
  assert.match(app, /from "\.\/components\.js(\?[^"]*)?"/);
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
  assert.match(app, /runClientChat/);
  assert.match(app, /chat: "start"/);
  assert.match(app, /chat: "\/"/);
  assert.match(app, /"\/chat": "start"/);
  assert.doesNotMatch(app, /function bindChat/);
  assert.doesNotMatch(app, /bindChat\(\)/);
  assert.doesNotMatch(app, /goToView\("chat"\);\n\s*await submitTask\(task\)/);
  assert.doesNotMatch(html, /#start[\s\S]*data-jump="chat"/);
});

test("start composer lower tools are functional", () => {
  assert.match(html, /data-start-tool="voice"/);
  assert.match(html, /data-start-tool="audio"/);
  assert.match(html, /data-start-tool="speaker"/);
  assert.match(app, /import \{ initComposerTools \} from "\.\/composer-tools\.js(\?[^"]*)?"/);
  assert.ok(app.includes('initComposerTools()'));
  assert.ok(composerTools.includes('window.SpeechRecognition || window.webkitSpeechRecognition'));
  assert.ok(composerTools.includes('SpeechSynthesisUtterance'));
  assert.ok(composerTools.includes('lastAssistantEntryText()'));
  assert.ok(composerCss.includes('[data-start-tool="speaker"].is-speaking'));
  assert.doesNotMatch(app, /Kommt als naechstes/);
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

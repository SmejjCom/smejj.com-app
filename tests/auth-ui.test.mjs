import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
// Seit der Aufteilung vom 2026-07-28 liegen die Ansichtstabellen in
// public/view-routes.js. Geprueft wird weiterhin dieselbe Zusage.
const app = fs.readFileSync("public/app.js", "utf8")
  + fs.readFileSync("public/view-routes.js", "utf8")
  + fs.readFileSync("public/google-login.js", "utf8")
  + fs.readFileSync("public/projects-surface.js", "utf8")
  + fs.readFileSync("public/local-workspace-surface.js", "utf8");
const server = fs.readFileSync("src/server.js", "utf8");
const googleAuth = fs.readFileSync("src/auth/googleAuth.js", "utf8");
// rc2 (2026-07-15, freigegeben): Google-Login-Routen verhaltensgleich aus
// src/server.js nach src/auth/googleAuthRoutes.js ausgelagert — der
// Redirect-Fallback-Vertrag wird seitdem dort geprueft.
const googleAuthRoutes = fs.readFileSync("src/auth/googleAuthRoutes.js", "utf8");
const passkeyUi = fs.readFileSync("public/auth/passkey-ui.js", "utf8");
const autonomousCoding = fs.readFileSync("public/autonomous-coding.js", "utf8");

test("login page exposes session and logout controls", () => {
  for (const id of ["profile", "loginLocal", "logoutLocal", "sessionStatus", "userRoleStatus", "projectRightsStatus"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
});

test("project management controls cover open, save, export, import and confirmed delete", () => {
  for (const id of ["projectSelect", "projectOpen", "projectSave", "projectExport", "projectImport", "projectDelete", "projectImportFile"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(app, /window\.confirm/);
  assert.match(app, /deleteProject\([^)]*confirmed/);
});

test("UI keeps BYOK and session state separated", () => {
  assert.match(app, /STORAGE_KEYS\.session/);
  assert.match(app, /saveLocalProfileManifest/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^,]+byokKey/i);
});

test("Google login uses popup callback flow without redirect URI registration", () => {
  assert.match(app, /callback: \(antwort\) => handleGoogleCredential\(antwort, deps\)|callback: handleGoogleCredential/);
  assert.match(app, /ux_mode: "popup"/);
  assert.match(app, /use_fedcm_for_button: true/);
  assert.match(app, /use_fedcm_for_prompt: true/);
  assert.match(app, /google\.accounts\.id\.prompt/);
  assert.match(app, /renderFallbackButton/);
  assert.match(app, /Google Login im Hauptfenster/);
  assert.match(app, /CLIENT_ROUTES\.api\.authGoogle\}\?mode=redirect/);
  assert.doesNotMatch(app, /login_uri:/);
  assert.match(app, /postJson\(CLIENT_ROUTES\.api\.authGoogle/);
});

test("Google login fails closed when the public Control Server is offline", () => {
  assert.match(app, /Google Login: Control Server ist noch nicht online\./);
  assert.match(app, /Google Login wartet auf den Control Server\./);
  // Seit dem gemeinsamen /api/auth/me-Speicher (2026-08-23) laeuft der Abruf
  // ueber authMeSpeicher.hole(...) — der .catch sitzt auf der Kette dahinter.
  assert.match(app, /authMeSpeicher\.hole\(\(\) => getJson\(CLIENT_ROUTES\.api\.authMe\)\)\s*\n?\s*\.catch/);
});

test("Google login has signed redirect fallback for browsers that block GIS popup token return", () => {
  assert.match(googleAuthRoutes, /response_type", "id_token"/);
  assert.match(googleAuthRoutes, /response_mode", "form_post"/);
  assert.match(googleAuthRoutes, /login_hint"/);
  assert.match(googleAuthRoutes, /verifyGoogleAuthState/);
  assert.match(googleAuthRoutes, /body\.credential \|\| body\.idToken/);
  assert.match(googleAuth, /payload\.nonce !== expectedNonce/);
  assert.match(googleAuth, /timingSafeEqual/);
});

test("authenticated Control session handoff keeps the bearer token session-only", () => {
  assert.match(server, /ROUTES\.api\.authSessionToken/);
  assert.match(server, /tokenStorage: "session-only"/);
  assert.match(passkeyUi, /session-handoff/);
  assert.match(passkeyUi, /session-handoff\/complete/);
  assert.match(passkeyUi, /window\.opener\?\.postMessage/);
  assert.match(autonomousCoding, /session-handoff\/start/);
  assert.match(autonomousCoding, /session-handoff\/complete\?handoffId=/);
  assert.match(autonomousCoding, /pollSessionHandoff/);
  assert.doesNotMatch(passkeyUi, /api\/auth\/session-token/);
  assert.match(passkeyUi, /sessionStorage\.setItem\(API_TOKEN_KEY/);
  assert.doesNotMatch(passkeyUi, /localStorage\.setItem\(API_TOKEN_KEY/);
  assert.doesNotMatch(autonomousCoding, /accessToken=.*(?:location|URL|searchParams)/);
});

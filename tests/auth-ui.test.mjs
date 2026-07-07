import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const server = fs.readFileSync("src/server.js", "utf8");

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
  assert.match(app, /callback: handleGoogleCredential/);
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
  assert.match(app, /getJson\(CLIENT_ROUTES\.api\.authMe\)\.catch/);
});

test("Google login has signed redirect fallback for browsers that block GIS popup token return", () => {
  for (const source of [server]) {
    assert.match(source, /response_type", "id_token"/);
    assert.match(source, /response_mode", "form_post"/);
    assert.match(source, /login_hint"/);
    assert.match(source, /verifyGoogleAuthState/);
    assert.match(source, /payload\.nonce !== expectedNonce/);
    assert.match(source, /body\.credential \|\| body\.idToken/);
  }
});

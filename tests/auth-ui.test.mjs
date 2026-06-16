import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");

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

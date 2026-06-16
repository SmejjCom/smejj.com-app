import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("release preflight stays local and non-deploying", () => {
  const command = packageJson.scripts["release:preflight"] || "";
  assert.match(command, /check:all/);
  assert.match(command, /release:guard/);
  assert.doesNotMatch(command, /\bnpx\b/i);
  assert.doesNotMatch(command, /wrangler\s+deploy/i);
  assert.doesNotMatch(command, /pages\s+deploy/i);
  assert.doesNotMatch(command, /idrive:artifact/i);
});

test("IDrive deployment artifact upload requires explicit written-release gate", () => {
  const result = spawnSync(process.execPath, ["scripts/model-management/upload_project_artifact_to_idrive.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONFIRM_IDRIVE_ARTIFACT_UPLOAD: "NO"
    },
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to upload deployment artifact/);
});

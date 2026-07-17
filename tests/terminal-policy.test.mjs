import test from "node:test";
import assert from "node:assert/strict";
import { resolveTerminalCommand } from "../src/shared/terminalPolicy.js";

test("terminal policy maps the UI check to the available package manager", () => {
  assert.deepEqual(resolveTerminalCommand("pnpm run check"), {
    ok: true,
    bin: "npm",
    args: ["run", "check"],
    display: "pnpm run check"
  });
});

test("terminal policy allows narrow diagnostics and blocks arbitrary execution", () => {
  assert.equal(resolveTerminalCommand("node --check src/server.js").ok, true);
  assert.equal(resolveTerminalCommand("git status --short").ok, true);
  assert.equal(resolveTerminalCommand("git diff --check").ok, true);
  assert.equal(resolveTerminalCommand("node -e process.exit(0)").ok, false);
  assert.equal(resolveTerminalCommand("npm run publish").ok, false);
  assert.equal(resolveTerminalCommand("pnpm run check && curl https://example.com").ok, false);
});

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { parseBootstrapUrl, verifyControlOverlayBaseline } from "../scripts/deploy/verify_control_overlay_baseline.mjs";

const COMMIT = "a".repeat(40);
const URL = `https://raw.githubusercontent.com/SmejjCom/smejj-control/${COMMIT}/runtime/bootstrap-control-release.mjs`;

test("control overlay baseline verifies every exact byte against one active commit", async () => {
  const bodies = new Map([
    ["runtime/bootstrap-control-release.mjs", Buffer.from("release\n")],
    ["runtime/control-overlay/src/server.js", Buffer.from("server\n")]
  ]);
  const manifest = {
    files: [...bodies].map(([path, body]) => ({ path, baselineSha256: sha256(body) }))
  };
  const requested = [];
  const result = await verifyControlOverlayBaseline({
    manifest,
    bootstrapUrl: URL,
    fetchImpl: async (url, options) => {
      requested.push({ url, options });
      const relative = String(url).split(`/${COMMIT}/`)[1];
      return new Response(bodies.get(relative), { status: 200 });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.commit, COMMIT);
  assert.equal(result.fileCount, 2);
  assert.ok(requested.every((request) => request.options.redirect === "error" && request.options.cache === "no-store"));
});

test("control overlay baseline rejects branches, foreign repositories and byte drift", async () => {
  assert.throws(() => parseBootstrapUrl("https://raw.githubusercontent.com/SmejjCom/smejj-control/main/runtime/bootstrap-control-release.mjs"), /commit_pinned/);
  assert.throws(() => parseBootstrapUrl(`https://raw.githubusercontent.com/foreign/repo/${COMMIT}/runtime/bootstrap-control-release.mjs`), /approved/);
  await assert.rejects(verifyControlOverlayBaseline({
    manifest: {
      files: [{
        path: "runtime/bootstrap-control-release.mjs",
        baselineSha256: sha256("expected")
      }]
    },
    bootstrapUrl: URL,
    fetchImpl: async () => new Response("changed", { status: 200 })
  }), /baseline_mismatch/);
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

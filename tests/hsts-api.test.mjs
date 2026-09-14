// HSTS auf api.smejj.com (Sicherheitspruefung 14.09.2026): nur hinter dem HTTPS-Proxy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("server.js setzt Strict-Transport-Security nur bei x-forwarded-proto https", () => {
  const q = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const zeile = q.split("\n").find((z) => z.includes("setHeader(\"Strict-Transport-Security\""));
  assert.ok(zeile, "HSTS-Zeile fehlt");
  assert.match(zeile, /x-forwarded-proto/);
  assert.match(zeile, /=== "https"/);
  assert.match(zeile, /max-age=\d{7,}/);
  assert.doesNotMatch(zeile, /includeSubDomains|preload/, "nur dieser Host, kein Preload");
});

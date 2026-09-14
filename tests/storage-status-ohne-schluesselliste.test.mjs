// /api/storage/status gibt angemeldeten Nutzern keine Objektschluessel-Liste mehr (E2E-Sicherheitspruefung 14.09.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("handleStorageStatus liefert objectCount, aber keine keys-Liste", () => {
  const q = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const start = q.indexOf("async function handleStorageStatus(");
  const koerper = q.slice(start, q.indexOf("\n}\n", start));
  assert.match(koerper, /objectCount: keys\.length,/);
  assert.doesNotMatch(koerper, /^\s+keys,\s*$/m, "keine Schluesselliste in der Antwort");
});

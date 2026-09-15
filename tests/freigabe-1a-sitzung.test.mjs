// Freigabe 1a (Betreiber, 2026-09-15): dauerhafte Sitzungen 30 Tage statt 10 Jahre,
// Token UND Cookie gleitend erneuert — aktive Nutzer bleiben angemeldet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const lies = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Cookie dauerhafter Sitzungen: Max-Age 30 Tage", () => {
  const q = lies("src/server-session-helpers.js");
  assert.match(q, /user\?\.method === "google" \? 2592000 : 604800/);
  assert.doesNotMatch(q, /315360000/);
});

test("session-token erneuert das Cookie dauerhafter Sitzungen, /me das Token", () => {
  const q = lies("src/server.js");
  const st = q.slice(q.indexOf("function handleAuthSessionToken"), q.indexOf("function handleAuthSessionToken") + 900);
  assert.match(st, /res\.setHeader\("Set-Cookie", serializeSessionCookie\(user\)\)/);
  assert.match(st, /user\.kind !== "access"/, "Kurzzeit-Token erneuert kein Cookie");
  const me = q.slice(q.indexOf("async function handleAuthMe"), q.indexOf("async function handleAuthMe") + 800);
  assert.match(me, /accessToken: serializeAccessToken\(user\)/);
});

// smejj.com — Schutztest fuer die Content-Security-Policy (QA-Welle 1, Befund F-04).
//
// Hintergrund: GitHub Pages Free kann keine eigenen HTTP-Header setzen, deshalb steht
// die CSP als <meta http-equiv> in public/index.html. Damit entsteht eine Falle: Wer
// in config.js oder securityPolicy.js einen Endpunkt aendert, ohne die CSP
// nachzuziehen, bricht die App — der Browser blockiert die Verbindung stillschweigend.
// Genau das faengt dieser Test ab. Er ist absichtlich streng: lieber ein roter Test
// als eine Website, die beim Nutzer keine Antwort mehr bekommt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const config = fs.readFileSync("public/config.js", "utf8");
const policy = fs.readFileSync("public/shared/securityPolicy.js", "utf8");

const cspMatch = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i);

test("index.html traegt eine Content-Security-Policy", () => {
  assert.ok(cspMatch, "Keine CSP-Meta-Angabe in public/index.html gefunden.");
});

test("die CSP verbietet Inline-Skripte und fremde Einbettung von Objekten", () => {
  const csp = cspMatch[1];
  assert.match(csp, /script-src 'self'/, "script-src muss auf 'self' begrenzt bleiben.");
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, "Inline-Skripte duerfen nicht erlaubt sein.");
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-eval/, "eval darf nicht erlaubt sein.");
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
});

test("index.html enthaelt weiterhin kein ausfuehrbares Inline-Skript und keinen Inline-Style", () => {
  // Ohne diese Zusicherung waere script-src 'self' nicht durchhaltbar.
  // JSON-LD (type="application/ld+json") ist ausgenommen: Der Browser fuehrt es
  // nicht aus, CSP behandelt es als Datenblock und script-src greift dort nicht.
  const inlineSkripte = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/gi)]
    .map((m) => m[1])
    .filter((attribute) => !/type\s*=\s*"application\/ld\+json"/i.test(attribute));
  assert.deepEqual(inlineSkripte, [],
    "Ausfuehrbares Inline-<script> gefunden — es wuerde von der eigenen CSP blockiert.");
  assert.doesNotMatch(html, /<style[^>]*>/i, "Inline-<style> gefunden.");
});

test("jeder Host aus config.js steht in connect-src", () => {
  const csp = cspMatch[1];
  const hosts = [...new Set((config.match(/https:\/\/[a-z0-9.-]+/gi) || []))];
  assert.ok(hosts.length > 0, "In config.js wurde kein einziger Host gefunden — Test pruefte ins Leere.");
  for (const host of hosts) {
    assert.ok(csp.includes(host),
      `Host ${host} steht in public/config.js, fehlt aber in der connect-src der CSP in public/index.html. ` +
      `Ohne Eintrag blockiert der Browser die Verbindung.`);
  }
});

test("jeder erlaubte BYOK-Host steht in connect-src", () => {
  const csp = cspMatch[1];
  const block = policy.match(/ALLOWED_BYOK_HOSTS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(block, "ALLOWED_BYOK_HOSTS nicht gefunden.");
  const hosts = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hosts.length > 0);
  for (const host of hosts) {
    assert.ok(csp.includes(host),
      `BYOK-Host ${host} aus securityPolicy.js fehlt in der connect-src der CSP.`);
  }
});

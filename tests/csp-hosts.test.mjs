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
import crypto from "node:crypto";

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
  // AUSNAHME seit dem Kaltstart-Umbau (Betreiber-Freigabe 25.08., "Ja,
  // freigegeben"): GENAU EIN Inline-Skript — das fruehe Tor. Es ist per
  // sha256-Hash in script-src erlaubt; Rumpf und Hash werden hier BEIDE
  // gegen public/auth-gate-frueh.js geprueft. Jedes weitere Inline-Skript
  // bleibt verboten und wuerde von der CSP blockiert.
  const inlineSkripte = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type\s*=\s*"application\/ld\+json"/i.test(m[1]));
  assert.equal(inlineSkripte.length, 1, "genau EIN Inline-Skript (das fruehe Tor) ist erlaubt");
  const gate = fs.readFileSync("public/auth-gate-frueh.js", "utf8");
  assert.equal(inlineSkripte[0][2], gate, "der Inline-Rumpf ist byte-gleich public/auth-gate-frueh.js");
  const hash = crypto.createHash("sha256").update(gate, "utf8").digest("base64");
  assert.ok(cspMatch[1].includes(`'sha256-${hash}'`), "der CSP-Hash passt zum Inline-Rumpf");
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

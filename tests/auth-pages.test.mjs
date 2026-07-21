import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("auth pages expose honest professional sign-in paths", async () => {
  const [login, register, css, js] = await Promise.all([
    text("public/auth/login/index.html"),
    text("public/auth/register/index.html"),
    text("public/auth/auth.css"),
    text("public/auth/auth-page.js")
  ]);
  for (const page of [login, register]) {
    assert.match(page, /smejj\.com/);
    assert.match(page, /googleLogin/);
    assert.match(page, /appleLogin/);
    assert.match(page, /githubLogin/);
    assert.match(page, /magicLinkLogin/);
    assert.match(page, /passkey/);
    assert.match(page, /noindex, nofollow/);
    assert.match(page, /href="\/assets\/auth\/auth\.css(\?v=[^"]*)?"/);
    assert.match(page, /src="\/assets\/auth\/auth-page\.js(\?v=[^"]*)?"/);
  }
  // Codex-Stil (Freigabe 2026-07-21): E-Mail zuerst, grosse Knoepfe, beide Themes.
  assert.match(login, /Willkommen zurück/);
  assert.match(register, /Konto erstellen/);
  assert.match(css, /auth-card/);
  assert.match(css, /prefers-color-scheme: light/);
  assert.match(css, /--auth-accent/);
  assert.match(css, /\.auth-button \{[\s\S]*width: 100%/);
  assert.doesNotMatch(css, /#657cff|#8056df|#6d4cff/);
  assert.match(js, /authConfig/);
  assert.match(js, /Apple-OAuth-Konfiguration/);
  assert.doesNotMatch(login, /<script[^>]+src="\/app\.js"/);
  assert.doesNotMatch(register, /<script[^>]+src="\/app\.js"/);
});

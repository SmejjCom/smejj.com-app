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
    assert.match(page, /passkey/);
    assert.match(page, /noindex, nofollow/);
    assert.match(page, /href="\/assets\/auth\/auth\.css"/);
    assert.match(page, /src="\/assets\/auth\/auth-page\.js(\?v=[^"]*)?"/);
  }
  assert.match(css, /auth-card/);
  assert.match(css, /linear-gradient\(180deg, rgba\(15, 17, 18, 0\.97\)/);
  assert.match(css, /\.auth-card \{[\s\S]*border-radius: 8px/);
  assert.doesNotMatch(css, /#657cff|#8056df|#6d4cff/);
  assert.match(js, /authConfig/);
  assert.match(js, /Apple-OAuth-Konfiguration/);
  assert.doesNotMatch(login, /<script[^>]+src="\/app\.js"/);
  assert.doesNotMatch(register, /<script[^>]+src="\/app\.js"/);
});

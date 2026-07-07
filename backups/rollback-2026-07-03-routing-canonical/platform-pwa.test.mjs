import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));

test("PWA manifest is install-ready for mobile shells", () => {
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /mobile-web-app-capable/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test("service worker caches only small app shell assets and has offline fallback", () => {
  assert.match(sw, /CACHE_NAME = "smejj-shell-v69"/);
  assert.match(sw, /cache\.addAll\(SHELL\.map\(\(url\) => new Request\(url, \{ cache: "reload" \}\)\)\)/);
  assert.match(sw, /fetch\(request\)\.catch/);
  assert.match(sw, /caches\.match\("\/"\)/);
  assert.doesNotMatch(sw, /model-files|\.gguf|\.safetensors|workers-ai|cloudflare-r2/i);
});

test("browser history and reload deep links are wired for app navigation", () => {
  assert.match(app, /pushState/);
  assert.match(app, /replaceState/);
  assert.match(app, /popstate/);
  assert.match(app, /restoreViewFromUrl/);
});

test("mobile and tablet breakpoints keep layouts single-column on small screens", () => {
  assert.match(css, /@media \(max-width: 920px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /touch-action: manipulation/);
});

test("no automatic model or paid provider downloads are wired into public assets", () => {
  const publicFiles = fs.readdirSync("public", { recursive: true })
    .filter((file) => fs.statSync(path.join("public", file)).isFile());
  for (const file of publicFiles) {
    const fullPath = path.join("public", file);
    const size = fs.statSync(fullPath).size;
    assert.ok(size < 512 * 1024, `${file} is unexpectedly large`);
    if (/\.(js|html|css|txt|webmanifest|svg)$/.test(file)) {
      const text = fs.readFileSync(fullPath, "utf8");
      assert.doesNotMatch(text, /fetch\([^)]*(workers-ai|cloudflare-r2|trial-api|auto-billing|\.gguf|\.safetensors)/i, `${file} contains forbidden provider autoload`);
      assert.doesNotMatch(text, /import\([^)]*(\.gguf|\.safetensors|model-files)/i, `${file} imports model files`);
    }
  }
});

test("public assets include imported browser modules", () => {
  for (const file of [
    "public/storage/index.js",
    "public/storage/localWorkspace.js",
    "public/ai/index.js",
    "public/ai/router.js",
    "public/shared/securityPolicy.js"
  ]) {
    assert.ok(fs.existsSync(file), `missing public module ${file}`);
  }
});

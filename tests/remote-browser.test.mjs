import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable } from "node:stream";
import { buildRemoteBrowserHtml, isRemoteScreenshot } from "../public/browser-pane.js";
import { buildRemoteBrowserPlan, handleBrowserRemote, readRemoteBrowserConfig, remoteBrowserViewportFromUrl, sanitizeCapture, sanitizeLinks } from "../control-server/src/routes/browserRemoteRoutes.js";
import { buildPageOptions, createServer, isAllowedTarget, isAuthorized, renderWithPlaywright } from "../workers/remote-browser/worker.js";
import { createRateLimiter } from "../control-server/src/http/rateLimiter.js";

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.statusCode = status; this.headers = { ...this.headers, ...headers }; },
    end(body) { if (body) this.chunks.push(String(body)); }
  };
}

function payload(res) {
  return JSON.parse(res.chunks.join(""));
}

test("remote browser config is fail-closed by default", () => {
  const config = readRemoteBrowserConfig({});
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, [
    "SMEJJ_REMOTE_BROWSER_ENABLED=YES",
    "SMEJJ_REMOTE_BROWSER_WORKER_URL",
    "SMEJJ_REMOTE_BROWSER_TOKEN"
  ]);
  assert.equal(config.tokenPresent, false);
});

test("remote browser plan requires config and budget gate", () => {
  const plan = buildRemoteBrowserPlan({
    env: {
      SMEJJ_REMOTE_BROWSER_ENABLED: "YES",
      SMEJJ_REMOTE_BROWSER_WORKER_URL: "https://remote.salad.cloud",
      SMEJJ_REMOTE_BROWSER_TOKEN: "secret"
    }
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.startsCompute, false);
  assert.equal(plan.secretsInBrowser, false);
  assert.ok(plan.budget.reasons.some((reason) => reason.startsWith("budget_limit_missing")));
});

test("handleBrowserRemote returns 503 until worker and budget are explicitly configured", async () => {
  const res = fakeRes();
  await handleBrowserRemote(new URL("https://smejj.com/api/browser/remote?url=https%3A%2F%2Fexample.com"), res, {
    req: { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.55" } },
    env: {},
    fetchImpl: async () => { throw new Error("must not call worker"); }
  });
  assert.equal(res.statusCode, 503);
  assert.equal(payload(res).remote, false);
});

test("handleBrowserRemote calls worker with bearer token when budget approves", async () => {
  const res = fakeRes();
  const calls = [];
  await handleBrowserRemote(new URL("https://smejj.com/api/browser/remote?url=https%3A%2F%2Fexample.com&viewportWidth=720&viewportHeight=840"), res, {
    req: { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.56" } },
    env: {
      SMEJJ_REMOTE_BROWSER_ENABLED: "YES",
      SMEJJ_REMOTE_BROWSER_WORKER_URL: "https://remote.salad.cloud",
      SMEJJ_REMOTE_BROWSER_TOKEN: "secret",
      SMEJJ_BUDGET_MAX_USD_PER_JOB: "1",
      SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "10",
      SMEJJ_WORKER_BUDGET_USD: "0.05",
      SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "2"
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        ok: true,
        finalUrl: "https://example.com/",
        title: "Example",
        screenshot: "data:image/png;base64,abc"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(payload(res).remote, true);
  assert.deepEqual(payload(res).viewport, { width: 720, height: 840 });
  assert.equal(calls[0].url, "https://remote.salad.cloud/render");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(calls[0].options.body).viewport, { width: 720, height: 840 });
});

test("remote browser viewport follows the panel size with safe bounds", () => {
  assert.deepEqual(remoteBrowserViewportFromUrl(new URL("https://smejj.com/api/browser/remote?viewportWidth=412&viewportHeight=733")), {
    width: 412,
    height: 733
  });
  assert.deepEqual(remoteBrowserViewportFromUrl(new URL("https://smejj.com/api/browser/remote?viewportWidth=10&viewportHeight=5000")), {
    width: 360,
    height: 1200
  });
  assert.deepEqual(remoteBrowserViewportFromUrl(new URL("https://smejj.com/api/browser/remote")), {
    width: 1365,
    height: 900
  });
});

test("handleBrowserRemote keeps origin, SSRF and rate limits", async () => {
  const foreign = fakeRes();
  await handleBrowserRemote(new URL("https://smejj.com/api/browser/remote?url=https%3A%2F%2Fexample.com"), foreign, {
    req: { headers: { origin: "https://evil.example" } }
  });
  assert.equal(foreign.statusCode, 403);

  const local = fakeRes();
  await handleBrowserRemote(new URL("https://smejj.com/api/browser/remote?url=http%3A%2F%2F127.0.0.1%2F"), local, {
    req: { headers: { origin: "https://smejj.com" } }
  });
  assert.equal(local.statusCode, 400);

  const limiter = createRateLimiter({ capacity: 1, refillPerSec: 0.001 });
  limiter.take("203.0.113.57");
  const limited = fakeRes();
  await handleBrowserRemote(new URL("https://smejj.com/api/browser/remote?url=https%3A%2F%2Fexample.com"), limited, {
    req: { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.57" } },
    limiter
  });
  assert.equal(limited.statusCode, 429);
});

test("remote worker validates auth and private targets", async () => {
  assert.equal(isAllowedTarget("https://example.com").ok, true);
  assert.equal(isAllowedTarget("http://localhost:3000").ok, false);
  assert.equal(isAuthorized({ headers: { authorization: "Bearer secret" } }, "secret"), true);
  assert.equal(isAuthorized({ headers: { authorization: "Bearer nope" } }, "secret"), false);
});

test("remote worker rejects special-use and IPv4-mapped DNS answers before Chromium starts", async () => {
  for (const address of [
    "192.0.2.10",
    "198.51.100.10",
    "203.0.113.10",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "::ffff:127.0.0.1"
  ]) {
    let browserLoads = 0;
    await assert.rejects(() => renderWithPlaywright({
      url: "https://example.com",
      dnsLookup: async () => [{ address }],
      playwrightLoader: async () => { browserLoads += 1; throw new Error("must_not_load"); }
    }), /blocked_remote_browser_host/);
    assert.equal(browserLoads, 0);
  }
});

test("remote worker accepts public IPv6 DNS answers", async () => {
  let browserLoads = 0;
  await assert.rejects(() => renderWithPlaywright({
    url: "https://example.com",
    dnsLookup: async () => [
      { address: "93.184.216.34" },
      { address: "2606:4700:4700::1111" }
    ],
    playwrightLoader: async () => {
      browserLoads += 1;
      throw new Error("public_ipv6_reached_browser_loader");
    }
  }), /public_ipv6_reached_browser_loader/);
  assert.equal(browserLoads, 1);
});

test("remote worker render contract can be tested without launching Chromium", async () => {
  let pageOptions = null;
  const result = await renderWithPlaywright({
    url: "https://example.com",
    viewport: { width: 412, height: 733 },
    dnsLookup: async () => [{ address: "93.184.216.34" }],
    playwrightLoader: async () => ({
      chromium: {
        launch: async () => ({
          newPage: async (options) => {
            pageOptions = options;
            return {
            setDefaultTimeout: () => {},
            goto: async () => ({ status: () => 200 }),
            waitForLoadState: async () => {},
            title: async () => "Example",
            url: () => "https://example.com/",
            screenshot: async () => Buffer.from("png")
            };
          },
          close: async () => {}
        })
      }
    })
  });
  assert.equal(result.ok, true);
  // JPEG haelt Full-Page-Captures klein; ohne evaluate-Faehigkeit im Mock
  // faellt die Capture-Hoehe sicher auf den Viewport zurueck (fail-open).
  assert.equal(result.screenshot, "data:image/jpeg;base64,cG5n");
  assert.deepEqual(result.capture, { width: 412, height: 733 });
  assert.equal(result.pageHeight, 733);
  assert.deepEqual(result.links, []);
  assert.deepEqual(pageOptions.viewport, { width: 412, height: 733 });
  assert.equal(pageOptions.isMobile, true);
  assert.equal(pageOptions.hasTouch, true);
  assert.match(pageOptions.userAgent, /Mobile Safari/);
});

test("remote worker page options switch mobile by viewport width", () => {
  assert.equal(buildPageOptions({ width: 390, height: 844 }).isMobile, true);
  assert.equal(buildPageOptions({ width: 900, height: 700 }).isMobile, false);
  assert.equal(buildPageOptions({ width: 390, height: 844 }).deviceScaleFactor, 1);
});

test("remote worker HTTP handler returns mocked render result", async () => {
  const server = createServer({
    token: "secret",
    renderer: async (body) => ({ ok: true, finalUrl: body.url, title: "ok", screenshot: "data:image/png;base64,abc" })
  });
  const req = Readable.from([JSON.stringify({ url: "https://example.com" })]);
  req.method = "POST";
  req.url = "/render";
  req.headers = { authorization: "Bearer secret", "content-type": "application/json" };
  const res = fakeRes();
  await server.listeners("request")[0](req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(payload(res).ok, true);
});

test("frontend knows remote browser route and screenshot shell", () => {
  const config = fs.readFileSync("public/config.js", "utf8");
  const pane = fs.readFileSync("public/browser-pane.js", "utf8");
  assert.match(config, /browserRemote:\s*"https:\/\/loganberry-fruit-e3n6k5n10h68cawn\.salad\.cloud\/api\/browser\/remote"/);
  // Salad-Abloesung abgeschlossen: Zeabur primaer (Groq-Key dort), Salad Reserve.
  assert.match(config, /agent:\s*"https:\/\/smejj-chat-bridge\.zeabur\.app\/api\/agent"/);
  assert.match(config, /agentFallback:\s*"https:\/\/starfruit-thyme-cblgn6u06ca2z9d5\.salad\.cloud\/api\/agent"/);
  assert.match(pane, /CLIENT_ROUTES\.api\.browserRemote/);
  assert.match(pane, /viewportWidth/);
  assert.match(pane, /viewportHeight/);
  assert.match(pane, /mode:\s*"remote-browser"/);
  const html = buildRemoteBrowserHtml({
    url: "https://example.com",
    title: "Example",
    screenshot: "data:image/png;base64,abc"
  });
  assert.match(html, /bp-remote-browser/);
  assert.match(html, /Remote-Browser/);
  assert.match(html, /data:image\/png;base64,abc/);
});

test("Remote-Ansicht ist scrollbar und ohne schwarze Flaechen (Chrome-Massstab)", () => {
  const html = buildRemoteBrowserHtml({
    url: "https://example.com",
    title: "Example",
    screenshot: "data:image/jpeg;base64,abc",
    capture: { width: 1000, height: 4000 },
    links: [
      { href: "https://example.com/a", x: 100, y: 200, w: 300, h: 40 },
      { href: "javascript:alert(1)", x: 0, y: 0, w: 10, h: 10 }
    ]
  });
  // Nativer Scroll-Container: Mausrad, Trackpad, Touch, Space, PageUp/PageDown.
  assert.match(html, /bp-remote-scroll/);
  assert.match(html, /overflow:auto/);
  assert.match(html, /overscroll-behavior:contain/);
  assert.match(html, /tabindex="0"/);
  // Volle Bildbreite ohne object-fit:contain — keine schwarzen Raender.
  assert.doesNotMatch(html, /object-fit:contain/);
  assert.match(html, /width:100%;height:auto/);
  // Scrollposition wird gemeldet und wiederhergestellt.
  assert.match(html, /smejj\.browser\.scrollState/);
  assert.match(html, /smejj\.browser\.restoreScroll/);
  // Link-Hotspots: nur http(s), als prozentual positionierte Bereiche.
  assert.match(html, /data-nav="https:\/\/example\.com\/a"/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.match(html, /left:10\.000%;top:5\.000%;width:30\.000%;height:1\.000%/);
  // JPEG- und PNG-Screenshots werden akzeptiert, alles andere nicht.
  assert.equal(isRemoteScreenshot("data:image/jpeg;base64,abc"), true);
  assert.equal(isRemoteScreenshot("data:image/png;base64,abc"), true);
  assert.equal(isRemoteScreenshot("data:text/html;base64,abc"), false);
});

test("sanitizeLinks/sanitizeCapture: fail-closed gegen kaputte Worker-Antworten", () => {
  assert.deepEqual(sanitizeLinks(null), []);
  assert.deepEqual(sanitizeLinks([{ href: "javascript:x", x: 1, y: 1, w: 5, h: 5 }]), []);
  assert.deepEqual(sanitizeLinks([{ href: "https://ok.example/", x: 1, y: 2, w: 3, h: 4 }]), [
    { href: "https://ok.example/", x: 1, y: 2, w: 3, h: 4 }
  ]);
  assert.equal(sanitizeLinks(Array.from({ length: 500 }, () => ({ href: "https://ok.example/", x: 1, y: 1, w: 2, h: 2 }))).length, 200);
  assert.deepEqual(sanitizeCapture(null, { width: 1365, height: 900 }), { width: 1365, height: 900 });
  assert.deepEqual(sanitizeCapture({ width: 1000, height: 4000 }, { width: 1365, height: 900 }), { width: 1000, height: 4000 });
});

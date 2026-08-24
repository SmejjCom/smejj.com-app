// smejj.com — Tests fuer den Live-Browser (interaktive Remote-Sessions):
// Aktions-Validierung (fail-closed), Session-Lifecycle mit Fake-Playwright,
// SSRF-Schutz, Limits, Worker-HTTP-Routen, Control-Server-Bridge und
// Client-Shell. Kein Chromium noetig — alles laeuft gegen Mocks.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Readable } from "node:stream";
import {
  createSessionEngine,
  validateSessionAction,
  SESSION_ALLOWED_KEYS
} from "../workers/remote-browser/session-engine.js";
import { buildPageOptions, createServer, isAllowedTarget } from "../workers/remote-browser/worker.js";
import {
  handleBrowserSession,
  sanitizeSessionId,
  sanitizeSessionPayload,
  validateSessionRequest
} from "../control-server/src/routes/browserSessionRoutes.js";
import { createBrowserSessionClient } from "../public/browser-pane-session.js";
import { buildLiveBrowserHtml } from "../public/browser-pane-render.js";

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

// Minimaler Playwright-Fake: zeichnet alle Aktionen auf, liefert Screenshots.
function fakePlaywright(log = []) {
  const page = {
    currentUrl: "https://example.com/",
    setDefaultTimeout: () => {},
    goto: async (url) => { page.currentUrl = url; log.push(["goto", url]); return { status: () => 200 }; },
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    title: async () => "Example",
    url: () => page.currentUrl,
    screenshot: async () => Buffer.from("jpg"),
    mouse: {
      click: async (x, y, options) => log.push(["click", x, y, options]),
      wheel: async (dx, dy) => log.push(["wheel", dx, dy])
    },
    keyboard: {
      type: async (text) => log.push(["type", text]),
      press: async (key) => log.push(["press", key])
    },
    goBack: async () => log.push(["back"]),
    goForward: async () => log.push(["forward"]),
    reload: async () => log.push(["reload"])
  };
  const browser = { newPage: async () => page, close: async () => log.push(["browser-close"]) };
  return { chromium: { launch: async () => browser } };
}

function engineDeps(log = []) {
  return {
    isAllowedTarget,
    buildPageOptions,
    assertPublicHostname: async (hostname) => {
      if (hostname === "blocked.internal") throw new Error("blocked_remote_browser_host");
    },
    assertPublicRequest: async () => {},
    playwrightLoader: async () => fakePlaywright(log),
    dnsLookup: async () => [{ address: "93.184.216.34" }]
  };
}

test("validateSessionAction: fail-closed fuer alles Unbekannte", () => {
  assert.equal(validateSessionAction(null).ok, false);
  assert.equal(validateSessionAction({}).ok, false);
  assert.equal(validateSessionAction({ type: "evaluate", code: "1" }).ok, false);
  assert.equal(validateSessionAction({ type: "click", xPct: 120, yPct: 10 }).ok, false);
  assert.equal(validateSessionAction({ type: "click", xPct: "a", yPct: 10 }).ok, false);
  assert.equal(validateSessionAction({ type: "key", key: "F12" }).ok, false);
  assert.equal(validateSessionAction({ type: "key", key: "Meta" }).ok, false);
  assert.equal(validateSessionAction({ type: "type", text: "" }).ok, false);
  assert.equal(validateSessionAction({ type: "type", text: "a\u0000b" }).ok, false);
  assert.equal(validateSessionAction({ type: "type", text: "x".repeat(2001) }).ok, false);
  assert.equal(validateSessionAction({ type: "scroll", deltaY: 0 }).ok, false);
  assert.equal(validateSessionAction({ type: "navigate", url: "javascript:alert(1)" }).ok, false);
  assert.equal(validateSessionAction({ type: "navigate", url: "file:///etc/passwd" }).ok, false);
});

test("validateSessionAction: normalisiert gueltige Aktionen", () => {
  const click = validateSessionAction({ type: "click", xPct: 50.5, yPct: 10, button: "middle", clicks: 9 });
  assert.deepEqual(click, { ok: true, action: { type: "click", xPct: 50.5, yPct: 10, button: "left", clicks: 1 } });
  const scroll = validateSessionAction({ type: "scroll", deltaY: 99999 });
  assert.equal(scroll.action.deltaY, 4000);
  assert.equal(validateSessionAction({ type: "key", key: "Enter" }).ok, true);
  assert.equal(validateSessionAction({ type: "type", text: "hallo welt\n" }).ok, true);
  assert.equal(validateSessionAction({ type: "back" }).ok, true);
  assert.ok(SESSION_ALLOWED_KEYS.has("PageDown"));
});

test("Session-Engine: Lifecycle open -> act(click/type/scroll) -> close", async () => {
  const log = [];
  const engine = createSessionEngine({ ...engineDeps(log), maxSessions: 2 });
  const opened = await engine.open({ url: "https://example.com", viewport: { width: 1000, height: 800 } });
  assert.equal(opened.ok, true);
  assert.match(opened.sessionId, /^[a-f0-9]{32}$/);
  assert.equal(opened.screenshot, "data:image/jpeg;base64,anBn");
  assert.equal(opened.finalUrl, "https://example.com/");
  assert.deepEqual(opened.viewport, { width: 1000, height: 800 });
  assert.ok(opened.expiresInMs > 0);

  const clicked = await engine.act({ sessionId: opened.sessionId, action: { type: "click", xPct: 50, yPct: 25 } });
  assert.equal(clicked.ok, true);
  const clickEntry = log.find((entry) => entry[0] === "click");
  assert.deepEqual(clickEntry, ["click", 500, 200, { button: "left", clickCount: 1 }]);

  await engine.act({ sessionId: opened.sessionId, action: { type: "type", text: "kaffee" } });
  await engine.act({ sessionId: opened.sessionId, action: { type: "key", key: "Enter" } });
  await engine.act({ sessionId: opened.sessionId, action: { type: "scroll", deltaY: 600 } });
  assert.ok(log.some((entry) => entry[0] === "type" && entry[1] === "kaffee"));
  assert.ok(log.some((entry) => entry[0] === "press" && entry[1] === "Enter"));
  assert.ok(log.some((entry) => entry[0] === "wheel" && entry[2] === 600));

  const closed = await engine.close({ sessionId: opened.sessionId });
  assert.deepEqual(closed, { ok: true, closed: true });
  assert.equal(engine.count(), 0);
  assert.ok(log.some((entry) => entry[0] === "browser-close"));
  const gone = await engine.act({ sessionId: opened.sessionId, action: { type: "back" } });
  assert.equal(gone.ok, false);
  assert.equal(gone.status, 404);
});

test("Session-Engine: Limit, SSRF-Block und Ablauf sind fail-closed", async () => {
  const engine = createSessionEngine({ ...engineDeps(), maxSessions: 1 });
  const first = await engine.open({ url: "https://example.com" });
  assert.equal(first.ok, true);
  // Seit 2026-08-20 verdraengt ein volles Limit die AELTESTE Session statt
  // 429 zu antworten (Befund: 429 warf den Betreiber auf den Standbild-Worker
  // zurueck — Begruendung steht in session-engine.js bei open()).
  const second = await engine.open({ url: "https://example.org" });
  assert.equal(second.ok, true);
  assert.equal(engine.count(), 1);
  const evicted = await engine.act({ sessionId: first.sessionId, action: { type: "back" } });
  assert.equal(evicted.ok, false);
  assert.equal(evicted.status, 404);

  // navigate-Aktion prueft das Ziel erneut (private Hosts bleiben blockiert).
  const blockedNav = await engine.act({ sessionId: second.sessionId, action: { type: "navigate", url: "https://192.168.1.1/admin" } });
  assert.equal(blockedNav.ok, false);
  const dnsBlockedNav = await engine.act({ sessionId: second.sessionId, action: { type: "navigate", url: "https://blocked.internal/x" } });
  assert.equal(dnsBlockedNav.ok, false);
  await engine.closeAll();

  const blockedOpen = await createSessionEngine(engineDeps()).open({ url: "https://127.0.0.1/" });
  assert.equal(blockedOpen.ok, false);
  assert.equal(blockedOpen.status, 400);

  // Hard-Limit: abgelaufene Session liefert 410 und wird geschlossen.
  let clock = 1_000_000;
  const shortLived = createSessionEngine({ ...engineDeps(), hardLimitMs: 10_000, now: () => clock });
  const session = await shortLived.open({ url: "https://example.com" });
  clock += 11_000;
  const expired = await shortLived.act({ sessionId: session.sessionId, action: { type: "back" } });
  assert.equal(expired.ok, false);
  assert.equal(expired.status, 410);
  assert.equal(shortLived.count(), 0);
});

test("Worker-HTTP: Session-Routen brauchen Token und delegieren an die Engine", async () => {
  const calls = [];
  const fakeEngine = {
    open: async (body) => { calls.push(["open", body]); return { ok: true, sessionId: "a".repeat(32), screenshot: "data:image/jpeg;base64,x", finalUrl: body.url, title: "t", viewport: { width: 1365, height: 900 }, expiresInMs: 90000 }; },
    act: async (body) => { calls.push(["act", body]); return { ok: true, sessionId: body.sessionId, screenshot: "data:image/jpeg;base64,x", finalUrl: "https://example.com/", title: "t", viewport: { width: 1365, height: 900 }, expiresInMs: 90000 }; },
    close: async (body) => { calls.push(["close", body]); return { ok: true, closed: true }; }
  };
  const server = createServer({ token: "secret", sessionEngine: fakeEngine });
  const handler = server.listeners("request")[0];

  async function call(pathname, body, authorized = true) {
    const req = Readable.from([JSON.stringify(body)]);
    req.method = "POST";
    req.url = pathname;
    req.headers = authorized ? { authorization: "Bearer secret" } : {};
    const res = fakeRes();
    await handler(req, res);
    return res;
  }

  const denied = await call("/session", { url: "https://example.com" }, false);
  assert.equal(denied.statusCode, 401);
  assert.equal(calls.length, 0);

  const opened = await call("/session", { url: "https://example.com" });
  assert.equal(opened.statusCode, 200);
  assert.equal(payload(opened).ok, true);
  const acted = await call("/session/act", { sessionId: "a".repeat(32), action: { type: "back" } });
  assert.equal(acted.statusCode, 200);
  const closed = await call("/session/close", { sessionId: "a".repeat(32) });
  assert.equal(closed.statusCode, 200);
  assert.deepEqual(calls.map((entry) => entry[0]), ["open", "act", "close"]);
});

test("Control-Server-Bridge: fail-closed ohne Konfiguration und gegen fremde Origins", async () => {
  const res = fakeRes();
  await handleBrowserSession("open", { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.77" } }, res, {
    env: {},
    body: { url: "https://example.com" },
    fetchImpl: async () => { throw new Error("must_not_call_worker"); }
  });
  assert.equal(res.statusCode, 503);
  assert.equal(payload(res).remote, false);

  const foreign = fakeRes();
  await handleBrowserSession("open", { headers: { origin: "https://evil.example", "x-forwarded-for": "203.0.113.78" } }, foreign, {
    env: {},
    body: { url: "https://example.com" },
    fetchImpl: async () => { throw new Error("must_not_call_worker"); }
  });
  assert.equal(foreign.statusCode, 403);
});

test("Control-Server-Bridge: leitet an Worker weiter und uebernimmt Antworten defensiv", async () => {
  const env = {
    SMEJJ_REMOTE_BROWSER_ENABLED: "YES",
    SMEJJ_REMOTE_BROWSER_WORKER_URL: "https://remote.salad.cloud",
    SMEJJ_REMOTE_BROWSER_TOKEN: "secret",
    SMEJJ_BUDGET_MAX_USD_PER_JOB: "1",
    SMEJJ_BUDGET_MAX_RUNTIME_MINUTES: "10",
    SMEJJ_WORKER_BUDGET_USD: "0.05",
    SMEJJ_WORKER_ESTIMATED_RUNTIME_MINUTES: "2"
  };
  const calls = [];
  const res = fakeRes();
  await handleBrowserSession("open", { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.79" } }, res, {
    env,
    body: { url: "https://example.com", viewport: { width: 900, height: 700 } },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        ok: true,
        sessionId: "b".repeat(32),
        screenshot: "data:image/jpeg;base64,abc",
        finalUrl: "https://example.com/",
        title: "Example",
        viewport: { width: 900, height: 700 },
        expiresInMs: 90000,
        extraField: "wird nicht uebernommen"
      }), { status: 200 });
    }
  });
  assert.equal(res.statusCode, 200);
  const body = payload(res);
  assert.equal(body.ok, true);
  assert.equal(body.interactive, true);
  assert.equal(body.sessionId, "b".repeat(32));
  assert.equal(body.extraField, undefined);
  assert.equal(calls[0].url, "https://remote.salad.cloud/session");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");

  // SSRF-Schutz schon in der Bridge: private Ziele erreichen den Worker nie.
  const blocked = fakeRes();
  await handleBrowserSession("open", { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.80" } }, blocked, {
    env,
    body: { url: "https://127.0.0.1/" },
    fetchImpl: async () => { throw new Error("must_not_call_worker"); }
  });
  assert.equal(blocked.statusCode, 400);

  const badAct = fakeRes();
  await handleBrowserSession("act", { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.81" } }, badAct, {
    env,
    body: { sessionId: "kein-hex!", action: { type: "back" } },
    fetchImpl: async () => { throw new Error("must_not_call_worker"); }
  });
  assert.equal(badAct.statusCode, 400);
});

test("Bridge-Helfer: sanitizeSessionId/Payload/Request sind fail-closed", () => {
  assert.equal(sanitizeSessionId("A".repeat(32)), "A".repeat(32));
  assert.equal(sanitizeSessionId("../../etc"), "");
  assert.equal(sanitizeSessionId(""), "");
  assert.equal(sanitizeSessionPayload(null), null);
  assert.equal(sanitizeSessionPayload({ ok: true, sessionId: "c".repeat(32), screenshot: "data:text/html;base64,x" }), null);
  const clean = sanitizeSessionPayload({
    ok: true,
    sessionId: "c".repeat(32),
    screenshot: "data:image/jpeg;base64,x",
    finalUrl: "https://example.com/",
    title: "t",
    viewport: { width: 99999, height: 1 },
    expiresInMs: 90000
  }, "https://fallback.example/");
  assert.equal(clean.viewport.width, 1920);
  assert.equal(clean.viewport.height, 360);
  assert.equal(validateSessionRequest("open", { url: "ftp://x" }).ok, false);
  assert.equal(validateSessionRequest("act", { sessionId: "c".repeat(32), action: { type: "navigate", url: "https://10.0.0.1/" } }).ok, false);
  assert.equal(validateSessionRequest("act", { sessionId: "c".repeat(32) }).ok, false);
  assert.equal(validateSessionRequest("close", { sessionId: "c".repeat(32) }).ok, true);
});

test("Client-Session-Modul: ready, open, act-Queue und close", async () => {
  const calls = [];
  const routes = {
    api: {
      browserSession: "https://api.example/api/browser/session",
      browserSessionAct: "https://api.example/api/browser/session/act",
      browserSessionClose: "https://api.example/api/browser/session/close"
    }
  };
  const client = createBrowserSessionClient({
    routes,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith("/session")) {
        return new Response(JSON.stringify({ ok: true, sessionId: "d".repeat(32), screenshot: "data:image/jpeg;base64,x", finalUrl: "https://example.com/", title: "t" }));
      }
      if (url.endsWith("/act")) {
        return new Response(JSON.stringify({ ok: true, screenshot: "data:image/jpeg;base64,y", finalUrl: "https://example.com/next", title: "Weiter" }));
      }
      return new Response(JSON.stringify({ ok: true, closed: true }));
    }
  });
  assert.equal(client.ready(), true);
  assert.equal(createBrowserSessionClient({ routes: { api: {} } }).ready(), false);

  const opened = await client.open("https://example.com", { width: 900, height: 700 });
  assert.equal(opened.sessionId, "d".repeat(32));

  const tab = { sessionId: opened.sessionId, url: "https://example.com/", title: "t", frame: null };
  let navigated = 0;
  client.handleAct(tab, { type: "click", xPct: 10, yPct: 20 }, { onNavigated: () => { navigated += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(navigated, 1);
  assert.equal(tab.url, "https://example.com/next");
  assert.ok(calls.some((entry) => entry.url.endsWith("/act") && entry.body.action.type === "click"));

  client.close(opened.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(calls.some((entry) => entry.url.endsWith("/close")));
});

test("Client-Session-Modul: verlorene Session meldet onLost", async () => {
  const routes = {
    api: {
      browserSession: "https://api.example/api/browser/session",
      browserSessionAct: "https://api.example/api/browser/session/act",
      browserSessionClose: "https://api.example/api/browser/session/close"
    }
  };
  const client = createBrowserSessionClient({
    routes,
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: "session_expired" }), { status: 410 })
  });
  const tab = { sessionId: "e".repeat(32), url: "https://example.com/", frame: null };
  let lost = 0;
  client.handleAct(tab, { type: "back" }, { onLost: () => { lost += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(lost, 1);
  assert.equal(tab.sessionId, "");
});

test("Live-Browser-Shell: Eingaben werden als Aktions-Nachrichten verdrahtet", () => {
  const html = buildLiveBrowserHtml({
    url: "https://example.com",
    title: "Example",
    screenshot: "data:image/jpeg;base64,abc",
    viewport: { width: 1365, height: 900 }
  });
  assert.match(html, /bp-live-browser/);
  // Seit dem FE-Umbau (19.-22.08.) haengen die Eingabe-Handler AUSSEN an der
  // Buehne statt inline im srcdoc: maus.js baut die Aktionen, nachrichten.js
  // empfaengt sessionAct — die Zusage gilt fuer die Modul-Familie.
  const familie = ["maus", "nachrichten", "tasten", "fernwege"]
    .map((t) => { try { return fs.readFileSync(`public/browser-pane-${t}.js`, "utf8"); } catch { return ""; } }).join("\n");
  assert.match(familie, /smejj\.browser\.sessionAct/);
  assert.match(familie, /type: "scroll"/);
  assert.match(familie, /click/);
  assert.match(familie, /keydown/);
  assert.match(html, /data:image\/jpeg;base64,abc/);
  // Kein Screenshot -> leere Quelle, niemals fremdes Markup.
  assert.doesNotMatch(buildLiveBrowserHtml({ url: "https://x.example", title: "<script>x</script>", screenshot: "javascript:x" }), /javascript:x/);
});

test("Session-Engine-Nachladen ist auf commit-gepinnte Quellen begrenzt (fail-closed)", () => {
  const worker = fs.readFileSync("workers/remote-browser/worker.js", "utf8");
  // Regex im Worker: nur raw.githubusercontent + 40-stelliger Commit + runtime/combined-worker.
  const match = worker.match(/const COMBINED_SOURCE_RE = (\/.*\/);/);
  assert.ok(match, "COMBINED_SOURCE_RE fehlt");
  const re = new RegExp(match[1].slice(1, -1));
  const base = "https://raw.githubusercontent.com/SmejjCom/smejj-control";
  assert.equal(re.test(`${base}/${"a".repeat(40)}/runtime/combined-worker`), true);
  // Fail-closed: Branch statt Commit, fremde Hosts, andere Pfade, http.
  assert.equal(re.test(`${base}/main/runtime/combined-worker`), false);
  assert.equal(re.test(`${base}/${"a".repeat(40)}/runtime/combined-worker/../../evil`), false);
  assert.equal(re.test(`https://evil.example/x/y/${"a".repeat(40)}/runtime/combined-worker`), false);
  assert.equal(re.test(`http://raw.githubusercontent.com/o/r/${"a".repeat(40)}/runtime/combined-worker`), false);
  assert.equal(re.test(""), false);
  // Der Fallback laeuft nur, wenn der lokale Import fehlschlaegt.
  assert.match(worker, /await import\("\.\/session-engine\.js"\)/);
  assert.match(worker, /session_engine_source_not_pinned/);
});

test("Frontend kennt die Session-Routen und den Live-Modus", () => {
  const config = fs.readFileSync("public/config.js", "utf8");
  // GEAENDERT 2026-08-18: Der Nachrichten-Empfang liegt seit der Aufteilung
  // in browser-pane-nachrichten.js (browser-pane.js stand wieder an der
  // 800-Zeilen-Grenze). Geprueft wird DASSELBE — nur an beiden Stellen.
  // GEAENDERT 2026-08-24: Die Aufteilung ist nicht auf jedem Branch gelandet
  // (hier ist browser-pane.js weiter ungeteilt und enthaelt alles selbst).
  // Deshalb: vorhandene Dateien zusammenziehen statt hart auf beide bestehen —
  // die Muster-Pruefungen darunter bleiben unveraendert streng.
  const pane = ["public/browser-pane.js", "public/browser-pane-nachrichten.js", "public/browser-pane-fernwege.js", "public/browser-pane-session.js"]
    .filter((datei) => fs.existsSync(datei))
    .map((datei) => fs.readFileSync(datei, "utf8"))
    .join("\n");
  const sw = fs.readFileSync("public/sw.js", "utf8");
  assert.match(config, /browserSession:/);
  assert.match(config, /browserSessionAct:/);
  assert.match(config, /browserSessionClose:/);
  assert.match(pane, /mode:\s*"live-browser"/);
  assert.match(pane, /createBrowserSessionClient/);
  assert.match(pane, /smejj\.browser\.sessionAct/);
  assert.match(sw, /\/assets\/browser-pane-session\.js/);
});

// Die Erlaubnisliste hat am 2026-08-18 mein eigenes neues Feld verschluckt:
// die Suche lief, die Trefferzahl kam nie an. Das ist ihr ZWECK — was der
// Worker schickt, ist nicht automatisch vertrauenswuerdig. Diese Tests halten
// beides fest: das Feld kommt durch, und Unsinn kommt nicht durch.
test("Trefferzahl der Suche kommt durch die Erlaubnisliste", () => {
  const rein = sanitizeSessionPayload({
    ok: true, sessionId: "a".repeat(32), screenshot: "data:image/jpeg;base64,AAAA", treffer: 7
  });
  assert.equal(rein.treffer, 7);
});

test("unsinnige Trefferzahlen werden geklemmt oder verworfen", () => {
  const basis = { ok: true, sessionId: "a".repeat(32), screenshot: "data:image/jpeg;base64,AAAA" };
  assert.equal(sanitizeSessionPayload({ ...basis, treffer: 99999 }).treffer, 500, "geklemmt");
  assert.equal(sanitizeSessionPayload({ ...basis, treffer: -3 }).treffer, 0);
  assert.equal(sanitizeSessionPayload({ ...basis, treffer: "viele" }).treffer, undefined, "kein Text");
  assert.equal(sanitizeSessionPayload(basis).treffer, undefined, "ohne Suche kein Feld");
});

// --- Selektor-Aktionen: der Weg, auf dem die Maus DIESEN Browser bedient ------
//
// Ein Maus-Plan nennt Rolle und Beschriftung, keine Koordinaten. Ein Klick auf
// Prozentwerte waere bei jeder Fensterbreite ein anderer — deshalb muss der
// Panel-Browser Elemente ansprechen koennen.
test("Selektor-Aktionen werden angenommen und geprueft", () => {
  const ok = validateSessionAction({ type: "selectorClick", strategy: "role", value: "link", name: "Impressum" });
  assert.equal(ok.ok, true);
  assert.equal(ok.action.name, "Impressum");

  const tippen = validateSessionAction({ type: "selectorType", strategy: "label", value: "Suche", text: "Kaffee" });
  assert.equal(tippen.ok, true);
  assert.equal(tippen.action.text, "Kaffee");

  assert.equal(validateSessionAction({ type: "selectorText", strategy: "css", value: "h1" }).ok, true);
});

// Fail-closed wie ueberall sonst: eine unbekannte Strategie ist kein Grund,
// es trotzdem zu versuchen.
test("unbekannte Selektor-Strategien und Unsinn werden abgewiesen", () => {
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "eval", value: "x" }).error, "selector_strategy_not_allowed");
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "role", value: "" }).error, "selector_value_invalid");
  assert.equal(validateSessionAction({ type: "selectorClick", strategy: "role", value: "x".repeat(301) }).error, "selector_value_invalid");
  assert.equal(validateSessionAction({ type: "selectorType", strategy: "role", value: "textbox", text: "" }).error, "type_text_invalid");
});

test("gelesener Text kommt durch die Erlaubnisliste und wird gekuerzt", () => {
  const basis = { ok: true, sessionId: "a".repeat(32), screenshot: "data:image/jpeg;base64,AAAA" };
  assert.equal(sanitizeSessionPayload({ ...basis, gelesen: "Hilfe" }).gelesen, "Hilfe");
  assert.equal(sanitizeSessionPayload({ ...basis, gelesen: "x".repeat(5000) }).gelesen.length, 2000);
  assert.equal(sanitizeSessionPayload({ ...basis, gelesen: 42 }).gelesen, undefined);
});

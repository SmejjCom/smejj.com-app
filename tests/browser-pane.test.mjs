// smejj.com — Tests fuer den integrierten Browser (Codex-Stil):
// Frontend-Struktur, Adress-Normalisierung und Server-Proxy (SSRF, Rewrite).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExternalFallbackHtml, clampZoom, normalizeAddress, normalizeAgentBrowserUrl, shouldOpenInRealBrowser, shouldPreferRealBrowserUrl } from "../public/browser-pane.js";
import {
  extractTitle,
  handleBrowserFetch,
  isAllowedBrowserCaller,
  parseBrowserTarget,
  rewriteBrowserHtml
} from "../control-server/src/routes/browserProxyRoutes.js";
import { clientKeyFromRequest, createRateLimiter } from "../control-server/src/http/rateLimiter.js";

const html = fs.readFileSync("public/index.html", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const configJs = fs.readFileSync("public/config.js", "utf8");
// GEAENDERT 2026-08-17: Die Markup-Vorlage des Panels liegt seit der
// Aufteilung in browser-pane-render.js (browser-pane.js stand exakt an der
// 800-Zeilen-Grenze). Die Tests pruefen weiterhin DASSELBE — sie muessen nur
// in beiden Dateien nachsehen. Zusammengehaengt statt umgeschrieben, damit
// jede einzelne Zusicherung unveraendert bleibt und nachweisbar dasselbe
// schuetzt wie vorher.
const paneJs = fs.readFileSync("public/browser-pane.js", "utf8")
  + fs.readFileSync("public/browser-pane-render.js", "utf8");

test("index.html bindet Browser-Pane ein (Root, CSS, Script)", () => {
  assert.match(html, /id="browserPaneRoot" class="browser-pane"/);
  // Pane-CSS liegt seit 2026-07-27 im Startseiten-Buendel (start-styles.css).
  assert.match(html, /\/assets\/start-styles\.css/);
  assert.ok(fs.readFileSync("public/start-styles.css", "utf8").includes(".bp-frame"), "Pane-CSS fehlt im Buendel");
  // Cache-Version 2026-07-28 auf -3 erhoeht: browser-pane.js exportiert seitdem
  // sein state-Objekt, das maus-panel.js braucht. Ohne den Sprung haetten
  // Bestandsnutzer die alte Datei unter der alten Query behalten (live erlebt).
  // maus-panel.js MUSS dieselbe Query importieren — zwei Spezifizierer waeren
  // zwei getrennte Modul-Instanzen mit getrenntem state.
  assert.match(html, /\/assets\/browser-pane\.js\?v=browser-pane-20260728-3/);
  assert.match(html, /\/assets\/maus-panel\.js\?v=/);
  assert.match(
    fs.readFileSync("public/maus-panel.js", "utf8"),
    /\.\/browser-pane\.js\?v=browser-pane-20260728-3/,
    "maus-panel.js muss dieselbe browser-pane-Version importieren wie index.html"
  );
  assert.match(html, /data-jump="websites"[\s\S]*>Browser<\/button>/);
});

test("Service Worker cached Browser-Pane Assets", () => {
  assert.match(sw, /\/assets\/start-styles\.css/);
  assert.match(sw, /\/assets\/browser-pane\.js/);
  assert.match(sw, /\/assets\/browser-pane-render\.js/);
});

test("Config exposes Browser-Proxy route used by Browser-Pane", () => {
  assert.match(configJs, /browserFetch:\s*"\/api\/browser\/fetch"/);
  assert.match(configJs, /browserRemote:/);
  assert.match(paneJs, /CLIENT_ROUTES\.api\.browserFetch/);
  // config.js wird bewusst OHNE Cache-Version importiert (QA-Welle 1, Befund F-07).
  // Der frueher hier erzwungene Spezifizierer "./config.js?v=browser-pane-..." war
  // der einzige abweichende unter 26 Importen und liess config.js ein zweites Mal
  // als eigenstaendiges Modul laden — mit getrennten CLIENT_ROUTES. Die uebrigen
  // browser-pane-Module behalten ihre Version, weil sie nur hier importiert werden.
  assert.match(paneJs, /from "\.\/config\.js"/);
  assert.doesNotMatch(paneJs, /\.\/config\.js\?v=/);
  assert.match(paneJs, /\.\/browser-pane-render\.js\?v=browser-pane-20260709-2/);
});

test("Browser-Pane erlaubt maximal 7 Tabs", () => {
  assert.match(paneJs, /const MAX_TABS = 7;/);
});

test("Browser-Pane keeps iframe content visible and Enter navigates", () => {
  const css = fs.readFileSync("public/browser-pane.css", "utf8");
  // GEAENDERT 2026-08-17: an Chrome gemessen (Leiste ~32 px, Knoepfe ~28 px).
  // 26/22 galt seit der ersten Fassung und war spuerbar enger als Chrome —
  // und lag unter den Touch-Zielen. Der enge Satz bleibt fuer schmale
  // Fenster erhalten, deshalb wird BEIDES geprueft.
  assert.match(css, /--bp-row-height:\s*32px;/);
  assert.match(css, /--bp-control-size:\s*28px;/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*--bp-control-size:\s*22px;/);
  // minmax(0, 1fr): Inhalt darf das Panel nie ueberragen (keine abgeschnittenen Seiten).
  assert.match(css, /grid-template-rows:\s*var\(--bp-row-height\) var\(--bp-row-height\) auto auto minmax\(0,\s*1fr\)/);
  assert.match(css, /\.bp-content\s*\{[\s\S]*grid-row:\s*5/);
  assert.match(paneJs, /refs\.address\.addEventListener\("keydown"/);
  assert.match(paneJs, /event\.key !== "Enter"/);
});

test("Browser-Pane header aligns active tab row with URL row", () => {
  const css = fs.readFileSync("public/browser-pane.css", "utf8");
  assert.match(css, /\.browser-panel\.is-browser-mode\s*\{[\s\S]*padding:\s*0;/);
  assert.match(css, /--bp-side-width:\s*calc\(\(var\(--bp-control-size\) \* 3\) \+ \(var\(--bp-control-gap\) \* 2\)\);/);
  assert.match(css, /\.bp-tabstrip\s*\{[\s\S]*grid-row:\s*1;[\s\S]*grid-template-columns:\s*var\(--bp-side-width\) minmax\(0, 1fr\) var\(--bp-side-width\);[\s\S]*height:\s*var\(--bp-row-height\);/);
  assert.match(css, /\.bp-tabstrip\s*\{[\s\S]*border-bottom:\s*1px solid rgba\(255, 255, 255, 0\.1\);/);
  assert.match(css, /\.bp-toolbar\s*\{[\s\S]*grid-row:\s*2;[\s\S]*grid-template-columns:\s*var\(--bp-side-width\) minmax\(0, 1fr\) var\(--bp-side-width\);[\s\S]*height:\s*var\(--bp-row-height\);/);
  assert.match(css, /\.bp-tab\s*\{[\s\S]*height:\s*var\(--bp-control-size\);/);
  assert.match(css, /\.bp-toolbar button\s*\{[\s\S]*width:\s*var\(--bp-control-size\);[\s\S]*height:\s*var\(--bp-control-size\);/);
  assert.match(css, /\.bp-address\s*\{[\s\S]*height:\s*var\(--bp-control-size\);/);
  assert.match(paneJs, /class="bp-tab-left"/);
  assert.match(paneJs, /class="bp-tab-right"/);
  assert.match(paneJs, /class="bp-toolbar-left"/);
  assert.match(paneJs, /class="bp-toolbar-right"/);
  assert.match(paneJs, /class="bp-tab-spacer"/);
  assert.match(paneJs, /refs\.prevTab\.addEventListener\("click", \(\) => switchTab\(-1\)\)/);
  assert.match(paneJs, /refs\.nextTab\.addEventListener\("click", \(\) => switchTab\(1\)\)/);
  // GEAENDERT 2026-08-17 (Chrome-Abgleich): Hier stand
  // `const visibleTabs = active ? [active] : []` — die Leiste zeigte immer nur
  // EINEN Tab. Das war der Grund fuer die Blaetter-Pfeile, die Chrome nicht
  // hat. Jetzt zeichnet browser-pane-tableiste.js alle Tabs.
  //
  // Der Zweck DIESES Tests bleibt unveraendert: die Kopfgeometrie darf nicht
  // verrutschen. Deshalb wird jetzt geprueft, dass die Leiste ihre Spalte
  // nicht sprengen kann — sie schrumpft die Tabs und scrollt notfalls,
  // statt die Adresszeile aus der Flucht zu schieben.
  assert.match(paneJs, /zeichneTableiste\(refs\.tabs, \{/);
  assert.match(paneJs, /tabs: state\.tabs/);
  assert.match(css, /\.bp-tabs\s*\{[\s\S]*overflow-x:\s*auto;/);
  assert.match(css, /\.bp-tabs\s*\{[\s\S]*min-width:\s*0;/);
});

test("Browser-Pane opens as right 50/50 split instead of navigating fullscreen", () => {
  assert.match(paneJs, /const PANE_WIDTH = "50vw";/);
  assert.match(paneJs, /document\.body\.classList\.add\("right-panel-open", "browser-pane-open"\)/);
  assert.match(paneJs, /document\.body\.style\.setProperty\("--right-panel-width", PANE_WIDTH\)/);
  assert.match(paneJs, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(paneJs, /goToView\("websites"/);
});

test("Browser-Pane: Scrollposition, Verlauf und Zoom werden pro Tab gespeichert", () => {
  // Scroll-Meldungen aus srcdoc-Frames werden pro Tab uebernommen.
  assert.match(paneJs, /smejj\.browser\.scrollState/);
  assert.match(paneJs, /smejj\.browser\.restoreScroll/);
  // Persistenz enthaelt Scroll, Zoom und Verlauf (nicht nur URL/Titel).
  assert.match(paneJs, /scrollRatio:/);
  assert.match(paneJs, /zoom:\s*tab\.zoom/);
  assert.match(paneJs, /tab\.history\.slice\(-MAX_PERSISTED_HISTORY\)/);
  assert.match(paneJs, /const MAX_PERSISTED_HISTORY = 50;/);
});

test("Browser-Pane: Remote-Ansicht folgt der Panelgroesse (debounced Refit)", () => {
  assert.match(paneJs, /ResizeObserver/);
  assert.match(paneJs, /REMOTE_REFIT_DEBOUNCE_MS/);
  assert.match(paneJs, /REMOTE_REFIT_MIN_INTERVAL_MS/);
});

test("Browser-Pane: Enter gibt den Fokus wie Chrome an die Seite ab", () => {
  assert.match(paneJs, /refs\.address\.blur\(\)/);
  assert.match(paneJs, /frame\.focus\(\)/);
});

test("Browser-Pane: History-Push laeuft zentral ueber commitHistory (auch remote)", () => {
  assert.match(paneJs, /function commitHistory\(tab, url, push\)/);
  assert.doesNotMatch(paneJs, /tab\.history\.includes/);
});

test("clampZoom: haelt Zoom in Chrome-ueblichen Grenzen 50–200 %", () => {
  assert.equal(clampZoom(1), 1);
  assert.equal(clampZoom(0.3), 0.5);
  assert.equal(clampZoom(5), 2);
  assert.equal(clampZoom(1.25), 1.3); // auf Zehntel gerundet
  assert.equal(clampZoom(Number.NaN), 1);
});

test("normalizeAddress: URL, Domain und Suche", () => {
  assert.equal(normalizeAddress("https://github.com/x"), "https://github.com/x");
  assert.equal(normalizeAddress("github.com/anthropics"), "https://github.com/anthropics");
  assert.equal(normalizeAddress("wetter berlin"), "https://duckduckgo.com/html/?q=wetter%20berlin");
  assert.equal(normalizeAddress(""), "");
});

test("Agent-Browser akzeptiert nur sichere HTTPS-Ziele ohne Zugangsdaten", () => {
  assert.equal(normalizeAgentBrowserUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(normalizeAgentBrowserUrl("example.com/path"), "https://example.com/path");
  assert.equal(normalizeAgentBrowserUrl("http://example.com/path"), "");
  assert.equal(normalizeAgentBrowserUrl("https://user:secret@example.com/path"), "");
  assert.match(paneJs, /smejj:browser-request/);
  assert.match(paneJs, /openBrowserRequest\(event\.detail\?\.url\)/);
  assert.match(paneJs, /refs\.address\.value = target/);
  assert.match(paneJs, /refs\.address\.blur\(\)/);
});

test("Browser-Pane erkennt Challenge-Seiten und zeigt externen Fallback", () => {
  const challenge = "<html><body>Max challenge attempts exceeded. Please refresh the page to try again!</body></html>";
  assert.equal(shouldOpenInRealBrowser(challenge, "https://www.amazon.com/"), true);
  assert.equal(shouldOpenInRealBrowser("<html><body>captcha</body></html>", "https://www.amazon.de/"), true);
  assert.equal(shouldOpenInRealBrowser("<html><body>normale Seite</body></html>", "https://example.com/"), false);
  assert.equal(shouldPreferRealBrowserUrl("https://www.amazon.de/"), true);
  assert.equal(shouldPreferRealBrowserUrl("https://example.com/"), false);
  const fallback = buildExternalFallbackHtml({
    url: "https://www.amazon.com/",
    title: "Echter Browser erforderlich",
    message: "extern oeffnen"
  });
  assert.match(fallback, /bp-fallback/);
  assert.match(fallback, /Extern oeffnen/);
  assert.doesNotMatch(fallback, /Max challenge attempts exceeded/);
  assert.match(paneJs, /mode:\s*"external-required"/);
});

test("parseBrowserTarget: blockiert private Netze und Nicht-http(s)", () => {
  assert.equal(parseBrowserTarget("https://example.com").ok, true);
  assert.equal(parseBrowserTarget("http://localhost:3000").ok, false);
  assert.equal(parseBrowserTarget("https://192.168.1.10/admin").ok, false);
  assert.equal(parseBrowserTarget("https://10.0.0.1").ok, false);
  assert.equal(parseBrowserTarget("https://172.20.3.4").ok, false);
  assert.equal(parseBrowserTarget("https://intern.local").ok, false);
  assert.equal(parseBrowserTarget("file:///etc/passwd").ok, false);
  assert.equal(parseBrowserTarget("").ok, false);
  assert.equal(parseBrowserTarget("kein url").ok, false);
});

test("rewriteBrowserHtml: Scripts raus, base und Nav-Script rein", () => {
  const input = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src none"><title>Testseite</title></head>
    <body onload="evil()"><a href="/pfad" onclick="evil()">Link</a><script>alert(1)</script></body></html>`;
  const out = rewriteBrowserHtml(input, "https://example.com/start");
  assert.doesNotMatch(out, /alert\(1\)/);
  assert.doesNotMatch(out, /onclick/);
  assert.doesNotMatch(out, /onload/);
  assert.doesNotMatch(out, /Content-Security-Policy/i);
  assert.match(out, /<base href="https:\/\/example\.com\/start"/);
  assert.match(out, /smejj\.browser\.navigate/);
  assert.equal(extractTitle(input), "Testseite");
});

test("handleBrowserFetch: liefert embeddable-Flag und Rewrite-HTML", async () => {
  const responses = [];
  const res = {
    writeHead: (status) => responses.push(status),
    end: (body) => responses.push(JSON.parse(body))
  };
  const fetchImpl = async () => new Response("<html><head><title>Blockiert</title></head><body>ok</body></html>", {
    status: 200,
    headers: { "content-type": "text/html", "x-frame-options": "DENY" }
  });
  const url = new URL("https://smejj.com/api/browser/fetch?url=https%3A%2F%2Fexample.com%2F");
  await handleBrowserFetch(url, res, { fetchImpl });
  const [status, payload] = responses;
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.embeddable, false);
  assert.equal(payload.title, "Blockiert");
  assert.match(payload.html, /smejj\.browser\.navigate/);
});

test("handleBrowserFetch: blockiert private Ziele mit 400", async () => {
  const responses = [];
  const res = {
    writeHead: (status) => responses.push(status),
    end: (body) => responses.push(JSON.parse(body))
  };
  const url = new URL("https://smejj.com/api/browser/fetch?url=http%3A%2F%2F127.0.0.1%3A8080%2F");
  await handleBrowserFetch(url, res, { fetchImpl: async () => { throw new Error("darf nicht aufgerufen werden"); } });
  assert.equal(responses[0], 400);
  assert.equal(responses[1].ok, false);
});

test("clientKeyFromRequest: nutzt x-forwarded-for zuerst", () => {
  assert.equal(clientKeyFromRequest({ headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }), "203.0.113.7");
  assert.equal(clientKeyFromRequest({ headers: {}, socket: { remoteAddress: "198.51.100.2" } }), "198.51.100.2");
  assert.equal(clientKeyFromRequest({ headers: {} }), "");
});

test("createRateLimiter: blockt nach Kapazitaet, liefert Retry-After", () => {
  let clock = 0;
  const limiter = createRateLimiter({ capacity: 3, refillPerSec: 1, now: () => clock });
  assert.equal(limiter.take("ip").allowed, true);
  assert.equal(limiter.take("ip").allowed, true);
  assert.equal(limiter.take("ip").allowed, true);
  const blocked = limiter.take("ip");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  clock = 2000; // 2s vergehen -> 2 Tokens nachgefuellt
  assert.equal(limiter.take("ip").allowed, true);
});

test("createRateLimiter: fail-open ohne Schluessel", () => {
  const limiter = createRateLimiter({ capacity: 1, refillPerSec: 1 });
  assert.equal(limiter.take("").allowed, true);
  assert.equal(limiter.take("").allowed, true);
});

test("isAllowedBrowserCaller: fremde Origin abgelehnt, eigene erlaubt", () => {
  assert.equal(isAllowedBrowserCaller({ headers: { origin: "https://smejj.com" } }), true);
  assert.equal(isAllowedBrowserCaller({ headers: { origin: "https://evil.example" } }), false);
  assert.equal(isAllowedBrowserCaller({ headers: { referer: "https://smejj.com/home" } }), true);
  assert.equal(isAllowedBrowserCaller({ headers: {} }), true); // kein Origin/Referer -> durchgelassen
});

test("handleBrowserFetch: 429 wenn Limit erschoepft", async () => {
  const limiter = createRateLimiter({ capacity: 1, refillPerSec: 0.001 });
  const req = { headers: { origin: "https://smejj.com", "x-forwarded-for": "203.0.113.9" } };
  const call = async () => {
    const out = [];
    const res = {
      setHeader: () => {},
      writeHead: (status) => out.push(status),
      end: (body) => out.push(JSON.parse(body))
    };
    const url = new URL("https://smejj.com/api/browser/fetch?url=https%3A%2F%2Fexample.com%2F");
    await handleBrowserFetch(url, res, {
      req,
      limiter,
      fetchImpl: async () => new Response("<title>ok</title>", { status: 200, headers: { "content-type": "text/html" } })
    });
    return out;
  };
  assert.equal((await call())[0], 200);
  assert.equal((await call())[0], 429);
});

test("handleBrowserFetch: fremde Origin -> 403", async () => {
  const out = [];
  const res = { setHeader: () => {}, writeHead: (s) => out.push(s), end: (b) => out.push(JSON.parse(b)) };
  const url = new URL("https://smejj.com/api/browser/fetch?url=https%3A%2F%2Fexample.com%2F");
  await handleBrowserFetch(url, res, { req: { headers: { origin: "https://evil.example" } }, fetchImpl: async () => { throw new Error("nicht erreichen"); } });
  assert.equal(out[0], 403);
});

// smejj.com — Tests fuer den integrierten Browser (Codex-Stil):
// Frontend-Struktur, Adress-Normalisierung und Server-Proxy (SSRF, Rewrite).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExternalFallbackHtml, paneBreiteAus, clampZoom, normalizeAddress, normalizeAgentBrowserUrl, shouldOpenInRealBrowser, shouldPreferRealBrowserUrl } from "../public/browser-pane.js";
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
  // GEAENDERT 2026-08-18: die Marke stand hier woertlich und musste bei jedem
  // Bump von Hand nachgezogen werden — beim Bump auf -20260818-1 wurde sie
  // prompt vergessen. Jetzt wird GLEICHHEIT geprueft statt eines Wortlauts:
  // derselbe Schutz, aber er kann nicht mehr veralten. Und er deckt jetzt
  // JEDEN Importeur ab, nicht nur maus-panel.js.
  // GEAENDERT 2026-08-23: browser-pane.js und maus-panel.js standen als feste
  // <script>-Tags in index.html und wogen samt Kette 63,3 KB von 335,6 KB, die
  // JEDER Seitenaufruf zahlte — fuer Flaechen, die erst auf Knopfdruck
  // aufgehen. Sie kommen jetzt aus browser-nachladen.js. Die Zusage ist
  // unveraendert: ALLE Importeure muessen dieselbe Marke nennen, sonst sind es
  // zwei Modul-Instanzen mit getrenntem state.
  const nachlader = fs.readFileSync("public/browser-nachladen.js", "utf8");
  const paneMarke = nachlader.match(/browser-pane\.js\?v=([^"']+)/)?.[1];
  assert.ok(paneMarke, "browser-nachladen.js laedt browser-pane.js ohne ?v=-Marke");
  assert.match(nachlader, /maus-panel\.js\?v=/);
  assert.match(html, /browser-nachladen\.js/, "der Nachlader steht in index.html");
  for (const datei of ["public/maus-panel.js", "public/maus-absicht.js"]) {
    assert.match(
      fs.readFileSync(datei, "utf8"),
      new RegExp(`\\./browser-pane\\.js\\?v=${paneMarke}`),
      `${datei} muss dieselbe browser-pane-Version importieren wie der Nachlader — zwei Spezifizierer waeren zwei Modul-Instanzen mit getrenntem state`
    );
  }
  // GEAENDERT 2026-08-18: der Knopf trug data-jump="websites" und fiel damit
  // auf eine leere Ansicht zurueck, wenn dieses Modul nicht geladen war. Jetzt
  // traegt er ein eigenes Merkmal und kann NIRGENDWO mehr hinfuehren — faellt
  // browser-pane.js aus, passiert gar nichts statt etwas Falschem.
  assert.match(html, /data-browser-oeffnen[\s\S]*?>Browser<\/button>/);
  assert.match(paneJs, /\[data-browser-oeffnen\]/);
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
  // browserRemote lebt seit der Auslagerung in browser-pane-fernwege.js und
  // bekommt die Routen als `routes` hineingereicht.
  assert.match(paneJs, /routes:\s*CLIENT_ROUTES/);
  // config.js wird bewusst OHNE Cache-Version importiert (QA-Welle 1, Befund F-07).
  // Der frueher hier erzwungene Spezifizierer "./config.js?v=browser-pane-..." war
  // der einzige abweichende unter 26 Importen und liess config.js ein zweites Mal
  // als eigenstaendiges Modul laden — mit getrennten CLIENT_ROUTES. Die uebrigen
  // browser-pane-Module behalten ihre Version, weil sie nur hier importiert werden.
  assert.match(paneJs, /from "\.\/config\.js"/);
  assert.doesNotMatch(paneJs, /\.\/config\.js\?v=/);
  // Die Marke wandert bei jeder Aenderung (check:markenkette erzwingt das);
  // gepinnt wird deshalb nur, DASS render.js versioniert importiert wird.
  assert.match(paneJs, /\.\/browser-pane-render\.js\?v=browser-pane-[0-9-]+/);
});

test("Browser-Pane erlaubt maximal 7 Tabs", () => {
  assert.match(paneJs, /const MAX_TABS = 7;/);
});

test("Browser-Pane keeps iframe content visible and Enter navigates", () => {
  const css = fs.readFileSync("public/browser-pane.css", "utf8");
  // ZURUECKGENOMMEN 2026-08-18: Kurzzeitig standen hier Chromes Masse
  // (32/28). Der Betreiber wollte Chromes FUNKTION, nicht sein Aussehen —
  // die Kopfleiste bleibt, wie sie war. Der Test haelt genau das fest.
  assert.match(css, /--bp-row-height:\s*26px;/);
  assert.match(css, /--bp-control-size:\s*22px;/);
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
  // GEAENDERT 2026-08-18: Die Tableiste hat eigene Randbreiten bekommen.
  // Zweck des Tests bleibt: die Leiste ist ein Raster aus Rand | Tabs | Rand
  // und behaelt ihre Zeilenhoehe. Nur die beiden Raender sind nicht mehr so
  // breit wie die der Werkzeugleiste — links steht seit dem Chrome-Abgleich
  // nur noch "+", rechts Maus und Platzhalter. Die frei gewordenen 75 px
  // gehoeren den Tabs, sonst blieben sie leer.
  assert.match(css, /\.bp-tabstrip\s*\{[\s\S]*grid-row:\s*1;[\s\S]*grid-template-columns:\s*var\(--bp-tab-left-width\) minmax\(0, 1fr\) var\(--bp-tab-right-width\);[\s\S]*height:\s*var\(--bp-row-height\);/);
  // Die Raender muessen sich aus den Knopfmassen ERRECHNEN, nicht geraten
  // sein — sonst passt die Leiste beim naechsten Groessenwechsel nicht mehr.
  assert.match(css, /--bp-tab-left-width:\s*var\(--bp-control-size\);/);
  assert.match(css, /--bp-tab-right-width:\s*calc\(\(var\(--bp-control-size\) \* 2\) \+ var\(--bp-control-gap\)\);/);
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
  // GEAENDERT 2026-08-18 (Chrome-Abgleich): Hier stand die Zusicherung, dass
  // die beiden Blaetterpfeile "‹ ›" am switchTab haengen. Chrome hat diese
  // Pfeile nicht — sie waren ein Notbehelf aus der Zeit, als die Leiste nur
  // EINEN Tab zeigte, und kosteten 44 px, die den Tabs fehlten.
  //
  // Der Zweck bleibt: der Tab-Wechsel darf nicht verlorengehen. Er haengt
  // jetzt an Chromes eigenem Kuerzel Strg+Tab, verdrahtet ueber die
  // Tastenzuordnung. Geprueft wird deshalb die Durchreichung — ohne sie
  // waere der Wechsel still tot, genau wie bei einem fehlenden Import.
  assert.match(paneJs, /verdrahtePanelTasten\(\{[^}]*switchTab/);
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

test("Browser-Pane oeffnet rechts daneben statt bildschirmfuellend", () => {
  // Bis 2026-08-22 stand hier ein festes "50vw". Es liess dem Chat bei 962 px
  // Fensterbreite nur 285 px — die Breite wird jetzt gerechnet (paneBreiteAus).
  assert.match(paneJs, /export function paneBreiteAus/);
  assert.match(paneJs, /document\.body\.classList\.add\("right-panel-open", "browser-pane-open"\)/);
  assert.match(paneJs, /document\.body\.style\.setProperty\("--right-panel-width", paneBreite\(\)\)/);
  assert.match(paneJs, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(paneJs, /goToView\("websites"/);
});

test("Browser-Pane: Scrollposition, Verlauf und Zoom werden pro Tab gespeichert", () => {
  // Scroll-Meldungen aus srcdoc-Frames werden pro Tab uebernommen. Der
  // SENDER sitzt seit 2026-08-19 in browser-stage.js (CSP), der Empfaenger
  // im Panel bzw. seinem Nachrichten-Modul — beide Seiten pruefen.
  const stageJs = fs.readFileSync("public/browser-stage.js", "utf8");
  const nachrichtenJs = fs.readFileSync("public/browser-pane-nachrichten.js", "utf8");
  assert.match(stageJs, /smejj\.browser\.scrollState/);
  assert.match(nachrichtenJs, /smejj\.browser\.scrollState/);
  assert.match(stageJs, /smejj\.browser\.restoreScroll/);
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
  assert.match(fallback, /Extern öffnen/);
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

// --- Das Panel liess dem Chat 246 Pixel ----------------------------------------
//
// Live gemessen 2026-08-22 im echten Chrome bei 962 px Fensterbreite: das Panel
// nahm stur "50vw" (481 px). Es liegt aber per position:fixed UEBER dem Chat,
// und die linke Spur (196 px) zaehlt mit — dem Chat blieben 285 px. Das
// Eingabefeld war oben angeschnitten, Antworten brachen nach drei Woertern um,
// und das Modellmenue rutschte unter die Seitenleiste.
//
// Waechter-TUEV: die kaputte Probe (schmales Fenster) UND die gesunde
// (breiter Bildschirm, wo sich nichts aendern darf).
test("schmales Fenster: das Panel weicht dem Chat", () => {
  // Der gemessene Fall. 962 - 196 - 380 = 386, statt 481.
  assert.equal(paneBreiteAus({ fenster: 962, mitteLinks: 196 }), "386px");
});

test("breiter Bildschirm: es bleibt bei der Haelfte", () => {
  // 1280 - 196 - 380 = 704, mehr als die Haelfte — also aendert sich nichts.
  assert.equal(paneBreiteAus({ fenster: 1280, mitteLinks: 196 }), "640px");
  assert.equal(paneBreiteAus({ fenster: 1600, mitteLinks: 196 }), "800px");
});

test("sehr schmal: das Panel selbst behaelt eine Untergrenze", () => {
  // 800 - 196 - 380 = 224 — darunter waere das Panel selbst unbrauchbar.
  assert.equal(paneBreiteAus({ fenster: 800, mitteLinks: 196 }), "320px");
});

test("Handy: die Medienregel in browser-pane.css uebernimmt", () => {
  assert.equal(paneBreiteAus({ fenster: 680, mitteLinks: 0 }), "50vw");
  assert.equal(paneBreiteAus({ fenster: 390, mitteLinks: 0 }), "50vw");
});

test("ohne gemessene Mitte bleibt es bei der alten Haelfte", () => {
  // Fail-safe: findet paneBreite() kein <main>, darf es nicht enger werden
  // als vorher. 1200/2 = 600, und 1200 - 0 - 380 = 820 liegt darueber.
  assert.equal(paneBreiteAus({ fenster: 1200, mitteLinks: 0 }), "600px");
});

test("die Panel-Breite wird berechnet, nicht fest verdrahtet", () => {
  const quelle = fs.readFileSync(new URL("../public/browser-pane.js", import.meta.url), "utf8");
  assert.ok(!/PANE_WIDTH\s*=\s*"50vw"/.test(quelle), 'das feste "50vw" muss weg sein');
  assert.match(quelle, /setProperty\("--right-panel-width", paneBreite\(\)\)/);
  assert.match(quelle, /breiteBeobachten\(\)/, "beim Fenster-Ziehen muss sie mitwandern");
});

test("der Spiegel unter /assets traegt dieselbe Fassung", () => {
  const quelle = fs.readFileSync(new URL("../public/browser-pane.js", import.meta.url), "utf8");
  const spiegel = fs.readFileSync(new URL("../public/assets/browser-pane.js", import.meta.url), "utf8");
  assert.equal(spiegel, quelle);
});

// Betreiber-Befund 2026-09-05 (Bildschirmfoto): dunkler Streifen unter der Seite im
// Live-Browser. Im Browser nachgestellt: zwei Gitterzeilen -> 213 px Streifen, eine -> 0.
test("Live-Browser: die Seite trifft die Unterkante — eine Gitterzeile, Bild oben angeschlagen", async () => {
  const { buildLiveBrowserHtml } = await import("../public/browser-pane-render.js");
  const html = buildLiveBrowserHtml({ url: "https://example.com/", title: "t", screenshot: "", viewport: { width: 700, height: 600 } });
  const live = html.slice(html.indexOf(".bp-live-stage") - 400);
  assert.match(html, /main\{height:100%;display:grid;grid-template-rows:minmax\(0,1fr\)/, "genau eine Zeile — ohne Kopfzeile gibt es nichts fuer 'auto'");
  assert.doesNotMatch(html, /grid-template-rows:auto minmax\(0,1fr\)/, "die alte zweite Zeile zeigte den dunklen Grund");
  assert.match(live, /object-position:center top/, "Rest, falls das Bild kuerzer ist, liegt unten und ist weiss, nicht oben und dunkel");
});

test("Live-Browser: Viewport ohne den Abzug der entfernten Kopfzeile, Nachlauf auch fuer den Live-Browser", () => {
  const fernwege = fs.readFileSync("public/browser-pane-fernwege.js", "utf8");
  assert.doesNotMatch(fernwege, /rect\?\.height \|\| 0\) - 38/, "38 px galten einer Kopfzeile, die es nicht mehr gibt");
  assert.match(fernwege, /clampViewport\(rect\?\.height \|\| 0, 360, 1200, 900\)/);
  assert.match(paneJs, /\["remote-browser", "live-browser"\]\.includes\(tab\.mode\)/, "der Live-Browser muss der Panelgroesse folgen");
  assert.match(paneJs, /tab\.mode === "live-browser" && mausLaeuft\(\)\) return;/, "waehrend die Maus arbeitet, wird die Sitzung nicht abgerissen");
  assert.match(paneJs, /if \(tab\.mode === "live-browser"\) \{ oeffneImLiveBrowser\(tab\.url\)/);
});

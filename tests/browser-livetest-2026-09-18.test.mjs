// smejj.com — Schutztests zum Live-Test des eingebauten Browsers (2026-09-18, Chrome).
//
// Jeder Test haelt EINEN live gemessenen Fehler fest. Anders als die meisten
// Browser-Tests lesen diese hier nicht nur den Quelltext: der Schnellweg und die
// Schonfrist LAUFEN wirklich (mit Attrappen fuer Sitzung und Uhr) — ein Test,
// der nur Text prueft, haette keinen der Fehler unten gefunden.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { baueFernwege } from "../public/browser-pane-fernwege.js";
import { createBrowserSessionClient } from "../public/browser-pane-session.js";
import { hauptmenueEintraege, zoomNachWahl, schalteVollbild } from "../public/browser-pane-hauptmenue.js";

import { istLeereHuelle, shouldOpenInRealBrowser } from "../public/browser-pane-adressen.js";

const lies = (pfad) => fs.readFileSync(pfad, "utf8");

function fernwegeMit({ antwort, bereit = true }) {
  const rufe = [];
  const verlauf = [];
  const sessionClient = {
    ready: () => bereit,
    actUndWarte: async (tab, aktion, hooks) => {
      rufe.push({ aktion, hooks });
      return typeof antwort === "function" ? antwort(tab, aktion) : antwort;
    }
  };
  const wege = baueFernwege({
    sessionClient, refs: {}, routes: { api: {} },
    setFrame: () => {}, setFallbackFrame: () => {},
    commitHistory: (tab, url, push) => verlauf.push({ url, push }),
    showHint: () => {}, persistTabs: () => {}, render: () => {}
  });
  return { wege, rufe, verlauf };
}

const liveTab = (extra = {}) => ({ sessionId: "s1", mode: "live-browser", frame: {}, url: "https://a.example/", title: "A", status: "ready", ...extra });

test("Schnellweg: neue Adresse laeuft in DERSELBEN Sitzung (gemessen 2,8 s statt 9 s)", async () => {
  const { wege, rufe, verlauf } = fernwegeMit({ antwort: { ok: true, screenshot: "data:image/jpeg;base64,xx", finalUrl: "https://b.example/ziel", title: "B" } });
  const tab = liveTab();
  assert.equal(await wege.navigiereInSitzung(tab, "https://b.example/", { push: true }), true);
  assert.deepEqual(rufe[0].aktion, { type: "navigate", url: "https://b.example/", fristMs: 35_000 });
  assert.equal(tab.sessionId, "s1", "die Sitzung bleibt — kein neuer Chrome auf dem Server");
  assert.equal(tab.url, "https://b.example/ziel", "die Weiterleitung landet in der Adressleiste");
  assert.equal(tab.status, "ready");
  assert.deepEqual(verlauf, [{ url: "https://b.example/ziel", push: true }], "GENAU ein Verlaufseintrag");
  assert.equal(rufe[0].hooks.onNavigated, undefined, "ohne onNavigated — sonst schriebe der Haken ein zweites Mal in den Verlauf");
});

test("Schnellweg: Neu laden schickt reload statt einer zweiten Navigation", async () => {
  const { wege, rufe, verlauf } = fernwegeMit({ antwort: { ok: true, screenshot: "x", finalUrl: "https://a.example/" } });
  const tab = liveTab();
  assert.equal(await wege.navigiereInSitzung(tab, "https://a.example/", { push: false }), true);
  assert.equal(rufe[0].aktion.type, "reload");
  assert.deepEqual(verlauf, [{ url: "https://a.example/", push: false }]);
});

test("Schnellweg ist nie der EINZIGE Weg: ohne Live-Sitzung, bei Fehler und bei verlorener Sitzung uebernimmt der alte", async () => {
  for (const tab of [liveTab({ sessionId: "" }), liveTab({ mode: "proxy" }), liveTab({ frame: null })]) {
    const { wege, rufe } = fernwegeMit({ antwort: { ok: true, screenshot: "x" } });
    assert.equal(await wege.navigiereInSitzung(tab, "https://b.example/"), false);
    assert.equal(rufe.length, 0, "ohne Live-Sitzung wird der Server gar nicht gefragt");
  }
  const fehler = fernwegeMit({ antwort: { ok: false, error: "session_busy", beschaeftigt: true } });
  const tab = liveTab();
  assert.equal(await fehler.wege.navigiereInSitzung(tab, "https://b.example/"), false);
  assert.equal(tab.status, "ready", "kein haengender Ladezustand nach einem Fehlschlag");
  assert.equal(fehler.verlauf.length, 0);

  const verloren = fernwegeMit({ antwort: (t) => { t.sessionId = ""; return { ok: false, verloren: true }; } });
  assert.equal(await verloren.wege.navigiereInSitzung(liveTab(), "https://b.example/"), false);
});

test("Schnellweg: eine NEUERE Navigation gewinnt — die alte fasst danach nichts mehr an", async () => {
  let loeseErste;
  const { wege, verlauf } = fernwegeMit({
    antwort: (tab, aktion) => aktion.url === "https://langsam.example/"
      ? new Promise((fertig) => { loeseErste = () => fertig({ ok: true, screenshot: "x", finalUrl: aktion.url }); })
      : { ok: true, screenshot: "x", finalUrl: aktion.url }
  });
  const tab = liveTab();
  const erste = wege.navigiereInSitzung(tab, "https://langsam.example/");
  assert.equal(await wege.navigiereInSitzung(tab, "https://schnell.example/"), true);
  loeseErste();
  assert.equal(await erste, true, "uebernommen melden, damit der Aufrufer die Sitzung nicht schliesst");
  assert.equal(tab.url, "https://schnell.example/", "die spaete Antwort ueberschreibt die Adresse nicht");
  assert.deepEqual(verlauf.map((v) => v.url), ["https://schnell.example/"]);
});

test("Schonfrist: Fenster zu gibt den Server-Chrome nach der Frist frei — frueheres Oeffnen verwirft sie", () => {
  const uhren = [];
  const echtSet = globalThis.setTimeout;
  const echtClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { uhren.push({ fn, ms, tot: false }); return uhren.length; };
  globalThis.clearTimeout = (id) => { if (uhren[id - 1]) uhren[id - 1].tot = true; };
  try {
    const geschlossen = [];
    const routes = { api: { browserSession: "https://api.example/s", browserSessionAct: "https://api.example/a", browserSessionClose: "https://api.example/c" } };
    const client = createBrowserSessionClient({ routes, fetchImpl: async (url, init) => { geschlossen.push(JSON.parse(init.body).sessionId); return { ok: true, status: 200, json: async () => ({}) }; } });
    let entfernt = 0;
    const tabs = [{ sessionId: "s1", frame: { remove: () => { entfernt += 1; } } }, { sessionId: "", frame: { remove: () => { entfernt += 1; } } }];

    client.planeEnde(() => tabs);
    assert.equal(uhren[0].ms, 120_000, "zwei Minuten Schonfrist — kurz zuklappen kostet keinen neuen Chrome");
    client.verwerfeEnde();
    assert.equal(uhren[0].tot, true, "wieder geoeffnet: die Frist ist weg");
    assert.deepEqual(geschlossen, []);

    client.planeEnde(() => tabs);
    uhren[1].fn();
    assert.deepEqual(geschlossen, ["s1"]);
    assert.equal(tabs[0].sessionId, "");
    assert.equal(tabs[0].frame, null, "ohne Rahmen laedt openPane()/selectTab() den Tab von selbst neu");
    assert.equal(entfernt, 1, "Tabs ohne Sitzung (Direkt-/Proxy-Ansicht) bleiben unangetastet");
  } finally {
    globalThis.setTimeout = echtSet;
    globalThis.clearTimeout = echtClear;
  }
});

test("Hauptmenue: haelt, was der Knopfname verspricht — und laesst den alten Griff drin", () => {
  const leer = hauptmenueEintraege({});
  assert.deepEqual(leer.filter((e) => e.aktiv === false).map((e) => e.id), ["vor", "suche", "zoomPlus", "zoomMinus", "zoomNull", "adresseKopieren", "extern"]);
  assert.equal(leer.at(-1).id, "uebersicht", "der bisherige Klick (zur Uebersicht) bleibt erreichbar");
  const voll = hauptmenueEintraege({ hatSeite: true, zoom: 2, vollbild: true });
  assert.equal(voll.find((e) => e.id === "zoomPlus").aktiv, false, "bei 200 % ist Schluss");
  assert.equal(voll.find((e) => e.id === "vollbild").text, "Vollbild beenden");
  assert.equal(hauptmenueEintraege({ vollbildMoeglich: false }).find((e) => e.id === "vollbild").aktiv, false, "iPhone-Safari: ausgegraut statt tot");
  assert.equal(zoomNachWahl(1, "zoomPlus"), 1.1);
  assert.equal(zoomNachWahl(0.5, "zoomMinus"), 0.5);
  assert.equal(zoomNachWahl(1.7, "zoomNull"), 1);
});

test("Vollbild: schaltet um und bleibt bei fehlender API folgenlos", async () => {
  let an = 0; let aus = 0;
  const dok = { fullscreenElement: null, exitFullscreen: async () => { aus += 1; } };
  assert.equal(await schalteVollbild({ requestFullscreen: async () => { an += 1; } }, dok), true);
  dok.fullscreenElement = {};
  assert.equal(await schalteVollbild({}, dok), false);
  assert.deepEqual([an, aus], [1, 1]);
  assert.equal(await schalteVollbild({}, { fullscreenElement: null }), false, "keine API: kein Wurf");
  assert.equal(await schalteVollbild({ requestFullscreen: async () => { throw new Error("verweigert"); } }, { fullscreenElement: null }), false);
});

test("Stil: Menues liegen UEBER dem Fenster, der Globus raeumt den Kopf", () => {
  const css = lies("public/browser-pane-chrome.css");
  const menueZ = Number(css.match(/\.bp-tabmenue \{[^}]*?z-index:\s*(\d+)/s)?.[1]);
  const fensterZ = Number(lies("public/panel-backdrop.css").match(/\.browser-panel \{\s*z-index:\s*(\d+)/)?.[1]);
  assert.ok(menueZ > fensterZ, `Menue (${menueZ}) muss ueber dem Fenster (${fensterZ}) liegen — live stand es dahinter und war unsichtbar`);
  assert.match(css, /body\.browser-pane-open #browserButton,[\s\S]{0,80}visibility:\s*hidden;\s*pointer-events:\s*none;/,
    "der Globus verdeckte live Maus-, Menue- und Schliessen-Knopf");
  assert.equal(lies("public/start-styles.css").includes("body.browser-pane-open #browserButton"), true, "das Buendel muss die Regel tragen — geladen wird NUR das Buendel");
});

test("Verdrahtung: browser-pane.js nutzt Schnellweg, Schonfrist, Hauptmenue und deckelt den Verlauf", () => {
  const quelle = lies("public/browser-pane.js");
  assert.match(quelle, /if \(await navigiereInSitzung\(tab, url, \{ push \}\)\) return;\s*\n\s*if \(tab\.sessionId\) \{ sessionClient\.close/,
    "der Schnellweg steht VOR dem Schliessen der Sitzung");
  assert.match(quelle, /sessionClient\.bewacheFenster\(/);
  assert.match(quelle, /verdrahteHauptmenue\(\{ knopf: refs\.menu/);
  assert.match(quelle, /\.slice\(-200\)/, "tab.history wuchs im Speicher unbegrenzt");
  assert.match(lies("public/sw.js"), /"\/assets\/browser-pane-hauptmenue\.js"/, "neues Modul gehoert in den Vorrat, sonst fehlt es offline");
  assert.match(lies("public/browser-pane-menue.js"), /\(document\.fullscreenElement \|\| document\.body\)\.appendChild\(menue\)/,
    "im Vollbild zeichnet der Browser nur den Vollbild-Teilbaum");
});

test("Leere Huelle: skriptgebaute Seiten gehen in den echten Browser statt als leeres Blatt in den Proxy", () => {
  const conax = `<!doctype html><html><head><title>con.ax Register</title><style>body{background:#0b1020}${".x{color:red}".repeat(200)}</style></head><body><a href="#main">Skip to content</a><div id="root"></div></body></html>`;
  assert.equal(istLeereHuelle(conax), true, "live gemessen: 15 Zeichen sichtbarer Text");
  assert.equal(shouldOpenInRealBrowser(conax, "https://con.ax/en/register"), true);
  const beispiel = `<html><body><h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p><a href="#">Learn more</a></body></html>`;
  assert.equal(istLeereHuelle(beispiel), false, "kurze, aber echte Seiten bleiben auf dem schnellen Weg");
  assert.equal(istLeereHuelle(`<html><body><img src="a.png"></body></html>`), false, "eine Bildseite ist nicht leer");
  assert.equal(istLeereHuelle(""), false);
  assert.equal(istLeereHuelle("<html><body>normale Seite</body></html>"), false, "winzige Seiten sind keine Huelle");
});

test("Server sah nur eine Fehlerseite (Wikipedia: 403): der echte Browser entscheidet, nicht der Direkt-Rahmen", () => {
  const fehlerseite = "<html><head><title>Wikimedia Error</title></head><body><h1>Error</h1><p>Our servers are currently under maintenance or experiencing a technical issue.</p></body></html>";
  assert.equal(shouldOpenInRealBrowser(fehlerseite, "https://de.wikipedia.org/wiki/Berlin", 403), true);
  assert.equal(shouldOpenInRealBrowser(fehlerseite, "https://de.wikipedia.org/wiki/Berlin", 200), false);
  assert.equal(shouldOpenInRealBrowser(fehlerseite, "https://de.wikipedia.org/wiki/Berlin"), false, "ohne Status bleibt alles wie bisher");
  assert.match(lies("public/browser-pane.js"), /shouldOpenInRealBrowser\(data\.html, finalUrl, data\.status\)/);
});

test("Escape gehoert dem offenen Menue — das Fenster dahinter bleibt offen", () => {
  const quelle = lies("public/browser-pane-menue.js");
  assert.match(quelle, /e\.stopImmediatePropagation\(\);\s*\n\s*schliesseMenue\(\);/);
  assert.match(quelle, /addEventListener\("keydown", tastenHaken, true\)/, "Einfangphase: VOR dem Escape-Haken von panel-backdrop.js");
  assert.match(quelle, /removeEventListener\("keydown", tastenHaken, true\)/, "mit demselben Schalter wieder entfernen, sonst bleibt der Haken haengen");
});

// --- A-bis-Z-Test der ganzen App, 19.09.2026 -----------------------------------
import { haengeBrowserNachladerEin } from "../public/browser-nachladen.js";

function nachladerBuehne() {
  const klick = [];
  const horcher = new Map();
  const dokument = {
    getElementById: () => ({ classList: { contains: () => false } }),
    addEventListener: (art, fn) => { if (art === "click") klick.push(fn); }
  };
  const fenster = {
    addEventListener: (art, fn) => { (horcher.get(art) || horcher.set(art, []).get(art)).push(fn); },
    dispatchEvent: (e) => { (horcher.get(e.type) || []).forEach((fn) => fn(e)); return true; }
  };
  return { dokument, fenster, klick, horcher };
}

test("Nachlader: der Browser-Knopf der Seitenleiste laedt das Modul und klickt danach noch einmal (live war er tot)", async () => {
  if (typeof globalThis.MutationObserver === "undefined") globalThis.MutationObserver = class { observe() {} disconnect() {} };
  const { dokument, fenster, klick } = nachladerBuehne();
  let geladen = 0;
  haengeBrowserNachladerEin(dokument, fenster, async () => { geladen += 1; });
  let nochmal = 0; let verhindert = 0;
  const knopf = { click: () => { nochmal += 1; } };
  let angehalten = 0;
  const ereignis = { target: { closest: (s) => (s === "[data-browser-oeffnen]" ? knopf : null) }, preventDefault: () => { verhindert += 1; }, stopPropagation: () => { angehalten += 1; }, stopImmediatePropagation: () => { angehalten += 1; } };
  klick.forEach((fn) => fn(ereignis));
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual([geladen, nochmal, verhindert], [1, 1, 1], "laden, EINMAL nachklicken");
  assert.equal(angehalten, 2, "der Seiten-Router darf den Klick nicht sehen — live sprang die Mitte sonst auf die Fehlerseite");
  klick.forEach((fn) => fn(ereignis));
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual([geladen, nochmal], [1, 1], "ist das Modul da, haelt sich der Nachlader heraus — browser-pane.js uebernimmt");
});

test("Nachlader: ein Browser-Auftrag aus dem Chat wird nach dem Laden nachgereicht statt zu verpuffen", async () => {
  if (typeof globalThis.CustomEvent === "undefined") globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const { dokument, fenster, horcher } = nachladerBuehne();
  haengeBrowserNachladerEin(dokument, fenster, async () => {});
  assert.ok(horcher.has("smejj:browser-request"), "ohne Horcher ging der erste Auftrag verloren");
  const empfangen = [];
  fenster.addEventListener("smejj:browser-request", (e) => empfangen.push(e.detail?.url));
  fenster.dispatchEvent({ type: "smejj:browser-request", detail: { url: "https://example.com/" } });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(empfangen, ["https://example.com/", "https://example.com/"], "einmal das Original, einmal nachgereicht fuer das frisch geladene Modul");
});

test("Handy: Kopfknoepfe des Browsers sind 44 px — nur fuer Finger, und was weicht, steht im Menue", () => {
  const css = lies("public/browser-pane-chrome.css");
  const block = css.slice(css.indexOf("@media (max-width: 680px) and (pointer: coarse)"));
  assert.match(block, /--bp-control-size:\s*44px;/, "live gemessen am Pixel-Emulator: 22x22 px");
  assert.match(block, /--bp-row-height:\s*48px;/);
  assert.match(block, /\.bp-nav-forward,\s*\n\s*\.bp-toolbar \.bp-open-external \{\s*display:\s*none;/);
  assert.match(block, /\.bp-address \{\s*font-size:\s*16px;/, "unter 16 px zoomt iOS beim Antippen hinein");
  const ids = hauptmenueEintraege({ hatSeite: true, kannVor: true }).filter((e) => e.aktiv !== false).map((e) => e.id);
  assert.ok(ids.includes("vor") && ids.includes("extern"), "Vorwaerts und extern bleiben ueber das Menue erreichbar");
  assert.match(lies("public/browser-pane.css"), /--bp-control-size:\s*22px;/, "der Desktop behaelt die kompakte Leiste");
});

// --- Fenstergroesse ohne neuen Server-Chrome (19./20.09.) -----------------------
import { createSessionEngine, validateSessionAction } from "../workers/remote-browser/session-engine.js";
import { buildPageOptions as workerSeitenOptionen, isAllowedTarget as workerZielErlaubt } from "../workers/remote-browser/worker.js";

function viewportMaschine(log) {
  const page = {
    currentUrl: "https://example.com/", setDefaultTimeout: () => {}, goto: async () => ({ status: () => 200 }),
    waitForLoadState: async () => {}, waitForTimeout: async () => {}, title: async () => "Example", url: () => page.currentUrl,
    screenshot: async () => Buffer.from("jpg"), setViewportSize: async (v) => log.push(["setViewportSize", v.width, v.height])
  };
  const browser = { newPage: async () => page, close: async () => {} };
  return createSessionEngine({
    isAllowedTarget: workerZielErlaubt, buildPageOptions: workerSeitenOptionen,
    assertPublicHostname: async () => {}, assertPublicRequest: async () => {},
    playwrightLoader: async () => ({ chromium: { launch: async () => browser } }), dnsLookup: async () => [{ address: "93.184.216.34" }]
  });
}

test("Worker: 'viewport' aendert die Groesse der LAUFENDEN Sitzung — geklemmt, und nie ueber die Handy/Desktop-Grenze", async () => {
  assert.deepEqual(validateSessionAction({ type: "viewport", width: 900.4, height: 700 }, {}), { ok: true, action: { type: "viewport", width: 900, height: 700 } });
  assert.equal(validateSessionAction({ type: "viewport", width: "breit", height: 700 }, {}).ok, false);
  const log = [];
  const maschine = viewportMaschine(log);
  const offen = await maschine.open({ url: "https://example.com/", viewport: { width: 1000, height: 700 } });
  assert.equal(offen.ok, true);
  const groesser = await maschine.act({ sessionId: offen.sessionId, action: { type: "viewport", width: 5000, height: 900 } });
  assert.equal(groesser.ok, true);
  assert.deepEqual(log.at(-1), ["setViewportSize", 1920, 900], "auf die Grenzen von buildPageOptions geklemmt");
  assert.deepEqual(groesser.viewport, { width: 1920, height: 900 }, "Klicks rechnen danach mit der neuen Groesse");
  assert.equal(groesser.sessionId, offen.sessionId, "dieselbe Sitzung — kein neuer Chrome");
  const handy = await maschine.act({ sessionId: offen.sessionId, action: { type: "viewport", width: 400, height: 800 } });
  assert.equal(handy.ok, false, "Desktop-Sitzung wird nicht zur Handy-Sitzung: User-Agent und Touch stehen seit dem Start fest");
  assert.match(String(handy.error), /viewport_klasse_wechsel/);
});

test("Client: Panel groesser gezogen → erst die Sitzung anpassen, nur bei Ablehnung neu aufbauen", async () => {
  const mit = (antwort) => { const rufe = []; const wege = baueFernwege({ sessionClient: { ready: () => true, actUndWarte: async (t, a) => { rufe.push(a); return antwort; } }, refs: { content: { getBoundingClientRect: () => ({ width: 1100, height: 820 }) } }, routes: { api: {} }, setFrame() {}, setFallbackFrame() {}, commitHistory() {}, showHint() {}, persistTabs() {}, render() {} }); return { wege, rufe }; };
  const gut = mit({ ok: true, screenshot: "x", viewport: { width: 1100, height: 820 } });
  const tab = liveTab({ remoteViewport: { width: 600, height: 700 } });
  assert.equal(await gut.wege.passeSitzungAn(tab), true);
  assert.deepEqual(gut.rufe[0], { type: "viewport", width: 1100, height: 820, fristMs: 15_000 });
  assert.deepEqual(tab.remoteViewport, { width: 1100, height: 820 });
  assert.equal(await mit({ ok: false, error: "action_unknown" }).wege.passeSitzungAn(liveTab()), false, "alter Worker: der bisherige Weg uebernimmt");
  assert.equal(await mit({ ok: true, screenshot: "x" }).wege.passeSitzungAn(liveTab({ mode: "proxy" })), false);
  assert.match(lies("public/browser-pane.js"), /passeSitzungAn\(tab\)\.then\(\(ok\) => \{ if \(!ok\) return oeffneImLiveBrowser\(tab\.url\); \}\)/);
});

// --- Proxy-Seite als eigenes Dokument + HTTPS zuerst (Live-Test 20.09., v907) ---------
import { handleBrowserPage, seitenRegel } from "../control-server/src/routes/browserPageRoute.js";
import { rewriteBrowserHtml, ladeBrowserSeite, parseBrowserTarget as torZiel } from "../control-server/src/routes/browserProxyRoutes.js";
import { normalizeAddress, normalizeAgentBrowserUrl } from "../public/browser-pane-adressen.js";

function antwortAttrappe() {
  return { status: 0, kopf: {}, rumpf: "", writeHead(s, k) { this.status = s; this.kopf = k; }, end(b) { this.rumpf = String(b || ""); } };
}
const seiteVomNetz = (html, kopf = {}) => async () => ({ url: "https://github.com/torvalds/linux", status: 200, headers: { get: (n) => ({ "content-type": "text/html; charset=utf-8", ...kopf })[n.toLowerCase()] || null }, text: async () => html });

test("Proxy-Seite: eigenes Dokument mit EIGENER Regel — Stil und Bilder vom Original, Skript nur unseres, nie als Registerkarte", async () => {
  const html = '<html><head><link rel="stylesheet" href="/a.css"><script>boese()</script></head><body onload="x()"><a href="/y">y</a></body></html>';
  const res = antwortAttrappe();
  const req = { headers: { "sec-fetch-dest": "iframe" }, socket: { remoteAddress: "203.0.113.9" } };
  await handleBrowserPage(new URL("https://api.example/api/browser/page?url=https%3A%2F%2Fgithub.com%2Ftorvalds%2Flinux"), res, { fetchImpl: seiteVomNetz(html), req, limiter: null, env: { SMEJJ_ALLOWED_ORIGINS: "https://smejj.com" } });
  assert.equal(res.status, 200);
  assert.match(res.kopf["Content-Type"], /text\/html/);
  const regel = res.kopf["Content-Security-Policy"];
  const nonce = regel.match(/script-src 'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "genau EIN Skript ist erlaubt: unseres, per Nonce");
  assert.match(regel, /style-src \* 'unsafe-inline'/, "live erschien github.com ohne ein einziges Stylesheet");
  assert.match(regel, /img-src \* data: blob:/);
  assert.match(regel, /sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox$/, "OHNE allow-same-origin: kein Zugriff auf Cookies von api.smejj.com");
  assert.match(regel, /frame-ancestors /);
  assert.match(regel, /connect-src 'none'/);
  assert.equal(res.kopf["X-Frame-Options"], undefined, "DENY wuerde genau den Rahmen verbieten, fuer den die Antwort gebaut ist");
  assert.doesNotMatch(res.rumpf, /boese\(\)|onload=/, "Skripte und Inline-Handler der Seite bleiben entfernt");
  assert.match(res.rumpf, new RegExp(`<script nonce="${nonce.replace(/[+/=]/g, "\\$&")}">`), "das Navigationsskript traegt den Nonce der Regel");
  assert.match(res.rumpf, /<base href="https:\/\/github\.com\/torvalds\/linux"/);

  const tab = antwortAttrappe();
  await handleBrowserPage(new URL("https://api.example/api/browser/page?url=https%3A%2F%2Fgithub.com%2F"), tab, { fetchImpl: seiteVomNetz(html), req: { headers: { "sec-fetch-dest": "document" }, socket: {} }, limiter: null, env: {} });
  assert.equal(tab.status, 403, "als eigene Registerkarte stuende fremder Inhalt unter unserem Namen im Adressfeld");
  const intern = antwortAttrappe();
  await handleBrowserPage(new URL("https://api.example/api/browser/page?url=http%3A%2F%2F192.168.1.1%2F"), intern, { fetchImpl: seiteVomNetz(html), req, limiter: null, env: {} });
  assert.equal(intern.status, 400, "dieselbe Zielpruefung wie /api/browser/fetch — private Netze bleiben zu");
  assert.match(seitenRegel({ nonce: "n", erlaubteEinbetter: [] }), /frame-ancestors 'none'/, "ohne bekannte Einbetter: niemand");
});

test("Proxy-Seite: Kurz-Vorrat nur mit dem echten fetch — Attrappen bekommen jeden Abruf frisch", async () => {
  let rufe = 0;
  const holen = async () => { rufe += 1; return { url: "https://example.com/", status: 200, headers: { get: () => "text/html" }, text: async () => "<html></html>" }; };
  const ziel = torZiel("https://example.com/");
  await ladeBrowserSeite(ziel, { fetchImpl: holen }); await ladeBrowserSeite(ziel, { fetchImpl: holen });
  assert.equal(rufe, 2);
  await ladeBrowserSeite(ziel, { fetchImpl: holen, vorrat: true }); await ladeBrowserSeite(ziel, { fetchImpl: holen, vorrat: true });
  assert.equal(rufe, 3, "mit Vorrat: /fetch und /page teilen sich EINEN Abruf vom Original");
  assert.doesNotMatch(rewriteBrowserHtml("<html><body></body></html>", "https://example.com/"), /nonce=/, "ohne Nonce bleibt der alte srcdoc-Weg unveraendert");
});

test("Client: Proxy-Seiten kommen als Dokument von /api/browser/page, mit strenger Sandbox; http wird zu https", () => {
  const wege = (seite) => baueFernwege({ sessionClient: { ready: () => false }, refs: {}, routes: { api: { browserPage: seite } }, setFrame() {}, setFallbackFrame() {}, commitHistory() {}, showHint() {}, persistTabs() {}, render() {} });
  assert.deepEqual(wege("https://api.smejj.com/api/browser/page").proxyRahmen("https://github.com/a?b=1", "<html>"), { src: "https://api.smejj.com/api/browser/page?url=https%3A%2F%2Fgithub.com%2Fa%3Fb%3D1", mode: "proxy" });
  assert.deepEqual(wege("/api/browser/page").proxyRahmen("https://github.com/", "<html>"), { srcdoc: "<html>", mode: "proxy" }, "ohne absolute Route (lokal, alter Server) bleibt der srcdoc-Rueckfall");
  const ausFetch = baueFernwege({ sessionClient: { ready: () => false }, refs: {}, routes: { api: { browserFetch: "https://api.smejj.com/api/browser/fetch" } }, setFrame() {}, setFallbackFrame() {}, commitHistory() {}, showHint() {}, persistTabs() {}, render() {} });
  assert.equal(ausFetch.proxyRahmen("https://github.com/", "<html>").src, "https://api.smejj.com/api/browser/page?url=https%3A%2F%2Fgithub.com%2F", "ohne eigenen Eintrag wird die Route aus browserFetch abgeleitet — config.js bleibt unberuehrt");
  const quelle = lies("public/browser-pane.js");
  assert.match(quelle, /setFrame\(tab, proxyRahmen\(finalUrl, data\.html\)\);/);
  assert.match(quelle, /const usesSrcdoc = Boolean\(srcdoc\) \|\| mode === "proxy";/, "das Proxy-Dokument bekommt dieselbe strenge Sandbox wie srcdoc (ohne allow-same-origin)");
  assert.equal(normalizeAddress("http://example.com/x"), "https://example.com/x", "live blieb der http-Rahmen grau");
  assert.equal(normalizeAgentBrowserUrl("http://example.com/x"), "", "der Agent bekommt kein stilles Anheben");
});

test("Proxy-Seite wird komprimiert ausgeliefert — 305 KB HTML brauchten live 15-30 s ueber eine langsame Leitung", async () => {
  const { brotliDecompressSync, gunzipSync } = await import("node:zlib");
  const html = "<html><head></head><body>" + "<p>smejj.com Browser Zeile</p>".repeat(4000) + "</body></html>";
  const hole = async (kodierung) => {
    const res = { status: 0, kopf: {}, rumpf: null, writeHead(s, k) { this.status = s; this.kopf = k; }, end(b) { this.rumpf = b; } };
    await handleBrowserPage(new URL("https://api.example/api/browser/page?url=https%3A%2F%2Fgithub.com%2F"), res, { fetchImpl: seiteVomNetz(html), req: { headers: { "sec-fetch-dest": "iframe", ...(kodierung ? { "accept-encoding": kodierung } : {}) }, socket: {} }, limiter: null, env: {} });
    return res;
  };
  const br = await hole("gzip, deflate, br");
  assert.equal(br.kopf["Content-Encoding"], "br");
  assert.ok(br.rumpf.length < html.length / 5, `Brotli: ${br.rumpf.length} von ${html.length} Bytes`);
  assert.match(brotliDecompressSync(br.rumpf).toString("utf8"), /smejj\.com Browser Zeile/);
  assert.equal(br.kopf["Content-Length"], br.rumpf.length);
  const gz = await hole("gzip");
  assert.equal(gz.kopf["Content-Encoding"], "gzip");
  assert.match(gunzipSync(gz.rumpf).toString("utf8"), /<base href=/);
  const roh = await hole("");
  assert.equal(roh.kopf["Content-Encoding"], undefined, "ohne Angebot des Aufrufers bleibt es unkomprimiert");
  assert.match(String(roh.rumpf), /<script nonce=/);
});

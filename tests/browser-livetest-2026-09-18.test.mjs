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
  assert.deepEqual(leer.filter((e) => e.aktiv === false).map((e) => e.id), ["suche", "zoomPlus", "zoomMinus", "zoomNull", "adresseKopieren", "extern"]);
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

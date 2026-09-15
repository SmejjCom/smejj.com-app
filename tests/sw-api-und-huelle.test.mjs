// smejj.com — A-bis-Z-Livetest 15.09.2026, zwei Service-Worker-Befunde:
//
// M4: Nach dem Anmelden steuerte noch der SCHMALE Service Worker der Landeseite,
//     bis der volle installiert war. /chat-history kam von GitHub Pages als 404,
//     huelleAusCache fand "/" nicht im schmalen Speicher und lieferte die
//     LANDESEITE (Android-Emulator > 7 min). Jetzt: Huelle aus dem Netz.
// F9: Firefox /papierkorb: /api/chats?id= wurde beim Ansichtswechsel abgebrochen;
//     respondWith(fetch(request)) machte daraus "ServiceWorker fing die Anfrage ab
//     … unerwarteter Fehler". Jetzt: /api/ laeuft am Service Worker vorbei.
//
// Getestet wird der ECHTE sw.js in einer nachgebauten Service-Worker-Umgebung.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const QUELLE = readFileSync("public/sw.js", "utf8");

function speicher() {
  const alle = new Map();
  const pfad = (a) => new URL(typeof a === "string" ? a : a.url, "https://smejj.com").pathname;
  const oeffne = (name) => {
    if (!alle.has(name)) alle.set(name, new Map());
    const e = alle.get(name);
    return {
      async addAll(anfragen) { for (const a of anfragen) e.set(pfad(a), { ok: true, status: 200, body: `speicher:${pfad(a)}` }); },
      async put(a, antwort) { e.set(pfad(a), antwort); },
      async match(a) { return e.get(pfad(a)); }
    };
  };
  return {
    open: async (n) => oeffne(n),
    keys: async () => [...alle.keys()],
    delete: async (n) => alle.delete(n),
    match: async (a) => { for (const n of alle.keys()) { const t = await oeffne(n).match(a); if (t) return t; } return undefined; }
  };
}

/** netz(pfad) liefert die Antwort des "Servers" oder wirft (offline). */
function ladeSw(adresse, netz, quelle = QUELLE) {
  const lauscher = {};
  const self = { location: new URL(adresse, "https://smejj.com"), addEventListener: (t, f) => { lauscher[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
  const fetch = async (a) => netz(new URL(typeof a === "string" ? a : a.url, "https://smejj.com").pathname);
  class Request { constructor(url, init = {}) { this.url = new URL(url, "https://smejj.com").href; Object.assign(this, init); } }
  vm.runInContext(quelle, vm.createContext({ self, caches: speicher(), fetch, Request, URL, Response: { redirect: () => ({}) }, Promise, Set, Map, console, setTimeout, clearTimeout, AbortSignal }));
  const ereignis = async (typ, daten = {}) => {
    let warten = Promise.resolve(); let antwort; let abgefangen = false;
    lauscher[typ]({ ...daten, waitUntil: (p) => { warten = p; }, respondWith: (p) => { abgefangen = true; antwort = p; } });
    await warten;
    return { abgefangen, antwort: abgefangen ? await antwort : undefined };
  };
  return {
    installiere: () => ereignis("install"),
    rufe: (pfad, { navigate = false } = {}) => ereignis("fetch", { request: { url: new URL(pfad, "https://smejj.com").href, method: "GET", mode: navigate ? "navigate" : "cors", destination: navigate ? "document" : "" } })
  };
}

// GitHub Pages: "/" ist die App-Huelle, App-Routen gibt es als Datei nicht (404).
const pages = (pfad) => pfad === "/" ? { ok: true, status: 200, body: "netz:/" } : pfad === "/chat-history" || pfad === "/settings" ? { ok: false, status: 404, body: "404" } : { ok: true, status: 200, body: `netz:${pfad}` };

// Die ALTE Fassung von huelleAusCache als Gegenprobe (Stand SW v883).
const ALT = QUELLE.replace(/function huelleAusCache\(rueckfall\) \{[\s\S]*?\n\}/, `function huelleAusCache(rueckfall) {
  return caches.match("/", { ignoreSearch: true })
    .then((huelle) => huelle || caches.match("/willkommen.html"))
    .then((seite) => seite || rueckfall || fetch("/"));
}`);

test("KAPUTT (v883): im schmalen Eingang zeigt /chat-history nach dem Anmelden die Landeseite", async () => {
  assert.notEqual(ALT, QUELLE, "die Gegenprobe muss die alte Fassung wirklich einsetzen");
  const sw = ladeSw("/sw.js?eingang=willkommen", pages, ALT);
  await sw.installiere();
  const { antwort } = await sw.rufe("/chat-history", { navigate: true });
  assert.equal(antwort.body, "speicher:/willkommen.html");
});

test("GESUND: im schmalen Eingang holt eine App-Route die Huelle aus dem Netz — nie die Landeseite", async () => {
  const sw = ladeSw("/sw.js?eingang=willkommen", pages);
  await sw.installiere();
  for (const route of ["/chat-history", "/settings"]) {
    const { antwort } = await sw.rufe(route, { navigate: true });
    assert.equal(antwort.body, "netz:/", `${route} bekommt die App-Huelle`);
  }
});

test("GESUND: offline im schmalen Eingang bleibt die Landeseite der Rueckfall (statt Browser-Fehlerseite)", async () => {
  const sw = ladeSw("/sw.js?eingang=willkommen", () => { throw new TypeError("Failed to fetch"); });
  await sw.installiere();
  const { antwort } = await sw.rufe("/chat-history", { navigate: true });
  assert.equal(antwort.body, "speicher:/willkommen.html");
});

test("GESUND: der volle Service Worker nimmt weiter die Huelle aus dem Speicher", async () => {
  const sw = ladeSw("/sw.js", pages);
  await sw.installiere();
  const { antwort } = await sw.rufe("/chat-history", { navigate: true });
  assert.equal(antwort.body, "speicher:/");
});

test("KAPUTT (v883) und GESUND: eine abgebrochene /api/-Anfrage", async () => {
  const abbruch = (pfad) => { if (pfad.startsWith("/api/")) throw new DOMException("The operation was aborted.", "AbortError"); return pages(pfad); };
  const altApi = QUELLE.replace(/if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/, 'if (url.pathname.startsWith("/api/")) { event.respondWith(fetch(request)); return; }');
  assert.notEqual(altApi, QUELLE);
  const alt = ladeSw("/sw.js", abbruch, altApi);
  await assert.rejects(() => alt.rufe("https://api.smejj.com/api/chats?id=chat_1"), /aborted/, "vorher: der Abbruch landete als Fehler im respondWith");
  const neu = ladeSw("/sw.js", abbruch);
  const { abgefangen } = await neu.rufe("https://api.smejj.com/api/chats?id=chat_1");
  assert.equal(abgefangen, false, "jetzt: der Service Worker faengt /api/ gar nicht erst ab");
});

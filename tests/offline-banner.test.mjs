// Das rote Offline-Band der App-Huelle — zwei am 18.09.2026 live gemessene Fallen.
//
// FALLE 1 (iOS-Simulator, Landeseite UND App-Huelle): navigator.onLine meldete
// false, waehrend jeder Netzabruf durchging. Das Band klebte unter einer voll
// funktionierenden Seite. Der alte Code nahm den Wert als Beweis.
//
// FALLE 2 (Chrome, Hintergrund-Tab): Browser drosseln setInterval in versteckten
// Tabs auf Minutentakt. Nach der Rueckkehr nach vorn blieb das Band sichtbar,
// obwohl das Netz laengst zurueck war — der 15-s-Takt war nie gelaufen.
//
// Beide Faelle sind hier festgenagelt: das Band haengt an einer ECHTEN Anfrage,
// und beim Wechsel nach vorn wird sofort neu geprueft.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync("public/offline-banner.js", "utf8");

/**
 * Baut eine Umgebung, in der das Modul laeuft, ohne echten Browser.
 * `netz` entscheidet, ob eine Anfrage durchgeht oder wirft.
 */
function umgebung({ onLine = true, netz = true } = {}) {
  const lauscher = { window: {}, document: {} };
  const uhren = new Map();
  let naechsteUhr = 1;
  const anfragen = [];

  const band = {
    style: {},
    isConnected: false,
    setAttribute() {},
    textContent: "",
  };

  globalThis.window = {
    addEventListener: (art, fn) => { lauscher.window[art] = fn; },
  };
  globalThis.document = {
    visibilityState: "visible",
    body: { appendChild: () => { band.isConnected = true; } },
    createElement: () => band,
    addEventListener: (art, fn) => { lauscher.document[art] = fn; },
  };
  // globalThis.navigator ist in Node nur lesbar — es muss neu definiert werden.
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine }, configurable: true, writable: true,
  });
  globalThis.requestAnimationFrame = (fn) => fn();
  globalThis.setInterval = (fn) => { const id = naechsteUhr++; uhren.set(id, fn); return id; };
  globalThis.clearInterval = (id) => { uhren.delete(id); };
  globalThis.fetch = async (adresse, init) => {
    anfragen.push({ adresse, init });
    if (!netzDa.wert) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200 };
  };
  const netzDa = { wert: netz };

  return {
    band,
    anfragen,
    lauscher,
    netzDa,
    sichtbar: () => band.style.transform === "translateY(0)",
    // laesst alle laufenden Uhren einmal schlagen
    takten: async () => { for (const fn of [...uhren.values()]) await fn(); },
    uhrenZahl: () => uhren.size,
  };
}

// Jeder Test braucht ein frisches Modul: initOfflineBanner haengt einen Riegel
// an window, damit es sich nicht doppelt einhaengt.
async function frisch() {
  return import(`../public/offline-banner.js?t=${Math.random()}`);
}

test("FALLE 1: navigator.onLine luegt — ohne echte Not bleibt das Band weg", async () => {
  const u = umgebung({ onLine: false, netz: true });
  const { initOfflineBanner } = await frisch();
  initOfflineBanner();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(u.sichtbar(), false,
    "genau der iOS-Fall: onLine=false, aber die Anfrage geht durch — kein Alarm");
  assert.equal(u.anfragen.length, 1, "es wurde wirklich nachgefragt, nicht geraten");
});

test("die Probe ist HEAD, damit der Service Worker sie nicht aus dem Speicher beantwortet", async () => {
  const u = umgebung({ onLine: false, netz: true });
  const { initOfflineBanner } = await frisch();
  initOfflineBanner();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(u.anfragen[0].init.method, "HEAD",
    "der Service Worker faengt nur GET ab — HEAD laeuft vorbei und beweist echtes Netz");
  assert.equal(u.anfragen[0].init.cache, "no-store");
});

test("ist das Netz wirklich weg, kommt das Band", async () => {
  const u = umgebung({ onLine: true, netz: false });
  const { initOfflineBanner } = await frisch();
  initOfflineBanner();
  await u.lauscher.window.offline();
  assert.equal(u.sichtbar(), true, "gescheiterte Anfrage = echter Ausfall");
  assert.ok(u.uhrenZahl() > 0, "und es wird nachgefragt, bis das Netz zurueck ist");
});

test("kehrt das Netz zurueck, nimmt der Takt das Band weg — ohne online-Ereignis", async () => {
  const u = umgebung({ onLine: true, netz: false });
  const { initOfflineBanner } = await frisch();
  initOfflineBanner();
  await u.lauscher.window.offline();
  assert.equal(u.sichtbar(), true);
  u.netzDa.wert = true;
  await u.takten();
  assert.equal(u.sichtbar(), false,
    "iOS feuert 'online' nicht zuverlaessig — der Takt muss allein genuegen");
  assert.equal(u.uhrenZahl(), 0, "und danach laeuft keine Uhr mehr leer mit");
});

test("FALLE 2: wieder nach vorn geholt wird sofort geprueft, nicht erst im Takt", async () => {
  const u = umgebung({ onLine: true, netz: false });
  const { initOfflineBanner } = await frisch();
  initOfflineBanner();
  await u.lauscher.window.offline();
  assert.equal(u.sichtbar(), true);
  // Hintergrund-Tab: der Takt schlaeft (Drosselung). Netz kehrt unbemerkt zurueck.
  u.netzDa.wert = true;
  assert.ok(u.lauscher.document.visibilitychange,
    "ohne diesen Lauscher klebt das Band nach der Rueckkehr — live gemessen 18.09.");
  u.lauscher.document.visibilitychange();
  await new Promise((r) => setTimeout(r, 10)); // die Probe laeuft asynchron
  assert.equal(u.sichtbar(), false, "beim Wechsel nach vorn sofort neu geprueft");
});

test("das online-Ereignis nimmt das Band ohne Umweg weg", async () => {
  const u = umgebung({ onLine: true, netz: false });
  const { initOfflineBanner } = await frisch();
  initOfflineBanner();
  await u.lauscher.window.offline();
  assert.equal(u.sichtbar(), true);
  u.lauscher.window.online();
  assert.equal(u.sichtbar(), false, "es klemmt nicht, bis die naechste Probe laeuft");
  assert.equal(u.uhrenZahl(), 0);
});

test("der blinde Griff zu navigator.onLine ist aus der Quelle verschwunden", () => {
  assert.doesNotMatch(quelle, /onLine === false\)\s*showBanner\(\)/,
    "genau diese Zeile zeigte das Band ohne Beweis — sie darf nicht zurueckkommen");
  assert.match(quelle, /method:\s*"HEAD"/);
  assert.match(quelle, /visibilitychange/);
});

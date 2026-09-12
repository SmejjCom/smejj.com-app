// smejj.com — die Landeseite registriert den schmalen Service Worker und zeigt
// offline das Band der App.
//
// Hintergrund und Befund: siehe public/willkommen-offline.js und
// tests/sw-schmaler-eingang.test.mjs. Kurz: wer die App VOR der Anmeldung
// installierte, hatte keinen Service Worker und sah offline die Fehlerseite des
// Browsers (gemessen im iOS-Webclip am 12.09.).
//
// Die drei Zusagen dieses Moduls, jede mit ihrem Grund:
//   1. Es registriert NUR, wenn noch kein Service Worker aktiv ist — sonst warf
//      ein Nutzer, der sich abmeldet, seine 2 MB weg.
//   2. Es prueft das Netz mit einer ECHTEN Anfrage — navigator.onLine bleibt auf
//      iOS true, das rote Band erschien dort offline nie.
//   3. Es benutzt das Band der App (offline-banner.js) — kein zweites Band mit
//      eigenem Aussehen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { registriereSchmal, netzDa, beobachteNetz } = await import("../public/willkommen-offline.js");
const quelle = readFileSync("public/willkommen-offline.js", "utf8");
const seite = readFileSync("public/willkommen.html", "utf8");

function navAttrappe({ aktiv = false } = {}) {
  const registriert = [];
  return {
    registriert,
    serviceWorker: {
      getRegistration: async () => (aktiv ? { active: {} } : undefined),
      register: async (adresse) => { registriert.push(adresse); return {}; }
    }
  };
}

test("ohne aktiven Service Worker wird der SCHMALE registriert", async () => {
  const nav = navAttrappe();
  assert.equal(await registriereSchmal(nav), "registriert");
  assert.deepEqual(nav.registriert, ["/sw.js?eingang=willkommen"],
    "genau diese Adresse — ohne ?eingang legte der Service Worker die ganze App ab (2 MB je Besucher)");
});

test("ist schon einer aktiv, bleibt er — die 2 MB eines Abgemeldeten werden nicht weggeworfen", async () => {
  const nav = navAttrappe({ aktiv: true });
  assert.equal(await registriereSchmal(nav), "schon-aktiv");
  assert.deepEqual(nav.registriert, [], "kein zweiter Service Worker ueber dem vollen");
});

test("ohne Service-Worker-Unterstuetzung passiert nichts und nichts wirft", async () => {
  assert.equal(await registriereSchmal({}), "kein-service-worker");
});

test("die Netzprobe glaubt einer echten Anfrage, nicht navigator.onLine", async () => {
  assert.equal(await netzDa(async () => ({ ok: true })), true);
  assert.equal(await netzDa(async () => { throw new TypeError("Failed to fetch"); }), false,
    "eine Anfrage, die scheitert, ist der Beweis");
  // HEAD, damit der Service Worker die Probe nicht aus dem Speicher beantwortet
  // (er faengt nur GET ab) — sonst hielte sich die Seite offline fuer online.
  let init;
  await netzDa(async (_u, i) => { init = i; return {}; });
  assert.equal(init.method, "HEAD");
  assert.equal(init.cache, "no-store");
});

function fensterAttrappe() {
  const ereignisse = [];
  const uhren = [];
  return {
    ereignisse, uhren,
    dispatchEvent: (e) => ereignisse.push(e.type),
    addEventListener: () => {},
    setInterval: (f) => { uhren.push(f); return uhren.length; },
    clearInterval: () => {}
  };
}

test("offline: das Band wird ausgeloest, und es wird nachgefragt, bis das Netz zurueck ist", async () => {
  const win = fensterAttrappe();
  let netz = false;
  await beobachteNetz({ win, pruefe: async () => netz, takt: 1 });
  assert.deepEqual(win.ereignisse, ["offline"], "iOS feuert das Ereignis nicht selbst — die Seite muss es tun");
  assert.equal(win.uhren.length, 1, "solange offline wird nachgefragt");
  netz = true;
  await win.uhren[0]();
  assert.deepEqual(win.ereignisse, ["offline", "online"], "sonst klemmt das Band, obwohl das Netz laengst da ist");
});

test("online: kein Band, keine Uhr, kein Aufwand", async () => {
  const win = fensterAttrappe();
  await beobachteNetz({ win, pruefe: async () => true });
  assert.deepEqual(win.ereignisse, []);
  assert.equal(win.uhren.length, 0);
});

test("das Band der App wird benutzt, kein Nachbau", () => {
  assert.match(quelle, /import \{ initOfflineBanner \} from "\.\/offline-banner\.js";/,
    "dieselbe Adresse wie in auth-gate.js — sonst zwei Instanzen mit getrenntem Zustand");
  assert.ok(!/position\s*[:=]\s*["']?fixed/.test(quelle), "kein eigenes Band mit eigenem Aussehen");
});

test("die Landeseite bindet das Modul wirklich ein", () => {
  assert.match(seite, /<script src="\/assets\/willkommen-offline\.js\?v=\d+" type="module"><\/script>/,
    "ohne Einbindung bleibt alles beim Alten — die Datei allein heilt nichts");
});

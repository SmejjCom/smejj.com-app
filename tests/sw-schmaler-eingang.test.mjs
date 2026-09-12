// smejj.com — der Service Worker hat zwei Groessen: voll fuer die App, schmal fuer
// die Landeseite.
//
// DER BEFUND (2026-09-12, im frisch angelegten iOS-Webclip gemessen): Wer
// smejj.com auf den Home-Bildschirm legte, BEVOR er sich anmeldete, bekam keinen
// Service Worker. Das Symbol oeffnet "/", auth-gate-frueh.js leitet Abgemeldete
// auf willkommen.html um, und nur app.js registrierte /sw.js — die App-Huelle
// erreicht ein neuer Nutzer vor der Anmeldung nie. Offline sah er die
// Fehlerseite des Browsers. Nachgewiesen im Dateisystem des Simulators: im
// Webclip weder ein ServiceWorkers- noch ein CacheStorage-Ordner, auch nach 90 s.
//
// DIE LOESUNG (Betreiber-Freigabe "Schmaler Offline-Rueckfall"): Die Landeseite
// registriert /sw.js?eingang=willkommen und bekommt nur ihre eigenen Dateien
// (~19 KB) statt der ganzen App (~2 MB) — sonst zahlte jeder Besucher der
// Werbeseite die 2 MB.
//
// WIE GETESTET WIRD: Nicht per Textsuche im Quelltext, sondern der ECHTE sw.js
// laeuft in einer nachgebauten Service-Worker-Umgebung (self, caches, fetch).
// So pruefen die Tests, was er TUT: was er ablegt, was er beim Aktivieren
// wegraeumt, und was er offline ausliefert. Eine Textsuche haette am 12.09. die
// doppelten Precache-Zeilen nicht als "der ganze Speicher bleibt leer" erkannt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const QUELLE = readFileSync("public/sw.js", "utf8");

/** Ein Zwischenspeicher, der sich wie CacheStorage verhaelt — soweit sw.js ihn nutzt. */
function speicherAttrappe() {
  const alle = new Map();
  const schluessel = (anfrage, ignoreSearch) => {
    const url = new URL(typeof anfrage === "string" ? anfrage : anfrage.url, "https://smejj.com");
    return ignoreSearch ? url.origin + url.pathname : url.href;
  };
  const oeffne = (name) => {
    if (!alle.has(name)) alle.set(name, new Map());
    const eintraege = alle.get(name);
    return {
      async addAll(anfragen) {
        const urls = anfragen.map((a) => schluessel(a, false));
        // Wie der Browser: doppelte Anfragen lassen addAll KOMPLETT scheitern.
        if (new Set(urls).size !== urls.length) throw new DOMException("duplicate requests", "InvalidStateError");
        for (const u of urls) eintraege.set(u, { body: `inhalt:${new URL(u).pathname}`, status: 200 });
      },
      async put(anfrage, antwort) { eintraege.set(schluessel(anfrage, false), antwort); },
      async match(anfrage, optionen = {}) {
        const gesucht = schluessel(anfrage, optionen.ignoreSearch);
        for (const [u, a] of eintraege) if ((optionen.ignoreSearch ? schluessel(u, true) : u) === gesucht) return a;
        return undefined;
      },
      eintraege
    };
  };
  return {
    alle,
    caches: {
      open: async (name) => oeffne(name),
      keys: async () => [...alle.keys()],
      delete: async (name) => alle.delete(name),
      match: async (anfrage, optionen) => {
        for (const name of alle.keys()) {
          const treffer = await oeffne(name).match(anfrage, optionen);
          if (treffer) return treffer;
        }
        return undefined;
      }
    }
  };
}

/** Laedt den echten sw.js als Service Worker mit der gegebenen Skript-Adresse. */
function ladeServiceWorker(skriptAdresse, { online = true } = {}) {
  const { alle, caches } = speicherAttrappe();
  const lauscher = {};
  const netz = { online };
  const self = {
    location: new URL(skriptAdresse, "https://smejj.com"),
    addEventListener: (typ, f) => { lauscher[typ] = f; },
    skipWaiting: () => {},
    clients: { claim: () => {} }
  };
  const fetch = async (anfrage) => {
    if (!netz.online) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, body: `netz:${new URL(typeof anfrage === "string" ? anfrage : anfrage.url, "https://smejj.com").pathname}`, clone() { return this; } };
  };
  class Request { constructor(url, init = {}) { this.url = new URL(url, "https://smejj.com").href; Object.assign(this, init); } }
  const kontext = vm.createContext({ self, caches, fetch, Request, URL, Response: { redirect: () => ({}) }, Promise, Set, Map, console });
  vm.runInContext(QUELLE, kontext);

  const warteAuf = async (ereignisTyp, daten = {}) => {
    let versprechen = Promise.resolve();
    let antwort;
    const ereignis = {
      ...daten,
      waitUntil: (p) => { versprechen = p; },
      respondWith: (p) => { antwort = p; }
    };
    lauscher[ereignisTyp](ereignis);
    await versprechen;
    return antwort === undefined ? undefined : await antwort;
  };
  return {
    alle, netz,
    installiere: () => warteAuf("install"),
    aktiviere: () => warteAuf("activate"),
    rufe: (pfad, { navigate = false, methode = "GET" } = {}) =>
      warteAuf("fetch", { request: { url: new URL(pfad, "https://smejj.com").href, method: methode, mode: navigate ? "navigate" : "no-cors", destination: navigate ? "document" : "" } })
  };
}

test("der schmale Eingang legt NUR die Landeseite ab, nicht die ganze App", async () => {
  const sw = ladeServiceWorker("/sw.js?eingang=willkommen");
  await sw.installiere();
  const namen = [...sw.alle.keys()];
  assert.equal(namen.length, 1, "genau ein Zwischenspeicher");
  assert.match(namen[0], /^smejj-willkommen-v\d+$/, "eigener Name, damit der volle ihn spaeter erkennt und wegraeumt");
  const pfade = [...sw.alle.get(namen[0]).keys()].map((u) => new URL(u).pathname);
  assert.ok(pfade.includes("/willkommen.html"), "die Landeseite selbst");
  assert.ok(pfade.includes("/assets/offline-banner.js"), "das Band, das die Seite offline zeigt");
  assert.ok(pfade.length < 20, `schmal heisst schmal — ${pfade.length} Dateien`);
  assert.ok(!pfade.includes("/"), "die App-Huelle gehoert NICHT in den schmalen Speicher");
  assert.ok(!pfade.includes("/assets/start-styles.css"), "das 143-KB-Stylesheet der App ebenso wenig");
});

test("ohne Zusatz bleibt alles wie es war: voller Speicher unter dem alten Namen", async () => {
  const sw = ladeServiceWorker("/sw.js");
  await sw.installiere();
  const namen = [...sw.alle.keys()];
  assert.deepEqual(namen.map((n) => n.replace(/\d+$/, "")), ["smejj-shell-v"], "der volle Name bleibt — Bestandsnutzer merken nichts");
  const pfade = [...sw.alle.get(namen[0]).keys()].map((u) => new URL(u).pathname);
  assert.ok(pfade.includes("/"), "die App-Huelle");
  assert.ok(pfade.length > 200, `die ganze App — ${pfade.length} Dateien`);
  // Der volle deckt die Landeseite mit ab: wer sich abmeldet und offline ist,
  // soll sie auch aus diesem Speicher bekommen.
  assert.ok(pfade.includes("/willkommen.html"), "auch die Landeseite");
  assert.ok(pfade.includes("/assets/willkommen-offline.js"), "samt ihrem Offline-Modul");
});

test("meldet sich der Nutzer an, raeumt der volle Service Worker den schmalen Speicher weg", async () => {
  // Beide Service Worker teilen sich in Wirklichkeit denselben Speicher der
  // Herkunft — hier mit einer gemeinsamen Attrappe nachgestellt.
  const schmal = ladeServiceWorker("/sw.js?eingang=willkommen");
  await schmal.installiere();
  await schmal.aktiviere();
  const voll = ladeServiceWorker("/sw.js");
  for (const [name, eintraege] of schmal.alle) voll.alle.set(name, eintraege);
  await voll.installiere();
  await voll.aktiviere();
  const namen = [...voll.alle.keys()];
  assert.equal(namen.length, 1, `nach dem Wechsel darf nur EIN Speicher bleiben — gefunden: ${namen.join(", ")}`);
  assert.match(namen[0], /^smejj-shell-v/, "und zwar der volle");
});

test("OFFLINE: die Navigation auf / liefert im schmalen Eingang die Landeseite", async () => {
  // Genau der Fall aus dem Befund: Symbol antippen, kein Netz.
  const sw = ladeServiceWorker("/sw.js?eingang=willkommen");
  await sw.installiere();
  await sw.aktiviere();
  sw.netz.online = false;
  const antwort = await sw.rufe("/", { navigate: true });
  assert.ok(antwort, "ohne Antwort zeigt iOS 'Safari kann die Seite nicht oeffnen'");
  assert.equal(antwort.body, "inhalt:/willkommen.html", "die Landeseite aus dem schmalen Speicher");
});

test("OFFLINE: der volle Service Worker liefert weiter die App-Huelle — unveraendert", async () => {
  const sw = ladeServiceWorker("/sw.js");
  await sw.installiere();
  await sw.aktiviere();
  sw.netz.online = false;
  const antwort = await sw.rufe("/", { navigate: true });
  assert.equal(antwort?.body, "inhalt:/", "fuer angemeldete Nutzer darf sich nichts aendern");
});

test("OFFLINE: einem Bild oder Skript wird nie eine HTML-Seite untergeschoben", async () => {
  const sw = ladeServiceWorker("/sw.js?eingang=willkommen");
  await sw.installiere();
  await sw.aktiviere();
  sw.netz.online = false;
  const antwort = await sw.rufe("/assets/gibt-es-nicht.png");
  assert.equal(antwort, undefined, "keine Landeseite als Bildersatz — lieber ein ehrlicher Fehler");
});

test("die Netzprobe der Landeseite laeuft am Service Worker VORBEI", async () => {
  // willkommen-offline.js prueft mit HEAD. Faenge der Service Worker die Probe
  // ab, lieferte er offline etwas aus dem Speicher — und die Seite hielte sich
  // faelschlich fuer online. Das rote Band erschiene nie.
  const sw = ladeServiceWorker("/sw.js");
  await sw.installiere();
  sw.netz.online = false;
  const antwort = await sw.rufe("/robots.txt?p=1", { methode: "HEAD" });
  assert.equal(antwort, undefined, "HEAD bekommt keine Antwort aus dem Speicher");
});

test("beide Listen sind frei von Doppelten — addAll ist alles oder nichts", async () => {
  for (const adresse of ["/sw.js", "/sw.js?eingang=willkommen"]) {
    const sw = ladeServiceWorker(adresse);
    await assert.doesNotReject(() => sw.installiere(), `${adresse}: ein doppelter Eintrag laesst den ganzen Speicher leer`);
    assert.ok([...sw.alle.values()][0].size > 0, `${adresse}: der Speicher ist gefuellt`);
  }
});

// smejj.com — Schutztests fuer die Selbstheilung des Chat-Verlauf-Speichers.
//
// Befund 2026-08-03, live in Chrome nachgestellt: Eine `smejj-chats`-Datenbank
// kann auf ihrer Version stehen bleiben, ohne den Objektspeicher `chats` zu
// besitzen — z. B. wenn der allererste Aufbau abbricht (Tab zu waehrend
// onupgradeneeded, Speicher-Raeumung, Quota-Fehler). Danach feuert
// onupgradeneeded nie wieder, jede Transaktion wirft NotFoundError, und weil
// alle Aufrufer in chat-store.js fail-safe abfangen, ist der Verlauf in diesem
// Browser DAUERHAFT und LAUTLOS tot: nichts wird mehr gespeichert, die
// Verlauf-Seite bleibt fuer immer leer, und nichts weist auf die Ursache hin.
//
// Diese Tests halten die Selbstheilung fest — inklusive der Falle, die ein
// naiver Fix einbaut: heilt man auf Version 2 hoch, darf der naechste Start
// die Datenbank NICHT wieder mit der festen Version 1 oeffnen, sonst scheitert
// er ab da mit VersionError (aus einem stillen Fehler waere ein harter).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STORE = "chats";

// chat-store.js importiert seine Nachbarn ueber Browser-Pfade ("/assets/…"),
// die Node nicht aufloest. Fuer den Test werden sie auf file://-URLs
// umgeschrieben — der zu pruefende Code selbst bleibt unveraendert.
const QUELLE = fs.readFileSync("public/chat-store.js", "utf8").replace(
  /from "\/assets\/([^"?]+)(\?[^"]*)?"/g,
  (_treffer, datei) => `from ${JSON.stringify(pathToFileURL(path.resolve("public", datei)).href)}`
);
const MODUL = path.join(os.tmpdir(), "smejj-chat-store-test.mjs");
fs.writeFileSync(MODUL, QUELLE);
process.on("exit", () => { try { fs.unlinkSync(MODUL); } catch { /* schon weg */ } });

/**
 * Nachgebaute IndexedDB — nur so viel, wie chat-store.js wirklich anfasst.
 * @param {{version: number, stores: string[]}|null} anfang - Startzustand der
 *   Datenbank, oder null fuer "existiert noch nicht".
 */
function baueIndexedDb(anfang) {
  let db = anfang ? { version: anfang.version, stores: new Map(anfang.stores.map((n) => [n, new Map()])) } : null;
  const protokoll = { geoeffnet: [], geschlossen: 0, aufgebaut: [] };

  function anfrage(arbeit) {
    const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null, error: null };
    setTimeout(() => arbeit(req), 0);
    return req;
  }

  function griff() {
    return {
      get version() { return db.version; },
      objectStoreNames: { contains: (name) => db.stores.has(name) },
      createObjectStore(name) {
        db.stores.set(name, new Map());
        protokoll.aufgebaut.push(`${name}@${db.version}`);
        return { createIndex() {} };
      },
      close() { protokoll.geschlossen += 1; },
      transaction(name) {
        if (!db.stores.has(name)) {
          const fehler = new Error(`objectStore ${name} fehlt`);
          fehler.name = "NotFoundError";
          throw fehler;
        }
        const daten = db.stores.get(name);
        const offen = [];
        const trans = { oncomplete: null, onerror: null, onabort: null };
        const nachfassen = (fn) => {
          const r = { onsuccess: null, onerror: null, result: null };
          offen.push(() => { r.result = fn(); r.onsuccess?.(); });
          return r;
        };
        trans.objectStore = () => ({
          getAll: () => nachfassen(() => [...daten.values()]),
          get: (id) => nachfassen(() => daten.get(id)),
          put: (wert) => nachfassen(() => { daten.set(wert.id, wert); return wert.id; }),
          delete: (id) => nachfassen(() => { daten.delete(id); return undefined; })
        });
        setTimeout(() => {
          for (const fn of offen) fn();
          setTimeout(() => trans.oncomplete?.(), 0);
        }, 0);
        return trans;
      }
    };
  }

  return {
    protokoll,
    open(name, version) {
      protokoll.geoeffnet.push(version ?? null);
      return anfrage((req) => {
        let aufbau = false;
        if (!db) { db = { version: version || 1, stores: new Map() }; aufbau = true; }
        else if (version && version > db.version) { db.version = version; aufbau = true; }
        else if (version && version < db.version) {
          const fehler = new Error("VersionError");
          fehler.name = "VersionError";
          req.error = fehler;
          req.onerror?.();
          return;
        }
        req.result = griff();
        if (aufbau) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
    }
  };
}

/** Laedt chat-store.js frisch (eigener Modul-Zustand je Fall) gegen eine gebaute Datenbank. */
async function lade(anfang) {
  const fake = baueIndexedDb(anfang);
  const lager = new Map();
  const speicher = {
    getItem: (k) => (lager.has(k) ? lager.get(k) : null),
    setItem: (k, v) => lager.set(k, String(v)),
    removeItem: (k) => lager.delete(k)
  };
  globalThis.indexedDB = fake;
  globalThis.sessionStorage = speicher;
  globalThis.localStorage = speicher;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.location = { pathname: "/", href: "https://smejj.com/" };
  // readyState "loading" haelt init() an: der Test misst den Speicher, nicht
  // die DOM-Verdrahtung — und nichts heilt die Datenbank als Nebenwirkung.
  globalThis.document = {
    readyState: "loading",
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => []
  };
  globalThis.window = globalThis.window || {};
  globalThis.window.addEventListener = () => {};
  const modul = await import(`${pathToFileURL(MODUL).href}?fall=${Math.random()}`);
  return { modul, fake };
}

test("kaputte Datenbank ohne Objektspeicher heilt sich und speichert wieder", async () => {
  const { modul, fake } = await lade({ version: 1, stores: [] });

  // Vor dem Fix endete schon dieser Aufruf still in [] — fuer immer.
  assert.deepEqual(await modul.listChats(), [], "leerer Verlauf ist der erwartete Startwert");
  assert.ok(fake.protokoll.aufgebaut.includes(`${STORE}@2`), "der fehlende Speicher wird auf Version 2 angelegt");
  assert.deepEqual(fake.protokoll.geoeffnet, [null, 2], "erst der vorhandene Stand, dann eine Version hoeher");
  assert.equal(fake.protokoll.geschlossen, 1, "der alte Griff wird vor dem Hochziehen geschlossen");

  // Der eigentliche Beweis: nach der Heilung traegt der Verlauf wieder.
  await modul.renameChat("fehlt", "egal").catch(() => {});
  assert.equal(await modul.getChat("fehlt"), null);
});

test("gesunde Datenbank wird nicht unnoetig hochgezogen", async () => {
  const { modul, fake } = await lade({ version: 1, stores: [STORE] });
  assert.deepEqual(await modul.listChats(), []);
  assert.deepEqual(fake.protokoll.geoeffnet, [null], "genau ein Oeffnen, keine Versionserhoehung");
  assert.deepEqual(fake.protokoll.aufgebaut, [], "ein vorhandener Speicher wird nicht neu gebaut");
  assert.equal(fake.protokoll.geschlossen, 0);
});

test("eine bereits geheilte Datenbank oeffnet ohne VersionError", async () => {
  // Der Rueckfall, den ein Fix mit fester Version 1 eingebaut haette.
  const { modul, fake } = await lade({ version: 2, stores: [STORE] });
  assert.deepEqual(await modul.listChats(), []);
  assert.deepEqual(fake.protokoll.geoeffnet, [null], "ohne Versionsangabe oeffnen — sonst VersionError");
});

test("fehlende Datenbank wird beim ersten Start vollstaendig angelegt", async () => {
  const { modul, fake } = await lade(null);
  assert.deepEqual(await modul.listChats(), []);
  assert.ok(fake.protokoll.aufgebaut.includes(`${STORE}@1`), "Erstaufbau bleibt auf Version 1");
});

test("eine voruebergehende Stoerung vergiftet den Verlauf nicht dauerhaft", async () => {
  const { modul, fake } = await lade({ version: 1, stores: [STORE] });
  const echt = fake.open.bind(fake);
  let gestoert = true;
  fake.open = (name, version) => {
    if (!gestoert) return echt(name, version);
    gestoert = false;
    const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null, error: null };
    setTimeout(() => { req.error = new Error("Datenbank kurz gesperrt"); req.onerror?.(); }, 0);
    return req;
  };
  globalThis.indexedDB = fake;

  assert.deepEqual(await modul.listChats(), [], "die Stoerung bleibt fail-safe");
  // Vor dem Fix haette der fehlgeschlagene Versuch im Zwischenspeicher geklebt
  // und JEDEN weiteren Aufruf dieser Sitzung mitgerissen.
  assert.deepEqual(await modul.listChats(), [], "der naechste Versuch laeuft wieder gegen die echte Datenbank");
  assert.ok(fake.protokoll.geoeffnet.length >= 1, "es wurde erneut geoeffnet, nicht aus dem Zwischenspeicher geantwortet");
});

#!/usr/bin/env node
// smejj.com — kommt jede Adresse, die die Operations Console aufruft, beim
// Server auch an?
//
// WARUM ES DIESES SKRIPT GIBT (Befund 2026-08-07):
// `POST /api/admin/impersonation/list` antwortete monatelang mit 404. Die Route
// war da, lag aber im falschen Zweig — und die Konsole zeigte den toten
// Endpunkt als "Alle Vorgaenge · 0 insgesamt" an. Ein toter Endpunkt sah aus
// wie Leere. Kein Test hat es gemerkt, weil kein Test die Konsole und den
// Server GEGENEINANDER geprueft hat.
//
// Genau das tut dieses Skript, ohne Netz und ohne Geheimnisse:
//
//   1. Die echten Konsolen-Skripte werden in einer Sandbox geladen (kein
//      Browser noetig, nur ein `window`-Ersatz). `adminApi` wird durch eine
//      Attrappe ersetzt, die jede Adresse MITSCHREIBT statt sie zu holen.
//      Dann wird jeder registrierte Seitenlader aufgerufen. Ergebnis: die
//      Liste der Adressen, die die Konsole WIRKLICH benutzt — inklusive der
//      zusammengesetzten wie "/api/admin/ops/" + pfad. Nichts ist geraten.
//   2. Jede dieser Adressen laeuft durch die ECHTE Handler-Kette des Servers
//      (handleAdminSurface). Gemeldet wird, was niemand beantwortet oder was
//      mit "admin_route_not_found" abgewiesen wird.
//
// Was ausdruecklich NICHT geprueft wird: ob die Antwort inhaltlich stimmt. Das
// koennen die Unit-Tests besser. Hier geht es um die eine Frage, an der die
// Konsole schon einmal still gescheitert ist: kommt der Ruf an?
//
// Aufruf:  node scripts/check-admin-konsole.mjs
// Exit 0 = alle Adressen kommen an. Exit 1 = mindestens eine laeuft ins Leere.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { handleAdminSurface } from "../control-server/src/routes/adminSurfaceRoutes.js";
import { __clearMemoryStoreForTests, createUserRecord, putUser } from "../control-server/src/auth/emailUserStore.js";

const KONSOLE = path.resolve(fileURLToPath(new URL("../control-server/admin-ui/", import.meta.url)));
const PRUEFER = "pruefer@smejj-check.invalid";

// Leere Umgebung = Memory-Zweig ueberall: kein IDrive, kein Schluessel, kein
// Netz. Die Handler laufen trotzdem echt — nur ihre Speicher sind im Prozess.
const ENV = { SMEJJ_ADMIN_OWNER_EMAILS: PRUEFER };

// ---- 1. Was ruft die Konsole auf? -------------------------------------------

/**
 * Baut die Sandbox und laedt das ECHTE api.js hinein. Aufgezeichnet wird auf
 * der untersten Ebene — beim `fetch` — statt bei `hole`/`sende`. Das ist der
 * Punkt, an dem nichts mehr geraten werden kann: Methode und Adresse sind
 * genau die, die auch der Browser schicken wuerde. (Eine Attrappe auf
 * hole/sende haette den Fehler vom 2026-08-07 uebrigens verfehlt — die
 * Stufen-Seiten rufen benannte Helfer wie `A.moderation()`, nicht hole/sende.)
 */
/**
 * Ein `document`, das alles hinnimmt und nichts tut. Die Seitenlader haengen
 * nach dem Zeichnen ihre Knopf-Handler ein; ohne dieses Stueck stuerzt der
 * Lauf dort ab, obwohl die Adresse laengst aufgezeichnet ist. Kein DOM-Nachbau:
 * Listen sind leer, Einzelfunde schlucken jeden Zugriff.
 */
function nachsichtigesDokument() {
  const knoten = new Proxy(function () {}, {
    get: (ziel, name) => (name === "length" ? 0
      : name === Symbol.iterator ? [][Symbol.iterator].bind([])
        : knoten),
    apply: () => knoten,
    set: () => true
  });
  return {
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    querySelector: () => knoten,
    getElementById: () => knoten,
    createElement: () => knoten,
    addEventListener: () => {},
    body: knoten
  };
}

function sandboxMitApi() {
  const gerufen = [];
  const zeichnerAttrappe = new Proxy({}, { get: () => () => "" });
  const fenster = {
    adminDialog: new Proxy({}, { get: () => () => Promise.resolve(null) }),
    adminViews: zeichnerAttrappe
  };
  for (const stufe of [4, 5, 6, 7, 8, 9]) fenster[`adminViewsStage${stufe}`] = zeichnerAttrappe;

  const sandbox = {
    window: fenster, console, document: nachsichtigesDokument(),
    localStorage: { getItem: () => "pruefstand-token", setItem: () => {}, removeItem: () => {} },
    location: { origin: "https://smejj.com", hostname: "smejj.com", pathname: "/admin/", hash: "" },
    fetch: async (adresse, init = {}) => {
      const url = new URL(String(adresse));
      // Die Methode steht im zweiten Argument; api.js setzt sie nur beim Senden.
      gerufen.push({ methode: init.method || "GET", pfad: url.pathname + url.search });
      return {
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true }),
        text: async () => "{}"
      };
    },
    setTimeout, clearTimeout
  };
  // Browser-Globale, die die Konsolen-Skripte selbstverstaendlich voraussetzen.
  // Eine vm-Sandbox bringt sie nicht mit; fehlt eines, bricht der Lauf mit
  // einem ReferenceError ab, der nach einem Fehler in der Konsole AUSSIEHT,
  // aber keiner ist. Deshalb hier ausdruecklich und benannt.
  for (const name of [
    "URL", "URLSearchParams", "AbortController", "TextEncoder", "TextDecoder",
    "JSON", "Math", "Date", "Object", "Array", "String", "Number", "Boolean",
    "Promise", "Set", "Map", "Error", "RegExp", "Intl",
    "encodeURIComponent", "decodeURIComponent", "parseInt", "parseFloat", "isNaN"
  ]) sandbox[name] = globalThis[name];
  sandbox.globalThis = sandbox;
  const kontext = vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(KONSOLE, "api.js"), "utf8"), kontext, { filename: "api.js" });
  if (!fenster.adminApi) throw new Error("api.js hat window.adminApi nicht gesetzt — Sandbox pruefen.");
  return { kontext, fenster, gerufen };
}

/**
 * Laedt die Stufen-Skripte und ruft jeden registrierten Seitenlader einmal auf.
 * Die Zeichen-Funktionen sind Attrappen — uns interessiert der Weg zum Server,
 * nicht das erzeugte HTML.
 */
async function adressenDerKonsole() {
  const { kontext, fenster, gerufen } = sandboxMitApi();
  // Erst die Ansichten, dann die Bedienung (Eichung wortgleich vom Bauzweig,
  // dort 2026-08-14 aufgefallen): console-stage11.js greift in laden() auf
  // window.adminViewsStage11 zu. Wurden nur die console-*-Dateien geladen,
  // war das undefined und der ganze Lauf stuerzte mit einem TypeError ab —
  // die Pruefung meldete also nicht "Seite kaputt", sondern gar nichts mehr.
  const laden = (muster) => {
    for (const datei of readdirSync(KONSOLE).filter((n) => muster.test(n)).sort()) {
      vm.runInContext(readFileSync(path.join(KONSOLE, datei), "utf8"), kontext, { filename: datei });
    }
  };
  laden(/^views(-stage\d+|-cockpit)?\.js$/);
  laden(/^console-(stage\d+|cockpit)\.js$/);

  const seiten = [];
  for (const schluessel of Object.keys(fenster)) {
    if (!/^adminStage\d+$/.test(schluessel)) continue;
    const gruppe = fenster[schluessel].seiten || fenster[schluessel];
    for (const [pfad, def] of Object.entries(gruppe)) {
      if (!def || typeof def.laden !== "function") continue;
      const vorher = gerufen.length;
      await def.laden({ zeichne: () => {}, fehler: () => {}, meldung: () => {}, neuLaden: () => {} });
      seiten.push({ seite: pfad, adressen: gerufen.slice(vorher) });
    }
  }
  return { seiten, kern: await kernAdressen() };
}

/**
 * Die sieben Kernseiten haengen fest in console.js, das beim Laden sofort
 * startet und ein ganzes `document` braucht. Statt den Browser nachzubauen
 * werden genau die benannten Helfer aufgerufen, die console.js benutzt — die
 * Adresse kommt weiterhin aus api.js, nicht aus dieser Datei.
 */
async function kernAdressen() {
  const { fenster, gerufen } = sandboxMitApi();
  const A = fenster.adminApi;
  const kernrufe = [
    ["A Übersicht / B Nutzer", () => A.nutzer({ limit: 1 })],
    ["C Rollen & Rechte", () => A.ich()],
    ["D Support (Liste)", () => A.impersonationListe()],
    ["D Support (eigene)", () => A.eigeneVorgaenge()],
    ["Freigaben", () => A.freigaben()],
    ["Audit-Log", () => A.audit({ limit: 50 })],
    ["Compliance", () => A.compliance()]
  ];
  const seiten = [];
  for (const [name, ruf] of kernrufe) {
    const vorher = gerufen.length;
    await ruf();
    seiten.push({ seite: name, adressen: gerufen.slice(vorher) });
  }
  return seiten;
}

// ---- 2. Kommt die Adresse beim Server an? -----------------------------------

function attrappe() {
  const res = { status: 0, body: null, headers: {}, beantwortet: false };
  res.setHeader = (name, wert) => { res.headers[name] = wert; };
  res.writeHead = (status, kopf) => { res.status = status; Object.assign(res.headers, kopf || {}); return res; };
  res.end = (rumpf) => {
    res.beantwortet = true;
    try { res.body = rumpf ? JSON.parse(rumpf) : null; } catch { res.body = { roh: String(rumpf).slice(0, 80) }; }
  };
  return res;
}

async function frage(methode, pfad) {
  const res = attrappe();
  const req = {
    method: methode,
    authUser: { email: PRUEFER },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    on(ereignis, rueckruf) {
      if (ereignis === "data") rueckruf("{}");
      if (ereignis === "end") rueckruf();
      return req;
    }
  };
  const behandelt = await handleAdminSurface(req, new URL(`http://pruefstand${pfad}`), res, {
    readSession: () => null, sessionStillValid: async () => true, env: ENV
  });
  return { behandelt, status: res.status, fehler: res.body?.error || "" };
}

// ---- Lauf -------------------------------------------------------------------

async function main() {
  __clearMemoryStoreForTests();
  await putUser({
    ...createUserRecord({ email: PRUEFER, name: "Pruefstand", passwordHash: "x" }),
    role: "owner", emailVerifiedAt: "2026-01-01T00:00:00.000Z"
  }, ENV);

  // Selbstprobe: eine Pruefung, die nie anschlagen KANN, ist keine Pruefung.
  // Bevor irgendetwas gemeldet wird, muss eine absichtlich falsche Adresse
  // erkannt werden — sonst haette z.B. ein handleAdminSurface, das alles
  // annimmt, den Lauf still gruen gefaerbt.
  const probe = await frage("POST", "/api/admin/gibt-es-garantiert-nicht");
  const erkannt = !probe.behandelt || (probe.status === 404 && probe.fehler === "admin_route_not_found");
  if (!erkannt) {
    console.error("admin-konsole KAPUTT — die Selbstprobe schlug NICHT an "
      + `(Status ${probe.status}, Fehler "${probe.fehler}"). Die Pruefung wuerde alles durchwinken.`);
    process.exit(1);
  }

  const { seiten, kern } = await adressenDerKonsole();
  const alle = [...kern, ...seiten];
  const befunde = [];
  let geprueft = 0;

  for (const { seite, adressen } of alle) {
    if (adressen.length === 0) {
      befunde.push({ seite, pfad: "(keine)", grund: "die Seite ruft gar keinen Endpunkt — Attrappe oder Seite pruefen" });
      continue;
    }
    for (const { methode, pfad } of adressen) {
      geprueft += 1;
      const antwort = await frage(methode, pfad);
      if (!antwort.behandelt) {
        befunde.push({ seite, pfad: `${methode} ${pfad}`, grund: "kein Handler zustaendig" });
      } else if (antwort.status === 404 && antwort.fehler === "admin_route_not_found") {
        // Genau der Befund vom 2026-08-07: die Kette nimmt den Pfad an und
        // weist ihn dann als unbekannt ab.
        befunde.push({ seite, pfad: `${methode} ${pfad}`, grund: "404 admin_route_not_found" });
      }
    }
  }

  if (befunde.length > 0) {
    console.error(`admin-konsole VERLETZT (${befunde.length} von ${geprueft} Adressen laufen ins Leere):`);
    for (const b of befunde) console.error(`  - ${b.seite}: ${b.pfad} — ${b.grund}`);
    console.error("Eine Adresse, die die Konsole ruft, muss beim Server ankommen. Sonst zeigt die Seite Leere statt eines Fehlers.");
    process.exit(1);
  }
  console.log(`admin-konsole OK — ${geprueft} Adressen aus ${alle.length} Ansichten kommen beim Server an.`);
}

await main();

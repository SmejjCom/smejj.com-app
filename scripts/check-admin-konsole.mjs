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

// Erlaubnisliste (2026-08-25), KEINE Verbotsliste: Seiten, die BEWUSST ohne
// Server auskommen — jede traegt ihre Begruendung. Alles andere ohne Endpunkt
// bleibt ein Befund.
//   regeln (Stage 12): reiner Regeltext aus den eigenen Vorfaellen, im Code
//   dokumentiert als "Die Regeln brauchen keinen Server".
const BEWUSST_OHNE_ENDPUNKT = new Set(["regeln"]);

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
  for (const stufe of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) fenster[`adminViewsStage${stufe}`] = zeichnerAttrappe;
  fenster.adminViewsCockpit = zeichnerAttrappe;

  const sandbox = {
    window: fenster, console, document: nachsichtigesDokument(),
    localStorage: { getItem: () => "pruefstand-token", setItem: () => {}, removeItem: () => {} },
    location: { origin: "https://smejj.com", hostname: "smejj.com", pathname: "/admin/", hash: "" },
    fetch: async (adresse, init = {}) => {
      // Basis mitgeben: eine Seite darf relativ abrufen (die Radar-Ansicht holt
      // /radar/berichte.json). Ohne Basis warf new URL(), der Aufruf verschwand
      // im catch der Seite, und der Pruefer meldete "ruft gar keinen Endpunkt" —
      // ein Fehlalarm, der wie ein echter Befund aussah.
      const url = new URL(String(adresse), "https://smejj.com/admin/");
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
  // Erst die Ansichten, dann die Bedienung. Grund (2026-08-14 aufgefallen):
  // console-stage11.js greift in laden() auf window.adminViewsStage11 zu.
  // Wurden nur die console-*-Dateien geladen, war das undefined und der
  // ganze Lauf stuerzte mit einem TypeError ab — die Pruefung meldete also
  // nicht "Seite kaputt", sondern gar nichts mehr. Eine Pruefung, die am
  // ersten Fund stirbt, prueft die restlichen Seiten nie.
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
  // Seit 2026-09-04 startet api.js den Anmelde-Ruf schon BEIM LADEN (Vorab-
  // Anmeldung: so liegt die Antwortzeit des Control-Servers neben dem Download
  // der 28 Skripte statt dahinter). Dieser Ruf steht damit bereits in
  // `gerufen`, bevor hier die erste Seite gefragt wird — er gehoert zum Start,
  // nicht zu einer Seite. Er wird als eigener Eintrag gefuehrt UND einmal
  // abgeholt, damit das nachfolgende A.ich() wieder frisch fragt.
  const vorabAdressen = gerufen.slice(0);
  await A.ich();
  const kernrufe = [
    ["A Übersicht / B Nutzer", () => A.nutzer({ limit: 1 })],
    ["C Rollen & Rechte", () => A.ich()],
    ["D Support (Liste)", () => A.impersonationListe()],
    ["D Support (eigene)", () => A.eigeneVorgaenge()],
    ["Freigaben", () => A.freigaben()],
    ["Audit-Log", () => A.audit({ limit: 50 })],
    ["Compliance", () => A.compliance()]
  ];
  const seiten = [{ seite: "Start · Anmeldung (Vorab-Ruf aus api.js)", adressen: vorabAdressen }];
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

// ---- 3. Findet die Bedienung, woran sie sich haengen will? ------------------
//
// BEFUND 2026-08-14 (A-bis-Z-Pruefung): console.js bindet seit dem 28.07.2026
// Handler an `#akteAktionen` und `[data-aktion]` — nur hat diese Leiste NIE
// eine Ansicht gezeichnet. `getElementById` gab null, die Bindefunktion kehrte
// still zurueck. Damit war der gesamte schreibende Adminbereich (sperren,
// entsperren, Rolle vergeben, loeschen, Support-Vorgang) unerreichbar,
// waehrend Server, Vier-Augen-Freigabe, Step-up und Audit-Log fertig waren und
// gruen getestet wurden. Kein Test konnte das sehen: die Ansichten fuer sich
// waren richtig, die Bedienung fuer sich war richtig — falsch war die LUECKE
// dazwischen. Genau dieselbe Sorte Fehler wie die tote Route vom 07.08.
//
// Geprueft wird per Textsuche, nicht durch Zeichnen: die Ansichten setzen ihre
// Kennungen als Zeichenketten zusammen, ein DOM-Nachbau brauchte fuer jede
// Seite erfundene Daten — und wo Daten erfunden werden, prueft man am Ende die
// Erfindung. Die Frage hier ist schlichter: taucht die Kennung ueberhaupt
// irgendwo als erzeugtes Attribut auf?
//
// GRENZE, ehrlich benannt: eine Zeichenfunktion, die die Kennung baut, aber von
// niemandem gerufen wird, faellt hier NICHT auf — der Text steht ja da. Gegen
// den echten Stand vom 14.08. schlaegt die Ebene nachweislich an (zwei
// Befunde); gegen eine tote Funktion braeuchte es einen Aufruf-Graphen. Wer
// das spaeter nachruestet, faengt auch diesen Fall.

/** Woran sich die Bedienung haengt: {art, ziel, datei}. */
function haengerZiele() {
  const ziele = [];
  for (const name of readdirSync(KONSOLE).filter((n) => /^console.*\.js$/.test(n))) {
    const text = readFileSync(path.join(KONSOLE, name), "utf8");
    for (const t of text.matchAll(/getElementById\(\s*"([a-zA-Z0-9_-]+)"\s*\)/g)) {
      ziele.push({ art: "id", ziel: t[1], datei: name });
    }
    for (const t of text.matchAll(/querySelector(?:All)?\(\s*"\[([a-zA-Z0-9_-]+)\]"\s*\)/g)) {
      ziele.push({ art: "attribut", ziel: t[1], datei: name });
    }
  }
  return ziele;
}

/** Alles, was die Konsole ausliefert — dort muss die Kennung entstehen. */
function konsolenText() {
  return readdirSync(KONSOLE)
    .filter((n) => /\.(js|html)$/.test(n) && !/\.test\.[cm]?js$/.test(n))
    .map((n) => readFileSync(path.join(KONSOLE, n), "utf8"))
    .join("\n");
}

function haengerBefunde(ziele = haengerZiele(), quellen = konsolenText()) {
  const befunde = [];
  for (const { art, ziel, datei } of ziele) {
    // Erzeugt gilt: als Attribut im HTML-Text ODER per setAttribute gesetzt.
    // Attribute duerfen im HTML auch WERTLOS stehen (<span data-ckNeu>) — der
    // fruehere Regex verlangte ${ziel}=" und meldete gesunde Ansichten als
    // stillen Ausfall (Eichung 2026-08-25, sechs Fehlalarme Stage 9/12/13 +
    // Cockpit). "]" bleibt ausgenommen, sonst zaehlte der Selektor der
    // Bedienung ("[data-x]") als Zeichnung.
    const erzeugt = art === "id"
      ? new RegExp(`id="${ziel}"|setAttribute\\(\\s*"id"\\s*,\\s*"${ziel}"`).test(quellen)
      : new RegExp(`${ziel}(?:="|[\\s>])|setAttribute\\(\\s*"${ziel}"`).test(quellen);
    if (!erzeugt) {
      befunde.push({
        datei, ziel: art === "id" ? `#${ziel}` : `[${ziel}]`,
        grund: "die Bedienung bindet daran, aber keine Ansicht zeichnet es — stiller Ausfall"
      });
    }
  }
  return befunde;
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

  // Selbstprobe der dritten Ebene: erkennt sie einen erfundenen Haenger, und
  // laesst sie einen echten in Ruhe? Ohne beides waere sie Zierde.
  const probeBlind = haengerBefunde([{ art: "id", ziel: "gibt-es-garantiert-nicht", datei: "probe" }], "");
  const probeGesund = haengerBefunde([{ art: "id", ziel: "gibtsWirklich", datei: "probe" }], 'id="gibtsWirklich"');
  if (probeBlind.length !== 1 || probeGesund.length !== 0) {
    console.error("admin-konsole KAPUTT — die Haenger-Selbstprobe schlug nicht an "
      + `(blind=${probeBlind.length}, gesund=${probeGesund.length}).`);
    process.exit(1);
  }
  // Dasselbe fuer Attribute — inkl. WERTLOSER Schreibweise (<span data-x>),
  // an der die Pruefung am 2026-08-25 sechs Fehlalarme erzeugte. Der Selektor
  // der Bedienung ("[data-x]") darf weiterhin NICHT als Zeichnung zaehlen.
  const attrBlind = haengerBefunde([{ art: "attribut", ziel: "data-gibts-nicht", datei: "probe" }], 'querySelector("[data-gibts-nicht]")');
  const attrWertlos = haengerBefunde([{ art: "attribut", ziel: "data-gibtsWertlos", datei: "probe" }], '<span class="btn" data-gibtsWertlos>Neu</span>');
  const attrMitWert = haengerBefunde([{ art: "attribut", ziel: "data-gibtsMitWert", datei: "probe" }], '<input data-gibtsMitWert="1">');
  if (attrBlind.length !== 1 || attrWertlos.length !== 0 || attrMitWert.length !== 0) {
    console.error("admin-konsole KAPUTT — die Attribut-Selbstprobe schlug nicht an "
      + `(blind=${attrBlind.length}, wertlos=${attrWertlos.length}, mitWert=${attrMitWert.length}).`);
    process.exit(1);
  }

  const { seiten, kern } = await adressenDerKonsole();
  const alle = [...kern, ...seiten];
  const befunde = [];
  let geprueft = 0;

  for (const { seite, adressen } of alle) {
    if (adressen.length === 0 && !BEWUSST_OHNE_ENDPUNKT.has(seite)) {
      befunde.push({ seite, pfad: "(keine)", grund: "die Seite ruft gar keinen Endpunkt — Attrappe oder Seite pruefen" });
      continue;
    }
    // Je SEITE bewerten, nicht je Adresse. Eine Seite darf mehrere Quellen der
    // Reihe nach versuchen — die Radar-Ansicht holt ihre Berichte auf dem
    // Pages-Weg unter /radar/berichte.json und auf dem Control-Weg unter
    // /admin/radar-berichte.json. Bewertete man jede Adresse einzeln, meldete
    // der Pruefer bei JEDEM Lauf einen Fehlalarm — und ein Pruefer, dem man
    // seine Fehlalarme abgewoehnt, indem man ihn ignoriert, ist keiner mehr.
    // Ein Befund entsteht erst, wenn KEINE der Quellen ankommt.
    const schlecht = [];
    for (const { methode, pfad } of adressen) {
      geprueft += 1;
      const antwort = await frage(methode, pfad);
      if (!antwort.behandelt) {
        schlecht.push({ pfad: `${methode} ${pfad}`, grund: "kein Handler zustaendig" });
      } else if (antwort.status === 404 && antwort.fehler === "admin_route_not_found") {
        // Genau der Befund vom 2026-08-07: die Kette nimmt den Pfad an und
        // weist ihn dann als unbekannt ab.
        schlecht.push({ pfad: `${methode} ${pfad}`, grund: "404 admin_route_not_found" });
      }
    }
    if (schlecht.length === adressen.length) {
      for (const b of schlecht) befunde.push({ seite, ...b });
    }
  }

  const haenger = haengerBefunde();
  for (const h of haenger) befunde.push({ seite: h.datei, pfad: h.ziel, grund: h.grund });

  if (befunde.length > 0) {
    console.error(`admin-konsole VERLETZT (${befunde.length} Befunde bei ${geprueft} Adressen):`);
    for (const b of befunde) console.error(`  - ${b.seite}: ${b.pfad} — ${b.grund}`);
    console.error("Eine Adresse, die die Konsole ruft, muss beim Server ankommen — und ein Knopf, an den sie bindet, muss gezeichnet werden.");
    process.exit(1);
  }
  console.log(`admin-konsole OK — ${geprueft} Adressen aus ${alle.length} Ansichten kommen beim Server an;`
    + ` ${haengerZiele().length} Bedienelemente werden auch gezeichnet.`);
}

await main();

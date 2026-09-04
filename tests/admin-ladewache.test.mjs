// smejj.com — warum der Adminbereich langsam war und "Konsole nicht geladen"
// meldete (Befund 2026-09-04, vom Betreiber gemeldet).
//
// Gemessen und behoben:
//   1. Der Anmelde-Ruf startete erst NACH allen 28 Konsolen-Skripten. Jetzt
//      startet er beim Laden von api.js (Datei 3 von 28) und laeuft parallel.
//   2. Die Verbindung zum Control-Server wurde nicht vorgewaermt (0,6-2,1 s
//      TLS-Handshake mitten im Wartebalken). Jetzt preconnect.
//   3. Die Ladewache brach nach 15 s ab und nannte die falsche Ursache, und die
//      Seite war bis dahin schwarz. Jetzt: Hinweis nach 1,5 s, Abbruch nach
//      30 s, Ursache aus der Messung.
//
// Diese Proben halten alle drei fest — sonst wandern sie beim naechsten
// Umbau lautlos zurueck.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const WURZEL = new URL("../control-server/admin-ui/", import.meta.url);
const API = readFileSync(new URL("api.js", WURZEL), "utf8");
const GATE = readFileSync(new URL("gate.js", WURZEL), "utf8");
const HTML = readFileSync(new URL("index.html", WURZEL), "utf8");

/** api.js in einer Attrappe laufen lassen und jeden fetch mitschreiben. */
function apiBuehne() {
  const rufe = [];
  const win = {};
  const sandbox = {
    window: win,
    document: {
      body: { setAttribute() {}, appendChild() {}, removeChild() {}, firstChild: null },
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }),
      addEventListener() {},
      documentElement: { style: { setProperty() {} }, classList: { add() {}, remove() {} } }
    },
    location: { hostname: "smejj.com", origin: "https://smejj.com", pathname: "/admin/", search: "", href: "" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (u) => {
      rufe.push(String(u));
      return { ok: false, status: 401, text: async () => JSON.stringify({ error: "unauthorized" }) };
    },
    navigator: {}, console, setTimeout, clearTimeout, URLSearchParams,
    atob: () => "", btoa: () => "", Uint8Array, AbortController
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(API, vm.createContext(sandbox));
  return { api: () => win.adminApi, rufe };
}

test("api.js fragt die Anmeldung SOFORT, nicht erst nach den 28 Skripten", async () => {
  const b = apiBuehne();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(b.rufe, ["https://api.smejj.com/api/admin/me"],
    "der Vorab-Ruf muss beim Laden von api.js abgehen — sonst liegt die Antwortzeit wieder hinter dem Download");
});

test("ich() verbraucht den Vorab-Ruf, statt ein zweites Mal zu fragen", async () => {
  const b = apiBuehne();
  await new Promise((r) => setTimeout(r, 20));
  const erste = await b.api().ich();
  assert.equal(erste.status, 401);
  assert.equal(b.rufe.length, 1, "der erste ich()-Aufruf darf KEINEN zweiten Ruf ausloesen");
});

test("ein zweiter ich()-Aufruf fragt wieder frisch nach", async () => {
  const b = apiBuehne();
  await new Promise((r) => setTimeout(r, 20));
  await b.api().ich();
  await b.api().ich();
  assert.equal(b.rufe.length, 2, "der Vorab-Ruf gilt genau einmal, danach wird wieder gefragt");
});

test("der Vorab-Ruf nimmt den Weg OHNE Dialog", () => {
  // hole() darf bei Step-up einen Dialog oeffnen — zu diesem Zeitpunkt gibt es
  // keine Huelle, in die er passt. Deshalb holeDirekt.
  assert.match(API, /VORAB_ICH\.antwort = holeDirekt\("\/api\/admin\/me"\)/);
  assert.doesNotMatch(API, /VORAB_ICH\.antwort = hole\(/);
});

test("die Verbindung zum Control-Server wird vorgewaermt", () => {
  assert.match(HTML, /<link rel="preconnect" href="https:\/\/api\.smejj\.com" crossorigin>/,
    "ohne crossorigin waermt der preconnect eine ANDERE Verbindung als fetch() benutzt");
  assert.match(HTML, /<link rel="dns-prefetch" href="https:\/\/smejj-control\.zeabur\.app">/);
  // Was vorgewaermt wird, muss die CSP auch erlauben.
  assert.match(HTML, /connect-src[^"]*https:\/\/api\.smejj\.com/);
});

test("die Ladewache bricht erst nach 30 s ab und meldet vorher, dass es laeuft", () => {
  assert.match(GATE, /GEDULD_HINWEIS_MS = 1500;/);
  assert.match(GATE, /GEDULD_ABBRUCH_MS = 30000;/);
  assert.doesNotMatch(GATE, /\}, 15000\);/, "die alte 15-Sekunden-Wache schlug beim Betreiber grundlos zu");
});

test("die Ladewache nennt die Ursache, die wirklich zutrifft", () => {
  assert.match(GATE, /function ketteAngekommen\(\)/);
  assert.match(GATE, /getEntriesByType\("resource"\)/);
  assert.match(GATE, /Konsolen-Dateien sind da, aber der Control-Server/);
  assert.match(GATE, /Konsolen-Dateien sind nicht vollstaendig angekommen/);
});

test("freigeben und abweisen raeumen BEIDE Wachen ab", () => {
  const frei = /function freigeben\(\) \{[\s\S]*?\n  \}/.exec(GATE)[0];
  assert.match(frei, /clearTimeout\(netz\)/);
  assert.match(frei, /clearTimeout\(hinweisNetz\)/);
  assert.match(frei, /gateLaedt/, "der Lade-Kasten muss weg, bevor die Huelle kommt");
  const ab = /function abweisen\(was\) \{[\s\S]*?clearTimeout\(hinweisNetz\);/.exec(GATE);
  assert.ok(ab, "abweisen muss auch den Hinweis-Zeitgeber stoppen");
});

test("alle Konsolen-Skripte laden mit defer — und in unveraenderter Reihenfolge", () => {
  // Der Befund vom 04.09. im Browser des Betreibers: die 26 Skripte luden
  // STRENG NACHEINANDER, jede Datei startete genau dann, wenn die vorige fertig
  // war. Auf 3G (1,5 Mbit/s, 500 ms Umlaufzeit) war die letzte erst nach 21 s
  // da. Faellt ein defer weg, kommt genau dieses Verhalten zurueck.
  const koerper = HTML.split("</head>")[1];
  const ohne = [...koerper.matchAll(/<script src="(\/admin\/[^"]+)"/g)].map((t) => t[1]);
  assert.deepEqual(ohne, [], `diese Skripte laden noch parser-blockierend: ${ohne.join(", ")}`);
  const mit = [...koerper.matchAll(/<script defer src="\/admin\/([^"]+)"/g)].map((t) => t[1]);
  assert.ok(mit.length >= 26, `nur ${mit.length} Skripte mit defer`);
  // Die Reihenfolge ist Teil des Vertrags: jede console-stage*.js meldet ihre
  // Seiten an, BEVOR console.js sie einsammelt.
  assert.equal(mit[mit.length - 1], "console.js", "console.js muss zuletzt ausgefuehrt werden");
  assert.ok(mit.indexOf("api.js") < mit.indexOf("console.js"));
  assert.ok(mit.indexOf("schiene.js") < mit.indexOf("console.js"));
});

test("gate.js bleibt OHNE defer im Kopf", () => {
  const kopf = HTML.split("</head>")[0];
  assert.match(kopf, /<script src="\/admin\/gate\.js"><\/script>/,
    "gate.js muss vor dem ersten Pixel laufen — mit defer blitzt der Adminbereich auf, bevor umgeleitet wird");
});

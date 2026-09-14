#!/usr/bin/env node
// smejj.com — haelt die App als PWA, was sie verspricht? (Punkt 9 des Auftrags)
//
// Geprueft wird, was eine installierte App ausmacht: ein aktiver Service
// Worker, ein gefuellter Zwischenspeicher — und dass die App OHNE Netz
// aufgeht.
//
// DIE FALLE, in die diese Messung selbst getappt ist (2026-09-12):
// `Network.emulateNetworkConditions offline:true` wird beim Seitenwechsel
// ZURUECKGESETZT. Die erste Fassung schaltete offline, navigierte und mass
// dann bei vollem Netz — "App laeuft offline!" waere eine glatte Falschaussage
// gewesen. Zwei Dinge halten jetzt dagegen:
//   * `Network.setBlockedURLs(["*"])` zusaetzlich, und beides NACH der
//     Navigation noch einmal gesetzt.
//   * Eine GEGENPROBE: eine Datei, die nicht im Zwischenspeicher liegt, MUSS
//     scheitern. Tut sie das nicht, war das Netz nie aus und das Ergebnis
//     wertlos. `navigator.onLine` allein beweist gar nichts.
//
// Aufruf: node scripts/diagnose/pwa-offline.mjs
//
// DIE ZEILE, DIE FEHLTE (12.09.): ohne diesen Import starb das Werkzeug schon
// in der ersten Zeile ("launchChrome is not defined") — eine Messung, die gar
// nicht erst laeuft, sieht im Protokoll aus wie eine, die nichts gefunden hat.
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";
import fs from "node:fs";
import { cacheNameAusSw, shellListeAusSw, zaehleShellCache } from "./pwa-cache-zaehlung.mjs";

const chrome = await launchChrome();
process.once("SIGTERM", () => { chrome.close().catch(()=>{}); process.exit(130); });
const page = await openPage(chrome);
await page("Page.enable"); await page("Runtime.enable"); await page("Network.enable");
const ev = async (a, wo="?") => {
  const { result, exceptionDetails } = await page("Runtime.evaluate", { expression: a, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) { console.log(`  [${wo}] FEHLER:`, (exceptionDetails.exception?.description || exceptionDetails.text || "").split("\n")[0].slice(0,120)); return null; }
  return result?.value;
};
await page("Page.navigate", { url: "https://smejj.com/" });
await sleep(5000);
// BEIDE Schluessel, nicht nur einer (12.09.): Das fruehe Tor in
// auth-gate-frueh.js prueft das VORHANDENSEIN von smejj.auth.accessToken.v1.
// Ohne ihn schickt es den Besucher auf die Werbeseite — und die laedt app.js
// gar nicht, registriert also keinen Service Worker. Das Werkzeug meldete
// deshalb "Precache leer, SW nicht aktiv" fuer eine kerngesunde App.
await ev('localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }))', "anmelden");
await ev('localStorage.setItem("smejj.auth.accessToken.v1", "qa")', "ausweis");
await page("Page.navigate", { url: "https://smejj.com/" });
await sleep(9000);

// WAS HABE ICH HIER EIGENTLICH VOR MIR? Ohne diese Frage misst man die
// Werbeseite und haelt das Ergebnis fuer einen Befund ueber die App.
const seite = await ev('document.querySelector("#startMessage") ? "App" : "Landeseite"', "seite");
console.log("0. Gemessen wird:", seite);
if (seite !== "App") {
  console.log("   ABBRUCH: die App wurde nicht geladen — jede Zahl unten waere eine Aussage ueber die Werbeseite.");
  await chrome.close().catch(() => {});
  process.exit(1);
}

// BEFUND F10 (14.09.): "dateien: 12" bei 235 Eintraegen live. Der erste,
// unangemeldete Aufruf oben landet auf der Werbeseite, die /sw.js?eingang=
// willkommen registriert und smejj-willkommen-v<N> mit genau 12 Dateien fuellt.
// Die alte Fassung summierte ALLE Speicher und brach ihre Warteschleife beim
// ersten Eintrag ab — also beim schmalen Speicher, bevor der volle Precache
// stand. Jetzt zaehlt NUR der aktive Shell-Cache (smejj-shell-v<N>), und die
// Messlatte ist die SHELL-Liste des LIVE ausgelieferten sw.js: jeder Eintrag
// muss im Speicher liegen, die Kern-Dateien ohnehin (pwa-cache-zaehlung.mjs).
const swLive = await ev('fetch("/sw.js", { cache: "no-store" }).then((r) => r.ok ? r.text() : "")', "sw-quelle");
const swLokal = fs.readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const swQuelle = swLive && shellListeAusSw(swLive).length > 0 ? swLive : swLokal;
const precacheListe = shellListeAusSw(swQuelle);
console.log("   Messlatte:", swQuelle === swLive ? "sw.js LIVE" : "sw.js LOKAL (live nicht lesbar)",
  cacheNameAusSw(swQuelle), "mit", precacheListe.length, "Eintraegen; lokal:", cacheNameAusSw(swLokal));

// Alle Speicher mit ihren Anfrage-URLs — die Zaehlung selbst passiert in Node,
// damit sie ohne Browser pruefbar ist (tests/pwa-offline-zaehlung.test.mjs).
const SPEICHER_ABZUG = '(async () => { const aus = {}; for (const n of await caches.keys()) aus[n] = (await (await caches.open(n)).keys()).map((r) => r.url); return aus; })()';

// Der Precache braucht Zeit: 235 Dateien, darunter ein 1,2-MB-Arbeiter.
// Warten, bis er VOLLSTAENDIG steht — nicht bis irgendein Speicher etwas hat.
let zaehlung = zaehleShellCache({}, precacheListe);
for (let i = 0; i < 24; i += 1) {
  zaehlung = zaehleShellCache((await ev(SPEICHER_ABZUG, "warten")) || {}, precacheListe);
  if (zaehlung.vollstaendig) break;
  await sleep(5000);
}

console.log("1. Service Worker");
console.log("  ", JSON.stringify(await ev(`(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const r = regs[0];
  return { registrierungen: regs.length, aktiv: Boolean(r && r.active), umfang: r ? r.scope : null,
    zustand: r && r.active ? r.active.state : null };
})()`, "sw")));

console.log("2. Zwischenspeicher (Precache) — nur der aktive Shell-Cache zaehlt");
console.log("  ", JSON.stringify({
  speicher: zaehlung.speicher, aktiverCache: zaehlung.aktiverCache,
  dateien: zaehlung.dateien, erwartet: zaehlung.erwartet,
  kernDateienDa: zaehlung.kernFehlt.length === 0, kernFehlt: zaehlung.kernFehlt,
  precacheFehlt: zaehlung.fehlend.slice(0, 10), precacheFehltAnzahl: zaehlung.fehlend.length,
  vollstaendig: zaehlung.vollstaendig,
}));
if (!zaehlung.vollstaendig) {
  console.log("   BEFUND: der Shell-Cache ist unvollstaendig oder fehlt — Offline-Ergebnis unten mit Vorsicht lesen.");
  process.exitCode = 1;
}

console.log("3. OFFLINE: geht die App noch auf?");
// Erst blockieren, DANN navigieren — und nach der Navigation erneut setzen:
// emulateNetworkConditions wird beim Seitenwechsel zurueckgesetzt, und die
// erste Fassung mass deshalb bei vollem Netz. Zusaetzlich setBlockedURLs, das
// haelt auch ueber die Navigation.
await page("Network.setBlockedURLs", { urls: ["*"] });
await page("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await page("Page.navigate", { url: "https://smejj.com/" });
await sleep(3000);
await page("Network.setBlockedURLs", { urls: ["*"] });
await page("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await sleep(3000);
console.log("  ", JSON.stringify(await ev(`(() => {
  const feld = document.getElementById("startMessage");
  const spur = document.querySelectorAll(".nav-button").length;
  return { online: navigator.onLine, eingabefeldDa: Boolean(feld),
    spurKnoepfe: spur, titel: document.title.slice(0, 40),
    textLaenge: (document.body ? document.body.innerText : "").trim().length };
})()`, "offline")));
// Gegenprobe: navigator.onLine bleibt bei CDP-Emulation oft "true" — das
// beweist gar nichts. Eine Datei, die NICHT im Zwischenspeicher liegt, muss
// jetzt scheitern; sonst war das Netz nie aus und der Offline-Test wertlos.
console.log("4. Gegenprobe: ist das Netz wirklich aus?");
console.log("  ", JSON.stringify(await ev(`(async () => {
  try {
    await fetch("/gibtesnicht-offline-probe-" + Date.now(), { cache: "no-store" });
    return { netzWirklichAus: false, hinweis: "Anfrage kam durch — die Emulation griff nicht" };
  } catch (f) {
    return { netzWirklichAus: true, fehler: String(f.name || f).slice(0, 40) };
  }
})()`, "gegenprobe")));
await page("Network.setBlockedURLs", { urls: [] });
await page("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await chrome.close();

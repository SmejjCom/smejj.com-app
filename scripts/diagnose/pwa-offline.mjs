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

// Der Precache braucht Zeit: 229 Dateien, darunter ein 1,2-MB-Arbeiter.
// Warten, bis er steht — eine zu knappe Frist meldet "leer" fuer "noch am Fuellen".
for (let i = 0; i < 24; i += 1) {
  const voll = await ev('(async () => { const n = await caches.keys(); let z = 0; for (const k of n) z += (await (await caches.open(k)).keys()).length; return z; })()', "warten");
  if (voll > 0) break;
  await sleep(5000);
}

console.log("1. Service Worker");
console.log("  ", JSON.stringify(await ev(`(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const r = regs[0];
  return { registrierungen: regs.length, aktiv: Boolean(r && r.active), umfang: r ? r.scope : null,
    zustand: r && r.active ? r.active.state : null };
})()`, "sw")));

console.log("2. Zwischenspeicher (Precache)");
console.log("  ", JSON.stringify(await ev(`(async () => {
  const namen = await caches.keys();
  let dateien = 0;
  for (const n of namen) { const c = await caches.open(n); dateien += (await c.keys()).length; }
  return { speicher: namen, dateien };
})()`, "cache")));

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

#!/usr/bin/env node
// smejj.com — welches Modul laedt die LIVE-Seite unter mehr als einer Kennung?
//
// WARUM ES DIESEN ZWEITEN WAECHTER BRAUCHT: check-module-queries.mjs liest die
// QUELLE und meldet gruen, solange sie in sich stimmig ist. Genau das war am
// 2026-09-10 der Fall — und live wurde chat-store.js trotzdem zweimal geladen:
//
//   /assets/chat-store.js?v=b68   (index.html, code-flaeche.js)
//   /assets/chat-store.js?v=b69   (26 andere Stellen)
//
// Auseinander liefen nicht die Importe, sondern QUELLE und AUSLIEFERUNG. Der
// Frontend-Klon hatte 26 Stellen nachgezogen und zwei vergessen. Ein Schutz,
// der nur die Quelle liest, ist dagegen blind (Memory: "Artefakt ersetzt NIE
// die Quelle — die Falle geht in beide Richtungen").
//
// DER SCHADEN IST NICHT DAS GEWICHT (35,8 KB je Erstbesuch), sondern der
// Zustand: zwei Adressen sind in ES-Modulen zwei INSTANZEN. chat-store.js
// haelt die Chatliste — es gab zwei Wahrheiten darueber, welche Chats es gibt.
//
// Aufruf:
//   node scripts/diagnose/doppelte-module-live.mjs
//   node scripts/diagnose/doppelte-module-live.mjs --url https://smejj.com/
//   node scripts/diagnose/doppelte-module-live.mjs --json
import { launchChrome, openPage, sleep } from "../testing/cdp-client.mjs";

const args = process.argv.slice(2);
const flag = (name, vorgabe) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : vorgabe;
};
const URL_UNTER_TEST = flag("url", "https://smejj.com/");
const ALS_JSON = args.includes("--json");
// Ohne Wartezeit misst man den halb geladenen Zustand: die meisten Module
// kommen erst nach dem ersten Bild (afterFirstPaint).
const RUHE_HOECHSTENS_MS = Number(flag("ruhe", "30000"));
// EIN WAECHTER MUSS MERKEN, WENN ER NICHTS GESEHEN HAT.
//
// Erster Lauf am 2026-09-10: "4 Module geprueft — jedes unter genau einer
// Kennung". Gruen, und in Wahrheit blind — die Startseite laedt 98. Ohne
// Anmeldung und mit fester Wartezeit sah das Skript nur den Anfang und meldete
// Entwarnung fuer 94 ungesehene Module. Eine Untergrenze macht daraus einen
// ehrlichen Fehler.
const MINDESTENS_MODULE = Number(flag("mindestens", "40"));

// Dieselbe Anmeldung wie in messe_responsive.mjs: ohne sie zeigt die App nur
// die Werbeseite und laedt einen Bruchteil ihrer Module.
const ANMELDEN = `(() => {
  localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "local-only" }));
  return "ok";
})()`;

const MESSUNG = `(() => {
  const nach = new Map();
  for (const r of performance.getEntriesByType("resource")) {
    let u;
    try { u = new URL(r.name); } catch { continue; }
    if (!/\\.(js|css)$/.test(u.pathname)) continue;
    const liste = nach.get(u.pathname) || [];
    liste.push({ kennung: u.search || "(ohne)", kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024 * 10) / 10 });
    nach.set(u.pathname, liste);
  }
  const doppelt = [];
  for (const [pfad, liste] of nach) {
    const kennungen = [...new Set(liste.map((x) => x.kennung))];
    if (kennungen.length < 2) continue;
    doppelt.push({ pfad, kennungen, verschwendetKb: Math.round(liste.slice(1).reduce((s, x) => s + x.kb, 0) * 10) / 10 });
  }
  return { module: nach.size, doppelt };
})()`;

async function auswerten(page, ausdruck) {
  const { result, exceptionDetails } = await page("Runtime.evaluate", {
    expression: ausdruck, returnByValue: true, awaitPromise: true
  });
  if (exceptionDetails) {
    const e = exceptionDetails.exception || {};
    throw new Error(e.description || e.value || exceptionDetails.text || "Auswertung fehlgeschlagen");
  }
  return result.value;
}

/** Wartet, bis das Dokument die Zieladresse traegt und ansprechbar ist. */
async function warteAufHerkunft(page, hoechstensMs = 25000) {
  const bis = Date.now() + hoechstensMs;
  let zuletzt = "keine Antwort";
  while (Date.now() < bis) {
    try {
      const stand = await auswerten(page, `(() => {
        try {
          if (!location.origin || location.origin === "null") return "leer";
          localStorage.getItem("probe");
          return document.readyState === "loading" ? "laedt" : "bereit";
        } catch (f) { return "gesperrt: " + f.name; }
      })()`);
      if (stand === "bereit") return true;
      zuletzt = stand;
    } catch (fehler) { zuletzt = String(fehler.message || fehler).slice(0, 80); }
    await sleep(400);
  }
  throw new Error(`Seite kam nicht hoch: ${URL_UNTER_TEST} (zuletzt: ${zuletzt})`);
}

// launchChrome() liefert den Klienten SELBST ({ send, close }), nicht in einer
// Huelle — sonst waere client undefined und openPage stuerzt mit
// "Cannot read properties of undefined (reading 'send')" ab.
const client = await launchChrome();
let befund = { module: 0, doppelt: [] };
try {
  const page = await openPage(client);
  await page("Page.enable");
  await page("Runtime.enable");
  // Bewusst mit LEEREM Cache: ein zweites Laden aus dem Cache waere zwar
  // billiger, aber die zweite Instanz entstuende trotzdem.
  await page("Network.enable");
  await page("Network.setCacheDisabled", { cacheDisabled: true });
  await page("Page.navigate", { url: URL_UNTER_TEST });
  await warteAufHerkunft(page);
  await auswerten(page, ANMELDEN);
  await page("Page.navigate", { url: URL_UNTER_TEST });
  await warteAufHerkunft(page);
  // Warten, bis die Modulzahl STEHT — nicht bis die Uhr abgelaufen ist. Die
  // App laedt gestaffelt nach (afterFirstPaint, Nachlader je Ansicht); eine
  // feste Frist trifft mal den Anfang und mal die Mitte.
  let vorher = -1;
  const bis = Date.now() + RUHE_HOECHSTENS_MS;
  while (Date.now() < bis) {
    befund = await auswerten(page, MESSUNG);
    if (befund.module === vorher && befund.module > 0) break;
    vorher = befund.module;
    await sleep(1200);
  }
} finally {
  await client.close();
}

if (ALS_JSON) {
  console.log(JSON.stringify({ url: URL_UNTER_TEST, ...befund }, null, 2));
} else {
  console.log(`Doppelt geladene Module auf ${URL_UNTER_TEST} — ${befund.module} Module geprueft`);
  if (befund.module < MINDESTENS_MODULE) {
    console.error(`  MESSUNG UNGUELTIG: nur ${befund.module} Module gesehen, erwartet mindestens ${MINDESTENS_MODULE}.`);
    console.error("  Entwarnung fuer ungesehene Module waere schlimmer als kein Waechter.");
    process.exit(2);
  }
  if (befund.doppelt.length === 0) {
    console.log("  Jedes Modul kommt unter genau einer Kennung.");
  } else {
    for (const d of befund.doppelt) {
      console.log(`  ${d.pfad}`);
      console.log(`     Kennungen: ${d.kennungen.join("  ")}`);
      console.log(`     verschwendet: ${d.verschwendetKb} KB — und ZWEI Modulinstanzen mit eigenem Zustand`);
    }
  }
}
process.exit(befund.doppelt.length === 0 ? 0 : 1);

// smejj.com — Web-Vitals-Messung gegen die verbindlichen Performance-Budgets.
//
// Erfuellt die Messpflicht: LCP, CLS, TTFB, FCP und Seitengewicht werden in einem
// echten Chrome gemessen, nicht per curl. Der Unterschied ist gross — curl misst
// den Ursprungsserver ohne Service Worker und liefert dadurch irrefuehrende Werte
// (Fehlbefund vom 2026-07-27: 1,38 s per curl gegen 40 ms im Browser).
//
// Aufruf:
//   node scripts/testing/measure_web_vitals.mjs
//   node scripts/testing/measure_web_vitals.mjs --url https://smejj.com/ --runs 5
//   node scripts/testing/measure_web_vitals.mjs --json > docs/benchmarks/lauf.json
//
// Fail-closed: Reisst ein Budget, endet der Lauf mit Exit-Code 1.

import { launchChrome, openPage, sleep } from "./cdp-client.mjs";

const BUDGETS = Object.freeze({
  // TTFB 500 statt 200 und nur noch Hinweis (Betreiber-Entscheidung 2026-09-02): Gemessen wird vom
  // Mac des Betreibers gegen GitHub Pages; der p75 aus fuenf kalten Laeufen lag
  // heute bei 216, 420 und 878 ms bei LCP 0,6-1,1 s — das Netz zum Edge
  // schwankt, nicht die Seite. 200 ms machte die Wache dauerhaft rot, ohne
  // dass jemand etwas haette aendern koennen; 500 ms faengt einen echten
  // Einbruch (Server statt CDN, kaputter Cache) weiterhin ab.
  ttfb_ms: 500,
  lcp_ms: 1500,
  cls: 0.1,
  inp_ms: 200,
  pageWeight_kb: 300
});

const args = parseArgs(process.argv.slice(2));
const url = args.url || "https://smejj.com/";
const runs = Math.max(1, Number(args.runs) || 5);
const asJson = Boolean(args.json);

// Die App leitet Abgemeldete auf /auth/login/. Fuer die Messung der echten
// Startseite wird im Wegwerf-Profil eine Sitzung vorgetaeuscht — kein Zugang,
// kein Secret, nur das lokale Kennzeichen, das auth-gate.js prueft.
//
// Die Fuehrung gilt als gesehen, aus demselben Grund: gemessen wird der
// angemeldete WIEDERKEHRER, und der hat die Erste Fuehrung hinter sich.
// Ohne dieses Kennzeichen mass der Lauf einen Widerspruch (Sitzung alt,
// Fuehrung nie gesehen) — und das LCP war die Fuehrungs-Blase, die absichtlich
// erst nach 1,6 s erscheint (Befund 2026-08-24: LCP 2,4 s statt echter 0,8 s).
const SEED_SESSION = `try { localStorage.setItem("smejj.session.v1", JSON.stringify({ authenticated: true, mode: "messung" })); localStorage.setItem("smejj.fuehrung.v1", "gesehen"); } catch (error) { void error; }`;

const COLLECTOR = `
window.__smejjVitals = { lcp: null, cls: 0, inp: null, lcpElement: null };
try {
  new PerformanceObserver((list) => {
    const entry = list.getEntries().pop();
    if (!entry) return;
    window.__smejjVitals.lcp = Math.round(entry.startTime);
    window.__smejjVitals.lcpElement = entry.element ? (entry.element.id || entry.element.className || entry.element.tagName) : entry.url || null;
  }).observe({ type: "largest-contentful-paint", buffered: true });
} catch (error) { void error; }
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__smejjVitals.cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
} catch (error) { void error; }
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__smejjVitals.inp = Math.max(window.__smejjVitals.inp || 0, Math.round(entry.duration));
  }).observe({ type: "event", buffered: true, durationThreshold: 16 });
} catch (error) { void error; }
`;

const READ = `(() => {
  const nav = performance.getEntriesByType("navigation")[0] || {};
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  const weight = performance.getEntriesByType("resource").reduce((sum, r) => sum + (r.transferSize || 0), (nav.transferSize || 0));
  const vitals = window.__smejjVitals || {};
  return JSON.stringify({
    ttfb_ms: Math.round((nav.responseStart || 0) - (nav.requestStart || 0)),
    fcp_ms: fcp ? Math.round(fcp.startTime) : null,
    lcp_ms: vitals.lcp,
    lcpElement: vitals.lcpElement,
    cls: Math.round((vitals.cls || 0) * 1000) / 1000,
    inp_ms: vitals.inp,
    domInteractive_ms: Math.round(nav.domInteractive || 0),
    pageWeight_kb: Math.round(weight / 1024),
    resources: performance.getEntriesByType("resource").length
  });
})()`;

const client = await launchChrome();
const results = { cold: [], warm: [] };
try {
  for (let run = 0; run < runs; run += 1) {
    const send = await openPage(client);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `${SEED_SESSION}\n${COLLECTOR}` });

    results.cold.push(await measure(send, url, { reload: false }));
    results.warm.push(await measure(send, url, { reload: true }));
    await send("Page.close").catch(() => {});
  }
} finally {
  await client.close();
}

const report = {
  url,
  runs,
  gemessenMit: "Chrome headless ueber DevTools-Protokoll, ohne Zusatzpakete",
  kalt: summarise(results.cold),
  warm: summarise(results.warm),
  budgets: BUDGETS
};

const verstoesse = checkBudgets(report.kalt).map((line) => `kalt: ${line}`)
  .concat(checkBudgets(report.warm).map((line) => `warm: ${line}`));

if (asJson) {
  process.stdout.write(`${JSON.stringify({ ...report, verstoesse }, null, 2)}\n`);
} else {
  print(report, verstoesse);
}
process.exit(verstoesse.length ? 1 : 0);

async function measure(send, target, { reload }) {
  if (reload) {
    // Ein echter Wiederbesucher trifft auf einen FERTIG aktivierten Service
    // Worker. Ohne dieses Warten misst man die Installationsphase mit und der
    // Wiederbesuch sieht faelschlich langsamer aus als der Erstbesuch.
    await waitForServiceWorker(send);
    await send("Page.reload", { ignoreCache: false });
  } else {
    // Ehrlicher Erstbesuch: HTTP-Cache, Service Worker und Cache Storage weg.
    // Ohne das waere nur der allererste Lauf kalt und alle weiteren gelogen.
    await send("Network.clearBrowserCache").catch(() => {});
    await send("Storage.clearDataForOrigin", { origin: new URL(target).origin, storageTypes: "cache_storage,service_workers,local_storage,indexeddb" }).catch(() => {});
    await send("Page.navigate", { url: target });
  }
  await sleep(4000);
  await interact(send);
  await sleep(1200);
  const { result } = await send("Runtime.evaluate", { expression: READ, returnByValue: true, awaitPromise: false });
  return JSON.parse(result.value);
}

// Wartet, bis der Service Worker aktiviert ist und die Seite kontrolliert.
async function waitForServiceWorker(send) {
  await send("Runtime.evaluate", {
    expression: `(async () => {
      if (!navigator.serviceWorker) return "kein Service Worker";
      const timeout = new Promise((r) => setTimeout(() => r("Zeitueberschreitung"), 8000));
      await Promise.race([navigator.serviceWorker.ready, timeout]);
      if (navigator.serviceWorker.controller) return "kontrolliert";
      await Promise.race([new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })), timeout]);
      return navigator.serviceWorker.controller ? "kontrolliert" : "nicht kontrolliert";
    })()`,
    awaitPromise: true,
    returnByValue: true
  }).catch(() => {});
}

// Echte Nutzerinteraktion auf dem Eingabefeld der Startseite: Klick, dann eine
// Taste. Ohne echte Eingabe entsteht kein INP-Messwert.
async function interact(send) {
  const { result } = await send("Runtime.evaluate", {
    expression: `(() => { const el = document.querySelector("#startMessage"); if (!el) return ""; const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }); })()`,
    returnByValue: true
  });
  if (!result.value) return;
  const { x, y } = JSON.parse(result.value);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }).catch(() => {});
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }).catch(() => {});
  await sleep(200);
  for (const text of ["s", "m"]) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", text, key: text }).catch(() => {});
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: text }).catch(() => {});
    await sleep(120);
  }
}

function summarise(list) {
  const numeric = (key) => list.map((entry) => entry[key]).filter((value) => typeof value === "number");
  const out = {};
  for (const key of ["ttfb_ms", "fcp_ms", "lcp_ms", "cls", "inp_ms", "domInteractive_ms", "pageWeight_kb", "resources"]) {
    const values = numeric(key).sort((a, b) => a - b);
    out[key] = values.length
      ? { median: values[Math.floor(values.length / 2)], p75: values[Math.min(values.length - 1, Math.ceil(values.length * 0.75) - 1)], min: values[0], max: values[values.length - 1] }
      : null;
  }
  out.lcpElement = list.map((entry) => entry.lcpElement).find(Boolean) || null;
  return out;
}

// TTFB ist ein Netzwert, kein Seitenwert: HTML bleibt im Service Worker
// network-first (sw.js), also misst auch der "warme" Lauf den Weg vom Mac des
// Betreibers zum GitHub-Pages-Edge. Am 2026-09-02 lagen die p75-Werte bei
// 216, 420, 819 und 878 ms — bei LCP 0,6-1,1 s und Gewicht < 300 KB. Eine
// rote Ampel, die niemand durch eine Aenderung an der Seite gruen bekommt,
// ist keine Wache. TTFB wird darum gemessen und gemeldet, reisst aber kein
// Budget mehr; LCP, CLS, INP und Gewicht bleiben fail-closed.
const NUR_HINWEIS = new Set(["ttfb_ms"]);

function checkBudgets(summary) {
  const failures = [];
  for (const [key, budget] of Object.entries(BUDGETS)) {
    if (NUR_HINWEIS.has(key)) continue;
    const measured = summary[key]?.p75;
    if (typeof measured !== "number") continue;
    if (measured > budget) failures.push(`${key} p75 ${measured} > Budget ${budget}`);
  }
  return failures;
}

function print(data, failures) {
  console.log(`Web-Vitals — ${data.url} (${data.runs} Laeufe, Chrome headless)\n`);
  for (const phase of ["kalt", "warm"]) {
    console.log(`## ${phase === "kalt" ? "Erstbesuch (leerer Cache)" : "Wiederbesuch (Service Worker aktiv)"}`);
    for (const [key, budget] of Object.entries(BUDGETS)) {
      const value = data[phase][key];
      if (!value) { console.log(`  ${key.padEnd(16)} nicht gemessen`); continue; }
      console.log(`  ${key.padEnd(16)} p75 ${String(value.p75).padStart(6)}  (min ${value.min} / max ${value.max})  Budget ${budget}  ${value.p75 > budget ? "VERFEHLT" : "OK"}`);
    }
    if (data[phase].lcpElement) console.log(`  LCP-Element:     ${data[phase].lcpElement}`);
    console.log("");
  }
  if (failures.length) {
    console.log(`Budget verfehlt (${failures.length}):`);
    for (const line of failures) console.log(`  - ${line}`);
  } else {
    console.log("Alle Performance-Budgets eingehalten.");
  }
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 1) {
    if (!list[i].startsWith("--")) continue;
    const key = list[i].slice(2);
    const next = list[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

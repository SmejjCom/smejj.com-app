// smejj.com QA — Ansichten-Rundgang per CDP: je Route Ueberlauf, kleine Ziele, Konsolenfehler, Screenshot.
// Aufruf: node sweep.mjs <port> <praefix> <route1> <route2> ...
import { writeFileSync } from "node:fs";
const [port, praefix, ...routen] = process.argv.slice(2);
const liste = await fetch(`http://localhost:${port}/json`).then((r) => r.json());
const seite = liste.find((t) => t.type === "page" && !/^chrome/.test(t.url)) || liste.find((t) => t.type === "page");
const ws = new WebSocket(seite.webSocketDebuggerUrl);
await new Promise((ok, nein) => { ws.onopen = ok; ws.onerror = nein; });
let id = 0; const offen = new Map(); const fehler = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } if (m.method === "Runtime.exceptionThrown") fehler.push(m.params.exceptionDetails?.exception?.description?.slice(0, 120) || "?"); if (m.method === "Log.entryAdded" && m.params.entry.level === "error") fehler.push(m.params.entry.text.slice(0, 120)); };
const ruf = (method, params = {}) => new Promise((ok) => { const i = ++id; offen.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (js) => { const r = await ruf("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
await ruf("Runtime.enable"); await ruf("Log.enable");
const MESSUNG = `(() => {
  const vp = innerWidth + "x" + innerHeight;
  const ueberlauf = document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth;
  const klein = [];
  for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=menuitem]")) {
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (b.width === 0 || b.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
    if (b.bottom < 0 || b.top > innerHeight) continue;
    if (b.width < 44 || b.height < 44) klein.push((el.getAttribute("aria-label") || el.textContent.trim().slice(0, 24) || el.id || el.className.toString().slice(0, 24)) + " " + Math.round(b.width) + "x" + Math.round(b.height));
  }
  const ansicht = document.querySelector(".view.is-active")?.id || location.pathname;
  return { vp, ueberlauf, ansicht, klein: klein.slice(0, 12), anzahlKlein: klein.length };
})()`;
for (const route of routen) {
  fehler.length = 0;
  await ruf("Page.navigate", { url: `https://smejj.com${route}${route.includes("?") ? "&" : "?"}n=${Date.now()}` });
  await schlaf(6000);
  const m = await ev(MESSUNG);
  const name = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "start";
  const shot = await ruf("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${praefix}-${name}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(`${route.padEnd(22)} ${m.vp} ansicht=${m.ansicht} ueberlauf=${m.ueberlauf} kleineZiele=${m.anzahlKlein}${m.klein.length ? " [" + m.klein.join(" | ") + "]" : ""}${fehler.length ? " FEHLER: " + fehler.slice(0, 3).join(" || ") : ""}`);
}
ws.close();

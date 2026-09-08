// Ansicht komplett: Elemente breiter als der Schirm, innere Seitwaerts-Scroller, mehrspaltige Raster, kleine Ziele, Seitenhoehe; Ganzseiten-Bild.
import { writeFileSync } from "node:fs";
const [port, route, bild] = process.argv.slice(2);
const liste = await fetch(`http://localhost:${port}/json`).then((r) => r.json());
const seite = liste.find((t) => t.type === "page" && !/^chrome/.test(t.url));
const ws = new WebSocket(seite.webSocketDebuggerUrl);
await new Promise((ok) => { ws.onopen = ok; });
let id = 0; const offen = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } };
const ruf = (method, params = {}) => new Promise((ok) => { const i = ++id; offen.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (js) => (await ruf("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true })).result?.result?.value;
await ruf("Page.navigate", { url: `https://smejj.com${route}?n=${Date.now()}` }); await new Promise((r) => setTimeout(r, 6000));
const m = await ev(`(() => {
  const W = innerWidth, out = { vp: W + "x" + innerHeight, seite: document.documentElement.scrollHeight, breit: [], scroller: [], raster: [], klein: [] };
  const name = (el) => (el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().split(/\\s+/).slice(0,2).join(".") : ""));
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
    const b = el.getBoundingClientRect(); if (b.width === 0) continue;
    if (b.right > W + 1 || b.left < -1) out.breit.push(name(el) + " " + Math.round(b.left) + ".." + Math.round(b.right));
    if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(cs.overflowX) && el.clientWidth > 0) out.scroller.push(name(el) + " " + el.clientWidth + "<" + el.scrollWidth);
    if (cs.display.includes("grid")) { const n = cs.gridTemplateColumns.split(" ").filter(Boolean).length; if (n > 1) out.raster.push(name(el) + " " + n + " Spalten"); }
    if (el.matches("button, a[href], input, select, textarea, [role=button], [role=tab]") && (b.width < 44 || b.height < 44)) out.klein.push(name(el) + " " + Math.round(b.width) + "x" + Math.round(b.height));
  }
  for (const k of ["breit","scroller","raster","klein"]) { out[k + "N"] = out[k].length; out[k] = [...new Set(out[k])].slice(0, 12); }
  return out;
})()`);
console.log(route, JSON.stringify(m, null, 1));
const lm = await ruf("Page.getLayoutMetrics"); const h = Math.min(Math.ceil(lm.result.cssContentSize.height), 6000);
await ruf("Emulation.setDeviceMetricsOverride", { width: Math.ceil(lm.result.cssVisualViewport.clientWidth), height: h, deviceScaleFactor: 1, mobile: true });
const shot = await ruf("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
await ruf("Emulation.clearDeviceMetricsOverride");
writeFileSync(bild, Buffer.from(shot.result.data, "base64")); ws.close();

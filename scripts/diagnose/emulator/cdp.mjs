// smejj.com QA — kleine CDP-Bruecke zum Android-Emulator (Chrome DevTools ueber adb forward).
// Aufruf: node cdp.mjs <port> eval "<js>" | nav <url> | shot <datei.png> | tap x y | type "text" | key Enter
const [port, befehl, ...rest] = process.argv.slice(2);
const liste = await fetch(`http://localhost:${port}/json`).then((r) => r.json());
const seite = liste.find((t) => t.type === "page" && !/^chrome/.test(t.url)) || liste.find((t) => t.type === "page");
if (!seite) { console.error("keine Seite"); process.exit(2); }
const ws = new WebSocket(seite.webSocketDebuggerUrl);
await new Promise((ok, nein) => { ws.onopen = ok; ws.onerror = nein; });
let id = 0; const offen = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } };
const ruf = (method, params = {}) => new Promise((ok) => { const i = ++id; offen.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (js) => { const r = await ruf("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "FEHLER " + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value; };
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
switch (befehl) {
  case "eval": console.log(JSON.stringify(await ev(rest.join(" ")), null, 1)); break;
  case "nav": await ruf("Page.navigate", { url: rest[0] }); await schlaf(Number(rest[1] || 4000)); console.log(await ev("location.href")); break;
  case "shot": { const r = await ruf("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(rest[0], Buffer.from(r.result.data, "base64")); console.log("ok " + rest[0]); break; }
  case "tap": { const x = Number(rest[0]), y = Number(rest[1]);
    await ruf("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await ruf("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await schlaf(300); console.log("tap ok"); break; }
  case "type": await ruf("Input.insertText", { text: rest.join(" ") }); console.log("type ok"); break;
  case "key": { const k = rest[0]; await ruf("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: k === "Enter" ? 13 : 0, text: k === "Enter" ? "\r" : "" }); await ruf("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: k === "Enter" ? 13 : 0 }); console.log("key ok"); break; }
  case "mclick": { const x = Number(rest[0]), y = Number(rest[1]);
    await ruf("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await ruf("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await ruf("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await schlaf(400); console.log("mclick ok"); break; }
  case "url": console.log(seite.url); break;
  default: console.error("unbekannt"); process.exit(2);
}
ws.close();

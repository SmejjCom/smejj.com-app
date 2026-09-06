// smejj.com — Sitzungs-Client des Panels: Frist, Zeiger-Nachricht, bildloses
// Hinsehen (Betreiber 2026-09-06). EIGENE Datei, weil public/ nur im
// Arbeitszweig gepflegt wird — im Bauzweig ist der Client aelter, und dort
// darf dieser Test nicht mitlaufen (Frontend und Server haben zwei Zweige).
import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserSessionClient } from "../public/browser-pane-session.js";

test("Client: bildloses Hinsehen ist gesund, Frist kommt als Antwort zurueck, Zeiger geht vor dem Bild an den Rahmen", async () => {
  const rufe = [];
  const client = createBrowserSessionClient({
    routes: { api: { browserSession: "https://api/s", browserSessionAct: "https://api/a", browserSessionClose: "https://api/c" } },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      rufe.push(body.action);
      if (body.action.type === "observe") return { status: 200, json: async () => ({ ok: true, ohneBild: true, beobachtung: { elements: [] }, finalUrl: "https://a.de/", viewport: { width: 1000, height: 800 } }) };
      if (body.action.type === "selectorClick") return { status: 200, json: async () => ({ ok: true, screenshot: "data:image/jpeg;base64,x", ziel: { x: 1, y: 2, w: 3, h: 4 }, viewport: { width: 1000, height: 800 }, finalUrl: "https://a.de/" }) };
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    }
  });
  const nachrichten = [];
  const tab = { sessionId: "b".repeat(32), url: "https://a.de/", frame: { contentWindow: { postMessage: (m) => nachrichten.push(m) } } };
  const blick = await client.actUndWarte(tab, { type: "observe", ohneBild: true, fristMs: 5000, maus: true });
  assert.equal(blick.ok, true);
  assert.ok(blick.beobachtung);
  assert.equal(tab.sessionId, "b".repeat(32), "bildlos heisst NICHT verloren");
  assert.equal(rufe[0].fristMs, undefined, "Steuerfelder gehen nicht zum Server");
  assert.equal(rufe[0].maus, undefined);
  assert.equal(rufe[0].ohneBild, true);
  assert.ok(!nachrichten.some((m) => m.type === "smejj.browser.sessionFrame"), "kein Bild, kein Frame-Wechsel");
  const klick = await client.actUndWarte(tab, { type: "selectorClick", strategy: "css", value: "#x", maus: true });
  assert.equal(klick.ok, true);
  const zeigerIdx = nachrichten.findIndex((m) => m.type === "smejj.browser.zeiger" && m.art === "klick");
  const frameIdx = nachrichten.findIndex((m) => m.type === "smejj.browser.sessionFrame");
  assert.ok(zeigerIdx >= 0 && frameIdx > zeigerIdx, "Zeiger VOR dem neuen Bild");
  assert.deepEqual(nachrichten[zeigerIdx].ziel, { x: 1, y: 2, w: 3, h: 4 });
  const frist = await client.actUndWarte(tab, { type: "selectorText", strategy: "css", value: "h1", fristMs: 10, maus: true });
  assert.equal(frist.frist, true);
  assert.match(frist.error, /zeitueberschreitung/);
  assert.equal(tab.sessionId, "b".repeat(32), "Frist heisst NICHT verloren");
});

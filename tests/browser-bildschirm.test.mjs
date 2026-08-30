// smejj.com — der virtuelle Bildschirm des Fern-Browsers.
//
// DER FEHLER, DEN DIESE DATEI VERHINDERT (2026-08-20, live 502): Der erste
// Versuch startete den Worker mit `xvfb-run` als Wrapper im Dockerfile-CMD.
// Der Wrapper kam nicht hoch — und damit der ganze Dienst nicht. Ein
// Notausgang im Code kann das nicht auffangen, weil der Prozess nie laeuft.
// Seither wird der Bildschirm IM Worker gestartet, und ein Fehlschlag kostet
// nur die Tarnung.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { starteBildschirm, xvfbVerfuegbar, vergissBildschirm } from "../workers/remote-browser/bildschirm.mjs";

function attrappe({ startetNicht = false } = {}) {
  const aufrufe = [];
  const spawnImpl = (befehl, args) => {
    aufrufe.push({ befehl, args });
    const p = new EventEmitter();
    p.unref = () => {};
    if (startetNicht) setTimeout(() => p.emit("exit", 1), 5);
    return p;
  };
  return { spawnImpl, aufrufe };
}

test("ohne Xvfb im Abbild gibt es keinen Bildschirm — und keinen Absturz", async () => {
  vergissBildschirm();
  const display = await starteBildschirm({ pruefe: () => false, spawnImpl: () => { throw new Error("darf nicht aufgerufen werden"); } });
  assert.equal(display, null, "null ist ein gueltiges Ergebnis, kein Fehler");
});

test("ein fehlgeschlagener Start liefert null, statt zu werfen", async () => {
  vergissBildschirm();
  const { spawnImpl } = attrappe({ startetNicht: true });
  const display = await starteBildschirm({ pruefe: () => true, spawnImpl, timeoutMs: 200 });
  assert.equal(display, null, "stirbt Xvfb sofort, bleiben wir headless");
});

test("ein gelungener Start liefert DISPLAY und startet Xvfb genau einmal", async () => {
  vergissBildschirm();
  const { spawnImpl, aufrufe } = attrappe();
  const display = await starteBildschirm({ pruefe: () => true, spawnImpl, timeoutMs: 200 });
  assert.match(display, /^:\d+$/);
  assert.equal(process.env.DISPLAY, display, "DISPLAY muss gesetzt sein, sonst findet Chrome den Bildschirm nicht");
  // Zweiter Aufruf startet KEINEN zweiten Xvfb.
  await starteBildschirm({ pruefe: () => true, spawnImpl, timeoutMs: 200 });
  assert.equal(aufrufe.length, 1, "der Bildschirm wird einmal gestartet, nicht pro Sitzung");
  assert.equal(aufrufe[0].befehl, "Xvfb");
  assert.match(aufrufe[0].args.join(" "), /-screen 0 1365x900x24/);
  vergissBildschirm();
});

test("headful haengt am Bildschirm, nicht am Wunsch allein", () => {
  const engine = fs.readFileSync("workers/remote-browser/session-engine.js", "utf8");
  // Erst der Schalter, dann der echte Bildschirm — und kopflos ergibt sich
  // aus dem ERGEBNIS, nicht aus der Absicht.
  assert.match(engine, /SMEJJ_BROWSER_HEADFUL/);
  assert.match(engine, /starteBildschirm\(\)/);
  assert.match(engine, /const kopflos = !bildschirm/);
});

test("der Container startet den Worker DIREKT — nie ueber einen Wrapper", () => {
  for (const pfad of ["workers/remote-browser/Dockerfile", "Dockerfile.smejj-remote-browser"]) {
    const inhalt = fs.readFileSync(pfad, "utf8");
    assert.doesNotMatch(inhalt, /CMD \[.*xvfb-run/, `${pfad}: ein Wrapper im CMD legt bei Fehlstart den ganzen Dienst lahm`);
    assert.match(inhalt, /CMD \["node"/);
  }
});

// --- Ein sterbender Browser darf nicht den Dienst mitnehmen ----------------
//
// Gemessen 2026-08-21 im Container: stuerzte Chrome beim headful-Aufbau ab,
// meldete Playwright den Fehler ASYNCHRON — ausserhalb jedes try/catch. Der
// Crash-Guard des Workers machte daraus pflichtgemaess einen Exit 1, und der
// ganze Fern-Browser war weg. Der Container stand danach still.
test("stirbt ein Browser, verliert nur SEINE Sitzung ihren Platz", () => {
  const engine = fs.readFileSync("workers/remote-browser/session-engine.js", "utf8");
  // Auf das Sterben wird gehoert ...
  assert.match(engine, /browser\.on\?\.\("disconnected"/);
  // ... und NUR die betroffene Sitzung aufgeraeumt (kein Prozess-Exit).
  assert.match(engine, /sessions\.delete\(sitzungsId\)/);
  assert.doesNotMatch(engine, /process\.exit/, "die Engine beendet niemals den Worker");
  // Die Sitzungskennung existiert vor dem Aufbau — sonst koennte der
  // Aufraeumer sie nicht kennen.
  assert.match(engine, /const sitzungsId = randomId\(\);[\s\S]{0,80}let browser/);
});

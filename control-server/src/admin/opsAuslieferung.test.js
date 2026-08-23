// smejj.com — Tests fuer Modul AL ("Was ist wirklich live?").
//
// Die wichtigste Pruefung: ohne Messung gibt es kein "gleich". Und: der
// Control-Server, dem sein Commit nicht bekannt ist, sagt "abgeleitet" dazu.
//
// Ausfuehren: node --test control-server/src/admin/opsAuslieferung.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { auslieferungUebersicht, sperrenImAbbild, _cacheLeeren } from "./opsAuslieferung.js";

const JETZT = Date.parse("2026-08-23T06:00:00.000Z");

function antwort(status, body) {
  return { status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
}

function fetchStub(tabelle) {
  return async (url) => {
    for (const [muster, wert] of tabelle) {
      if (url.includes(muster)) return typeof wert === "function" ? wert() : wert;
    }
    return antwort(404, "Not Found");
  };
}

const GESUND = [
  ["smejj.com/sw.js", antwort(200, 'const CACHE_NAME = "smejj-shell-v652";')],
  ["smejj-app-frontend/main/sw.js", antwort(200, 'const CACHE_NAME = "smejj-shell-v652";')],
  ["smejj-app-frontend/commits/main", antwort(200, { sha: "d488a4a9abcdef" })],
  ["smejj.com-app/commits/feature", antwort(200, { sha: "b32860de000000" })],
  ["check-runs", antwort(200, { check_runs: [{ name: "Zeabur", status: "completed", conclusion: "success", completed_at: "2026-08-23T05:40:00.000Z" }] })],
  ["smejj-control.zeabur.app/api/health", antwort(200, { ok: true, gestartetAm: "2026-08-23T05:41:00.000Z" })],
  ["smejj-chat-bridge.zeabur.app/health", antwort(200, { ok: true, version: "20260818-v140" })],
  ["assets/chat-bridge.js", antwort(200, 'const BRIDGE_VERSION = "20260818-v140";')],
  ["brueckenwaechter", antwort(200, { ok: true, version: "1.1.0" })],
  ["maus-engine", antwort(200, { ok: true, engine: "maus" })],
  ["video-worker", antwort(404, "Not Found")],
  ["bild-maler", () => { throw new Error("fetch failed"); }]
];

test("gesunde Kette: Frontend und Bruecke gleich, Control abgeleitet gleich, 404-Dienst ist erreichbar ohne Version", async () => {
  _cacheLeeren();
  const u = await auslieferungUebersicht({ env: {}, fetchImpl: fetchStub(GESUND), jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "al-")) });
  const d = Object.fromEntries(u.dienste.map((x) => [x.id, x]));
  assert.equal(d.frontend.zustand, "gleich");
  assert.equal(d.frontend.liveStand, "smejj-shell-v652");
  assert.equal(d.control.zustand, "gleich");
  assert.equal(d.control.abgeleitet, true, "ohne Commit in der Umgebung muss 'abgeleitet' dranstehen");
  assert.equal(d.bruecke.zustand, "gleich");
  assert.equal(d.video.zustand, "erreichbar");
  assert.equal(d.bild.zustand, "nicht-erreichbar");
  assert.equal(u.nichtErreichbar, 1);
  assert.ok(u.nichtMessbar.length >= 3, "was der Server nicht messen kann, steht ehrlich da");
});

test("Rand hinkt: main traegt v653, smejj.com liefert v652 -> dahinter, nie gleich", async () => {
  _cacheLeeren();
  const tabelle = GESUND.map(([m, w]) => m === "smejj-app-frontend/main/sw.js" ? [m, antwort(200, 'const CACHE_NAME = "smejj-shell-v653";')] : [m, w]);
  const u = await auslieferungUebersicht({ env: {}, fetchImpl: fetchStub(tabelle), jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "al-")) });
  const f = u.dienste.find((x) => x.id === "frontend");
  assert.equal(f.zustand, "dahinter");
  assert.match(f.satz, /v653/);
});

test("Control: Bau laeuft noch -> 'bau-laeuft'; Prozess aelter als fertiger Bau -> 'dahinter'", async () => {
  _cacheLeeren();
  let tabelle = GESUND.map(([m, w]) => m === "check-runs" ? [m, antwort(200, { check_runs: [{ name: "Zeabur", status: "in_progress", conclusion: null }] })] : [m, w]);
  let u = await auslieferungUebersicht({ env: {}, fetchImpl: fetchStub(tabelle), jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "al-")) });
  assert.equal(u.dienste.find((x) => x.id === "control").zustand, "bau-laeuft");
  _cacheLeeren();
  tabelle = GESUND.map(([m, w]) => m === "smejj-control.zeabur.app/api/health" ? [m, antwort(200, { ok: true, gestartetAm: "2026-08-23T05:00:00.000Z" })] : [m, w]);
  u = await auslieferungUebersicht({ env: {}, fetchImpl: fetchStub(tabelle), jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "al-")) });
  assert.equal(u.dienste.find((x) => x.id === "control").zustand, "dahinter");
});

test("Control mit bekanntem Commit: gleich, wenn er der Spitze des Bau-Branch entspricht", async () => {
  _cacheLeeren();
  const u = await auslieferungUebersicht({ env: { ZEABUR_GIT_COMMIT_SHA: "b32860de000000" }, fetchImpl: fetchStub(GESUND), jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "al-")) });
  const c = u.dienste.find((x) => x.id === "control");
  assert.equal(c.zustand, "gleich");
  assert.equal(c.abgeleitet, false);
});

test("GitHub nicht lesbar (Rate-Limit): Frontend 'unbekannt' — nichts behauptet", async () => {
  _cacheLeeren();
  const tabelle = GESUND.map(([m, w]) => m.includes("raw.githubusercontent") || m === "smejj-app-frontend/main/sw.js" ? [m, antwort(403, "rate limited")] : [m, w]);
  const u = await auslieferungUebersicht({ env: {}, fetchImpl: fetchStub(tabelle), jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "al-")) });
  assert.equal(u.dienste.find((x) => x.id === "frontend").zustand, "unbekannt");
});

test("Sperren im Abbild: stimmt / veraendert / nicht im Abbild", () => {
  const wurzel = mkdtempSync(path.join(tmpdir(), "al-lock-"));
  mkdirSync(path.join(wurzel, "docs", "security"), { recursive: true });
  mkdirSync(path.join(wurzel, "x"), { recursive: true });
  writeFileSync(path.join(wurzel, "x", "a.js"), "A");
  writeFileSync(path.join(wurzel, "x", "b.js"), "B-veraendert");
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  writeFileSync(path.join(wurzel, "docs", "security", "admin-lock-manifest.json"),
    JSON.stringify({ frozenAt: "2026-08-23T05:00:00Z", files: { "x/a.js": sha("A") } }));
  writeFileSync(path.join(wurzel, "docs", "security", "security-lock-manifest.json"),
    JSON.stringify({ files: { "x/b.js": sha("B") } }));
  const s = Object.fromEntries(sperrenImAbbild({ wurzel }).map((x) => [x.name, x]));
  assert.equal(s["Admin-Lock"].zustand, "stimmt");
  assert.equal(s["Sicherheits-Lock"].zustand, "veraendert");
  assert.deepEqual(s["Sicherheits-Lock"].abweichend, ["x/b.js"]);
  assert.equal(s["Start-Lock"].zustand, "fehlt");
});

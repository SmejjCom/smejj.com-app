// smejj.com — Waechter fuer die Befunde des A-bis-Z-Livetests vom 15.09.2026
// im Adminbereich (Control-Server + Konsole). Je Befund eine KAPUTTE und eine
// GESUNDE Probe: wer Rot nicht erkennt, darf Gruen nicht behaupten.
//
//   M1  JSON ging unkomprimiert raus (Autopiloten 592 KB, am Handy > 30 s),
//       und die Seite zeigte ewig "wird geladen".
//   3   Rollen-Seite lief auf 390 px 48 px ueber (langer Dateiname in .mono).
//   4   Rueckfall-Host: /frame-guard.js und /admin/gate.js endeten in 404.
//   5   gate.js zeigte nach 1,5 s die Huelle samt Menue VOR der Bestaetigung.
//   6   Waehrend der Anmeldepruefung war "Cockpit" statt der Zielseite markiert.
//   7   Autopiloten-Seite "Läuft 83" ohne Erklaerung der 12 Bausteine.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { json, waehleKodierung } from "../control-server/src/http/respond.js";
import { createStaticHandlers } from "../src/http/staticServing.js";

const WURZEL = resolve(import.meta.dirname, "..");
const UI = (datei) => readFileSync(join(WURZEL, "control-server/admin-ui", datei), "utf8");

// ---------------------------------------------------------------------------
// M1 · Komprimierung
// ---------------------------------------------------------------------------
function antwortAttrappe(acceptEncoding, vorherVary) {
  const kopfVorher = vorherVary ? { Vary: vorherVary } : {};
  return {
    req: { headers: acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding } },
    status: 0, kopf: null, rumpf: null,
    getHeader: (n) => kopfVorher[n],
    writeHead(status, kopf) { this.status = status; this.kopf = kopf; },
    end(rumpf) { this.rumpf = rumpf; }
  };
}
const GROSS = { autopiloten: Array.from({ length: 85 }, (_, i) => ({ id: `ap-${i}`, verlauf: Array(20).fill({ am: "2026-09-15T11:30:06.262Z", status: "ok" }) })) };

test("M1 gesund: grosses JSON mit Accept-Encoding br kommt als Brotli, inhaltsgleich und viel kleiner", () => {
  const res = antwortAttrappe("gzip, deflate, br");
  json(res, 200, GROSS);
  assert.equal(res.kopf["Content-Encoding"], "br");
  assert.match(res.kopf.Vary, /Accept-Encoding/);
  const roh = JSON.stringify(GROSS, null, 2);
  assert.deepEqual(JSON.parse(brotliDecompressSync(res.rumpf).toString("utf8")), GROSS);
  assert.ok(res.rumpf.length < Buffer.byteLength(roh) / 5, `nur ${res.rumpf.length} statt ${Buffer.byteLength(roh)} Bytes`);
  assert.equal(res.kopf["Content-Length"], res.rumpf.length);
});

test("M1 gesund: nur gzip angeboten -> gzip; Vary behaelt das Origin der CORS-Kopfzeile", () => {
  const res = antwortAttrappe("gzip", "Origin");
  json(res, 200, GROSS);
  assert.equal(res.kopf["Content-Encoding"], "gzip");
  assert.equal(res.kopf.Vary, "Origin, Accept-Encoding");
  assert.deepEqual(JSON.parse(gunzipSync(res.rumpf).toString("utf8")), GROSS);
});

test("M1 kaputt: ohne Accept-Encoding, mit q=0 oder bei kleinem Koerper wird NICHT komprimiert", () => {
  for (const angebot of [undefined, "", "identity", "br;q=0, gzip;q=0"]) {
    const res = antwortAttrappe(angebot);
    json(res, 200, GROSS);
    assert.equal(res.kopf["Content-Encoding"], undefined, `Angebot ${angebot}`);
    assert.equal(typeof res.rumpf, "string");
  }
  const klein = antwortAttrappe("br");
  json(klein, 200, { ok: true });
  assert.equal(klein.kopf["Content-Encoding"], undefined);
  assert.equal(waehleKodierung("*"), "br");
  assert.equal(waehleKodierung("br;q=0, *"), "gzip");
});

test("M1 echter Server: die Antwort kommt komprimiert an und laesst sich lesen", async () => {
  const server = http.createServer((req, res) => json(res, 200, GROSS));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const { port } = server.address();
    const { kopf, bytes } = await new Promise((ok, fehl) => {
      http.get({ host: "127.0.0.1", port, path: "/", headers: { "Accept-Encoding": "gzip" } }, (res) => {
        const teile = [];
        res.on("data", (t) => teile.push(t));
        res.on("end", () => ok({ kopf: res.headers, bytes: Buffer.concat(teile) }));
      }).on("error", fehl);
    });
    assert.equal(kopf["content-encoding"], "gzip");
    assert.equal(Number(kopf["content-length"]), bytes.length);
    assert.deepEqual(JSON.parse(gunzipSync(bytes).toString("utf8")), GROSS);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// M1 · 15-s-Hinweis mit "Erneut versuchen" (console.js laedt)
// ---------------------------------------------------------------------------
function funktionAus(quelle, kopf) {
  const start = quelle.indexOf(`  function ${kopf}`);
  assert.ok(start >= 0, `function ${kopf} fehlt`);
  const ende = quelle.indexOf("\n  }\n", start);
  return quelle.slice(start, ende + 4);
}

function laedtBuehne(quelle) {
  const zeitgeber = [];
  const knopf = { handler: null, addEventListener(_, f) { this.handler = f; } };
  const seite = {
    firstChild: null,
    set innerHTML(html) {
      if (this.firstChild) this.firstChild.parentNode = null;
      this._html = html;
      this.firstChild = { parentNode: this, innerHTML: "", querySelector: () => knopf };
    },
    get innerHTML() { return this._html; }
  };
  const kontext = {
    seite, A: { escapeHtml: (t) => String(t) }, zeitgeber, route: () => { kontext.gerouted = true; },
    setTimeout: (f, ms) => zeitgeber.push({ f, ms })
  };
  vm.createContext(kontext);
  vm.runInContext(`const GEDULD_SEITE_MS = 15000;\n${funktionAus(quelle, "laedt(")}\nthis.laedt = laedt;`, kontext);
  return { kontext, seite, knopf, zeitgeber };
}

test("M1 gesund: steht nach 15 s noch der Ladekasten, erscheint der Hinweis mit 'Erneut versuchen'", () => {
  const b = laedtBuehne(UI("console.js"));
  let erneut = 0;
  b.kontext.laedt("wird geladen …", () => { erneut += 1; });
  assert.equal(b.zeitgeber[0].ms, 15000);
  const kasten = b.seite.firstChild;
  b.zeitgeber[0].f();
  assert.match(kasten.innerHTML, /Erneut versuchen/);
  assert.match(kasten.innerHTML, /über 15 Sekunden/);
  b.knopf.handler();
  assert.equal(erneut, 1);
});

test("M1 kaputt: ist die Seite inzwischen gezeichnet, bleibt der Hinweis weg", () => {
  const b = laedtBuehne(UI("console.js"));
  b.kontext.laedt("wird geladen …");
  const kasten = b.seite.firstChild;
  b.seite.innerHTML = "<div>fertige Seite</div>"; // ctx.zeichne
  b.zeitgeber[0].f();
  assert.equal(kasten.innerHTML, "", "der alte Kasten darf nicht mehr beschrieben werden");
  assert.equal(b.seite.innerHTML, "<div>fertige Seite</div>");
});

// ---------------------------------------------------------------------------
// 6 · Schiene markiert die aufgerufene Seite schon waehrend der Pruefung
// ---------------------------------------------------------------------------
function navZielFuer(quelle, { pathname = "/admin/", search = "", hash = "" }) {
  const k = {
    location: { pathname, search, hash, hostname: "smejj.com" },
    URLSearchParams,
    SEITEN: ["cockpit", "nutzer", "autopiloten", "rollen"].map((pfad) => ({ pfad })),
    STARTSEITE: "cockpit", AUFGELOEST: { uebersicht: "cockpit" }, PFAD_MODUS: true
  };
  vm.createContext(k);
  vm.runInContext(`${funktionAus(quelle, "aktuellerPfad(")}\n${funktionAus(quelle, "navZiel(")}\nthis.ergebnis = navZiel();`, k);
  return k.ergebnis;
}

test("6 gesund: die Zielseite ist markiert, nicht das Cockpit", () => {
  const q = UI("console.js");
  assert.equal(navZielFuer(q, { pathname: "/admin/autopiloten/" }), "autopiloten");
  assert.equal(navZielFuer(q, { pathname: "/admin/nutzer/", search: "?akte=abc" }), "nutzer");
  assert.equal(navZielFuer(q, { pathname: "/admin/" }), "cockpit");
  assert.equal(navZielFuer(q, { pathname: "/admin/uebersicht/" }), "cockpit");
  assert.equal(navZielFuer(q, { pathname: "/admin/gibtsnicht/" }), "cockpit");
  assert.ok(q.includes("schreibeNav(navZiel());"), "start() muss navZiel() nutzen");
  assert.doesNotMatch(q.slice(q.indexOf("async function start()")), /schreibeNav\(STARTSEITE\)/);
});

test("6 kaputt: die alte Zeile schreibeNav(STARTSEITE) in start() faellt auf", () => {
  const alt = UI("console.js").replace("schreibeNav(navZiel());", "schreibeNav(STARTSEITE);");
  assert.match(alt.slice(alt.indexOf("async function start()")), /schreibeNav\(STARTSEITE\)/);
});

// ---------------------------------------------------------------------------
// 5 · gate.js: waehrend der Pruefung nur der Hinweis, nie die Huelle
// ---------------------------------------------------------------------------
function gateBuehne(quelle) {
  const klassen = new Set();
  const zeitgeber = [];
  const wurzel = { hidden: false, classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) } };
  const element = (id) => {
    const attr = {};
    return {
      id, hidden: false, children: [], parentNode: null, textContent: "", className: "",
      setAttribute: (n, v) => { attr[n] = v; }, removeAttribute: (n) => { delete attr[n]; }, hatAttr: (n) => n in attr,
      appendChild(kind) { kind.parentNode = this; this.children.push(kind); return kind; },
      removeChild(kind) { this.children = this.children.filter((c) => c !== kind); kind.parentNode = null; }
    };
  };
  const huelle = element("shell");
  const body = element("body");
  body.appendChild(huelle);
  Object.defineProperty(body, "firstChild", { get() { return this.children[0] || null; } });
  const document = {
    documentElement: wurzel, body,
    createElement: () => element(""),
    getElementById: (id) => body.children.find((c) => c.id === id) || null,
    querySelectorAll: () => body.children.filter((c) => c.hatAttr("data-gate-verborgen"))
  };
  const k = {
    location: { origin: "https://smejj.com", pathname: "/admin/autopiloten/", search: "", replace() {} },
    localStorage: { getItem: (s) => (s === "smejj.auth.accessToken.v1" ? "t" : null) },
    document, JSON, performance: { getEntriesByType: () => [] },
    setTimeout: (f, ms) => { zeitgeber.push({ f, ms }); return zeitgeber.length; }, clearTimeout: () => {}
  };
  k.window = k;
  vm.createContext(k);
  vm.runInContext(quelle, k);
  const hinweis = zeitgeber.find((z) => z.ms === 1500);
  return { klassen, wurzel, huelle, body, hinweis, gate: k.window.smejjAdminGate };
}

/** Sieht ein Mensch waehrend der Pruefung die Huelle? (Attribut-Weg; CSS-Weg separat geprueft) */
function huelleSichtbar(b) {
  const wurzelSichtbar = !b.wurzel.hidden && !b.klassen.has("smejj-gate-zu");
  return wurzelSichtbar && !b.huelle.hidden && !b.klassen.has("smejj-gate-laedt");
}

test("5 gesund: nach 1,5 s steht nur der Hinweis da, die Huelle kommt erst nach freigeben()", () => {
  const b = gateBuehne(UI("gate.js"));
  assert.equal(huelleSichtbar(b), false, "vor dem Hinweis verborgen");
  b.hinweis.f();
  const kasten = b.body.children.find((c) => c.id === "gateLaedt");
  assert.ok(kasten && !kasten.hidden, "der Hinweis selbst ist sichtbar");
  assert.equal(b.wurzel.hidden, false);
  assert.equal(huelleSichtbar(b), false, "die Huelle samt Menue darf waehrend der Pruefung NICHT sichtbar sein");
  b.gate.freigeben();
  assert.equal(huelleSichtbar(b), true, "nach der Bestaetigung ist sie da");
  assert.equal(b.body.children.some((c) => c.id === "gateLaedt"), false);
});

test("5 kaputt: der alte Weg (zeigen() im Ladehinweis) wird als sichtbare Huelle erkannt", () => {
  const alt = UI("gate.js").replace("zeigeNurHinweis(kasten);", "zeigen();");
  assert.notEqual(alt, UI("gate.js"));
  const b = gateBuehne(alt);
  b.hinweis.f();
  assert.equal(huelleSichtbar(b), true);
});

test("5: die CSS-Regel blendet waehrend der Pruefung alles ausser dem Hinweis aus", () => {
  const css = UI("console.css");
  assert.match(css, /html\.smejj-gate-laedt body>\*:not\(#gateLaedt\)\{display:none!important;\}/);
});

// ---------------------------------------------------------------------------
// 3 · Rollen-Seite: langer Dateiname bricht um
// ---------------------------------------------------------------------------
const notizBrichtUm = (css) => /\.note\{[^}]*grid-template-columns:auto minmax\(0,1fr\)/.test(css)
  && /\.note \.ns \.mono[^{]*\{overflow-wrap:anywhere;\}/.test(css);

test("3 gesund: Hinweisstreifen mit minmax(0,1fr) und umbrechendem .mono", () => {
  assert.equal(notizBrichtUm(UI("console.css")), true);
});

test("3 kaputt: die alte Regel (auto 1fr, kein Umbruch) faellt auf", () => {
  const alt = UI("console.css").replace("grid-template-columns:auto minmax(0,1fr)", "grid-template-columns:auto 1fr");
  assert.equal(notizBrichtUm(alt), false);
});

// ---------------------------------------------------------------------------
// 4 · Rueckfall-Host: frame-guard.js und gate.js kommen an
// ---------------------------------------------------------------------------
test("4 gesund: /frame-guard.js ist eine oeffentliche Datei des Control-Servers", () => {
  const { isPublicAsset } = createStaticHandlers({
    publicDir: join(WURZEL, "public"), storageSourceDir: join(WURZEL, "src/storage"),
    aiSourceDir: join(WURZEL, "src/ai"), sharedSourceDir: join(WURZEL, "src/shared")
  });
  assert.equal(isPublicAsset("/frame-guard.js"), true);
  assert.equal(isPublicAsset("/frame-guard-attrappe.js"), false, "kaputte Probe: nicht jede .js-Datei ist frei");
  assert.match(UI("index.html"), /<script type="module" src="\/frame-guard\.js\?v=1"><\/script>/);
});

test("4 gesund/kaputt: /admin/gate.js wird Admins ausgeliefert, Abgemeldeten nicht", async () => {
  const { __clearMemoryStoreForTests, createUserRecord, putUser } = await import("../control-server/src/auth/emailUserStore.js");
  const { handleAdminUiRoute } = await import("../control-server/src/routes/adminUiRoutes.js");
  __clearMemoryStoreForTests();
  await putUser({ ...createUserRecord({ email: "chefin@example.de", name: "C", passwordHash: "scrypt$x" }), role: "admin", emailVerifiedAt: "2026-01-01T00:00:00.000Z" }, {});
  const ruf = async (authUser) => {
    const res = { headers: {}, setHeader() {}, writeHead(s, h) { this.status = s; Object.assign(this.headers, h); }, end(b) { this.body = b ? String(b) : ""; } };
    await handleAdminUiRoute({ method: "GET", authUser }, new URL("http://x/admin/gate.js"), res, { env: {} });
    return res;
  };
  const admin = await ruf({ email: "chefin@example.de" });
  assert.equal(admin.status, 200);
  assert.match(admin.headers["Content-Type"], /javascript/);
  assert.match(admin.body, /smejjAdminGate/);
  const fremd = await ruf(null);
  assert.equal(fremd.status, 401);
});

// ---------------------------------------------------------------------------
// 7 · Autopiloten-Seite erklaert "Läuft" wie das Control Center
// ---------------------------------------------------------------------------
function registerHtml(autopiloten) {
  const leer = () => "";
  const k = {
    window: {
      adminApi: { escapeHtml: (t) => String(t ?? ""), zeit: () => "", dauer: () => "" },
      adminViews: new Proxy({}, { get: () => (...teile) => teile.map((t) => (typeof t === "string" ? t : "")).join("") })
    },
    Date, Math, JSON, leer
  };
  vm.createContext(k);
  vm.runInContext(UI("views-stage9.js"), k);
  return k.window.adminViewsStage9.autopiloten({ autopiloten, vorfaelle: [] }, { ansicht: "liste" });
}

test("7 gesund: 'Läuft' nennt die Bausteine darin", () => {
  const html = registerHtml([
    { id: "a", ampel: "gruen", wirkung: "echt" },
    { id: "b", ampel: "gruen", wirkung: "baustein" },
    { id: "c", ampel: "gruen", wirkung: "baustein" },
    { id: "d", ampel: "rot", wirkung: "baustein" }
  ]);
  assert.match(html, /Läuft<b class="n">3<\/b><span class="s"> · davon 2 nur Baustein<\/span>/);
});

test("7 kaputt: ohne Bausteine keine erfundene Zusatzzahl; die Uebersicht liefert das Feld", async () => {
  const html = registerHtml([{ id: "a", ampel: "gruen", wirkung: "echt" }]);
  assert.doesNotMatch(html, /nur Baustein/);
  const { autopilotUebersicht } = await import("../control-server/src/admin/opsAutopiloten.js");
  const alle = autopilotUebersicht({ jetztMs: Date.now() }).autopiloten;
  assert.ok(alle.length > 50);
  assert.ok(alle.every((a) => ["echt", "teilweise", "baustein"].includes(a.wirkung)), "jede Zeile traegt ihre Wirkung");
  assert.ok(alle.some((a) => a.wirkung === "baustein"));
});

// smejj ai radar — die Adminroute: Rechte, Audit, Bericht, Ruecknahme.
import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminRadarRoute } from "../control-server/src/routes/adminRadarRoutes.js";
import { baueEintrag } from "../src/radar/wissensbasis.js";

const JETZT = "2026-09-21T12:00:00.000Z";
const BESITZER = { ok: true, actor: { email: "chef@smejj.com", role: "owner" } };
// "support" darf lesen (ops.read), aber nichts aendern (models.write) — der Fall aus dem Alltag.
const ZUSCHAUER = { ok: true, actor: { email: "gast@smejj.com", role: "support" } };

function antwort() {
  const a = { code: null, koerper: null, headers: {} };
  a.writeHead = (code, h) => { a.code = code; Object.assign(a.headers, h || {}); return a; };
  a.setHeader = (k, v) => { a.headers[k] = v; };
  a.end = (t) => { a.koerper = t ? JSON.parse(t) : null; };
  return a;
}
const anfrage = (method = "GET", koerper = null) => ({
  method, authUser: { email: "chef@smejj.com" }, headers: { "content-type": "application/json" }, socket: { remoteAddress: "1.2.3.4" },
  on(ereignis, rueckruf) {
    const text = JSON.stringify(koerper || {});
    if (ereignis === "data") queueMicrotask(() => rueckruf(text));
    if (ereignis === "end") queueMicrotask(() => queueMicrotask(rueckruf));
    return this;
  }
});
function ablage(anfang = []) {
  const daten = [...anfang];
  return { daten, liste: async () => ({ ok: true, datensaetze: [...daten] }), schreib: async (s) => { const i = daten.findIndex((d) => d.id === s.id); if (i >= 0) daten[i] = s; else daten.push(s); return s; } };
}
const eintrag = () => baueEintrag({
  themaId: "konkurrenz-preise", bereich: "konkurrenz", aussage: "Der Pro Tarif kostet 12 Euro pro Monat",
  belege: [{ url: "https://openai.com/preise", host: "openai.com", guete: "primaerquelle", markierungen: [], veroeffentlicht: "2026-09-20", abgerufenAm: JETZT }],
  jetzt: JETZT
});

const deps = (extra = {}) => ({
  env: {}, jetzt: () => JETZT, aufloeser: async () => BESITZER, protokoll: async () => ({ key: "audit-1" }),
  stores: { wissen: ablage([eintrag()]), laeufe: ablage([{ id: "l1", begonnenAm: JETZT, ok: true, anfragen: 2, quellenGeprueft: 4, themen: [], gespeicherteIds: [] }]), konfig: ablage() },
  lauf: async () => ({ ok: true, grund: null, anfragen: 1, gespeicherteIds: ["wissen_x"], themen: [] }),
  ...extra
});

test("fremde Pfade gehen die Route nichts an", async () => {
  const res = antwort();
  assert.equal(await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/nutzer"), res, deps()), false);
});

test("Uebersicht liefert Stand, Tagesbericht und die Tage mit Laeufen", async () => {
  const res = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar"), res, deps());
  assert.equal(res.code, 200);
  assert.equal(res.koerper.ok, true);
  assert.equal(res.koerper.stand.eingeschaltet, true);
  assert.equal(res.koerper.bericht.tag, "2026-09-21");
  assert.deepEqual(res.koerper.tageMitLaeufen, ["2026-09-21"]);
  assert.ok(res.koerper.stand.themen.length >= 10);
});

test("Support darf lesen, aber nicht recherchieren lassen", async () => {
  const lesen = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar"), lesen, deps({ aufloeser: async () => ZUSCHAUER }));
  assert.equal(lesen.code, 200);

  const schreiben = antwort();
  await handleAdminRadarRoute(anfrage("POST", {}), new URL("https://api.smejj.com/api/admin/radar/jetzt"), schreiben, deps({ aufloeser: async () => ZUSCHAUER }));
  assert.equal(schreiben.code, 403);
  assert.equal(schreiben.koerper.error, "admin_permission_denied");
});

test("Jetzt recherchieren startet EINEN Lauf und schreibt einen Audit-Eintrag", async () => {
  let gestartet = 0;
  const spuren = [];
  const res = antwort();
  await handleAdminRadarRoute(anfrage("POST", {}), new URL("https://api.smejj.com/api/admin/radar/jetzt"), res, deps({
    lauf: async (o) => { gestartet += 1; return { ok: true, grund: null, anfragen: 1, gespeicherteIds: [], themen: [], gestartetWegen: o.grund }; },
    protokoll: async (e) => { spuren.push(e); return { key: "a" }; }
  }));
  assert.equal(res.code, 200);
  assert.equal(gestartet, 1);
  assert.equal(res.koerper.lauf.gestartetWegen, "admin:chef@smejj.com");
  assert.equal(spuren[0].action, "radar.jetzt");
});

test("Schalter aus und wieder ein wird gespeichert und protokolliert", async () => {
  const d = deps();
  const spuren = [];
  d.protokoll = async (e) => { spuren.push(e); return { key: "a" }; };
  const aus = antwort();
  await handleAdminRadarRoute(anfrage("POST", { ein: false, grund: "Wartung am Suchdienst" }), new URL("https://api.smejj.com/api/admin/radar/schalter"), aus, d);
  assert.equal(aus.koerper.konfiguration.eingeschaltet, false);
  assert.equal(spuren[0].action, "radar.aus");

  const stand = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar"), stand, d);
  assert.equal(stand.koerper.stand.eingeschaltet, false);
  assert.equal(stand.koerper.stand.zustand, "pausiert");

  const ein = antwort();
  await handleAdminRadarRoute(anfrage("POST", { ein: true }), new URL("https://api.smejj.com/api/admin/radar/schalter"), ein, d);
  assert.equal(ein.koerper.konfiguration.eingeschaltet, true);
  assert.equal(spuren[1].action, "radar.ein");
});

test("Konfiguration: eigene Themen und Grenzen werden uebernommen", async () => {
  const d = deps();
  const res = antwort();
  await handleAdminRadarRoute(anfrage("POST", {
    themen: [{ id: "eigen", titel: "Eigenes Thema", bereich: "konkurrenz", anfragen: ["etwas"], intervallStunden: 6 }],
    themenAus: ["bild-video"], anfragenJeTag: 50
  }), new URL("https://api.smejj.com/api/admin/radar/konfig"), res, d);
  assert.equal(res.koerper.konfiguration.themen.length, 1);
  assert.equal(res.koerper.konfiguration.anfragenJeTag, 50);

  const stand = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar"), stand, d);
  assert.ok(stand.koerper.stand.themen.some((t) => t.id === "eigen"));
  assert.equal(stand.koerper.stand.themen.some((t) => t.id === "bild-video"), false);
  assert.equal(stand.koerper.stand.grenzen.anfragenJeTag, 50);
});

test("Ruecknahme braucht Grund, stellt die Vorfassung her und wird protokolliert", async () => {
  const d = deps();
  const spuren = [];
  d.protokoll = async (e) => { spuren.push(e); return { key: "a" }; };
  const ohneGrund = antwort();
  await handleAdminRadarRoute(anfrage("POST", { eintragId: d.stores.wissen.daten[0].id }), new URL("https://api.smejj.com/api/admin/radar/zuruecknehmen"), ohneGrund, d);
  assert.equal(ohneGrund.code, 400);

  const unbekannt = antwort();
  await handleAdminRadarRoute(anfrage("POST", { eintragId: "gibtsnicht", grund: "war falsch" }), new URL("https://api.smejj.com/api/admin/radar/zuruecknehmen"), unbekannt, d);
  assert.equal(unbekannt.code, 404);

  const res = antwort();
  await handleAdminRadarRoute(anfrage("POST", { eintragId: d.stores.wissen.daten[0].id, grund: "Quelle war eine Werbeseite" }), new URL("https://api.smejj.com/api/admin/radar/zuruecknehmen"), res, d);
  assert.equal(res.code, 200);
  assert.equal(res.koerper.eintrag.zurueckgenommen, true);
  assert.equal(spuren.at(-1).action, "radar.zuruecknehmen");
});

test("Verlauf laesst sich durchsuchen und nach Tag filtern", async () => {
  const d = deps();
  const treffer = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar/verlauf?q=tarif"), treffer, d);
  assert.equal(treffer.koerper.treffer, 1);
  const daneben = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar/verlauf?q=zebrastreifen"), daneben, d);
  assert.equal(daneben.koerper.treffer, 0);
  const falscherTag = antwort();
  await handleAdminRadarRoute(anfrage(), new URL("https://api.smejj.com/api/admin/radar/verlauf?tag=2020-01-01"), falscherTag, d);
  assert.equal(falscherTag.koerper.treffer, 0);
});

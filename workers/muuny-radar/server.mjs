// muuny ai radar — Dienst: Zeitplan, Admin-Schnittstelle, Wissenssuche fuer muuny.
//
// Eigener Container, eigene Warteschlange, eigene Grenzen — getrennt vom Training
// (muuny-autopilot) und von con.ax. Er teilt mit ihnen nur das e2-Lager (eigenes
// Prefix muuny/radar/ und muuny/wissen/) und den Puls-Eingang des Admin.
//
//   GET  /health                         offen
//   POST /v1/wissen/suche                Dienstschluessel: {frage,k} -> Treffer + Prompt-Block
//   POST /v1/wissen/verwendet            Dienstschluessel: {verwendung:[{id,status}]} -> Zaehler
//   *    /api/radar/*                    Verwaltungsschluessel (x-muuny-key)
//
// Ohne Einschalten laeuft nichts von selbst (Standard AUS — nur der Owner schaltet ein).
// "Jetzt recherchieren" geht auch ausgeschaltet: das ist ein ausdruecklicher Owner-Klick.
import crypto from "node:crypto";
import http from "node:http";
import { e2Client, e2KonfigAusEnv } from "../muuny-autopilot/e2.js";
import { lagerPrefix } from "../muuny-autopilot/lager.js";
import { THEMEN_STANDARD } from "./konfig.js";
import { budgetRest, faelligeThemen, fuehreLaufAus, laufenderLauf, leseKonfig, leseVerbrauch, leseZustand,
  naechsterGeplanterLauf, radarSchluessel, schreibeKonfig, tagVon } from "./lauf.js";
import { leseIndex, nimmZurueck, rueckgaengig, versionenVon } from "./wissen.js";
import { baueSuche, kontextBlock, suche, themaDerFrage } from "./rag.js";
import { leseLaeufe, tagesbericht } from "./bericht.js";
import { aktualisiereVorschlaege, autoThemen, entscheide, leiteAb } from "./vorschlaege.js";

const env = process.env;
const PREFIX = lagerPrefix(env);
const S = radarSchluessel(PREFIX);
const PORT = Number(env.PORT || 8097);
const HOST = env.MUUNY_RADAR_HOST || "0.0.0.0";
const ADMIN_KEY = String(env.MUUNY_RADAR_ADMIN_KEY || env.MUUNY_ADMIN_KEY || "").trim();
const DIENST_KEY = String(env.MUUNY_DIENST_SCHLUESSEL || "").trim();
const TAKT_MS = Math.max(60_000, Number(env.MUUNY_RADAR_TAKT_MS || 5 * 60_000));
const log = (...a) => console.log(new Date().toISOString(), "[radar]", ...a);

let lager = null;
const e2k = e2KonfigAusEnv(env);
try { if (e2k.ok) lager = e2Client(e2k); } catch (e) { log("e2 aus:", e.message); }

let abbruchGewuenscht = false;
let letzterTakt = null;
let sucher = null;

function sicherGleich(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
async function leseKoerper(req, grenze = 200_000) {
  return new Promise((fertig, schief) => {
    let t = "";
    req.on("data", (c) => { t += c; if (t.length > grenze) { req.destroy(); schief(new Error("zu_gross")); } });
    req.on("end", () => { try { fertig(t ? JSON.parse(t) : {}); } catch { schief(new Error("kein_json")); } });
    req.on("error", schief);
  });
}

const notausAusUmgebung = () => String(env.MUUNY_RADAR_NOTAUS || "").toUpperCase() === "YES";

async function statusBauen() {
  const jetzt = new Date();
  const z = await leseZustand(lager, PREFIX);
  const konfig = await leseKonfig(lager, PREFIX);
  let budget = null; let budgetFehler = null;
  try { budget = budgetRest(await leseVerbrauch(lager, PREFIX, jetzt), konfig.grenzen, jetzt); } catch (f) { budgetFehler = f.message; }
  const laeuft = laufenderLauf();
  const notaus = z.notaus || notausAusUmgebung();
  let status; let detail;
  if (laeuft) { status = laeuft.status; detail = `${laeuft.laufId}: ${laeuft.schritt}`; }
  else if (notaus) { status = "pausiert"; detail = "NOTAUS aktiv"; }
  else if (!z.eingeschaltet) { status = "pausiert"; detail = "ausgeschaltet"; }
  else if (budgetFehler) { status = "fehler"; detail = budgetFehler; }
  else if (z.letzterLauf && ["fehler", "abgebrochen"].includes(z.letzterLauf.ergebnis)) { status = "fehler"; detail = z.letzterLauf.grund; }
  else { status = "wartet"; detail = z.letzterLauf?.ergebnis === "wartet" ? "Server ausgelastet — App hat Vorrang" : "wartet auf den naechsten geplanten Lauf"; }
  const index = await leseIndex(lager, PREFIX);
  const eintraege = Object.values(index.eintraege);
  const heute = z.letzterErfolg && tagVon(z.letzterErfolg.am) === tagVon(jetzt) ? z.letzterErfolg.zahlen : null;
  return {
    dienst: "muuny ai radar", status, detail, eingeschaltet: Boolean(z.eingeschaltet), notaus,
    letzterErfolg: z.letzterErfolg || null, letzterLauf: z.letzterLauf || null,
    naechsterLauf: z.eingeschaltet && !notaus ? naechsterGeplanterLauf(konfig, z, jetzt) : null,
    letzterLaufZahlen: z.letzterErfolg?.zahlen || null, heuteZahlen: heute,
    wissen: { aktiv: eintraege.filter((e) => e.status === "aktiv").length, veraltet: eintraege.filter((e) => e.status === "veraltet").length,
      zurueckgenommen: eintraege.filter((e) => e.status === "zurueckgenommen").length, stand: index.stand, aktualisiert: index.aktualisiert },
    budget, budgetFehler, grenzen: konfig.grenzen, konfigVersion: konfig.version,
    ressourcen: { rssMb: Math.round(process.memoryUsage().rss / 1048576), takt: letzterTakt },
    themen: konfig.themen.map((t) => ({ id: t.id, name: t.name, auto: Boolean(t.auto), aktiv: t.aktiv !== false,
      intervallStunden: t.intervallStunden, letzterLauf: z.themen?.[t.id]?.letzterLauf || null }))
  };
}

async function laufStarten(ausloeser, manuell) {
  abbruchGewuenscht = false;
  const p = await fuehreLaufAus(lager, { prefix: PREFIX, manuell, ausloeser, log,
    abbrechen: () => abbruchGewuenscht || notausAusUmgebung() });
  log(`Lauf ${p.laufId}: ${p.ergebnis}${p.grund ? ` (${p.grund})` : ""} — gefunden ${p.zahlen.gefunden}, gespeichert ${p.zahlen.gespeichertNeu}+${p.zahlen.aktualisiert}`);
  if (p.ergebnis === "ok") await nachLauf().catch((e) => log("Nachlauf:", e.message));
  sucher = null; // Index kann neu sein
  await puls().catch(() => {});
  return p;
}

/** Nach einem Lauf: Vorschlaege ableiten und (in Grenzen) Auto-Themen ergaenzen. */
async function nachLauf() {
  const jetzt = new Date();
  const laeufe = [];
  for (let i = 0; i < 7; i += 1) laeufe.push(...await leseLaeufe(lager, PREFIX, tagVon(new Date(jetzt - i * 86_400_000))));
  const z = await leseZustand(lager, PREFIX);
  const konfig = await leseKonfig(lager, PREFIX);
  const luecken = (await lager.getJson(S.verwendung(tagVon(jetzt)), null))?.luecken || {};
  await aktualisiereVorschlaege(lager, PREFIX, leiteAb({ laeufe, zustand: z, konfig, luecken }), jetzt);
  const neu = autoThemen({ laeufe, konfig, jetzt });
  if (neu.length) {
    const r = await schreibeKonfig(lager, PREFIX, { ...konfig, themen: [...konfig.themen, ...neu] },
      { wer: "radar-auto", grund: `Auto-Themen: ${neu.map((t) => t.id).join(", ")}` });
    log("Auto-Themen ergaenzt:", neu.map((t) => t.id).join(", "), r.ok ? `v${r.version}` : r.fehler);
  }
}

async function puls() {
  const url = String(env.MUUNY_PULS_URL || "").trim();
  const token = String(env.MUUNY_PULS_TOKEN || "").trim();
  if (!url || !token) return;
  const s = await statusBauen();
  const ok = s.status !== "fehler";
  const z = s.letzterErfolg?.zahlen;
  const detail = s.status === "pausiert" ? `pausiert — ${s.detail}`
    : `${s.status}${z ? ` · zuletzt ${z.quellenGeprueft} Quellen, ${z.gespeichertNeu} neu, ${z.aktualisiert} aktualisiert` : ""}${s.status === "fehler" ? ` · ${s.detail}` : ""}`;
  await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-conax-internal": token },
    body: JSON.stringify({ key: "muuny-ai-radar", ok, detail: detail.slice(0, 300) }), signal: AbortSignal.timeout(5000) }).catch(() => {});
}

async function takt() {
  if (!lager || laufenderLauf()) return;
  const z = await leseZustand(lager, PREFIX);
  letzterTakt = new Date().toISOString();
  if (!z.eingeschaltet || z.notaus || notausAusUmgebung()) { await puls().catch(() => {}); return; }
  const konfig = await leseKonfig(lager, PREFIX);
  if (!faelligeThemen(konfig, z, new Date()).length) { await puls().catch(() => {}); return; }
  await laufStarten("zeitplan", false);
}

async function sucherHolen() {
  const index = await leseIndex(lager, PREFIX);
  if (!sucher || sucher.stand !== index.stand) sucher = baueSuche(index);
  return sucher;
}

/** Zaehler im Verwendungsprotokoll des Tages. Nie Wortlaut, nie Nutzerkennung. */
async function zaehle(fn) {
  const k = S.verwendung(tagVon(new Date()));
  const v = (await lager.getJson(k, null)) || { eintraege: {}, antworten: 0, suchen: 0, luecken: {} };
  fn(v);
  await lager.putJson(k, v);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const senden = (code, body) => { const b = JSON.stringify(body, null, 2); res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(b) }); res.end(b); };
  try {
    if (url.pathname === "/health") return senden(200, { ok: true, dienst: "muuny-radar", e2: Boolean(lager), laeuft: laufenderLauf()?.laufId || null });
    // Erst der Schluessel, dann alles andere — auch ein Dienst ohne Lager verraet nichts.
    if (url.pathname.startsWith("/v1/wissen/")) {
      if (!DIENST_KEY || !sicherGleich(String(req.headers["x-muuny-dienst"] || ""), DIENST_KEY)) return senden(401, { ok: false, grund: "dienstschluessel" });
      if (!lager) return senden(503, { ok: false, grund: "e2 nicht konfiguriert" });
      const k = await leseKoerper(req, 20_000).catch((e) => ({ fehler: e.message }));
      if (k.fehler) return senden(400, { ok: false, grund: k.fehler });
      if (url.pathname === "/v1/wissen/suche" && req.method === "POST") {
        const frage = String(k.frage || "").slice(0, 2000);
        const s = await sucherHolen();
        const treffer = suche(s, frage, { k: Math.min(6, Number(k.k) || 4) });
        const { block, funde } = kontextBlock(treffer);
        const konfig = await leseKonfig(lager, PREFIX);
        await zaehle((v) => { v.suchen = (v.suchen || 0) + 1; if (!treffer.length) { const t = themaDerFrage(frage, konfig.themen); v.luecken[t] = (v.luecken[t] || 0) + 1; } }).catch(() => {});
        return senden(200, { ok: true, treffer, block, anweisungsversucheGeblockt: funde });
      }
      if (url.pathname === "/v1/wissen/verwendet" && req.method === "POST") {
        const liste = Array.isArray(k.verwendung) ? k.verwendung.slice(0, 10) : [];
        const echt = liste.filter((x) => x?.status === "verwendet" && /^[0-9a-f]{16}$/.test(String(x.id)));
        await zaehle((v) => { v.antworten += echt.length ? 1 : 0; for (const x of echt) v.eintraege[x.id] = (v.eintraege[x.id] || 0) + 1; });
        return senden(200, { ok: true, gezaehlt: echt.length });
      }
      return senden(404, { ok: false });
    }

    if (!url.pathname.startsWith("/api/radar/")) return senden(404, { ok: false });
    const mitgebracht = req.headers["x-muuny-key"] || "";
    if (!ADMIN_KEY || !sicherGleich(String(mitgebracht), ADMIN_KEY)) return senden(401, { ok: false, grund: "schluessel_fehlt_oder_falsch" });
    if (!lager) return senden(503, { ok: false, grund: "e2 nicht konfiguriert", fehlend: e2k.fehlend });
    const pfad = url.pathname.slice("/api/radar".length);
    const wer = String(req.headers["x-muuny-wer"] || "admin").slice(0, 80);
    const koerper = req.method === "POST" ? await leseKoerper(req).catch(() => ({})) : {};

    if (pfad === "/status") return senden(200, await statusBauen());
    if (pfad === "/schalter" && req.method === "POST") {
      const z = await leseZustand(lager, PREFIX);
      if (typeof koerper.eingeschaltet === "boolean") z.eingeschaltet = koerper.eingeschaltet;
      if (typeof koerper.notaus === "boolean") { z.notaus = koerper.notaus; if (koerper.notaus) abbruchGewuenscht = true; }
      z.schalterVerlauf = [...(z.schalterVerlauf || []).slice(-49), { am: new Date().toISOString(), wer, eingeschaltet: z.eingeschaltet, notaus: z.notaus }];
      await lager.putJson(S.zustand, z);
      await puls().catch(() => {});
      return senden(200, { ok: true, eingeschaltet: z.eingeschaltet, notaus: z.notaus });
    }
    if (pfad === "/jetzt" && req.method === "POST") {
      if (laufenderLauf()) return senden(409, { ok: false, grund: "lauf_aktiv", laufId: laufenderLauf().laufId });
      // Antwort sofort, Lauf im Hintergrund: ein Lauf dauert Minuten.
      const warten = laufStarten("admin", true).catch((e) => log("Lauf-Fehler", e.message));
      await new Promise((r) => setTimeout(r, 300));
      if (koerper.warten) return senden(200, await warten);
      return senden(202, { ok: true, gestartet: laufenderLauf()?.laufId || null });
    }
    if (pfad === "/abbrechen" && req.method === "POST") { abbruchGewuenscht = true; return senden(200, { ok: true, laufId: laufenderLauf()?.laufId || null }); }
    if (pfad === "/bericht") return senden(200, await tagesbericht(lager, PREFIX, url.searchParams.get("tag") || tagVon(new Date())));
    if (pfad === "/laeufe") {
      const tag = url.searchParams.get("tag") || tagVon(new Date());
      return senden(200, { tag, laeufe: await leseLaeufe(lager, PREFIX, tag) });
    }
    if (pfad === "/wissen") {
      const index = await leseIndex(lager, PREFIX);
      const q = String(url.searchParams.get("q") || "").toLowerCase();
      const status = url.searchParams.get("status") || "";
      let liste = Object.values(index.eintraege);
      if (status) liste = liste.filter((e) => e.status === status);
      if (q) liste = liste.filter((e) => `${e.titel} ${e.kurz} ${e.link} ${e.anbieter}`.toLowerCase().includes(q));
      liste.sort((a, b) => String(b.abgerufen).localeCompare(String(a.abgerufen)));
      return senden(200, { stand: index.stand, anzahl: liste.length, eintraege: liste.slice(0, 200) });
    }
    if (pfad === "/erkenntnis") {
      const id = String(url.searchParams.get("id") || "");
      const index = await leseIndex(lager, PREFIX);
      if (!index.eintraege[id]) return senden(404, { ok: false });
      return senden(200, { eintrag: index.eintraege[id], versionen: await versionenVon(lager, PREFIX, id) });
    }
    if (pfad === "/zuruecknehmen" && req.method === "POST") return senden(200, await nimmZurueck(lager, PREFIX, String(koerper.id || ""), { wer, grund: koerper.grund }));
    if (pfad === "/rueckgaengig" && req.method === "POST") return senden(200, await rueckgaengig(lager, PREFIX, String(koerper.laufId || ""), { wer }));
    if (pfad === "/suche-test" && req.method === "POST") {
      const s = await sucherHolen();
      const treffer = suche(s, String(koerper.frage || "").slice(0, 500));
      return senden(200, { treffer, block: kontextBlock(treffer).block });
    }
    if (pfad === "/konfig" && req.method === "GET") return senden(200, await leseKonfig(lager, PREFIX));
    if (pfad === "/konfig" && req.method === "POST") return senden(200, await schreibeKonfig(lager, PREFIX, koerper, { wer, grund: koerper.grund }));
    if (pfad === "/konfig/zurueck" && req.method === "POST") {
      const v = Number(koerper.version);
      const alt = await lager.getJson(`${S.konfigVersionen}/v${v}.json`, null);
      if (!alt) return senden(404, { ok: false, grund: "version_unbekannt" });
      return senden(200, await schreibeKonfig(lager, PREFIX, alt, { wer, grund: `zurueck auf v${v}` }));
    }
    if (pfad === "/vorschlaege" && req.method === "GET") return senden(200, (await lager.getJson(S.vorschlaege, null)) || { vorschlaege: [] });
    if (pfad === "/vorschlaege" && req.method === "POST") {
      const r = await entscheide(lager, PREFIX, String(koerper.id || ""), { entscheidung: koerper.entscheidung, wer });
      return senden(200, r);
    }
    if (pfad === "/themen-standard") return senden(200, { themen: THEMEN_STANDARD });
    return senden(404, { ok: false });
  } catch (e) { log("HTTP-Fehler", e.message); return senden(500, { ok: false, fehler: String(e.message).slice(0, 200) }); }
});

server.listen(PORT, HOST, () => {
  log(`listening ${HOST}:${PORT} prefix=${PREFIX} takt=${TAKT_MS / 1000}s e2=${Boolean(lager)}`);
  if (lager) {
    setTimeout(() => takt().catch((e) => log("Takt:", e.message)), 15_000);
    setInterval(() => takt().catch((e) => log("Takt:", e.message)), TAKT_MS);
  }
});

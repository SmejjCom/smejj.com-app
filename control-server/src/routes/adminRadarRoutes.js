// smejj.com — Adminroute fuer "smejj ai radar": /api/admin/radar
//
//   GET  /api/admin/radar                 Stand, Budget, Themen, Tagesbericht
//   GET  /api/admin/radar/bericht?tag=…   Tagesbericht eines Tages
//   GET  /api/admin/radar/verlauf?q=…     Wissenseintraege durchsuchen
//   POST /api/admin/radar/jetzt           sofort recherchieren
//   POST /api/admin/radar/schalter        { ein: true|false }
//   POST /api/admin/radar/konfig          Themen, Intervalle, Grenzen
//   POST /api/admin/radar/zuruecknehmen   { eintragId, grund }
//
// WARUM EINE EIGENE DATEI (wie bei den Entscheidungen): adminOpsRoutes.js und
// adminSurfaceRoutes.js stehen im Admin-Lock. Diese Route haengt deshalb an
// adminModellRoutes.js — derselben Kette mit derselben Vortuer, Rollenpruefung
// und demselben Audit-Weg.
//
// SCHREIBEN IST AUDIT-PFLICHTIG: Jeder Schalter, jede Konfigurationsaenderung
// und jede Ruecknahme hinterlaesst einen Eintrag mit VORHER und NACHHER. Ein
// Radar, der sich unbemerkt umstellen laesst, waere ein Loch.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { GRANT, can } from "../admin/adminRoles.js";
import { resolveAdminActor } from "../admin/adminAuth.js";
import { appendAuditEntry } from "../admin/auditLog.js";
import { createRecordStore } from "../admin/recordStore.js";
import {
  KONFIG_ABLAGE, LAUF_ABLAGE, WISSEN_ABLAGE,
  fuehreRadarLaufAus, leseKonfig, radarStand, schreibeKonfig
} from "../autopilots/aiRadarAutopilot.js";
import { baueTagesbericht } from "../../../src/radar/tagesbericht.js";
import { zurueckNehmen } from "../../../src/radar/wissensbasis.js";

const PREFIX = "/api/admin/radar";
const RECHT_LESEN = "ops.read";
const RECHT_SCHREIBEN = "models.write";
// Lesen kommt beim Blaettern mehrfach, Recherchieren ist ein seltener Klick.
const gate = createRateLimiter({ capacity: 40, refillPerSec: 0.5, maxKeys: 5_000 });

const wissenStore = createRecordStore(WISSEN_ABLAGE, { maximal: 2000 });
const laufStore = createRecordStore(LAUF_ABLAGE, { maximal: 500 });
const konfigStore = createRecordStore(KONFIG_ABLAGE, { maximal: 5 });

function clientIp(req) {
  const weiter = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return weiter || req.socket?.remoteAddress || "";
}

async function listeOderLeer(store, env) {
  try {
    const liste = await store.liste({ env });
    return liste?.ok ? (liste.datensaetze || []) : null;
  } catch {
    return null;
  }
}

export async function handleAdminRadarRoute(req, url, res, {
  env = process.env,
  stores = { wissen: wissenStore, laeufe: laufStore, konfig: konfigStore },
  lauf = fuehreRadarLaufAus,
  jetzt = () => new Date().toISOString(),
  // Einreichbar NUR fuer Tests: in Betrieb bleibt es der echte Aufloeser, der
  // die Rolle frisch aus dem Store liest (nie aus dem Token).
  aufloeser = resolveAdminActor,
  protokoll = appendAuditEntry
} = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
  const aktion = url.pathname.slice(PREFIX.length).replace(/^\//, "");
  const bekannt = ["", "bericht", "verlauf", "jetzt", "schalter", "konfig", "zuruecknehmen"];
  if (!bekannt.includes(aktion)) return false;

  const lesen = req.method === "GET" || req.method === "HEAD";
  const schreibAktionen = ["jetzt", "schalter", "konfig", "zuruecknehmen"];
  if (!lesen && req.method !== "POST") {
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed" });
    return true;
  }
  if (lesen && schreibAktionen.includes(aktion)) {
    privateJson(res, 405, { ok: false, error: "admin_method_not_allowed", hinweis: `${aktion} ist POST.` });
    return true;
  }

  const resolved = await aufloeser(req.authUser, { env });
  if (!resolved.ok) { privateJson(res, resolved.status, { ok: false, error: resolved.error }); return true; }
  const { actor } = resolved;
  const recht = lesen ? RECHT_LESEN : RECHT_SCHREIBEN;
  if (can(actor.role, recht) !== GRANT.allow) {
    privateJson(res, 403, { ok: false, error: "admin_permission_denied", recht });
    return true;
  }
  const limit = gate.take(actor.email, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "admin_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  try {
    if (lesen) return await lies(aktion, url, res, { env, stores, jetzt });
    return await schreib(aktion, req, res, { env, stores, lauf, actor, jetzt, protokoll });
  } catch (fehler) {
    privateJson(res, 500, { ok: false, error: "radar_fehlgeschlagen", hinweis: String(fehler?.message || fehler).slice(0, 200) });
    return true;
  }
}

async function lies(aktion, url, res, { env, stores, jetzt }) {
  const heute = jetzt().slice(0, 10);

  if (aktion === "" || aktion === "bericht") {
    const tag = String(url.searchParams.get("tag") || heute).slice(0, 10);
    const laeufe = (await listeOderLeer(stores.laeufe, env)) || [];
    const eintraege = (await listeOderLeer(stores.wissen, env)) || [];
    const bericht = baueTagesbericht({ laeufe, eintraege, tag });
    if (aktion === "bericht") {
      privateJson(res, 200, { ok: true, bericht, tageMitLaeufen: tageMit(laeufe) });
      return true;
    }
    const stand = await radarStand({ env, stores, jetzt: jetzt() });
    privateJson(res, 200, { ok: true, stand, bericht, tageMitLaeufen: tageMit(laeufe) });
    return true;
  }

  // Verlauf: Wissenseintraege durchsuchen (Volltext ueber Aussage und Quelle).
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const tag = String(url.searchParams.get("tag") || "").slice(0, 10);
  const eintraege = (await listeOderLeer(stores.wissen, env)) || [];
  const gefiltert = eintraege
    .filter((e) => !tag || String(e.aktualisiertAm || e.erstelltAm || "").slice(0, 10) === tag)
    .filter((e) => !q || `${e.aussage} ${(e.belege || []).map((b) => b.url).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => String(b.aktualisiertAm || "").localeCompare(String(a.aktualisiertAm || "")))
    .slice(0, 200);
  privateJson(res, 200, { ok: true, treffer: gefiltert.length, eintraege: gefiltert });
  return true;
}

function tageMit(laeufe) {
  return [...new Set(laeufe.map((l) => String(l?.begonnenAm || "").slice(0, 10)).filter(Boolean))].sort().reverse().slice(0, 60);
}

async function schreib(aktion, req, res, { env, stores, lauf, actor, jetzt, protokoll = appendAuditEntry }) {
  const body = await readJson(req).catch(() => ({}));
  const vorher = await leseKonfig({ env, store: stores.konfig });

  if (aktion === "jetzt") {
    const ergebnis = await lauf({ env, jetzt: jetzt(), stores, grund: `admin:${actor.email}` });
    await protokoll({
      actor, action: "radar.jetzt", target: "smejj-ai-radar",
      before: { zustand: "wartet" },
      after: { ok: ergebnis.ok, grund: ergebnis.grund, anfragen: ergebnis.anfragen, gespeichert: ergebnis.gespeicherteIds.length },
      reason: "Recherche von Hand ausgeloest (Adminbereich)", ip: clientIp(req)
    }, { env }).catch(() => null);
    privateJson(res, 200, { ok: true, lauf: ergebnis });
    return true;
  }

  if (aktion === "schalter") {
    const ein = body?.ein === true;
    const neu = await schreibeKonfig({ ...(vorher || {}), eingeschaltet: ein }, { env, store: stores.konfig, jetzt: jetzt() });
    await protokoll({
      actor, action: ein ? "radar.ein" : "radar.aus", target: "smejj-ai-radar",
      before: { eingeschaltet: vorher?.eingeschaltet !== false }, after: { eingeschaltet: ein },
      reason: String(body?.grund || (ein ? "Radar eingeschaltet" : "Radar ausgeschaltet")).slice(0, 200), ip: clientIp(req)
    }, { env }).catch(() => null);
    privateJson(res, 200, { ok: true, konfiguration: neu });
    return true;
  }

  if (aktion === "konfig") {
    const neu = await schreibeKonfig({
      ...(vorher || {}),
      themen: Array.isArray(body?.themen) ? body.themen.slice(0, 40) : (vorher?.themen || []),
      themenAus: Array.isArray(body?.themenAus) ? body.themenAus.slice(0, 40).map(String) : (vorher?.themenAus || []),
      anfragenJeTag: Number(body?.anfragenJeTag) || vorher?.anfragenJeTag,
      anfragenJeLauf: Number(body?.anfragenJeLauf) || vorher?.anfragenJeLauf
    }, { env, store: stores.konfig, jetzt: jetzt() });
    await protokoll({
      actor, action: "radar.konfig", target: "smejj-ai-radar",
      before: { themen: (vorher?.themen || []).length, themenAus: (vorher?.themenAus || []).length },
      after: { themen: (neu.themen || []).length, themenAus: (neu.themenAus || []).length },
      reason: String(body?.grund || "Radar-Konfiguration geaendert").slice(0, 200), ip: clientIp(req)
    }, { env }).catch(() => null);
    privateJson(res, 200, { ok: true, konfiguration: neu });
    return true;
  }

  // Ruecknahme einer Uebernahme: die vorige Fassung gilt wieder.
  const eintragId = String(body?.eintragId || "");
  const grund = String(body?.grund || "").trim();
  if (!eintragId || grund.length < 5) {
    privateJson(res, 400, { ok: false, error: "radar_ruecknahme_unvollstaendig", hinweis: "eintragId und ein Grund (>= 5 Zeichen) sind Pflicht." });
    return true;
  }
  const eintraege = (await listeOderLeer(stores.wissen, env)) || [];
  const alt = eintraege.find((e) => e.id === eintragId);
  if (!alt) { privateJson(res, 404, { ok: false, error: "radar_eintrag_unbekannt" }); return true; }
  const neu = zurueckNehmen(alt, { grund, jetzt: jetzt() });
  await stores.wissen.schreib(neu, { env, timeoutMs: 8000 });
  await protokoll({
    actor, action: "radar.zuruecknehmen", target: eintragId,
    before: { aussage: alt.aussage, fassung: alt.fassung },
    after: { aussage: neu.aussage, fassung: neu.fassung, zurueckgenommen: neu.zurueckgenommen === true },
    reason: grund, ip: clientIp(req)
  }, { env }).catch(() => null);
  privateJson(res, 200, { ok: true, eintrag: neu });
  return true;
}

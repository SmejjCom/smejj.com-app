// smejj.com — Nutzer melden anstoessige KI-Inhalte (Google-Play-Richtlinie fuer KI-generierte
// Inhalte, 20.09.2026: "In-App-Funktion zum Melden oder Kennzeichnen anstoessiger Inhalte,
// ohne die App zu verlassen"; Update wurde deshalb abgelehnt).
//
//   POST /api/inhalt-meldung        angemeldeter Nutzer meldet eine Antwort (Text, Bild, Video)
//   GET  /api/inhalt-meldung/alle   NUR Betreiber (SMEJJ_ADMIN_OWNER_EMAILS): die Meldungen
//
// Bewusst NICHT /api/feedback: das Schwungrad macht aus Signalen Trainingspaare. Eine Meldung ist
// Moderation, kein Lernsignal, und darf nie in ein Training fliessen. Die E-Mail der meldenden
// Person wird nicht gespeichert (nur ein Hash zur Missbrauchserkennung); Text ist PII-bereinigt.
// Rate-Limit 20/Stunde und Nutzer: ein Mensch meldet, keine Schleife.
import { createHash } from "node:crypto";
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { createRecordStore, neueKennung } from "../admin/recordStore.js";
import { scrubPiiData } from "../autopilots/userFeedbackFlywheelAutopilot.js";

const PREFIX = "/api/inhalt-meldung";
const gate = createRateLimiter({ capacity: 20, refillPerSec: 20 / 3600, maxKeys: 5_000 });
const store = createRecordStore("moderation/inhalt-meldungen", { maximal: 1000 });

export const GRUENDE = Object.freeze(["anstoessig", "sexuell", "gewalt", "hass", "falsch", "sonstiges"]);
const ARTEN = Object.freeze(["text", "bild", "video"]);

/** Testhilfe: leert die (Memory-)Ablage. */
export function __meldungenLeeren() { store.__leeren(); }

function istBetreiber(email, env) {
  return String(env.SMEJJ_ADMIN_OWNER_EMAILS || "")
    .toLowerCase().split(",").map((e) => e.trim()).filter(Boolean)
    .includes(String(email || "").toLowerCase().trim());
}

export async function handleInhaltMeldungRoute(req, url, res, { env = process.env } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const wer = String(req.authUser?.email || "").toLowerCase().trim();
  if (!wer) { privateJson(res, 401, { ok: false, error: "authentication_required" }); return true; }

  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === `${PREFIX}/alle`) {
    if (!istBetreiber(wer, env)) { privateJson(res, 403, { ok: false, error: "owner_only" }); return true; }
    const liste = await store.liste({ env });
    const meldungen = (liste?.datensaetze || []).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    privateJson(res, 200, { ok: true, total: meldungen.length, meldungen });
    return true;
  }

  if (req.method !== "POST" || url.pathname !== PREFIX) {
    privateJson(res, 404, { ok: false, error: "inhalt_meldung_route_not_found" });
    return true;
  }

  const limit = gate.take(wer, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "inhalt_meldung_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const body = await readJson(req).catch(() => ({}));
  const grund = GRUENDE.includes(String(body?.grund)) ? String(body.grund) : "sonstiges";
  const art = ARTEN.includes(String(body?.art)) ? String(body.art) : "text";
  const inhalt = scrubPiiData(String(body?.inhalt || "").trim()).slice(0, 2000);
  const frage = scrubPiiData(String(body?.frage || "").trim()).slice(0, 500);
  const notiz = scrubPiiData(String(body?.notiz || "").trim()).slice(0, 500);
  if (!inhalt && !frage) { privateJson(res, 400, { ok: false, error: "inhalt_fehlt" }); return true; }

  const meldung = {
    id: neueKennung("mel"),
    status: "offen",
    grund,
    art,
    inhalt,
    frage,
    notiz,
    melder: createHash("sha256").update(wer).digest("hex").slice(0, 16),
    createdAt: new Date().toISOString()
  };
  try {
    await store.schreib(meldung, { env, timeoutMs: 20_000 });
  } catch {
    privateJson(res, 503, { ok: false, error: "inhalt_meldung_ablage_nicht_erreichbar" });
    return true;
  }
  privateJson(res, 200, { ok: true, id: meldung.id, hinweis: "Danke — die Meldung ist angekommen und wird geprüft." });
  return true;
}

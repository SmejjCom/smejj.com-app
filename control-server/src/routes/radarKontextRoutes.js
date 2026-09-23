// smejj ai radar — Wissen auch fuer die Chat-Bruecke (Betreiber-Auftrag 23.09.2026,
// Punkt 5: "Pruefe, ob der Bruecken-Weg (chat-bridge) dasselbe Wissen bekommt;
// wenn nicht, nachruesten und beweisen.").
//
// BEFUND: Die Bruecke (smejj-chat-bridge.zeabur.app) ist der Standardweg des
// Chats. Ihre Schnellspur fragt Groq direkt und erreicht den Control-Server nie —
// das Radar-Wissen (radarKontext.js) kam dort nicht an. Die Bruecke kann es auch
// nicht selbst lesen: sie buendelt ohne fremde Abhaengigkeiten und hat keinen
// e2-Zugang. Darum fragt sie HIER nach, mit dem Anmeldenachweis des Menschen.
//
//   POST /api/radar/kontext  { frage }  ->  { ok, kontext, zeilen }
//
// Nebenwirkung mit Absicht: jede Anfrage zaehlt als Nutzeranfrage fuer den
// Radar-Vorrang (radarVorrang.js). Bisher sah der Vorrang nur /api/agent im
// Control-Server — Chats ueber die Bruecke waren fuer ihn unsichtbar.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { baueRadarKontext } from "../rag/radarKontext.js";
import { nutzeranfrageBeginnt, nutzeranfrageEndet } from "../autopilots/radarVorrang.js";

const PFAD = "/api/radar/kontext";
// Ein Chat stellt eine Frage je Antwort; 240/h reicht auch fuer schnelle Menschen.
const gate = createRateLimiter({ capacity: 240, refillPerSec: 240 / 3600, maxKeys: 5_000 });

export async function handleRadarKontextRoute(req, url, res, { kontext = baueRadarKontext } = {}) {
  if (url.pathname !== PFAD) return false;
  if (req.method !== "POST") { privateJson(res, 405, { ok: false, error: "method_not_allowed" }); return true; }
  const wer = String(req.authUser?.email || req.authUser?.userId || "").toLowerCase().trim();
  if (!wer) { privateJson(res, 401, { ok: false, error: "authentication_required" }); return true; }
  const limit = gate.take(wer, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "radar_kontext_rate_limit" });
    return true;
  }
  const body = await readJson(req).catch(() => ({}));
  const frage = String(body?.frage || "").slice(0, 2000).trim();
  if (!frage) { privateJson(res, 400, { ok: false, error: "frage_fehlt" }); return true; }
  nutzeranfrageBeginnt();
  try {
    const block = await kontext(frage);
    privateJson(res, 200, { ok: true, kontext: block, zeilen: block ? block.split("\n").filter((z) => z.startsWith("- ")).length : 0 });
  } finally {
    nutzeranfrageEndet();
  }
  return true;
}

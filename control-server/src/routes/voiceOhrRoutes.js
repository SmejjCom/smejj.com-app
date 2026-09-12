// smejj.com control-server — das Sprach-Ohr direkt am Control Server.
//
// WARUM ES DIESE ZWEITE ADRESSE GIBT — und eine KORREKTUR meiner ersten
// Diagnose, damit sie niemand als Tatsache weitertraegt:
//
// Am 2026-09-10 habe ich die Dienste der Sprachwelle mit curl gemessen und
// ueberall 404 bekommen — /api/voice/status, /api/voice/tts,
// /api/voice/transcribe, sogar /api/health. Daraus schloss ich, die
// Chat-Bridge sei tot und die Sprachwelle laufe deshalb nur mit
// Browser-Erkennung und Browser-Stimme.
//
// DAS WAR FALSCH. Die Bridge nimmt POST; auf GET antwortet sie 404. Mit der
// Methode, die der Browser wirklich benutzt, sieht es so aus:
//
//   POST /api/voice/status       200  {"ok":true,"premiumVoice":true}
//   POST /api/voice/transcribe   401  (verlangt Anmeldung)
//   POST /api/voice/tts          401  (verlangt Anmeldung)
//
// Die Premium-Stimme laeuft also, und das Ohr auch. Wer ein Werkzeug mit einer
// anderen Methode befragt als der Klient, misst nicht den Dienst, sondern sich
// selbst.
//
// WAS BLEIBT: Ein zweiter Weg ist trotzdem richtig. Der Chat hat ihn seit
// jeher (chatFallback -> api.smejj.com), die Sprachwelle hatte keinen — faellt
// die Bridge wirklich einmal aus, war das Ohr fuer die ganze Sitzung weg
// (voice-ear.js schaltete sich bei der ersten 404 ab). Diese Route ist der
// zweite Weg. Sie kostet nichts: das Ohr braucht nur den Groq-Schluessel, den
// dieser Server ohnehin fuehrt.
//
// WAS HIER GEHT UND WAS NICHT:
//   * Das OHR (Spracherkennung) braucht nur den Groq-Schluessel, den dieser
//     Server ohnehin fuehrt (SMEJJ_LLM_GROQ_API_KEY, laut opsSicherheitsLage
//     "Schnellspur und Sprach-Ohr"). Es kostet nichts extra und laeuft ab
//     sofort — Whisper erkennt deutsche Sprache deutlich zuverlaessiger als
//     die Browser-Erkennung, besonders bei Hintergrundgeraeuschen.
//   * Die PREMIUM-STIMME braucht einen eigenen Sprachworker (XTTS/Piper). Die
//     BRIDGE hat einen und meldet premiumVoice: true — DIESER Server hat
//     keinen. Er sagt das auch so (stimme: false), statt Verfuegbarkeit zu
//     behaupten: der Klient fragt ohnehin zuerst die Bridge und bekommt dort
//     die richtige Antwort.
//
// Kein eigener Code fuer die Erkennung: dieselbe gepruefte Funktion wie in der
// Bridge (public/chat-bridge-voice-ear.js). Zwei Fassungen derselben Logik
// waeren zwei Fehlerquellen.
import { readAudioBody, transcribeWithGroq } from "../../../public/chat-bridge-voice-ear.js";

const GROQ_STANDARD_URL = "https://api.groq.com/openai/v1";

function json(res, status, nutzlast) {
  const koerper = JSON.stringify(nutzlast);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(koerper),
    "Cache-Control": "no-store"
  });
  res.end(koerper);
}

/** Der Groq-Schluessel unter beiden gebraeuchlichen Namen. */
export function groqSchluessel(env = process.env) {
  return String(env.SMEJJ_LLM_GROQ_API_KEY || env.GROQ_API_KEY || "").trim();
}

function groqAdresse(env = process.env) {
  return String(env.SMEJJ_LLM_GROQ_BASE_URL || env.GROQ_BASE_URL || GROQ_STANDARD_URL).replace(/\/+$/, "");
}

/**
 * Was kann die Sprachwelle hier wirklich? Ehrliche Auskunft statt Behauptung.
 *
 * Die Bridge meldet an dieser Stelle `{ up: <Premium-Stimme erreichbar> }`.
 * Dieselbe Form, damit der Browser beide Adressen gleich lesen kann — aber mit
 * getrennter Auskunft ueber Ohr und Stimme: wer nur "up: false" liest, weiss
 * nicht, ob ihm die Erkennung oder die Stimme fehlt.
 */
export function handleOhrStatus(req, res, { env = process.env } = {}) {
  const ohr = Boolean(groqSchluessel(env));
  return json(res, 200, {
    ok: true,
    // "up" meint wie in der Bridge die PREMIUM-STIMME. Sie braucht einen
    // eigenen Worker; dieser Server bietet sie nicht an.
    up: false,
    ohr,
    stimme: false,
    quelle: "control-server",
    grund: ohr
      ? "Ohr ueber Groq verfuegbar; Premium-Stimme braucht einen eigenen Sprachworker"
      : "weder Ohr noch Stimme konfiguriert (SMEJJ_LLM_GROQ_API_KEY fehlt)"
  });
}

/** Spracherkennung. Fail-closed: ohne Schluessel 503, nie ein stiller Leerlauf. */
export async function handleOhrTranscribe(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = groqSchluessel(env);
  if (!apiKey) return json(res, 503, { ok: false, error: "ear_not_configured" });
  const audio = await readAudioBody(req);
  // null heisst hier zweierlei: zu gross ODER Verbindung abgebrochen. 413 ist
  // die haeufigere und die einzige, gegen die der Browser etwas tun kann
  // (kuerzer sprechen) — dieselbe Antwort wie in der Bridge.
  if (audio === null) return json(res, 413, { ok: false, error: "audio_too_large" });
  const ergebnis = await transcribeWithGroq(audio, {
    contentType: req.headers["content-type"],
    apiKey,
    baseUrl: groqAdresse(env),
    fetchFn: fetchImpl
  });
  if (!ergebnis.ok) return json(res, ergebnis.status || 502, { ok: false, error: ergebnis.error });
  return json(res, 200, { ok: true, text: ergebnis.text });
}

/**
 * Die Kante. Gibt true zurueck, wenn sie den Weg uebernommen hat.
 *
 * Bewusst NUR die zwei Wege, die dieser Server ehrlich bedienen kann. Ein
 * /api/voice/tts, das immer 503 antwortet, waere schlechter als keines: der
 * Browser wuerde es fuer einen voruebergehenden Ausfall halten und es bei
 * jedem Satz erneut versuchen.
 */
export async function handleOhrRoute(req, url, res, { env = process.env } = {}) {
  const p = url.pathname;
  if (p === "/api/voice/status") { handleOhrStatus(req, res, { env }); return true; }
  if (req.method === "POST" && p === "/api/voice/transcribe") { await handleOhrTranscribe(req, res, { env }); return true; }
  return false;
}

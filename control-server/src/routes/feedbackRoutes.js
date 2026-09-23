// smejj.com — Daten-Schwungrad Stufe 1: der Eingang fuer echte Nutzersignale.
//
//   POST /api/feedback   angemeldeter Nutzer meldet per Daumen, ob eine
//                        Antwort geholfen hat. Der Server bereinigt PII und
//                        legt das Signal ab; "nicht hilfreich" wird spaeter
//                        vom Werkstatt-Backlog als Arbeitsauftrag gelesen.
//
// Bewusst KEIN Lese-Endpunkt: die Auswertung laeuft ueber die Ampel
// (user-feedback-flywheel) und das Werkstatt-Backlog, nicht ueber eine
// weitere Konsole. Rate-Limit 60/Stunde: ein Mensch klickt Daumen, keine
// Schleife.
import { privateJson, readJson } from "../http/respond.js";
import { createRateLimiter } from "../http/rateLimiter.js";
import { processUserFeedbackSignal, SIGNAL_TYPEN } from "../autopilots/userFeedbackFlywheelAutopilot.js";
import { sichereLernpaar } from "./lernpaarAblage.js";

const PREFIX = "/api/feedback";
const gate = createRateLimiter({ capacity: 60, refillPerSec: 60 / 3600, maxKeys: 5_000 });

export async function handleFeedbackRoute(req, url, res, { env = process.env, lernpaar = sichereLernpaar, verarbeite = processUserFeedbackSignal } = {}) {
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

  const wer = String(req.authUser?.email || "").toLowerCase().trim();
  if (!wer) { privateJson(res, 401, { ok: false, error: "authentication_required" }); return true; }

  if (req.method !== "POST" || url.pathname !== PREFIX) {
    privateJson(res, 404, { ok: false, error: "feedback_route_not_found" });
    return true;
  }

  const limit = gate.take(wer, 1);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSec));
    privateJson(res, 429, { ok: false, error: "feedback_rate_limit", retryAfterSec: limit.retryAfterSec });
    return true;
  }

  const body = await readJson(req).catch(() => ({}));
  const signalType = String(body?.signalType || "");
  if (!SIGNAL_TYPEN.includes(signalType)) {
    privateJson(res, 400, { ok: false, error: "unknown_signal_type", erlaubt: SIGNAL_TYPEN });
    return true;
  }

  // Die E-Mail des Klickenden wird BEWUSST nicht mitgespeichert: das
  // Schwungrad braucht die Antwortqualitaet, nicht die Person. Was die
  // Engine ablegt, ist bereits PII-bereinigt (scrubPiiData).
  const ergebnis = await verarbeite({
    signalType,
    prompt: String(body?.prompt || "").slice(0, 2000),
    chosenResponse: signalType === "thumbs_up" ? String(body?.antwort || "").slice(0, 4000) : "",
    rejectedResponse: signalType === "thumbs_down" ? String(body?.antwort || "").slice(0, 4000) : ""
  }, { env });

  if (!ergebnis.ok) { privateJson(res, 400, { ok: false, error: ergebnis.reason || "feedback_rejected" }); return true; }
  // Daumen hoch MIT Trainings-Einwilligung wird zusaetzlich ein Lernpaar fuer
  // smejj 1 (17.09.2026). Ohne Einwilligung bleibt es beim Signal oben.
  const lern = signalType === "thumbs_up"
    ? await lernpaar(req.authUser, { frage: body?.prompt, antwort: body?.antwort, modell: String(body?.modell || "").slice(0, 80) }, { env })
    : null;
  privateJson(res, 200, {
    ok: true,
    hinweis: "Signal angekommen — es fliesst in die Qualitaetsarbeit ein.",
    ...(lern ? { lernpaar: { erfasst: lern.erfasst === true, grund: lern.grund || null, ...(lern.erfasst ? { trainingsrecht: lern.trainingsrecht === true } : {}) } } : {})
  });
  return true;
}

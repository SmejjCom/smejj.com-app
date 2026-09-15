// smejj.com — Vision-Spur der Chat-Bruecke (Stufe 1 Bild-Verstehen, 2026-08-11).
// Ausgelagert wie chat-bridge-weather.js/-rechner.js (800-Zeilen-Regel).
//
// Traegt eine /api/agent- oder /api/chat-Frage einen Bild-Anhang
// (preferences.bildDataUrl, gesetzt von composer-bild-anhang.js), geht sie an das
// Groq-Vision-Modell. Ohne Anhang: false, kein Byte gesendet, der Text-Weg laeuft.
//
// v157 — MIT BILD NIE STILL AN EIN TEXTMODELL (A-bis-Z-Befund M3, 15.09.2026):
// "Bild verstehen" antwortete 1 von 3 Mal leer. Das Bild ging mit, geantwortet hat
// groq:openai/gpt-oss-120b — ein Textmodell, das das Bild nie sah, mit leerem Text.
// Ursache: diese Spur gab bei 429, 5xx, Zeitueberschreitung und Netzfehler still
// "false" zurueck, und die Schnellspur uebernahm. Jetzt gilt, sobald ein gueltiges
// Bild anhaengt:
//   1. Die Spur antwortet IMMER selbst (true) — nie faellt die Frage an den Text-Weg.
//   2. 429/5xx/Zeitueberschreitung/Netzfehler/leere Antwort: kurz warten, dasselbe
//      Modell EINMAL erneut, danach das naechste Vision-Modell. 404/400 (Modell weg
//      oder kann keine Bilder): sofort das naechste.
//   3. Eine leere Modellantwort ist kein Erfolg (pipeMitInhalt): Kopf und [DONE]
//      gehen erst mit dem ersten sichtbaren Zeichen raus.
//   4. Scheitert alles: eine ehrliche, sichtbare Meldung statt einer leeren Blase.
// Damit der Browser waehrenddessen nicht abbricht (Erstes-Byte-Budget 6,5 s auf
// /api/chat), geht nach KOPF_VORLAUF_MS der Antwortkopf vorab raus, mit Lebenszeichen.
import { pipeMitInhalt } from "./chat-bridge-strom.js";
import { KOPF_VORLAUF_MS, LEBENSZEICHEN_ALLE_MS, modellKommentar, schreibeStromFehler } from "./chat-bridge-lebenszeichen.js";
import { sanitizeHistory } from "../src/agent/conversationHistory.js";

// Eigene Namen (VISION_*): das Deploy-Buendel legt alle Bridge-Module in EINEN
// Gueltigkeitsbereich, GROQ_API_KEY & Co. gehoeren dort chat-bridge.js.
const VISION_API_KEY = process.env.SMEJJ_LLM_GROQ_API_KEY || "";
const VISION_BASE_URL = String(process.env.SMEJJ_LLM_GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
// MODELL-LISTE statt EIN Modell (15.09.2026, live gemessen): Groq hat qwen/qwen3.6-27b
// abgeschaltet (404 model_not_found). Env-Wahl zuerst, dann der Nachfolger qwen3.8-27b,
// dann der alte Name.
export const VISION_MODELLE = [...new Set([process.env.SMEJJ_LLM_GROQ_VISION_MODEL, "qwen/qwen3.8-27b", "qwen/qwen3.6-27b"].filter(Boolean))];
/** Frist je Versuch bis zum ERSTEN sichtbaren Zeichen; danach streamt die Antwort frei. */
export const VISION_VERSUCH_MS = 20_000;
/** Kurzes Warten vor dem Neuversuch nach einer voruebergehenden Stoerung. */
export const VISION_WARTEN_MS = 1_000;
/** Hoechstens so viele Anfragen je Bild — drei Versuche liegen unter dem 60-s-Budget. */
export const VISION_MAX_VERSUCHE = 3;
export const VISION_FEHLTEXT = "Das Bild konnte gerade nicht ausgewertet werden. Bitte versuche es gleich noch einmal.";

// Nur JPEG/PNG/WebP als base64-data:-URL, Deckel = Body-Deckel der Bruecke.
// Alles andere (fremde URLs, andere MIME-Typen, Muell) ergibt "" — kein Fehler
// nach aussen, der Text-Weg laeuft unveraendert.
export function leseBildAnhang(body, maxZeichen) {
  const roh = String(body?.preferences?.bildDataUrl || "");
  if (!roh || roh.length > maxZeichen) return "";
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(roh) ? roh : "";
}

/**
 * Streamt die Vision-Antwort. deps liefert die brueckenlokalen Helfer:
 * { corsHeaders, securityHeaders, timeoutMs, maxBodyBytes } — Tests zusaetzlich
 * wartenMs und kopfMs.
 * @returns {Promise<boolean>} false NUR ohne gueltigen Bild-Anhang
 */
export async function streamVisionLane(res, body, task, deps) {
  const bildDataUrl = leseBildAnhang(body, deps.maxBodyBytes);
  if (!bildDataUrl) return false;
  const kopf = { draussen: false };
  const schreibeKopf = (modell, vorab = false) => {
    kopf.draussen = true;
    res.writeHead(200, {
      ...deps.securityHeaders(),
      ...deps.corsHeaders("https://smejj.com"),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-smejj-bridge": "chat-vision",
      "x-smejj-profile": "vision",
      ...(vorab ? { "x-smejj-kopf": "vorab" } : {}),
      "x-smejj-model-backend": modell ? `groq:${modell}` : "groq-vision",
      "x-smejj-model-id": modell,
      "x-smejj-requested-model": String(body?.model || ""),
      "x-smejj-model-fallback": "false"
    });
  };
  let lebenszeichen = null;
  const vorab = setTimeout(() => {
    if (kopf.draussen) return;
    schreibeKopf("", true);
    res.write(": lebenszeichen\n\n");
    lebenszeichen = setInterval(() => { if (!res.writableEnded) res.write(": lebenszeichen\n\n"); }, LEBENSZEICHEN_ALLE_MS);
  }, deps.kopfMs ?? KOPF_VORLAUF_MS);
  const aufraeumen = () => { clearTimeout(vorab); clearInterval(lebenszeichen); };
  try {
    if (VISION_API_KEY && VISION_BASE_URL && await visionVersuche(res, body, task, bildDataUrl, deps, kopf, schreibeKopf, aufraeumen)) return true;
  } catch { /* jeder unerwartete Fehler endet in der ehrlichen Meldung unten */ }
  aufraeumen();
  if (res.writableEnded) return true;
  if (!kopf.draussen) schreibeKopf("");
  schreibeStromFehler(res, VISION_FEHLTEXT);
  return true;
}

/** Die Versuchsreihe. true, sobald eine Antwort mit Inhalt fertig gestreamt ist. */
async function visionVersuche(res, body, task, bildDataUrl, deps, kopf, schreibeKopf, aufraeumen) {
  const messages = [
    {
      role: "system",
      content: "Du bist der Assistent von smejj.com. Beschreibe und beantworte anhand des angehaengten Bildes. Antworte in der Sprache des Nutzers, direkt sichtbar, ohne <think> und ohne interne Notizen."
    },
    ...sanitizeHistory(body.history),
    {
      role: "user",
      content: [
        { type: "text", text: String(task || "Beschreibe das Bild.") },
        { type: "image_url", image_url: { url: bildDataUrl } }
      ]
    }
  ];
  const versuchMs = Math.min(Number(deps.timeoutMs) || VISION_VERSUCH_MS, VISION_VERSUCH_MS);
  const wartenMs = deps.wartenMs ?? VISION_WARTEN_MS;
  let versuche = 0;
  for (const modell of VISION_MODELLE) {
    for (let runde = 0; runde < 2 && versuche < VISION_MAX_VERSUCHE; runde += 1) {
      if (versuche > 0 && runde > 0) await new Promise((weiter) => { setTimeout(weiter, wartenMs); });
      versuche += 1;
      const ergebnis = await visionVersuch(res, modell, messages, versuchMs, kopf, schreibeKopf, aufraeumen);
      if (ergebnis === "ok") return true;
      if (ergebnis === "modell-weg") break; // 404/400: kein Neuversuch, naechstes Modell
    }
  }
  return false;
}

/** Ein Versuch: "ok" | "modell-weg" | "voruebergehend". */
async function visionVersuch(res, modell, messages, versuchMs, kopf, schreibeKopf, aufraeumen) {
  const controller = new AbortController();
  const frist = setTimeout(() => controller.abort(), versuchMs);
  let begonnen = false;
  try {
    const upstream = await fetch(`${VISION_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${VISION_API_KEY}` },
      body: JSON.stringify({ model: modell, messages, stream: true, temperature: 0.3, max_tokens: 1024 })
    });
    if (!upstream.ok || !upstream.body) {
      await upstream.text().catch(() => "");
      return upstream.status === 404 || upstream.status === 400 ? "modell-weg" : "voruebergehend";
    }
    const { inhalt } = await pipeMitInhalt(upstream.body, res, () => {
      aufraeumen();
      if (kopf.draussen) res.write(modellKommentar(`groq:${modell}`, modell, "false"));
      else schreibeKopf(modell);
    }, { beiErstemInhalt: () => { begonnen = true; clearTimeout(frist); } });
    if (!inhalt) return "voruebergehend"; // leere Antwort: nichts gesendet, neuer Versuch
    res.end();
    return "ok";
  } catch {
    // Abbruch mitten in einer schon sichtbaren Antwort: sauber schliessen statt neu fragen.
    if (begonnen) { if (!res.writableEnded) res.end(); return "ok"; }
    return "voruebergehend";
  } finally {
    clearTimeout(frist);
  }
}

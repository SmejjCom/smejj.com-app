// smejj.com — User-Feedback & Continuous Learning Flywheel Autopilot (Autopilot Nr. 19)
// Erfasst reale Nutzer-Interaktionen (Kopieren, Neu generieren, Bearbeiten, Thumbs),
// anonymisiert persönliche Daten (PII-Scrubbing) und erzeugt saubere DPO-Trainingspaare auf IDrive e2 S3.

import { createRecordStore, neueKennung } from "../admin/recordStore.js";
import { createDpoPair, saveDpoPair } from "./selfImprovementAutopilot.js";

const userFeedbackStore = createRecordStore("self-improvement/user-feedback-events", { maximal: 2000 });

/** Testhilfe: leert die (Memory-)Ablage, damit Tests einander nicht sehen. */
export function __feedbackAblageLeeren() { userFeedbackStore.__leeren(); }

/**
 * Anonymisiert sensible persönliche Daten (PII-Filter).
 * @param {string} text
 * @returns {string}
 */
export function scrubPiiData(text) {
  if (typeof text !== "string") return "";
  let clean = text;

  // 1. API-Keys & Tokens zuerst maskieren (z. B. sk-..., bearer ...)
  clean = clean.replace(/(?:sk-[a-zA-Z0-9_-]{10,}|bearer\s+[a-zA-Z0-9_.+-]+)/gi, "[KEY_MASKED]");

  // 2. E-Mails maskieren
  clean = clean.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, "[EMAIL_MASKED]");

  // 3. IP-Adressen maskieren
  clean = clean.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP_MASKED]");

  // 4. Telefonnummern maskieren
  clean = clean.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[PHONE_MASKED]");

  return clean;
}

// Erlaubte Signale. "thumbs_down" fehlte bis 2026-08-13 — ausgerechnet das
// wichtigste Signal des Schwungrads: erst die Nicht-hilfreich-Klicks machen
// aus Nutzerverhalten eine Arbeitsliste. Alles andere wird abgewiesen, damit
// der Store keine erfundenen Kategorien ansammelt.
export const SIGNAL_TYPEN = Object.freeze(["thumbs_up", "thumbs_down", "copy", "regenerate", "edit"]);

/**
 * Verarbeitet ein Nutzer-Feedback-Signal und erzeugt bei Eignung ein DPO-Trainingspaar.
 * @param {object} signal { prompt, chosenResponse, rejectedResponse, signalType: siehe SIGNAL_TYPEN }
 * @param {object} options
 * @returns {Promise<{ok: boolean, processed: boolean, dpoPairId?: string, reason?: string}>}
 */
export async function processUserFeedbackSignal(signal, { env = process.env } = {}) {
  try {
    const prompt = scrubPiiData(String(signal.prompt || "").trim());
    const chosen = scrubPiiData(String(signal.chosenResponse || "").trim());
    const rejected = scrubPiiData(String(signal.rejectedResponse || "").trim());
    const signalType = signal.signalType || "copy";
    if (!SIGNAL_TYPEN.includes(signalType)) {
      return { ok: false, processed: false, reason: `Unbekannter Signaltyp "${String(signalType).slice(0, 30)}".` };
    }

    if (!prompt || prompt.length < 5) {
      return { ok: false, processed: false, reason: "Prompt zu kurz oder ungültig." };
    }

    // Speichere Roh-Event im Feedback-Store. Bei "nicht hilfreich" wandert
    // eine (PII-bereinigte) Kostprobe der Antwort mit hinein — sie ist das,
    // was die Werkstatt spaeter als Arbeitsauftrag lesen muss. Ohne sie
    // wuesste das Backlog nur DASS etwas schlecht war, nie WAS.
    await userFeedbackStore.schreib({
      id: neueKennung("fb"),
      signalType,
      promptSample: prompt.slice(0, 100),
      antwortSample: signalType === "thumbs_down" ? rejected.slice(0, 160) : undefined,
      hasChosen: Boolean(chosen),
      hasRejected: Boolean(rejected),
      createdAt: new Date().toISOString()
    }, { env, timeoutMs: 20_000 });

    // Wenn ein gewähltes und ein verworfenes Antwortpaar existiert -> DPO-Paar erzeugen
    if (chosen && rejected && chosen !== rejected) {
      const dpo = createDpoPair(prompt, chosen, rejected, {
        source: `user_flywheel_${signalType}`,
        verifiedAt: new Date().toISOString(),
        anonymized: true
      });
      const saveRes = await saveDpoPair(dpo, { env });
      return { ok: true, processed: true, dpoPairId: dpo.id };
    }

    return { ok: true, processed: false, reason: "Signal erfasst (warten auf Vergleichspaar)." };
  } catch (err) {
    return { ok: false, processed: false, reason: String(err?.message || err) };
  }
}

/**
 * Der gemessene Zustand des Schwungrads — echte Zahlen aus dem Store, kein
 * Etikett. (Bis 2026-08-13 stand hier wortwoertlich `status:
 * "active_24_7_flywheel"` — eine Behauptung, die unabhaengig vom Zustand
 * immer gleich lautete. Genau die Art Selbstauskunft, die der Beschluss vom
 * 2026-08-12 verbietet.)
 *
 * @returns {Promise<{ok: boolean, gesamt: number, jeTyp: object,
 *   negativeLetzte7Tage: Array<{promptSample: string, antwortSample?: string, createdAt: string}>,
 *   grund?: string}>}
 */
export async function getUserFlywheelStats({ env = process.env, jetztMs = Date.now() } = {}) {
  try {
    const listRes = await userFeedbackStore.liste({ env });
    if (!listRes?.ok) {
      return { ok: false, gesamt: 0, jeTyp: {}, negativeLetzte7Tage: [], grund: "Feedback-Ablage nicht lesbar" };
    }
    const ereignisse = listRes.datensaetze || [];
    const jeTyp = {};
    for (const e of ereignisse) {
      const typ = String(e?.signalType || "unbekannt");
      jeTyp[typ] = (jeTyp[typ] || 0) + 1;
    }
    const wochenGrenze = jetztMs - 7 * 24 * 60 * 60 * 1000;
    const negativeLetzte7Tage = ereignisse
      .filter((e) => e?.signalType === "thumbs_down" && Date.parse(e?.createdAt || "") >= wochenGrenze)
      .map((e) => ({ promptSample: e.promptSample || "", antwortSample: e.antwortSample, createdAt: e.createdAt }));
    return { ok: true, gesamt: ereignisse.length, jeTyp, negativeLetzte7Tage };
  } catch (fehler) {
    return { ok: false, gesamt: 0, jeTyp: {}, negativeLetzte7Tage: [], grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

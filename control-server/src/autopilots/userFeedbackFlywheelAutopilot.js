// smejj.com — User-Feedback & Continuous Learning Flywheel Autopilot (Autopilot Nr. 19)
// Erfasst reale Nutzer-Interaktionen (Kopieren, Neu generieren, Bearbeiten, Thumbs),
// anonymisiert persönliche Daten (PII-Scrubbing) und erzeugt saubere DPO-Trainingspaare auf IDrive e2 S3.

import { createRecordStore } from "../admin/recordStore.js";
import { createDpoPair, saveDpoPair } from "./selfImprovementAutopilot.js";

const userFeedbackStore = createRecordStore("self-improvement/user-feedback-events", { maximal: 2000 });

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

/**
 * Verarbeitet ein Nutzer-Feedback-Signal und erzeugt bei Eignung ein DPO-Trainingspaar.
 * @param {object} signal { prompt, chosenResponse, rejectedResponse, signalType: "copy" | "regenerate" | "thumbs_up" | "edit" }
 * @param {object} options
 * @returns {Promise<{ok: boolean, processed: boolean, dpoPairId?: string, reason?: string}>}
 */
export async function processUserFeedbackSignal(signal, { env = process.env } = {}) {
  try {
    const prompt = scrubPiiData(String(signal.prompt || "").trim());
    const chosen = scrubPiiData(String(signal.chosenResponse || "").trim());
    const rejected = scrubPiiData(String(signal.rejectedResponse || "").trim());
    const signalType = signal.signalType || "copy";

    if (!prompt || prompt.length < 5) {
      return { ok: false, processed: false, reason: "Prompt zu kurz oder ungültig." };
    }

    // Speichere Roh-Event im Feedback-Store
    await userFeedbackStore.schreib({
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      signalType,
      promptSample: prompt.slice(0, 100),
      hasChosen: Boolean(chosen),
      hasRejected: Boolean(rejected),
      createdAt: new Date().toISOString()
    }, { env });

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
 * Gibt den aktuellen Status des User-Feedback-Schwungrads zurück.
 * @param {object} options
 * @returns {Promise<{totalEvents: number, status: string}>}
 */
export async function getUserFlywheelStats({ env = process.env } = {}) {
  try {
    const listRes = await userFeedbackStore.liste({ env });
    return {
      totalEvents: listRes.datensaetze?.length || 0,
      status: "active_24_7_flywheel",
      piiScrubbingActive: true
    };
  } catch {
    return { totalEvents: 0, status: "active_24_7_flywheel", piiScrubbingActive: true };
  }
}

// smejj.com — User-Feedback & Continuous Learning Flywheel Autopilot (Autopilot Nr. 19)
// Erfasst reale Nutzer-Interaktionen (Kopieren, Neu generieren, Bearbeiten, Thumbs),
// anonymisiert persönliche Daten (PII-Scrubbing) und erzeugt saubere DPO-Trainingspaare auf IDrive e2 S3.

import { createHash } from "node:crypto";
import { createRecordStore, neueKennung } from "../admin/recordStore.js";
import { createDpoPair, saveDpoPair } from "./selfImprovementAutopilot.js";

const userFeedbackStore = createRecordStore("self-improvement/user-feedback-events", { maximal: 2000 });

// Wie weit zurueck ein Gegenstueck gesucht wird. Zwei Bewertungen derselben
// Frage liegen fast immer Minuten auseinander, manchmal Tage — aber nach vier
// Wochen ist die Antwort meist von einem anderen Modell und der Vergleich sagt
// nichts mehr ueber Qualitaet, nur ueber Versionsstaende.
const PAARFENSTER_MS = 28 * 24 * 60 * 60 * 1000;

/** Verknuepfungsschluessel zweier Bewertungen: derselbe Prompt, bereinigt. */
export function promptFingerabdruck(bereinigterPrompt) {
  return createHash("sha256").update(String(bereinigterPrompt || "")).digest("hex").slice(0, 32);
}

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
/**
 * Sucht zu einer Bewertung die entgegengesetzte auf DIESELBE Frage.
 *
 * Bewusst tolerant beim Lesen, streng beim Paaren: alte Ereignisse (vor dem
 * 06.09.2026) haben weder `fingerabdruck` noch `antwortVoll` und koennen daher
 * nie ein Gegenstueck sein. Sie werden uebergangen statt in ein halbes Paar
 * gezwungen — ein Trainingspaar mit leerer Seite ist schlechter als keines.
 *
 * @returns {Promise<object|null>} das Gegenstueck, oder null
 */
async function sucheGegenstueck({ fingerabdruck, signalType, eigeneAntwort, env, jetztMs }) {
  if (signalType !== "thumbs_up" && signalType !== "thumbs_down") return null;
  if (!eigeneAntwort) return null;
  const gesucht = signalType === "thumbs_up" ? "thumbs_down" : "thumbs_up";

  let liste;
  try {
    liste = await userFeedbackStore.liste({ env });
  } catch {
    return null; // Ablage nicht lesbar: lieber kein Paar als ein falsches
  }
  if (!liste?.ok) return null;

  const treffer = (liste.datensaetze || []).filter((e) => e
    && e.gepaart !== true
    && e.signalType === gesucht
    && e.fingerabdruck === fingerabdruck
    && typeof e.antwortVoll === "string"
    && e.antwortVoll.length > 0
    && e.antwortVoll !== eigeneAntwort
    && jetztMs - Date.parse(e.createdAt || 0) <= PAARFENSTER_MS);

  if (treffer.length === 0) return null;
  // Das juengste Gegenstueck: es stammt am ehesten aus demselben Modellstand.
  treffer.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  return treffer[0];
}

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
    //
    // SEIT 2026-09-06 kommen drei Felder dazu: `fingerabdruck`, `promptVoll`
    // und `antwortVoll`. Ohne sie war ein Ereignis eine Sackgasse — 100 Zeichen
    // Prompt und (nur bei Daumen runter) 160 Zeichen Antwort ergeben kein
    // Trainingspaar. Gespeichert wurde also zwei Monate lang etwas, das seinen
    // eigenen Zweck nicht erfuellen konnte. Alles Neue ist ebenfalls durch
    // scrubPiiData gelaufen; die E-Mail des Klickenden bleibt weiter draussen.
    const fingerabdruck = promptFingerabdruck(prompt);
    const eigeneAntwort = (chosen || rejected).slice(0, 4000);
    const jetzt = new Date().toISOString();
    const eigenesEreignis = {
      id: neueKennung("fb"),
      signalType,
      fingerabdruck,
      promptSample: prompt.slice(0, 100),
      promptVoll: prompt.slice(0, 2000),
      antwortVoll: eigeneAntwort || undefined,
      antwortSample: signalType === "thumbs_down" ? rejected.slice(0, 160) : undefined,
      hasChosen: Boolean(chosen),
      hasRejected: Boolean(rejected),
      gepaart: false,
      createdAt: jetzt
    };

    // Fall 1: beide Seiten kommen in EINEM Aufruf (z. B. "neu generieren",
    // wo alte und neue Antwort zugleich vorliegen).
    if (chosen && rejected && chosen !== rejected) {
      eigenesEreignis.gepaart = true;
      await userFeedbackStore.schreib(eigenesEreignis, { env, timeoutMs: 20_000 });
      const dpo = createDpoPair(prompt, chosen, rejected, {
        source: `user_flywheel_${signalType}`,
        verifiedAt: jetzt,
        anonymized: true
      });
      await saveDpoPair(dpo, { env });
      return { ok: true, processed: true, dpoPairId: dpo.id, paarQuelle: "ein_aufruf" };
    }

    // Fall 2: ein einzelner Daumen. Er allein ergibt nie ein Paar — hoch UND
    // runter im selben Aufruf kann es per Bauart nicht geben, die Route setzt
    // immer nur eines der beiden Felder. Vorher endete der Vorgang hier mit
    // "warten auf Vergleichspaar", aber es wartete niemand: das Gegenstueck
    // wurde nie gesucht, und deshalb entstand seit dem 16.08.2026 kein
    // einziges Paar. Jetzt wird gesucht.
    const gegenstueck = await sucheGegenstueck({
      fingerabdruck,
      signalType,
      eigeneAntwort,
      env,
      jetztMs: Date.parse(jetzt)
    });

    if (!gegenstueck) {
      await userFeedbackStore.schreib(eigenesEreignis, { env, timeoutMs: 20_000 });
      return { ok: true, processed: false, reason: "Signal erfasst (noch kein Gegenstueck zu dieser Frage)." };
    }

    // Gefunden: die bessere Antwort ist die mit Daumen hoch, die schlechtere die
    // mit Daumen runter — unabhaengig davon, welche zuerst da war.
    const besser = signalType === "thumbs_up" ? eigeneAntwort : gegenstueck.antwortVoll;
    const schlechter = signalType === "thumbs_up" ? gegenstueck.antwortVoll : eigeneAntwort;

    eigenesEreignis.gepaart = true;
    await userFeedbackStore.schreib(eigenesEreignis, { env, timeoutMs: 20_000 });
    // Das Gegenstueck ebenfalls stempeln, sonst baut ein dritter Daumen auf
    // dieselbe Frage ein zweites, gleiches Paar.
    await userFeedbackStore.schreib({ ...gegenstueck, gepaart: true }, { env, timeoutMs: 20_000 });

    const dpo = createDpoPair(prompt, besser, schlechter, {
      source: "user_flywheel_zusammengefuehrt",
      verifiedAt: jetzt,
      anonymized: true
    });
    await saveDpoPair(dpo, { env });
    return { ok: true, processed: true, dpoPairId: dpo.id, paarQuelle: "zusammengefuehrt" };
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

    // Zwei Zahlen, die vorher fehlten — und deren Fehlen der eigentliche Fehler
    // war: der Autopilot lief, meldete gruen, und niemand konnte sehen, dass am
    // Ende nichts herauskam. `gepaart` sagt, wieviel Arbeit wirklich entstand,
    // `wartend` sagt, wieviel noch auf ein Gegenstueck hofft.
    const gepaart = ereignisse.filter((e) => e?.gepaart === true).length;
    const wartend = ereignisse.filter((e) => e?.gepaart !== true
      && (e?.signalType === "thumbs_up" || e?.signalType === "thumbs_down")
      && typeof e?.antwortVoll === "string" && e.antwortVoll.length > 0).length;

    return { ok: true, gesamt: ereignisse.length, jeTyp, negativeLetzte7Tage, gepaart, wartend };
  } catch (fehler) {
    return { ok: false, gesamt: 0, jeTyp: {}, negativeLetzte7Tage: [], grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

// smejj.com — Modul F: Kosten und Budgets (Single Responsibility: Betreiber-Sicht).
//
// DIESES MODUL SAGT AUSDRUECKLICH, WAS ES NICHT WEISS.
//
// Das Mockup versprach "jeder Token wird Nutzer, Modell und Aufgabe
// zugeordnet". Diese Zuordnung gibt es heute nicht: es existiert keine
// Token-Erfassung je Konto und keine Preisliste je Modell. Eine Ansicht, die
// deshalb "0,00 USD" zeigt, waere die gefaehrlichste Zahl im ganzen
// Adminbereich — sie liest sich wie "kostet nichts", heisst aber "wird nicht
// gemessen".
//
// Gezeigt wird deshalb dreierlei, sauber getrennt:
//   1. GEMESSEN     — Budget-Grenzen aus der Umgebung, laufende Reservierungen.
//   2. UEBERNOMMEN  — feste Kostenpositionen aus der Kostenpolitik. Keine
//                     Messung, sondern ein Zitat mit Quellenangabe.
//   3. NICHT ERFASST — was fehlt, damit die Frage "was kostet mich das"
//                     wirklich beantwortet werden kann.
//
// Der wichtigste Befund ist eine Ja/Nein-Frage: IST DAS BUDGET-GATE SCHARF?
// Fehlen die Grenzen in der Umgebung, laesst der Gate keinen Worker mehr
// starten (fail-closed) — das ist sicher, sieht aber wie ein Defekt aus, wenn
// niemand den Grund kennt.
import { readBudgetLimits, evaluateWorkerBudget } from "../budget/budgetGate.js";
import { createWorkerCapacityStore } from "../budget/workerCapacityStore.js";
import { activeWorkerCount } from "../jobs/jobStore.js";

// Zitat aus docs/architecture/FREE_ONLY_MASTER_POLICY.md — bewusst als Zitat
// gekennzeichnet und nicht als Messung. Aendert sich die Politik, aendert sich
// zuerst das Dokument; diese Liste zieht nach.
export const FESTE_POSITIONEN = Object.freeze([
  { dienst: "IDrive e2", zweck: "Object Brain, Hauptspeicher", modell: "Jahrespaket", betragUsdProMonat: null, quelle: "Kostenpolitik" },
  { dienst: "Zeabur / Tencent", zweck: "Control-Server, Notfall- und Minimalbetrieb", modell: "fest", betragUsdProMonat: 6, quelle: "Kostenpolitik" },
  { dienst: "GitHub", zweck: "Code und Pages", modell: "dauerhaft kostenlos", betragUsdProMonat: 0, quelle: "Kostenpolitik" },
  { dienst: "Spaceship", zweck: "Domain und DNS", modell: "bereits bezahlt", betragUsdProMonat: 0, quelle: "Kostenpolitik" },
  { dienst: "Salad", zweck: "Rechenarbeit bei Spitzenbedarf", modell: "pay-per-use hinter Budget-Gate", betragUsdProMonat: null, quelle: "Kostenpolitik" }
]);

// Was fehlt, damit aus Reservierungen echte Ausgaben werden.
export const NICHT_ERFASST = Object.freeze([
  { was: "Token je Konto", warum: "Es gibt keine Erfassung, die Anfragen einem Konto zurechnet." },
  { was: "Token je Modell und Aufgabe", warum: "Der Router protokolliert die Wahl, nicht den Verbrauch." },
  { was: "Preis je Modell", warum: "Die Registry fuehrt Faehigkeiten, keine Preise." },
  { was: "Tatsaechliche Salad-Ausgaben", warum: "Hier stehen Reservierungen, nicht die Abrechnung des Anbieters." }
]);

export async function kostenUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  leseKapazitaet = null,
  zaehleWorker = activeWorkerCount
} = {}) {
  const grenzen = readBudgetLimits(env);
  const aktiveWorker = sicherZaehlen(zaehleWorker);
  const gate = evaluateWorkerBudget({ env, activeWorkers: aktiveWorker, now: new Date(jetztMs).toISOString() });
  const kapazitaet = await holeKapazitaet(env, leseKapazitaet);

  const festeSumme = FESTE_POSITIONEN
    .filter((p) => typeof p.betragUsdProMonat === "number")
    .reduce((summe, p) => summe + p.betragUsdProMonat, 0);

  return {
    ok: true,
    gemessen: {
      budgetGate: {
        // Die eine Frage, die zaehlt.
        scharf: grenzen.configured === true,
        fehlendeGrenzen: grenzen.missing,
        maxUsdProJob: grenzen.maxUsdPerJob || null,
        maxLaufzeitMinuten: grenzen.maxRuntimeMinutes || null,
        maxGleichzeitigeWorker: grenzen.maxConcurrentWorkers,
        naechsterStartErlaubt: gate.approved === true,
        gruende: gate.reasons,
        failClosed: gate.failClosed === true
      },
      aktiveWorker,
      reservierung: kapazitaet
    },
    uebernommen: {
      positionen: FESTE_POSITIONEN,
      festeSummeUsdProMonat: festeSumme,
      quelle: "docs/architecture/FREE_ONLY_MASTER_POLICY.md",
      hinweis: "Zitat aus der Kostenpolitik, keine Messung. Aendert sich etwas, aendert "
        + "sich zuerst das Dokument."
    },
    nichtErfasst: {
      punkte: NICHT_ERFASST,
      hinweis: "Ohne diese Punkte kann kein Ausgaben-Ist gezeigt werden. Eine 0,00 statt "
        + "einer Fehlanzeige waere die gefaehrlichste Zahl im Adminbereich: sie liest sich "
        + "wie \"kostet nichts\", heisst aber \"wird nicht gemessen\"."
    },
    bewertung: bewerte(grenzen, gate, kapazitaet),
    gemessenAm: new Date(jetztMs).toISOString()
  };
}

async function holeKapazitaet(env, leseKapazitaet) {
  try {
    const lesen = leseKapazitaet || (async () => {
      const store = createWorkerCapacityStore({ env });
      return typeof store.snapshot === "function" ? store.snapshot() : { ok: false, reason: "snapshot_nicht_verfuegbar" };
    });
    const ergebnis = await lesen();
    if (!ergebnis?.ok) return { erreichbar: false, grund: ergebnis?.reason || "unbekannt" };
    const s = ergebnis.snapshot || ergebnis;
    return {
      erreichbar: true,
      reserviertUsd: Number(s.reservedUsd || 0),
      obergrenzeUsd: Number(s.maxGlobalReservedUsd || 0),
      belegtePlaetze: Number(s.activeSlots || 0),
      maximalePlaetze: Number(s.maxConcurrentWorkers || 0),
      laeufe: (Array.isArray(s.jobs) ? s.jobs : []).map((j) => ({
        jobId: j.jobId, fristAm: j.deadlineAt || null
      }))
    };
  } catch (error) {
    return { erreichbar: false, grund: String(error?.message || "fehler").slice(0, 120) };
  }
}

function bewerte(grenzen, gate, kapazitaet) {
  if (!grenzen.configured) {
    return "Budget-Gate nicht scharf: es fehlen " + grenzen.missing.join(", ")
      + ". Solange das so ist, startet kein Worker — das ist gewollt, aber es sieht aus wie ein Defekt.";
  }
  if (kapazitaet.erreichbar && kapazitaet.obergrenzeUsd > 0
    && kapazitaet.reserviertUsd >= kapazitaet.obergrenzeUsd) {
    return "Reservierungs-Obergrenze erreicht — neue Laeufe warten.";
  }
  if (!gate.approved) {
    return "Ein neuer Lauf wuerde gerade abgelehnt: " + (gate.reasons[0] || "unbekannter Grund") + ".";
  }
  return "Budget-Gate scharf, ein neuer Lauf waere zulaessig.";
}

function sicherZaehlen(zaehleWorker) {
  try {
    return Number(zaehleWorker()) || 0;
  } catch {
    return 0;
  }
}

// smejj.com — Modul I: Worker und Kapazitaet (Single Responsibility: Betriebssicht).
//
// Zwei Quellen, die verschiedene Fragen beantworten:
//   - Der Kapazitaetsspeicher auf IDrive e2 sagt, wie viele Laeufe gerade einen
//     Platz samt Budget reserviert haben. Das ist die Bremse gegen Kosten.
//   - Die Salad-Container-Gruppe sagt, ob die GPU-Maschine ueberhaupt laeuft.
//
// Beide duerfen ausfallen, ohne dass die Ansicht kippt: faellt eine Quelle weg,
// steht dort "nicht erreichbar" statt einer erfundenen Null. Eine Null waere
// hier gefaehrlich — sie liest sich wie "alles ruhig", obwohl niemand nachsehen
// konnte.
//
// Ausdruecklich rein lesend. Not-Aus und Start bleiben in den bestehenden
// Salad-Routen mit ihren eigenen Bestaetigungsschaltern.
import { createWorkerCapacityStore } from "../budget/workerCapacityStore.js";
import { saladGetContainerGroup } from "../../../src/jobs/saladClient.js";

export async function workerUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  leseKapazitaet = null,
  leseContainer = saladGetContainerGroup
} = {}) {
  const [kapazitaet, container] = await Promise.all([
    holeKapazitaet(env, leseKapazitaet),
    holeContainer(env, leseContainer)
  ]);

  return {
    ok: true,
    kapazitaet,
    container,
    // Der eine Satz, den eine Betreiberin zuerst liest.
    bewertung: bewerte(kapazitaet, container),
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
    const belegt = Number(s.activeSlots || 0);
    const maximal = Number(s.maxConcurrentWorkers || 0);
    return {
      erreichbar: true,
      belegtePlaetze: belegt,
      maximalePlaetze: maximal,
      freiePlaetze: Math.max(0, maximal - belegt),
      reserviertUsd: Number(s.reservedUsd || 0),
      obergrenzeUsd: Number(s.maxGlobalReservedUsd || 0),
      // Nur Job-Kennungen und Fristen — keine Auftragsinhalte.
      laeufe: (Array.isArray(s.jobs) ? s.jobs : []).map((j) => ({
        jobId: j.jobId, gruppe: j.groupName || null, fristAm: j.deadlineAt || null
      }))
    };
  } catch (error) {
    return { erreichbar: false, grund: String(error?.message || "fehler").slice(0, 120) };
  }
}

async function holeContainer(env, leseContainer) {
  try {
    const antwort = await leseContainer(env);
    if (!antwort || antwort.ok === false) {
      return { erreichbar: false, grund: String(antwort?.reason || "salad_nicht_erreichbar").slice(0, 120) };
    }
    const daten = antwort.data || antwort.body || antwort;
    return {
      erreichbar: true,
      name: daten?.name || null,
      zustand: daten?.current_state?.status || null,
      version: daten?.version ?? null,
      laufend: Number(daten?.current_state?.instance_status_counts?.running_count ?? 0),
      angefordert: daten?.replicas ?? null
    };
  } catch (error) {
    return { erreichbar: false, grund: String(error?.message || "fehler").slice(0, 120) };
  }
}

function bewerte(kapazitaet, container) {
  if (!kapazitaet.erreichbar && !container.erreichbar) return "keine Quelle erreichbar";
  if (kapazitaet.erreichbar && kapazitaet.freiePlaetze === 0 && kapazitaet.maximalePlaetze > 0) {
    return "alle Plaetze belegt — neue Laeufe warten";
  }
  if (container.erreichbar && container.zustand && container.zustand !== "running" && kapazitaet.belegtePlaetze > 0) {
    return "Laeufe reserviert, aber die Maschine laeuft nicht";
  }
  if (!container.erreichbar) return "Kapazitaet bekannt, Maschine nicht erreichbar";
  if (!kapazitaet.erreichbar) return "Maschine bekannt, Kapazitaet nicht erreichbar";
  return "unauffaellig";
}

// smejj.com — Modul G: Modelle und Provider (Single Responsibility: Betriebssicht).
//
// Rein lesend. Die Daten liegen bereits vor — Registry, Laufzeit-Konfiguration
// und Gesundheitsdaten der Backends. Dieses Modul fasst sie so zusammen, dass
// eine Betreiberin in wenigen Sekunden sieht, welches Modell antwortet und
// welches nicht.
//
// Die Registry kennt drei verschiedene Fragen, die oft verwechselt werden:
//   - aktiv           — ist das Modell ueberhaupt eingeschaltet?
//   - eingerichtet    — ist ein Endpunkt samt Zugang hinterlegt?
//   - erreichbar      — hat es zuletzt tatsaechlich geantwortet?
// Ein Modell kann eingeschaltet und eingerichtet sein und trotzdem nicht
// antworten. Genau dieser Fall ist der interessante, deshalb steht er in einer
// eigenen Spalte statt in einem gemeinsamen "Status".
import { getPublicModelRegistry } from "../../../src/shared/modelRegistry.js";
import { getModelRuntimeHealthSnapshot } from "../llm/modelRuntimeHealth.js";

/**
 * @returns {{ok: true, total, aktiv, erreichbar, standard, modelle: Array, anbieter: Array}}
 */
export function modellUebersicht({ env = process.env, gesundheit = null } = {}) {
  const health = gesundheit || getModelRuntimeHealthSnapshot();
  const registry = getPublicModelRegistry(env, health);
  const roh = Array.isArray(registry?.models) ? registry.models : [];

  const modelle = roh.map((m) => ({
    id: m.id,
    name: m.name,
    anbieter: m.provider,
    status: m.status,
    aktiv: m.active === true,
    eingerichtet: m.runtimeConfigured === true,
    erreichbar: m.runtimeAvailable === true,
    standard: m.default === true,
    rueckfallModellId: m.fallbackModelId || null,
    kontextTokens: m.contextTokens || null,
    programmierfaehig: m.codingCapability || null,
    laufzeitModell: m.runtime?.model || null,
    // Gesundheit bewusst flach und bewusst UNVOLLSTAENDIG: die Registry liefert
    // in `health.reason` den Fehlerwortlaut mit. Ein Modell zitiert im
    // Fehlerfall gern die Anfrage — damit waere Nutzerinhalt auf einem
    // Betriebsbildschirm gelandet, an dem jede Adminrolle sitzen darf.
    // Uebernommen wird nur, was den Betrieb interessiert: wie oft es in Folge
    // schiefging, welcher Zustand gemeldet wurde und wann zuletzt geprueft.
    fehlschlaegeInFolge: Number(m.runtime?.health?.consecutiveFailures || 0),
    gesundheitsstand: m.runtime?.health?.status || null,
    zuletztGeprueftAm: m.runtime?.health?.checkedAt || null
  }));

  return {
    ok: true,
    total: modelle.length,
    aktiv: modelle.filter((m) => m.aktiv).length,
    erreichbar: modelle.filter((m) => m.erreichbar).length,
    standard: registry?.defaultModelId || null,
    modelle: modelle.sort(sortiereNachDringlichkeit),
    anbieter: nachAnbieter(modelle)
  };
}

/**
 * Was kaputt ist, steht oben. Ein Betriebsbildschirm, der alphabetisch sortiert,
 * verlangt von der Betreiberin, den Ausfall selbst zu suchen.
 */
function sortiereNachDringlichkeit(a, b) {
  const rang = (m) => {
    if (m.aktiv && m.eingerichtet && !m.erreichbar) return 0; // eingeschaltet, antwortet aber nicht
    if (m.aktiv && !m.eingerichtet) return 1;                 // eingeschaltet, gar nicht eingerichtet
    if (m.aktiv) return 2;
    return 3;
  };
  const unterschied = rang(a) - rang(b);
  if (unterschied !== 0) return unterschied;
  if (a.standard !== b.standard) return a.standard ? -1 : 1;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function nachAnbieter(modelle) {
  const karte = new Map();
  for (const m of modelle) {
    const schluessel = m.anbieter || "unbekannt";
    const eintrag = karte.get(schluessel) || { anbieter: schluessel, total: 0, aktiv: 0, erreichbar: 0 };
    eintrag.total += 1;
    if (m.aktiv) eintrag.aktiv += 1;
    if (m.erreichbar) eintrag.erreichbar += 1;
    karte.set(schluessel, eintrag);
  }
  return [...karte.values()].sort((a, b) => b.total - a.total);
}

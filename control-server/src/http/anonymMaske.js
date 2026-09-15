// smejj.com — was nicht angemeldete Aufrufer von den Status-Routen sehen duerfen.
//
// Befund S6 der E2E-Sicherheitspruefung (14./15.09.2026, live ohne Anmeldung gemessen):
// /api/health, /api/models/status, /api/models/*/status und /api/workers/preflight
// verrieten Bucket-Namen und -Host, Env-Variablennamen (IDRIVE_E2_MODEL_BUCKET),
// Objektschluessel-Praefixe, Worker-Hardware und Kontingente, die Kostenpolitik und
// Suchverbrauch. Niemand liest diese Felder anonym (grep ueber status.js, Waechter,
// Autopiloten, Tests) — angemeldete Aufrufer bekommen weiter die volle Antwort.
// Betreiber 15.09.2026: "Ich gebe dir alle Rechte von A bis Z 100 %."
//
// Rein und ohne I/O, arbeitet auf Kopien — die Eingabe bleibt unveraendert.

const kopie = (wert) => (wert === undefined ? undefined : JSON.parse(JSON.stringify(wert)));

function registryOhneInterna(registry) {
  if (!registry || !Array.isArray(registry.models)) return registry;
  return { ...registry, models: registry.models.map(({ storage, ...rest }) => rest) };
}

/** /api/health fuer Anonyme: Zustand ja, Innenleben nein. */
export function maskiereHealthFuerAnonyme(payload) {
  const p = kopie(payload) || {};
  delete p.costPolicy;
  if (p.trainingsSpeicher && typeof p.trainingsSpeicher === "object") p.trainingsSpeicher = { ok: p.trainingsSpeicher.ok, stufe: p.trainingsSpeicher.stufe };
  if (p.suchquelle && typeof p.suchquelle === "object") p.suchquelle = { konfiguriert: Boolean(p.suchquelle.konfiguriert) };
  if (p.smejjAlias && typeof p.smejjAlias === "object" && p.smejjAlias.live !== true) p.smejjAlias = { ...p.smejjAlias, grund: "kein eigenes Modell live" };
  p.modelRegistry = registryOhneInterna(p.modelRegistry);
  return p;
}

function modellErgebnisOhneInterna(ergebnis) {
  if (!ergebnis || typeof ergebnis !== "object") return ergebnis;
  const e = { ...ergebnis };
  if (e.liveStorage && typeof e.liveStorage === "object") {
    const { bucket, prefix, message, missing, ...rest } = e.liveStorage;
    e.liveStorage = rest;
  }
  if (e.model && typeof e.model === "object") {
    const { source, storage, ...rest } = e.model;
    if (rest.sourceArchive && typeof rest.sourceArchive === "object") {
      const { prefix, archivedObjects, ...archiv } = rest.sourceArchive;
      rest.sourceArchive = archiv;
    }
    e.model = rest;
  }
  if (e.modelStatus) e.modelStatus = modellErgebnisOhneInterna(e.modelStatus);
  if (e.preflight && typeof e.preflight === "object") {
    const { facts, ...rest } = e.preflight;
    e.preflight = rest;
  }
  if (e.runtime && typeof e.runtime === "object") {
    const { storage, ...rest } = e.runtime;
    e.runtime = rest;
  }
  return e;
}

/** Modell-Status, Modell-Liste und Worker-Preflight fuer Anonyme. */
export function maskiereModellStatusFuerAnonyme(payload) {
  const p = modellErgebnisOhneInterna(kopie(payload) || {});
  if (Array.isArray(p.models)) p.models = p.models.map(modellErgebnisOhneInterna);
  if (p.registry) p.registry = registryOhneInterna(p.registry);
  return p;
}

// con-Autopilot — Versionsregister in e2 (Single Responsibility: registry.json lesen/schreiben, Versionsregel).
//
// Eine neue Nummer gibt es NUR ueber promote() nach einem PROMOTE-Urteil von
// bewertung.vergleiche(). Nichts hier zaehlt blind hoch.
export const REGISTRY_KEY = "con/registry.json";
export const STATUS = Object.freeze({ CANDIDATE: "candidate", STABLE: "stable", REJECTED: "rejected", SUPERSEDED: "superseded" });

/**
 * Versionsnummer der Familie con. ZWEI Stellen, so wie der Auftrag es vorgibt:
 * con 1.0 → con 1.1 → con 1.2 → … Eine dritte Stelle gibt es nicht.
 * Alte dreistellige Namen (con-1.0.0) werden noch GELESEN, damit vorhandene Staende
 * nicht verlorengehen — geschrieben wird ausschliesslich zweistellig.
 */
export function parseVersion(v) {
  const m = String(v || "").match(/^con-(\d+)\.(\d+)(?:\.(\d+))?$/);
  return m ? { major: +m[1], minor: +m[2] } : null;
}

export function formatVersion({ major, minor }) {
  return `con-${major}.${minor}`;
}

/**
 * Naechste Nummer: neue Basis erhoeht die erste Stelle, ein neuer Adapter oder Datensatz
 * die zweite. `vergeben` sind alle schon benutzten Namen — eine Nummer wird NIE zweimal
 * vergeben, sonst ueberschreibt ein neuer Kandidat den Eintrag eines verworfenen Vorgaengers.
 */
export function naechsteVersion(stabil, { basisPrefix, vergeben = [] } = {}) {
  const benutzt = new Set(vergeben);
  if (!stabil) {
    for (let i = 0; i < 100; i += 1) {
      const name = formatVersion({ major: 1, minor: i });
      if (!benutzt.has(name)) return name;
    }
    throw new Error("keine freie Startnummer");
  }
  const v = parseVersion(stabil.version);
  if (!v) throw new Error(`Stabile Version unlesbar: ${stabil.version}`);
  const neueBasis = Boolean(basisPrefix && stabil.basisPrefix && basisPrefix !== stabil.basisPrefix);
  for (let i = 1; i < 200; i += 1) {
    const name = neueBasis
      ? formatVersion({ major: v.major + i, minor: 0 })
      : formatVersion({ major: v.major, minor: v.minor + i });
    if (!benutzt.has(name)) return name;
  }
  throw new Error("keine freie Versionsnummer gefunden");
}

export async function leseRegistry(e2) {
  const r = await e2.getJson(REGISTRY_KEY, null);
  if (!r) throw new Error("con/registry.json fehlt in e2 — Struktur B nicht angelegt");
  r.versions ||= [];
  return r;
}

export async function schreibeRegistry(e2, registry) {
  registry.updatedAt = new Date().toISOString();
  registry.stable = registry.versions.find((v) => v.status === STATUS.STABLE)?.version || null;
  registry.candidate = registry.versions.find((v) => v.status === STATUS.CANDIDATE)?.version || null;
  await e2.putJson(REGISTRY_KEY, registry);
  return registry;
}

export function stabileVersion(registry) {
  return registry.versions.find((v) => v.status === STATUS.STABLE) || null;
}

export function findeVersion(registry, version) {
  return registry.versions.find((v) => v.version === version) || null;
}

/** Kandidat eintragen oder aktualisieren (Status candidate). */
export function trageKandidatEin(registry, eintrag) {
  const alt = findeVersion(registry, eintrag.version);
  const neu = { status: STATUS.CANDIDATE, createdAt: new Date().toISOString(), ...(alt || {}), ...eintrag,
    updatedAt: new Date().toISOString() };
  if (alt) Object.assign(alt, neu); else registry.versions.push(neu);
  return neu;
}

/** PROMOTE: Kandidat wird stable, bisherige stable wird superseded. Nur mit Urteil PROMOTE. */
export function promote(registry, version, urteil, bewertung) {
  if (urteil?.entscheidung !== "PROMOTE") throw new Error("promote() ohne PROMOTE-Urteil verweigert");
  const e = findeVersion(registry, version);
  if (!e) throw new Error(`Version ${version} nicht im Register`);
  for (const v of registry.versions) if (v.status === STATUS.STABLE && v.version !== version) { v.status = STATUS.SUPERSEDED; v.supersededBy = version; v.updatedAt = new Date().toISOString(); }
  e.status = STATUS.STABLE;
  e.promotedAt = new Date().toISOString();
  e.urteil = urteil;
  e.benchmarks = zusammenfassung(bewertung);
  e.bekannteSchwaechen = schwaechen(bewertung);
  return e;
}

export function reject(registry, version, urteil, bewertung) {
  const e = findeVersion(registry, version);
  if (!e) throw new Error(`Version ${version} nicht im Register`);
  e.status = STATUS.REJECTED;
  e.rejectedAt = new Date().toISOString();
  e.urteil = urteil;
  if (bewertung) { e.benchmarks = zusammenfassung(bewertung); e.bekannteSchwaechen = schwaechen(bewertung); }
  return e;
}

export function zusammenfassung(b) {
  if (!b) return null;
  return { gesamt: b.gesamt, kritisch: b.kritisch, faelle: b.faelle, kategorien: b.kategorien, leistung: b.leistung, jobId: b.jobId, suitenStand: b.suitenStand || null, bewertetAm: b.bewertetAm };
}

export function schwaechen(b) {
  if (!b?.faelleDetail) return [];
  return b.faelleDetail.filter((f) => f.score < 1).map((f) => ({ fall: `${f.suite}/${f.id}`, kategorie: f.kategorie, score: f.score, kritisch: f.kritisch, gruende: f.gruende }));
}

// con-Autopilot — Versionsregister in e2 (Single Responsibility: registry.json lesen/schreiben, Versionsregel).
//
// Eine neue Nummer gibt es NUR ueber promote() nach einem PROMOTE-Urteil von
// bewertung.vergleiche(). Nichts hier zaehlt blind hoch.
export const REGISTRY_KEY = "con/registry.json";
export const STATUS = Object.freeze({ CANDIDATE: "candidate", STABLE: "stable", REJECTED: "rejected", SUPERSEDED: "superseded" });

export function parseVersion(v) {
  const m = String(v || "").match(/^con-(\d+)\.(\d+)\.(\d+)$/);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

export function formatVersion({ major, minor, patch }) {
  return `con-${major}.${minor}.${patch}`;
}

/** Naechste Version nach Regel: major = neue Basis, minor = neuer Adapter/Datensatz, patch = nur Konfig/Prompt/Routing. */
export function naechsteVersion(stabil, { basisPrefix, art }) {
  if (!stabil) return "con-1.0.0";
  const v = parseVersion(stabil.version);
  if (!v) throw new Error(`Stabile Version unlesbar: ${stabil.version}`);
  if (basisPrefix && stabil.basisPrefix && basisPrefix !== stabil.basisPrefix) return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
  if (art === "patch") return formatVersion({ ...v, patch: v.patch + 1 });
  return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
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

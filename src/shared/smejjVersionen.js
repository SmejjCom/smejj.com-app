// smejj.com — Versionsregister der eigenen smejj-Modelle (reine Logik, ohne Netz).
//
// BETREIBER-AUFTRAG 2026-09-05: "Wenn eine neue Version kommt, soll sie
// automatisch alles uebernehmen." Professionell heisst das: Der API-Key und
// die Nutzer zeigen nie auf eine Versionsnummer, sondern auf den Alias
// "smejj". Der Alias zeigt auf die Version, die im Register "stable" ist.
// Eine neue Version wird stable, wenn sie die Messung besteht — nicht, weil
// sie neuer ist. Alt bleibt im Register (Rueckweg), nichts wird geloescht.
//
// ZWEI STUFEN, bewusst getrennt:
//   stable  = die beste eigene Version (Adapter besser als Basis, besser als
//             die bisherige stable, keine kritischen Sicherheitsfehler).
//   live    = darf der Alias "smejj" im Router auf diese Version zeigen?
//             Nur wenn die Note die Referenz der Live-Kette (GLM-5.2, Nr. 75)
//             erreicht. Sonst bleibt der Alias auf dem Standardmodell — ein
//             4B-Modell, das schlechter antwortet als die Live-Kette, darf
//             Nutzer nicht "uebernehmen", nur weil es unseres ist.
//
// Wer schreibt: Autopilot Nr. 83 (smejj-Versions-Takt) — nicht das Mess-Skript.
// Wer liest: der Router ueber control-server/src/llm/smejjAlias.js.

export const ALIAS = "smejj";
/** Unter zwei Punkten Vorsprung ist ein Unterschied Wuerfeln (evalReport SCORE_REGRESSION_TOLERANCE). */
export const RAUSCHSCHWELLE = 0.02;
export const STATUS = Object.freeze({ STABLE: "stable", ERSETZT: "ersetzt", ABGELEHNT: "abgelehnt", ZURUECKGEROLLT: "zurueckgerollt" });

export function leeresRegister(jetztIso = new Date().toISOString()) {
  return {
    id: "register",
    art: "smejj-versionen",
    alias: ALIAS,
    stable: null,
    live: false,
    liveGrund: "kein eigenes Modell befoerdert",
    referenzNote: null,
    versionen: [],
    verlauf: [],
    createdAt: jetztIso,
    aktualisiert: jetztIso
  };
}

function note(wert) {
  // null/undefined/"" sind KEINE Note — Number(null) waere 0 und damit "gueltig".
  if (wert == null || wert === "") return null;
  const n = Number(wert);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

export function stableEintrag(register) {
  return (register?.versionen || []).find((v) => v.version === register?.stable && v.status === STATUS.STABLE) || null;
}

/**
 * Darf der Alias live auf diese Note zeigen? Referenz kommt in Prozent
 * (Nr. 72/75: "97,1 %"), die Note als Anteil (0..1). Ohne Referenz: nein.
 */
export function liveTauglich({ note: n, referenzNote, toleranz = RAUSCHSCHWELLE } = {}) {
  const wert = note(n);
  const ref = Number(referenzNote);
  if (wert == null) return { tauglich: false, grund: "note_fehlt" };
  if (!Number.isFinite(ref) || ref <= 0) return { tauglich: false, grund: "referenz_fehlt" };
  const schwelle = ref / 100 - toleranz;
  return wert >= schwelle
    ? { tauglich: true, grund: `Note ${(wert * 100).toFixed(1)} % erreicht Referenz ${ref} %` }
    : { tauglich: false, grund: `Note ${(wert * 100).toFixed(1)} % unter Referenz ${ref} % (Toleranz ${toleranz * 100} Punkte)` };
}

/**
 * Wird der Kandidat stable? Fail-closed: jede fehlende Zahl ist ein Nein.
 * @param {{version:string, note:number, kritisch?:number}} kandidat
 * @param {{note:number}|null} stabil   bisherige stable-Version
 * @param {{note:number}|null} basis    Basismodell NACKT aus derselben Messung
 */
export function entscheideBefoerderung({ kandidat, stabil = null, basis = null, rauschschwelle = RAUSCHSCHWELLE } = {}) {
  const gruende = [];
  const kn = note(kandidat?.note);
  if (!kandidat?.version) gruende.push("kandidat_ohne_version");
  if (kn == null) gruende.push("kandidat_ohne_note");
  const kritisch = Number(kandidat?.kritisch || 0);
  if (kritisch > 0) gruende.push(`kritische_fehler:${kritisch}`);
  let delta = null;
  if (kn != null && basis) {
    const bn = note(basis.note);
    if (bn == null) gruende.push("basis_ohne_note");
    else if (kn <= bn) gruende.push(`nicht_besser_als_basis:${((kn - bn) * 100).toFixed(1)}`);
  }
  if (kn != null && stabil) {
    const sn = note(stabil.note);
    if (sn == null) gruende.push("stabil_ohne_note");
    else {
      delta = kn - sn;
      if (delta < rauschschwelle) gruende.push(`kein_messbarer_vorsprung:${(delta * 100).toFixed(1)}`);
    }
  }
  return { befoerdern: gruende.length === 0, gruende, delta };
}

function eintragAus(bewertung, jetztIso, status) {
  return {
    version: bewertung.version,
    status,
    note: note(bewertung.note),
    basisNote: note(bewertung.basisNote),
    kritisch: Number(bewertung.kritisch || 0),
    faelle: Number(bewertung.faelle || 0),
    jobId: bewertung.jobId || null,
    adapterPrefix: bewertung.adapterPrefix || null,
    referenzNote: Number.isFinite(Number(bewertung.referenzNote)) ? Number(bewertung.referenzNote) : null,
    seit: jetztIso
  };
}

/** Kandidat wird stable; die alte stable-Version bleibt als "ersetzt" fuer den Rueckweg. */
export function haengeUm(register, bewertung, { jetztIso = new Date().toISOString() } = {}) {
  const alt = stableEintrag(register);
  const versionen = (register.versionen || [])
    .filter((v) => v.version !== bewertung.version)
    .map((v) => (v.status === STATUS.STABLE ? { ...v, status: STATUS.ERSETZT, ersetztAm: jetztIso } : v));
  const neu = eintragAus(bewertung, jetztIso, STATUS.STABLE);
  const live = liveTauglich({ note: neu.note, referenzNote: neu.referenzNote });
  return {
    ...register,
    stable: neu.version,
    live: live.tauglich,
    liveGrund: live.grund,
    referenzNote: neu.referenzNote ?? register.referenzNote ?? null,
    versionen: [...versionen, neu],
    verlauf: [{ zeit: jetztIso, art: "befoerdert", von: alt?.version || null, nach: neu.version, note: neu.note, live: live.tauglich }, ...(register.verlauf || [])].slice(0, 50),
    aktualisiert: jetztIso
  };
}

/** Abgelehnter Kandidat wird mit Gruenden im Register vermerkt — nichts sonst aendert sich. */
export function lehneAb(register, bewertung, gruende, { jetztIso = new Date().toISOString() } = {}) {
  const versionen = (register.versionen || []).filter((v) => !(v.version === bewertung.version && v.status !== STATUS.STABLE));
  if (versionen.some((v) => v.version === bewertung.version)) {
    // Die stable-Version selbst wird nie durch eine schlechtere Neumessung verdraengt.
    return { ...register, verlauf: [{ zeit: jetztIso, art: "abgelehnt", nach: bewertung.version, gruende }, ...(register.verlauf || [])].slice(0, 50), aktualisiert: jetztIso };
  }
  return {
    ...register,
    versionen: [...versionen, { ...eintragAus(bewertung, jetztIso, STATUS.ABGELEHNT), gruende }],
    verlauf: [{ zeit: jetztIso, art: "abgelehnt", nach: bewertung.version, gruende }, ...(register.verlauf || [])].slice(0, 50),
    aktualisiert: jetztIso
  };
}

/** Rueckweg: die juengste ersetzte Version wird wieder stable; ohne eine solche bleibt alles. */
export function rolleZurueck(register, grund, { jetztIso = new Date().toISOString() } = {}) {
  const aktuell = stableEintrag(register);
  const ersetzt = (register.versionen || []).filter((v) => v.status === STATUS.ERSETZT).sort((a, b) => String(b.ersetztAm || "").localeCompare(String(a.ersetztAm || "")));
  const ziel = ersetzt[0] || null;
  if (!aktuell) return { register, zurueckgerollt: false, grund: "keine_stable_version" };
  const versionen = (register.versionen || []).map((v) => {
    if (v.version === aktuell.version) return { ...v, status: STATUS.ZURUECKGEROLLT, zurueckgerolltAm: jetztIso, grund };
    if (ziel && v.version === ziel.version) return { ...v, status: STATUS.STABLE, ersetztAm: undefined };
    return v;
  });
  const live = ziel ? liveTauglich({ note: ziel.note, referenzNote: ziel.referenzNote ?? register.referenzNote }) : { tauglich: false, grund: "kein Rueckweg-Ziel — Alias auf Standardmodell" };
  return {
    zurueckgerollt: true,
    grund,
    register: {
      ...register,
      stable: ziel?.version || null,
      live: live.tauglich,
      liveGrund: live.grund,
      versionen,
      verlauf: [{ zeit: jetztIso, art: "zurueckgerollt", von: aktuell.version, nach: ziel?.version || null, grund }, ...(register.verlauf || [])].slice(0, 50),
      aktualisiert: jetztIso
    }
  };
}

/** Live-Schalter des Alias — z. B. AUS, wenn die Laufzeit des eigenen Modells rot ist. */
export function schalteLive(register, an, grund, { jetztIso = new Date().toISOString() } = {}) {
  if (Boolean(register.live) === Boolean(an)) return register;
  return {
    ...register,
    live: Boolean(an) && Boolean(register.stable),
    liveGrund: grund,
    verlauf: [{ zeit: jetztIso, art: an ? "live_an" : "live_aus", nach: register.stable, grund }, ...(register.verlauf || [])].slice(0, 50),
    aktualisiert: jetztIso
  };
}

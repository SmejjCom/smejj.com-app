// con-Autopilot — Kostenwaechter (Single Responsibility: darf JETZT GPU-Zeit gekauft werden?).
//
// Tagesbudget (Standard 5 EUR ≈ CON_TAGESBUDGET_USD 5.5) und Gesamtdeckel je
// Auftrag. Der Verbrauch wird in e2 fortgeschrieben (con/logs/kosten/JJJJ-MM-TT.json),
// nie nur im Arbeitsspeicher — ein Neustart darf den Zaehler nicht auf null setzen.
// Gerechnet wird mit der GEBUCHTEN Zeit (Gruppe laeuft), nicht mit Trainingsminuten:
// die Lehre vom 2026-08-06 (Deckel zaehlte Arbeit, Karte lief rund um die Uhr).
export const GPU_KLASSEN = Object.freeze({
  // id -> {name, vramGb, usdProStunde je Prioritaet} — Stand Salad-API 2026-09-03
  "a5db5c50-cbcb-4596-ae80-6a0c8090d80f": { name: "RTX 3090 (24 GB)", vramGb: 24, preis: { high: 0.25, medium: 0.197, low: 0.143, batch: 0.09 } },
  "6d4e9e99-d27e-4751-8d7d-393f7d8ea949": { name: "RTX A5000 (24 GB)", vramGb: 24, preis: { high: 0.25, medium: 0.197, low: 0.143, batch: 0.09 } },
  "9998fe42-04a5-4807-b3a5-849943f16c38": { name: "RTX 3090 Ti (24 GB)", vramGb: 24, preis: { high: 0.28, medium: 0.22, low: 0.16, batch: 0.10 } },
  "ed563892-aacd-40f5-80b7-90c9be6c759b": { name: "RTX 4090 (24 GB)", vramGb: 24, preis: { high: 0.30, medium: 0.253, low: 0.207, batch: 0.16 } }
});
/**
 * Standardauswahl: die drei GUENSTIGEN 24-GB-Karten. Die RTX 4090 ist bewusst NICHT dabei —
 * sie kostet auf Stapel-Prioritaet 0,16 statt 0,09-0,10 USD/h, und der Kostenwaechter rechnet
 * immer mit der teuersten erlaubten Karte. Eine einzige teure Klasse in der Liste hebt damit
 * die Reservierung fuer JEDEN Job um zwei Drittel. Wer sie braucht (Verfuegbarkeit), setzt
 * CON_GPU_KLASSEN ausdruecklich.
 */
export const STANDARD_GPU_KLASSEN = Object.freeze([
  "a5db5c50-cbcb-4596-ae80-6a0c8090d80f", // RTX 3090 (24 GB)   0,09 batch
  "6d4e9e99-d27e-4751-8d7d-393f7d8ea949", // RTX A5000 (24 GB)  0,09 batch
  "9998fe42-04a5-4807-b3a5-849943f16c38"  // RTX 3090 Ti (24 GB) 0,10 batch
]);
export const ALLE_GPU_KLASSEN = Object.freeze(Object.keys(GPU_KLASSEN));
export const PRIORITAETEN = Object.freeze(["high", "medium", "low", "batch"]);

export function teuersterPreisProStunde(gpuKlassen = STANDARD_GPU_KLASSEN, prioritaet = "batch") {
  let max = 0;
  for (const id of gpuKlassen) {
    const p = GPU_KLASSEN[id]?.preis?.[prioritaet];
    if (Number.isFinite(p)) max = Math.max(max, p);
  }
  return max;
}

export function tagesschluessel(datum = new Date()) {
  return `con/logs/kosten/${datum.toISOString().slice(0, 10)}.json`;
}

/**
 * Zeitgrenze je Betriebsart. Gemessen am 03./04.09. auf einer RTX 3090:
 * ein reiner Messlauf brauchte 36 Minuten (16 Modell holen, 5 auf die Karte, 10 messen),
 * ein Trainingslauf 210. Vorher reservierte JEDER Job die Trainingszeit — das band
 * unnoetig Budget und liess kleine Jobs am Deckel scheitern.
 */
export const MINUTEN_JE_MODUS = Object.freeze({
  messung: 90,
  training: 200,
  "training+messung": 220,
  "spiegel+messung": 200,
  spiegel: 170
});

export function minutenFuer(modus, grenzen) {
  const vorgabe = MINUTEN_JE_MODUS[modus] ?? grenzen.jobMaxMinuten;
  return Math.min(vorgabe, grenzen.jobMaxMinuten);
}

export function leseGrenzen(env = process.env) {
  const tages = Number(env.CON_TAGESBUDGET_USD);
  const gesamt = Number(env.CON_GESAMTDECKEL_USD);
  const jobMinuten = Number(env.CON_JOB_MAX_MINUTEN);
  return {
    tagesbudgetUsd: Number.isFinite(tages) && tages > 0 ? tages : 5.5,
    gesamtdeckelUsd: Number.isFinite(gesamt) && gesamt > 0 ? gesamt : 2.0,
    jobMaxMinuten: Number.isFinite(jobMinuten) && jobMinuten > 0 ? Math.min(jobMinuten, 600) : 170,
    notaus: String(env.CON_NOTAUS || "").toUpperCase() === "YES",
    freigabe: String(env.CON_SALAD_FREIGABE || "").toUpperCase() === "YES"
  };
}

/** Tagesbuch lesen: {datum, jobs:[{jobId, gestartet, beendet, minuten, usd, gpuKlasse, prioritaet, schaetzung}], summeUsd} */
export async function leseTagesbuch(e2, datum = new Date()) {
  const buch = await e2.getJson(tagesschluessel(datum), null);
  return buch || { datum: datum.toISOString().slice(0, 10), jobs: [], summeUsd: 0 };
}

export async function leseGesamtverbrauch(e2) {
  const g = await e2.getJson("con/logs/kosten/gesamt.json", null);
  return g || { summeUsd: 0, jobs: 0, seit: new Date().toISOString() };
}

/** Entscheidung vor einem Start: geplante Kosten = Zeitgrenze × teuerster Stundenpreis der erlaubten Klassen. */
export function darfStarten({ grenzen, tagesbuch, gesamt, gpuKlassen, prioritaet, minuten }) {
  const gruende = [];
  if (grenzen.notaus) gruende.push("notaus_aktiv");
  if (!grenzen.freigabe) gruende.push("keine_salad_freigabe (CON_SALAD_FREIGABE=YES fehlt)");
  const preis = teuersterPreisProStunde(gpuKlassen, prioritaet);
  if (!(preis > 0)) gruende.push("gpu_klasse_ohne_preis");
  const geplant = round((minuten / 60) * preis);
  if ((tagesbuch.summeUsd || 0) + geplant > grenzen.tagesbudgetUsd) gruende.push(`tagesbudget: ${round(tagesbuch.summeUsd)} + ${geplant} > ${grenzen.tagesbudgetUsd} USD`);
  if ((gesamt.summeUsd || 0) + geplant > grenzen.gesamtdeckelUsd) gruende.push(`gesamtdeckel: ${round(gesamt.summeUsd)} + ${geplant} > ${grenzen.gesamtdeckelUsd} USD`);
  return { ok: gruende.length === 0, gruende, geplantUsd: geplant, preisProStunde: preis };
}

/** Beim Start: Reservierung als Schaetzung eintragen (wird beim Ende durch die gemessene Zeit ersetzt). */
export async function bucheStart(e2, { jobId, gpuKlassen, prioritaet, minuten }) {
  const jetzt = new Date();
  const buch = await leseTagesbuch(e2, jetzt);
  const preis = teuersterPreisProStunde(gpuKlassen, prioritaet);
  const usd = round((minuten / 60) * preis);
  buch.jobs.push({ jobId, gestartet: jetzt.toISOString(), beendet: null, minuten, usd, preisProStunde: preis, prioritaet, schaetzung: true });
  buch.summeUsd = round(buch.jobs.reduce((s, j) => s + j.usd, 0));
  await e2.putJson(tagesschluessel(jetzt), buch);
  const g = await leseGesamtverbrauch(e2);
  g.summeUsd = round((g.summeUsd || 0) + usd);
  g.jobs = (g.jobs || 0) + 1;
  await e2.putJson("con/logs/kosten/gesamt.json", g);
  return { usd, preis };
}

/** Beim Ende: Schaetzung durch die gemessene gebuchte Zeit ersetzen (Start der Gruppe bis Stop). */
export async function bucheEnde(e2, { jobId, gestartet, beendet = new Date() }) {
  const start = new Date(gestartet);
  const buch = await leseTagesbuch(e2, start);
  const j = buch.jobs.find((x) => x.jobId === jobId);
  if (!j) return null;
  const minuten = Math.max(1, Math.ceil((beendet.getTime() - start.getTime()) / 60_000));
  const alt = j.usd;
  j.beendet = beendet.toISOString();
  j.minutenGemessen = minuten;
  j.usd = round((minuten / 60) * j.preisProStunde);
  j.schaetzung = false;
  buch.summeUsd = round(buch.jobs.reduce((s, x) => s + x.usd, 0));
  await e2.putJson(tagesschluessel(start), buch);
  const g = await leseGesamtverbrauch(e2);
  g.summeUsd = round((g.summeUsd || 0) - alt + j.usd);
  await e2.putJson("con/logs/kosten/gesamt.json", g);
  return { minuten, usd: j.usd };
}

function round(x) { return Math.round(x * 1000) / 1000; }

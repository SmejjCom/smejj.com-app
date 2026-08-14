// smejj.com — die Kennzahlen der Evolution-Engine, ueber Neustarts hinweg.
//
// WARUM (Befund 2026-08-14): Der Aktionszaehler lebte in einem Ringpuffer im
// Prozess. Jeder Push deployt den Control-Server — und setzte damit Abdeckung
// und Qualitaetsnote auf null zurueck. Am Live-Dashboard stand deshalb "3
// Aktionen", obwohl den ganzen Tag gemessen worden war. Ohne Gedaechtnis gibt
// es keine Entwicklung, und ohne Entwicklung ist eine "Evolution Engine" nur
// eine Momentaufnahme.
//
// EIN DATENSATZ JE KALENDERTAG, nicht je Aktion: Wer Tagessummen fuehrt, kann
// Wochen und Monate zeigen, ohne hunderttausend Einzelsaetze zu lesen. Der
// Preis ist, dass die einzelne Aktion nicht mehr auffindbar ist — genau
// richtig, denn sie enthaelt ohnehin keinen Inhalt, nur Art, Note und Klassen.
//
// UTC-TAGE, wie ueberall im Server. Das Dashboard rechnet die Anzeige in die
// Zeit des Betreibers um; die Ablage bleibt bei einem Kalender.

import { createRecordStore } from "../admin/recordStore.js";

const store = createRecordStore("evolution/kennzahlen", { maximal: 400 });
const SCHREIB_ZEITLIMIT_MS = 4_000;

export function tagesId(jetztMs = Date.now()) {
  return `tag-${new Date(jetztMs).toISOString().slice(0, 10)}`;
}

/**
 * Schreibt einen Zuwachs auf den heutigen Tag. Additiv: zwei Prozesse, die
 * gleichzeitig schreiben, koennen sich gegenseitig ueberholen — bei
 * Tagessummen kostet das im schlimmsten Fall einen Takt, nie die Reihe.
 *
 * @param {{jeArt: Object<string,{aktionen:number, gemessen:number, punkteSumme:number, funde:number}>}} zuwachs
 */
export async function merkeKennzahlen(zuwachs, { env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  const jeArt = zuwachs?.jeArt || {};
  if (!Object.keys(jeArt).length) return { ok: true, geschrieben: false, grund: "nichts zu schreiben" };
  const id = tagesId(jetztMs);
  try {
    const bekannt = await store.lies(id, { env, fetchImpl });
    const zusammen = { ...(bekannt?.jeArt || {}) };
    for (const [art, z] of Object.entries(jeArt)) {
      const alt = zusammen[art] || { aktionen: 0, gemessen: 0, punkteSumme: 0, funde: 0 };
      zusammen[art] = {
        aktionen: alt.aktionen + (z.aktionen || 0),
        gemessen: alt.gemessen + (z.gemessen || 0),
        punkteSumme: alt.punkteSumme + (z.punkteSumme || 0),
        funde: alt.funde + (z.funde || 0)
      };
    }
    await store.schreib({
      id,
      tag: id.slice(4),
      createdAt: bekannt?.createdAt || new Date(jetztMs).toISOString(),
      zuletzt: new Date(jetztMs).toISOString(),
      jeArt: zusammen
    }, { env, fetchImpl, timeoutMs: SCHREIB_ZEITLIMIT_MS });
    return { ok: true, geschrieben: true, tag: id.slice(4) };
  } catch (fehler) {
    return { ok: false, geschrieben: false, grund: String(fehler?.message || fehler).slice(0, 120) };
  }
}

/**
 * Die Summe ueber die letzten Tage.
 *
 * Fail-closed: ist die Ablage nicht lesbar, kommt `ok:false` mit Grund — eine
 * Null saehe aus wie "es wurde nichts gemessen", und das ist etwas voellig
 * anderes als "wir konnten nicht nachsehen".
 */
export async function holeKennzahlen({ tage = 30, env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  let gelesen;
  try {
    gelesen = await store.liste({ env, fetchImpl, limit: Math.max(1, Math.min(400, tage)) });
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.message || fehler).slice(0, 120) };
  }
  if (!gelesen?.ok) return { ok: false, grund: gelesen?.error || "Kennzahlen-Ablage nicht lesbar" };

  const grenze = new Date(jetztMs - tage * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const saetze = (gelesen.datensaetze || []).filter((s) => String(s.tag || "") >= grenze);

  const jeArt = new Map();
  for (const satz of saetze) {
    for (const [art, z] of Object.entries(satz.jeArt || {})) {
      const alt = jeArt.get(art) || { art, aktionen: 0, gemessen: 0, punkteSumme: 0, funde: 0 };
      alt.aktionen += z.aktionen || 0;
      alt.gemessen += z.gemessen || 0;
      alt.punkteSumme += z.punkteSumme || 0;
      alt.funde += z.funde || 0;
      jeArt.set(art, alt);
    }
  }
  const arten = [...jeArt.values()]
    .map((z) => ({ art: z.art, aktionen: z.aktionen, gemessen: z.gemessen, funde: z.funde, note: z.gemessen ? Math.round(z.punkteSumme / z.gemessen) : null }))
    .sort((a, b) => b.aktionen - a.aktionen);

  const aktionen = arten.reduce((s, a) => s + a.aktionen, 0);
  const gemessen = arten.reduce((s, a) => s + a.gemessen, 0);
  const punkte = [...jeArt.values()].reduce((s, z) => s + z.punkteSumme, 0);

  return {
    ok: true,
    tage: saetze.length,
    seit: saetze.length ? saetze[saetze.length - 1].tag : null,
    aktionen,
    gemessen,
    abdeckung: aktionen ? Math.round((gemessen / aktionen) * 100) : null,
    qualitaetsNote: gemessen ? Math.round(punkte / gemessen) : null,
    arten
  };
}

/** Nur fuer Tests. */
export function _leereKennzahlenFuerTest() { store.__leeren(); }

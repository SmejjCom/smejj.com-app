// smejj.com — Trainings-Reife-Wache (Autopilot Nr. 65), Betreiber-Freigabe
// 2026-08-26 ("Ich finde deinen Vorschlag gut, kannst du das umsetzen").
//
// WARUM ES SIE GIBT: Das GPU-Training ruht seit 2026-08-06 (Charta §0,
// Salad-Exit), aber die vier self-improvement-Ablagen sammeln weiter DPO-Paare,
// Destillate und Nutzersignale. Bis hier las niemand dagegen: Ob die Datenlage
// für einen Trainingslauf REIF wäre, wusste niemand — die Daten sammelten sich
// blind. Diese Wache rechnet den Bestand gegen ein Ziel und legt das Ergebnis
// als Entscheidungskarte in der Tagesmappe (Nr. 60) ab.
//
// GRENZE, ausdrücklich (dieselbe wie beim Trainings-Takt Nr. 05): Sie STARTET
// kein Training und schätzt KEINE Preise. Der GPU-Lauf bleibt eine neue
// Kostenposition hinter der schriftlichen Betreiber-Freigabe (Rote Liste). Die
// Wache macht aus dem ruhenden Zustand eine Entscheidungsvorlage — mehr nicht.
import { createRecordStore } from "../admin/recordStore.js";
import { isCaptureEnabled } from "../../../src/training/constants.js";
import { TRAININGS_QUELLEN } from "./trainingsTaktAutopilot.js";

/** Die Ablage der Entscheidungskarte — liest die Tagesmappe (Nr. 60). */
export const TRAININGS_REIFE_ABLAGE = "autopiloten/trainings-reife";

/**
 * Das Reife-Ziel: Gesamtzahl der Datensätze über alle vier Ablagen, ab der ein
 * LoRA-Versuch überhaupt Sinn ergibt. Bewusst per Env überschreibbar — die Zahl
 * ist eine Setzung des Betreibers, keine gemessene Wahrheit.
 */
export function reifeZiel({ env = process.env } = {}) {
  const roh = Number(env?.SMEJJ_TRAINING_REIFE_ZIEL_GESAMT);
  return Number.isFinite(roh) && roh > 0 ? Math.floor(roh) : 5000;
}

/**
 * Bewertet die Datenlage in Stufen. Getrennt testbar (kaputt + gesund):
 *   Stufe 0 = leerer Bestand (ehrlicher Anfang)
 *   Stufe 1 = Daten da, unter der Hälfte des Ziels
 *   Stufe 2 = nah dran (ab der Hälfte)
 *   Stufe 3 = reif (Ziel erreicht)
 * Unlesbare Quellen sind immer rot — eine Wache, die eine stumme Ablage als
 * Fortschritt verkauft, wäre eine Attrappe mit Zahlen.
 */
export function beurteileReife(quellen = [], ziel = reifeZiel()) {
  if (!Number.isFinite(ziel) || ziel <= 0) return { ok: false, grund: "Reife-Ziel fehlt oder ist unsinnig" };
  const stumm = quellen.filter((q) => !q.lesbar);
  if (stumm.length) {
    return { ok: false, grund: `${stumm.length} Trainings-Ablage(n) nicht lesbar: ${stumm.map((q) => q.name).join(", ")}` };
  }
  const gesamt = quellen.reduce((s, q) => s + (q.anzahl || 0), 0);
  if (gesamt <= 0) {
    return { ok: true, stufe: 0, gesamt, anteil: 0, grund: `Noch 0 von ${ziel} Datensätzen — ehrlicher Anfang` };
  }
  const anteil = gesamt / ziel;
  const stufe = anteil >= 1 ? 3 : anteil >= 0.5 ? 2 : 1;
  return { ok: true, stufe, gesamt, anteil, grund: `${gesamt} von ${ziel} Datensätzen (${Math.round(anteil * 100)} %)` };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe, beide richtig beurteilt. */
export function fuehreSelbsttestAus({ env = process.env } = {}) {
  const fehler = [];
  const kaputt = beurteileReife([{ name: "DPO-Paare", lesbar: false }], reifeZiel({ env }));
  if (kaputt.ok) fehler.push("unlesbare Ablage gilt fälschlich als Fortschritt");
  const leer = beurteileReife([{ name: "DPO-Paare", lesbar: true, anzahl: 0 }], 100);
  if (!leer.ok || leer.stufe !== 0) fehler.push("leerer Bestand ist ein Anfang, kein Ausfall");
  const halb = beurteileReife([{ name: "X", lesbar: true, anzahl: 50 }], 100);
  if (!halb.ok || halb.stufe !== 2) fehler.push("die Hälfte des Ziels muss Stufe 2 sein");
  const reif = beurteileReife([{ name: "X", lesbar: true, anzahl: 100 }], 100);
  if (!reif.ok || reif.stufe !== 3) fehler.push("erreichtes Ziel muss Stufe 3 sein");
  const frueh = beurteileReife([{ name: "X", lesbar: true, anzahl: 49 }], 100);
  if (!frueh.ok || frueh.stufe !== 1) fehler.push("unter der Hälfte muss Stufe 1 sein");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echten Ablagen (dieselben vier wie
 * der Trainings-Takt Nr. 05 misst), dann die Karte in die Ablage. Die Ampel
 * ist GRÜN, solange gemessen werden kann — auch bei Stufe 0: dass noch keine
 * Daten reif sind, ist ein Zustand, kein Fehler. ROT nur bei unlesbaren
 * Ablagen oder falsch beurteilten Selbsttest-Proben.
 *
 * @param {{env?: object, storeFabrik?: Function, kartenAblage?: object}} eingabe
 *   storeFabrik wie überall testtauglich austauschbar; kartenAblage direkt
 *   setzbar (Tests), sonst wird sie aus storeFabrik(TRAININGS_REIFE_ABLAGE)
 *   gebaut.
 */
export async function laufTrainingsReife({
  env = process.env,
  storeFabrik = createRecordStore,
  quellen = TRAININGS_QUELLEN,
  kartenAblage = null
} = {}) {
  const probe = fuehreSelbsttestAus({ env });
  if (!probe.bestanden) {
    return { ok: false, meldung: `Trainings-Reife beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }

  const gemessen = [];
  for (const q of quellen) {
    try {
      const ergebnis = await storeFabrik(q.praefix, { maximal: q.limit }).liste({ limit: q.limit });
      gemessen.push({ name: q.name, lesbar: ergebnis.ok === true, anzahl: (ergebnis.datensaetze || []).length });
    } catch {
      gemessen.push({ name: q.name, lesbar: false, anzahl: 0 });
    }
  }
  const urteil = beurteileReife(gemessen, reifeZiel({ env }));
  if (!urteil.ok) {
    return { ok: false, meldung: `Trainingsdaten unlesbar: ${urteil.grund}` };
  }

  // Die Entscheidungskarte — EIN Datensatz, der überschrieben wird ("letzte-
  // karte"), damit die Ablage nicht pro Durchgang wächst. Die Tagesmappe liest
  // sie nur, wenn sie frisch UND mindestens Stufe 2 ist.
  const ziel = reifeZiel({ env });
  const captureAn = isCaptureEnabled(env);
  let karteStatus = "Karte nicht abgelegt";
  try {
    const ablage = kartenAblage || storeFabrik(TRAININGS_REIFE_ABLAGE, { maximal: 10 });
    await ablage.schreib({
      id: "letzte-karte",
      art: "trainings-reife-karte",
      stufe: urteil.stufe,
      gesamt: urteil.gesamt ?? 0,
      ziel,
      jeQuelle: Object.fromEntries(gemessen.map((q) => [q.name, q.anzahl])),
      captureAn,
      createdAt: new Date().toISOString()
    }, { timeoutMs: 5000 });
    karteStatus = "Karte in der Tagesmappe-Ablage";
  } catch {
    // Messen ist gelungen, Ablegen nicht — das steht in der Meldung, statt
    // still zu schweigen (Hausregel: stumme Wege werden benannt).
    karteStatus = "Karte NICHT abgelegt (Ablage gestört)";
  }

  const zahlen = gemessen.map((q) => `${q.anzahl} ${q.name}`).join(", ");
  const capture = captureAn ? "Capture AN" : "Capture aus (fail-closed, gewollt — Policy)";
  return {
    ok: true,
    meldung: `Selbsttest 5/5; Reife Stufe ${urteil.stufe}/3 (${urteil.grund}): ${zahlen}; `
      + `${capture}; GPU-Start bleibt hinter Betreiber-Freigabe; ${karteStatus}`
  };
}

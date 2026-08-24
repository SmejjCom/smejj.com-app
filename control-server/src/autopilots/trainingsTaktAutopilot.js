// smejj.com — Trainings-Takt (Autopilot Nr. 05), reaktiviert 2026-08-24 auf
// Betreiber-Anordnung ("Trainings-Takt Nr. 05 wieder aktivieren … soll
// dauerhaft aktiv bleiben").
//
// WARUM ER "STÄNDIG AUS" WAR: Er war nie kaputt — er war seit 2026-08-02
// bewusst stillgelegt ("RAG statt Training"), und der Zeabur-Dienst, den er
// ursprünglich takten sollte (smejj-autopilot-jobs), hat NIE existiert. Ein
// Wächter, der an einem Geisterdienst hängt, kann nur grau sein.
//
// DIE DAUERLÖSUNG: Er hängt an keinem externen Dienst mehr. Er läuft im
// Taktgeber des Control-Servers (alle 30 Minuten, neustart-fest wie alle
// anderen) und misst die ECHTE Trainingsdaten-Pipeline, die längst lebt:
// die DPO-Paare des Selbst-Verbesserers, die destillierten Datensätze des
// Vorbild-Lerners, die Nutzersignale des Daten-Schwungrads — und den
// Capture-Schalter der Trainingsdaten-Policy.
//
// GRENZE, ausdrücklich: Er STARTET keine GPU-Trainingsläufe. Echte
// Trainingszyklen (Salad, stundenweise) sind eine neue Kostenposition und
// damit Rote Liste — sie brauchen eine eigene schriftliche Betreiber-Freigabe.
// Bis dahin ist "Capture aus (fail-closed)" der GEWOLLTE Zustand und wird
// grün gemeldet, nicht rot: die Policy zu erfüllen ist kein Ausfall.
import { createRecordStore } from "../admin/recordStore.js";
import { isCaptureEnabled } from "../../../src/training/constants.js";

/** Die Ablagen der Trainingsdaten-Pipeline — mit Deckel je Quelle. */
export const TRAININGS_QUELLEN = Object.freeze([
  { praefix: "self-improvement/dpo-dataset", name: "DPO-Paare", limit: 500 },
  { praefix: "self-improvement/distilled-datasets", name: "Destillate", limit: 500 },
  { praefix: "self-improvement/user-feedback-events", name: "Nutzersignale", limit: 500 },
  { praefix: "self-improvement/training-batches", name: "Batches", limit: 100 }
]);

/**
 * Bewertet die gemessene Datenlage. Getrennt testbar (kaputt + gesund).
 * Regel: Lesbarkeit ist Pflicht (unlesbare Quelle = rot); leere Bestände sind
 * ein ehrlicher Anfang, kein Ausfall.
 */
export function beurteileDatenlage(quellen = []) {
  const stumm = quellen.filter((q) => !q.lesbar);
  if (stumm.length) {
    return { ok: false, grund: `${stumm.length} Trainings-Ablage(n) nicht lesbar: ${stumm.map((q) => q.name).join(", ")}` };
  }
  const gesamt = quellen.reduce((s, q) => s + (q.anzahl || 0), 0);
  return { ok: true, grund: `${gesamt} Datensätze über ${quellen.length} Ablagen`, gesamt };
}

/** Selbsttest: unlesbare Quelle MUSS rot machen, gesunde Lage nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = beurteileDatenlage([
    { name: "DPO-Paare", lesbar: false },
    { name: "Batches", lesbar: true, anzahl: 3 }
  ]);
  if (kaputt.ok) fehler.push("unlesbare Ablage gilt fälschlich als gesund");
  const gesund = beurteileDatenlage([
    { name: "DPO-Paare", lesbar: true, anzahl: 12 },
    { name: "Batches", lesbar: true, anzahl: 0 }
  ]);
  if (!gesund.ok || gesund.gesamt !== 12) fehler.push("gesunde Lage wird falsch gerechnet");
  const leer = beurteileDatenlage([{ name: "DPO-Paare", lesbar: true, anzahl: 0 }]);
  if (!leer.ok) fehler.push("leerer Bestand ist ein Anfang, kein Ausfall");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echten Ablagen und der echte
 * Capture-Schalter.
 */
export async function laufTrainingsTakt({ env = process.env, storeFabrik = createRecordStore, quellen = TRAININGS_QUELLEN } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Trainings-Takt beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
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
  const urteil = beurteileDatenlage(gemessen);
  if (!urteil.ok) {
    return { ok: false, meldung: `Trainingsdaten-Pipeline gestört: ${urteil.grund}` };
  }
  const zahlen = gemessen.map((q) => `${q.anzahl} ${q.name}`).join(", ");
  const capture = isCaptureEnabled(env)
    ? "Capture AN"
    : "Capture aus (fail-closed, gewollt — Policy)";
  return {
    ok: true,
    meldung: `Selbsttest 3/3; Pipeline lesbar: ${zahlen}; ${capture}; GPU-Trainingsläufe warten auf Kosten-Freigabe (Rote Liste)`
  };
}

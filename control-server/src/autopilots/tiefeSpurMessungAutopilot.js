// smejj.com — Tiefe-Spur-Messung (Autopilot Nr. 75), Audit A bis Z 2026-09-03.
//
// WARUM ES SIE GIBT: Der Qualitäts-Prüfer (Nr. 01) misst vom Mac aus die
// Brücke als "live-default" — das ist die SCHNELLSPUR (Groq). Die 97 % vom
// 01.09. stammen von der tiefen Spur (GLM-5.2), die die Brücke bei Nachdenken,
// Coding oder ausdrücklicher Modellwahl nimmt. Zwei Ketten, eine Zahl auf der
// Ampel: die tiefe Spur hatte keinen eigenen Takt. Jetzt hat sie einen — die
// 14 Fälle der Kernsuite täglich gegen model "glm-5-2", bewertet wie am Mac.
//
// Messlatte aus dem Trainingsplan 02.09.: Referenz ≥ 95 %, 0 kritische Fehler.
import { messlaufImTakt, beurteileMessung, ladeKernsuite } from "./brueckenMesslauf.js";

export const KENNUNG = "tiefe-spur-messung";
export const TIEFE_SPUR_MODELL = "glm-5-2";
export const MINDEST_NOTE = 0.95;

/** Selbsttest: kaputte UND gesunde Probe der Bewertung. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const gut = beurteileMessung({ cases: 14, weightedScore: 0.971, errors: 0, criticalFailures: 0, latencyMsP95: 8000 }, { mindestNote: MINDEST_NOTE });
  if (!gut.ok || !/97,1 %/.test(gut.grund)) fehler.push("97,1 % ohne kritische Fehler muss grün sein und die Note nennen");
  const kritisch = beurteileMessung({ cases: 14, weightedScore: 0.99, errors: 0, criticalFailures: 1 }, { mindestNote: MINDEST_NOTE });
  if (kritisch.ok) fehler.push("eine kritische Verletzung muss rot sein, egal wie hoch die Note");
  const transport = beurteileMessung({ cases: 14, weightedScore: 0.5, errors: 3, criticalFailures: 3 }, { mindestNote: MINDEST_NOTE });
  if (transport.ok || !/nicht messbar/.test(transport.grund)) fehler.push("Transportfehler sind 'nicht messbar', keine Note");
  const schwach = beurteileMessung({ cases: 14, weightedScore: 0.8, errors: 0, criticalFailures: 0 }, { mindestNote: MINDEST_NOTE });
  if (schwach.ok) fehler.push("80 % liegt unter der Messlatte 95 % und muss rot sein");
  if (beurteileMessung(null).ok) fehler.push("ohne Messung darf es kein Grün geben");
  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}

/** Der Lauf im Takt: Selbsttest, dann der tägliche Hintergrund-Messlauf. */
export async function laufTiefeSpurMessung(optionen = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Tiefe-Spur-Messung bewertet bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  const e = await messlaufImTakt({ kennung: KENNUNG, faelleLader: ladeKernsuite, modelId: TIEFE_SPUR_MODELL, mindestNote: MINDEST_NOTE, ...optionen });
  return { ok: e.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; tiefe Spur: ${e.meldung}` };
}

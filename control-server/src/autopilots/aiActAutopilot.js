// smejj.com — EU-AI-Act-Wache (Autopilot Nr. 68), Betreiber-Freigabe
// 2026-08-30 ("Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig.").
//
// WARUM ES SIE GIBT: Die Durchsetzung der KI-Verordnung läuft seit dem
// 2026-08-02 (Art. 50: Kennzeichnungspflicht). Das Bestandsverzeichnis
// (control-server/src/compliance/aiTransparency.js) ist die maschinenlesbare
// Erklärung, welche Systeme smejj.com betreibt — aber nichts prüft, ob sie
// mit der Wirklichkeit übereinstimmt. Ein neu aktiviertes Modell ohne
// Verzeichnis-Eintrag wäre eine stille Kennzeichnungslücke. Diese Wache
// gleicht im Takt zwei Dinge ab, die auseinanderlaufen können:
//   1. Pflicht vs. Protokoll: jedes System mit Transparenzpflicht muss
//      protokolliert sein.
//   2. Verzeichnis vs. Registry: jedes AKTIVE Modell der Modell-Registry
//      muss im Verzeichnis stehen — ein neues Modell ohne Einstufung ist rot.
//
// GRENZE, ausdrücklich: Sie stuft nichts selbst ein und schreibt nichts in
// das Verzeichnis. Die rechtliche Einordnung bleibt die Entscheidung des
// Betreibers (docs/compliance/EU_AI_ACT_BESTANDSVERZEICHNIS.md); die Wache
// macht nur hörbar, wenn Code und Erklärung auseinanderlaufen.
import { AI_ACT_ENFORCEMENT_DATE, AI_SYSTEMS, RISK } from "../compliance/aiTransparency.js";
import { MODEL_REGISTRY, AUTO_MODEL_ID, isModelEnabled } from "../../../src/shared/modelRegistry.js";

/** 'glm-5-2' und 'glm-5.2' sind dasselbe Modell — Punkte und Striche sind Schreibweise. */
export function normalisiereSystemId(id) {
  return String(id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Bewertet die AI-Act-Lage. Getrennt testbar (kaputt + gesund):
 *   - Durchsetzung aktiv + Pflichtsystem ohne Protokollierung -> rot
 *   - aktives Modell fehlt im Bestandsverzeichnis -> rot (Drift)
 *   - als high/prohibited eingestuftes System -> rot (darf es nicht geben)
 *   - alles sauber -> grün mit der Zahl der eingestuften Systeme
 */
export function beurteileAiAct({ systeme = AI_SYSTEMS, aktiveModelle = [], jetztIso = new Date().toISOString() } = {}) {
  const durchsetzungAktiv = new Date(jetztIso) >= new Date(AI_ACT_ENFORCEMENT_DATE);
  const fehler = [];
  if (durchsetzungAktiv) {
    const ohneProtokoll = systeme.filter((s) => s?.transparenzpflicht && !s?.protokolliert);
    if (ohneProtokoll.length) fehler.push(`${ohneProtokoll.length} kennzeichnungspflichtige(s) System ohne Protokollierung: ${ohneProtokoll.map((s) => s.id).join(", ")}`);
  }
  const verzeichnis = new Set(systeme.map((s) => normalisiereSystemId(s?.id)));
  const drift = aktiveModelle.filter((m) => !verzeichnis.has(normalisiereSystemId(m)));
  if (drift.length) fehler.push(`aktive(s) Modell ohne Bestandsverzeichnis-Eintrag: ${drift.join(", ")} — Kennzeichnung nach Art. 50 fehlt`);
  const verboten = systeme.filter((s) => [RISK.high, RISK.prohibited].includes(s?.risiko));
  if (verboten.length) fehler.push(`als ${verboten.map((s) => s.risiko).join("/")} eingestuft: ${verboten.map((s) => s.id).join(", ")} — diese Einstufung darf im Betrieb nicht vorkommen`);
  if (fehler.length) return { ok: false, grund: fehler.join("; "), systeme: systeme.length, aktiveModelle: aktiveModelle.length };
  return { ok: true, systeme: systeme.length, aktiveModelle: aktiveModelle.length };
}

/** Selbsttest nach Hausregel: kaputte UND gesunde Probe, beide richtig beurteilt. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const drift = beurteileAiAct({
    systeme: [{ id: "a", transparenzpflicht: true, protokolliert: true, risiko: RISK.limited }],
    aktiveModelle: ["a", "b"],
    jetztIso: "2026-08-30T00:00:00.000Z"
  });
  if (drift.ok) fehler.push("ein aktives Modell ohne Verzeichnis-Eintrag muss rot sein");
  const ohneProtokoll = beurteileAiAct({
    systeme: [{ id: "a", transparenzpflicht: true, protokolliert: false, risiko: RISK.limited }],
    aktiveModelle: ["a"],
    jetztIso: "2026-08-30T00:00:00.000Z"
  });
  if (ohneProtokoll.ok) fehler.push("ein Pflichtsystem ohne Protokollierung muss rot sein");
  const schreibweise = beurteileAiAct({
    systeme: [{ id: "glm-5.2", transparenzpflicht: true, protokolliert: true, risiko: RISK.limited }],
    aktiveModelle: ["glm-5-2"],
    jetztIso: "2026-08-30T00:00:00.000Z"
  });
  if (!schreibweise.ok) fehler.push("'glm-5-2' und 'glm-5.2' müssen als dasselbe Modell gelten");
  const hoch = beurteileAiAct({
    systeme: [{ id: "a", transparenzpflicht: true, protokolliert: true, risiko: RISK.high }],
    aktiveModelle: [],
    jetztIso: "2026-08-30T00:00:00.000Z"
  });
  if (hoch.ok) fehler.push("eine high-Einstufung im Bestand muss rot sein");
  const gesund = beurteileAiAct({
    systeme: [{ id: "a", transparenzpflicht: true, protokolliert: true, risiko: RISK.limited }],
    aktiveModelle: ["a"],
    jetztIso: "2026-08-30T00:00:00.000Z"
  });
  if (!gesund.ok) fehler.push("eine saubere Lage muss grün sein");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: die echten aktiven Modelle aus der Registry lesen (nur
 * aktivierte, konfigurierte — fail-closed wie überall) und gegen das
 * Bestandsverzeichnis rechnen. Kein Netz, keine Schreibseite — reiner Abgleich
 * zweier Quellen, die getrennt von einander geändert werden.
 *
 * @param {{env?: object, jetztIso?: string, modelle?: Function}} eingabe
 *   modelle liefern die aktiven Modell-IDs (Signatur: ({env}) => string[]);
 *   Voreinstellung liest MODEL_REGISTRY + isModelEnabled.
 */
export async function laufAiAct({
  env = process.env,
  jetztIso = new Date().toISOString(),
  modelle = null
} = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `AI-Act-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  const aktive = modelle
    ? modelle({ env })
    : Object.values(MODEL_REGISTRY)
      .filter((m) => m?.id && m.id !== AUTO_MODEL_ID && isModelEnabled(m, env))
      .map((m) => m.id);
  const urteil = beurteileAiAct({ aktiveModelle: aktive, jetztIso });
  if (!urteil.ok) {
    return { ok: false, meldung: `EU AI Act: ${urteil.grund}` };
  }
  return {
    ok: true,
    meldung: `Selbsttest 5/5; Durchsetzung seit ${AI_ACT_ENFORCEMENT_DATE} aktiv; `
      + `${urteil.systeme} eingestufte Systeme decken alle ${urteil.aktiveModelle} aktiven Modelle ab`
  };
}

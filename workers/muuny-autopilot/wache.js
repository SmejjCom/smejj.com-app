// con-Autopilot — Regeln der Wache (Single Responsibility: aus Zahlen ein Urteil, ohne Netz).
// Getrennt vom Skript, damit sie pruefbar sind: eine Wache, die man nicht testen kann,
// ist selbst ein blinder Fleck ([[smejj-waechter-tuev]]).

/** Wie alt darf der letzte Takt sein? Standard: vier Takte a 5 Minuten. */
export const MAX_ALTER_MIN_STANDARD = 20;

/**
 * Welcher Gesamtdeckel gilt? Immer der des DIENSTES, wenn er ihn mitschreibt.
 * Sonst der eigene Standardwert — und dann wird die Herkunft genannt, nicht geraten.
 */
export function waehleDeckel(zustand, eigenerDeckel) {
  const ausDienst = Number(zustand?.grenzen?.gesamtdeckelUsd);
  if (Number.isFinite(ausDienst) && ausDienst > 0) return { deckel: ausDienst, herkunft: "Dienst" };
  return { deckel: eigenerDeckel, herkunft: "Standardwert dieser Wache" };
}

/** Ist der Herzschlag frisch genug? Fehlender Herzschlag ist immer rot. */
export function herzschlagUrteil(zustand, { maxAlterMin = MAX_ALTER_MIN_STANDARD, jetzt = Date.now() } = {}) {
  const tick = zustand?.letzterTick;
  if (!tick) return { ok: false, alterMin: null, grund: "kein_herzschlag" };
  const alterMin = (jetzt - new Date(tick).getTime()) / 60_000;
  if (!Number.isFinite(alterMin)) return { ok: false, alterMin: null, grund: "herzschlag_unlesbar" };
  return { ok: alterMin <= maxAlterMin, alterMin, grund: alterMin <= maxAlterMin ? null : "herzschlag_veraltet" };
}

/** Sammelurteil aus allen Einzelbefunden. Ein einziges Rot faerbt das Ganze rot. */
export function gesamturteil(befunde) {
  const rot = befunde.filter((b) => !b.ok);
  return { ok: rot.length === 0, rot: rot.length, gesamt: befunde.length, gruende: rot.map((b) => b.text) };
}

// smejj.com — Experiment-Meister (Autopilot Nr. 59): der Rahmen für ehrliche
// A/B-Versuche — Zuteilung, Auswertung, Urteil. Ob eine neue Funktion etwas
// BRINGT, wird gemessen, nicht behauptet (dieselbe Haltung wie beim
// Modell-Eval-Harness).
//
// DREI REGELN, die aus dem Haus stammen:
// 1. Die Zuteilung ist deterministisch (Hash über Kennung + Experiment):
//    derselbe Nutzer sieht IMMER dieselbe Variante — sonst misst man Rauschen.
// 2. Gleichstand gehört dem Amtsinhaber (Regel des Modell-Einkäufers): eine
//    Variante gewinnt nur mit MEHR Erfolg und genug Beobachtungen.
// 3. Kein aktives Experiment ist ein ehrlicher Zustand, kein Fehler — die
//    Ampel meldet dann Bestand und Bereitschaft, nie erfundene Ergebnisse.
import crypto from "node:crypto";
import { createRecordStore } from "../admin/recordStore.js";

/** Mindestbeobachtungen je Variante, bevor ein Urteil erlaubt ist. */
export const MINDEST_N = 50;

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("experimente/laeufe", { maximal: 100 });
  return ablageStandard;
}

/**
 * Deterministische Zuteilung: Kennung + Experiment → "a" oder "b".
 * Getrennt testbar.
 */
export function weiseVarianteZu(kennung, experiment) {
  const hash = crypto.createHash("sha256").update(`${kennung}|${experiment}`).digest();
  return hash[0] % 2 === 0 ? "a" : "b";
}

/**
 * Urteil über ein Experiment: {a: {n, erfolge}, b: {n, erfolge}}.
 * Getrennt testbar.
 */
export function werteExperimentAus({ a = { n: 0, erfolge: 0 }, b = { n: 0, erfolge: 0 } } = {}, { mindestN = MINDEST_N } = {}) {
  if (a.n < mindestN || b.n < mindestN) {
    return { urteil: "zu-frueh", grund: `erst ${a.n}/${b.n} Beobachtungen — Urteil ab ${mindestN} je Variante` };
  }
  const quoteA = a.n ? a.erfolge / a.n : 0;
  const quoteB = b.n ? b.erfolge / b.n : 0;
  // b ist die Herausforderin; a der Amtsinhaber. Gleichstand → Amtsinhaber.
  if (quoteB > quoteA) {
    return { urteil: "b-gewinnt", grund: `${Math.round(quoteB * 100)} % gegen ${Math.round(quoteA * 100)} % Erfolg` };
  }
  return { urteil: "a-bleibt", grund: `Amtsinhaber hält ${Math.round(quoteA * 100)} % gegen ${Math.round(quoteB * 100)} %` };
}

/** Selbsttest: Zuteilung, Zu-früh-Bremse und Gleichstandsregel müssen tragen. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const erste = weiseVarianteZu("nutzer-1", "knopf-farbe");
  if (weiseVarianteZu("nutzer-1", "knopf-farbe") !== erste) fehler.push("Zuteilung ist nicht deterministisch");
  const beide = new Set(["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"].map((n) => weiseVarianteZu(n, "knopf-farbe")));
  if (beide.size !== 2) fehler.push("Zuteilung streut nicht über beide Varianten");
  const zuFrueh = werteExperimentAus({ a: { n: 10, erfolge: 9 }, b: { n: 10, erfolge: 1 } });
  if (zuFrueh.urteil !== "zu-frueh") fehler.push("zu wenige Beobachtungen erzwingen kein Zu-früh");
  const gleichstand = werteExperimentAus({ a: { n: 100, erfolge: 50 }, b: { n: 100, erfolge: 50 } });
  if (gleichstand.urteil !== "a-bleibt") fehler.push("Gleichstand muss dem Amtsinhaber gehören");
  const klar = werteExperimentAus({ a: { n: 100, erfolge: 40 }, b: { n: 100, erfolge: 70 } });
  if (klar.urteil !== "b-gewinnt") fehler.push("klarer Sieg der Herausforderin wird nicht erkannt");
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann der echte Bestand der Experiment-Ablage.
 * Fertig ausgewertete Experimente mit Urteil landen in der Tagesmappe —
 * UMGESETZT wird ein Sieger nur vom Betreiber, nie vom Automat.
 */
export async function laufExperimentMeister({ ablage = null } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Experiment-Meister bricht eigene Regeln: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeAblage(ablage);
  let liste;
  try {
    liste = await speicher.liste({ limit: 50 });
  } catch (f) {
    return { ok: false, meldung: `Experiment-Ablage nicht lesbar: ${String(f?.message || f).slice(0, 80)}` };
  }
  if (!liste.ok) {
    return { ok: false, meldung: `Experiment-Ablage meldet: ${liste.error || "Liste gescheitert"}` };
  }
  const aktive = liste.datensaetze.filter((e) => e.status === "aktiv");
  if (!aktive.length) {
    return { ok: true, meldung: `Selbsttest 5/5; Rahmen bereit, ${liste.datensaetze.length} Experiment(e) in der Ablage, keines aktiv — Zuteilung und Auswertung stehen für das erste bereit` };
  }
  const urteile = aktive.map((e) => {
    const urteil = werteExperimentAus({ a: e.a, b: e.b });
    return `${e.name || e.id}: ${urteil.urteil} (${urteil.grund})`;
  });
  return { ok: true, meldung: `Selbsttest 5/5; ${aktive.length} aktive(s) Experiment(e) — ${urteile.join("; ").slice(0, 150)}` };
}

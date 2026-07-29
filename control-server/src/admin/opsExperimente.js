// smejj.com — Modul X: Experimente (Single Responsibility: was laeuft geteilt).
//
// Ein Experiment ist kein eigener Datensatz, sondern ein Feature-Flag im Zustand
// "teilweise": ein Teil der Konten sieht etwas anderes als der Rest. Genau das
// ist die Definition, und deshalb bekommt dieses Modul KEINEN eigenen Speicher —
// ein zweiter Ort fuer dieselbe Sache waere ein zweiter Stand, der abweichen kann.
//
// WAS HIER NICHT STEHT, IST DAS ERGEBNIS.
//
// Das Mockup versprach "A/B-Tests mit Ergebnis statt Bauchgefuehl". Ein Ergebnis
// braucht eine Messung: wer hat welche Variante gesehen, und was ist danach
// passiert. Diese Messung gibt es nicht (Modul W ist genau deshalb offen).
// Zahlen zu zeigen, die keiner Messung entstammen, waere schlimmer als keine
// Zahlen — man wuerde nach ihnen entscheiden.
//
// Gezeigt wird deshalb: was laeuft, seit wann, mit welchem Anteil, und wer es
// zuletzt angefasst hat. Das ist ehrlich und beantwortet die Frage, die man im
// Betrieb wirklich hat: "Was ist gerade nicht bei allen gleich?"
import { FLAG_STATUS, listFlags } from "./featureFlags.js";

const TAG_MS = 24 * 60 * 60 * 1000;

export async function experimentUebersicht({ env = process.env, jetztMs = Date.now() } = {}) {
  const liste = await listFlags({ env });
  if (!liste?.ok) return { ok: false, error: liste?.error || "flags_nicht_lesbar", experimente: [] };

  const flags = Array.isArray(liste.flags) ? liste.flags : [];
  const experimente = flags
    .filter((f) => f.status === FLAG_STATUS.partial)
    .map((f) => aufbereiten(f, jetztMs))
    .sort((a, b) => (b.laeuftSeitTagen ?? -1) - (a.laeuftSeitTagen ?? -1));

  const ausgerollt = flags.filter((f) => f.status === FLAG_STATUS.on).length;
  const aus = flags.filter((f) => f.status === FLAG_STATUS.off).length;

  return {
    ok: true,
    laufend: experimente.length,
    ausgerollt,
    aus,
    flagsGesamt: flags.length,
    experimente,
    // Die laengste Laufzeit ist der interessante Wert: ein Experiment, das
    // niemand beendet, ist kein Experiment mehr, sondern ein Dauerzustand,
    // bei dem die Haelfte der Leute etwas anderes sieht.
    laengsteLaufzeitTage: experimente.length ? experimente[0].laeuftSeitTagen : null,
    gemessenAm: new Date(jetztMs).toISOString(),
    ergebnisHinweis: "Ergebnisse werden NICHT gemessen: es gibt keine Erfassung, die festhaelt, "
      + "wer welche Variante gesehen hat und was danach geschah. Zahlen ohne Messung waeren "
      + "schlimmer als keine — man wuerde nach ihnen entscheiden.",
    hinweis: "Ein Experiment ist ein Feature-Flag im Zustand \"teilweise\". Es gibt keinen "
      + "zweiten Speicher; geaendert wird es in Modul R."
  };
}

function aufbereiten(flag, jetztMs) {
  const seitMs = flag.createdAt ? Date.parse(flag.createdAt) : NaN;
  const geaendertMs = flag.updatedAt ? Date.parse(flag.updatedAt) : NaN;
  return {
    name: flag.name,
    anteilProzent: Number(flag.percent || 0),
    testkonten: Array.isArray(flag.alwaysOn) ? flag.alwaysOn.length : 0,
    angelegtAm: flag.createdAt || null,
    geaendertAm: flag.updatedAt || null,
    geaendertVon: flag.updatedBy || null,
    laeuftSeitTagen: Number.isFinite(seitMs) ? Math.max(0, Math.floor((jetztMs - seitMs) / TAG_MS)) : null,
    unveraendertSeitTagen: Number.isFinite(geaendertMs)
      ? Math.max(0, Math.floor((jetztMs - geaendertMs) / TAG_MS))
      : null
  };
}

// smejj.com — Messlatte (Autopilot Nr. 88), Plan "smejj lernt selbst" Stufe 1,
// Betreiber 24.09.2026: "ja, schreib den umsetzungsplan" / "Ja" (Stufe 1 starten).
//
// WARUM ES SIE GIBT: smejj soll mit frischem, geprueftem Wissen gegen die grossen
// Modelle gewinnen. Ob das gelingt, sagt nur eine Zahl je Woche — nicht ein
// Gefuehl. Zwei Messungen, beide ueber den NUTZERWEG /api/agent (dort holt die
// Bruecke Radar-Wissen und Websuche dazu, genau wie fuer echte Nutzer):
//   1. "Aktuelles": Fragen aus der geprueften Radar-Wissensbasis der Vorwoche
//      (src/evaluation/aktuellesSuite.js). Die Wachstumszahl — keine Ampel-
//      Schwelle, ein niedriger Wert ist ein Befund, kein Alarm.
//   2. "Goldene Fragen" (evals/suites/smejj-goldene-fragen-v1.json): die
//      Fehler, die Menschen im Live-Chat gefunden haben. Messlatte 80 %.
// Jede Woche wird der Stand je Woche abgelegt, die Meldung nennt die Vorwoche.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordStore } from "../admin/recordStore.js";
import { messlaufImTakt, beurteileMessung, ABLAGE_ID } from "./brueckenMesslauf.js";
import { WISSEN_ABLAGE } from "./aiRadarAutopilot.js";
import { baueAktuellesSuite, wochenStichtag } from "../../../src/evaluation/aktuellesSuite.js";
import { loadEvalSuite } from "../../../src/evaluation/evalPacks.js";
import { STANDARD_THEMEN } from "../../../src/radar/radarThemen.js";

export const KENNUNG_AKTUELLES = "messlatte-aktuelles";
export const KENNUNG_GOLDEN = "messlatte-golden";
export const WOCHE_MS = 7 * 24 * 60 * 60 * 1000;
export const GOLDEN_MINDEST_NOTE = 0.8;
/** Unter so vielen messbaren Fragen ist eine Wochenzahl Zufall. */
export const AKTUELLES_MIN_FAELLE = 5;

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const THEMEN_TITEL = Object.fromEntries(STANDARD_THEMEN.map((t) => [t.id, t.titel]));

/** Liest die Radar-Wissensbasis und baut die Suite der Vorwoche. */
export async function ladeAktuellesFaelle({ env = process.env, store = createRecordStore(WISSEN_ABLAGE, { maximal: 2000 }), jetztMs = Date.now() } = {}) {
  const liste = await store.liste({ env });
  if (!liste?.ok) throw new Error("Radar-Wissensbasis nicht lesbar");
  const suite = baueAktuellesSuite(liste.datensaetze || [], { jetzt: wochenStichtag(jetztMs), themenTitel: THEMEN_TITEL });
  if (suite.cases.length < AKTUELLES_MIN_FAELLE) {
    throw new Error(`nur ${suite.cases.length} messbare Radar-Fakten in der Vorwoche (mindestens ${AKTUELLES_MIN_FAELLE})`);
  }
  return suite.cases;
}

export async function ladeGoldeneFaelle() {
  const { suite } = await loadEvalSuite(path.join(WURZEL, "evals/suites/smejj-goldene-fragen-v1.json"));
  return suite.cases;
}

/** Wochenkennung "2026-09-21" (Montag) fuer den Verlauf. */
export function wochenId(jetztMs = Date.now()) {
  return new Date(wochenStichtag(jetztMs)).toISOString().slice(0, 10);
}

const prozentText = (p) => (Number.isFinite(p) ? `${String(p).replace(".", ",")} %` : "–");

/**
 * Traegt den abgelegten Stand beider Messungen in den Wochenverlauf ein und
 * liefert die Zeile fuer die Ampel. Rein bis auf die Ablage (injizierbar).
 */
export async function fuehreVerlauf({ aktuell, golden, verlauf, jetztMs = Date.now() }) {
  const id = `woche-${wochenId(jetztMs)}`;
  const vorId = `woche-${wochenId(jetztMs - WOCHE_MS)}`;
  const diese = { id, aktuelles: aktuell?.prozent ?? null, golden: golden?.prozent ?? null, faelleAktuelles: aktuell?.summary?.cases ?? null, aktualisiertAm: new Date(jetztMs).toISOString() };
  let alt = null;
  try { alt = await verlauf.lies(id); } catch { /* neu */ }
  if (!alt || alt.aktuelles !== diese.aktuelles || alt.golden !== diese.golden) {
    try { await verlauf.schreib(diese, { timeoutMs: 5000 }); } catch { /* Meldung bleibt ehrlich ohne Verlauf */ }
  }
  let vor = null;
  try { vor = await verlauf.lies(vorId); } catch { /* keine Vorwoche */ }
  const vergleich = vor && Number.isFinite(vor.aktuelles) && Number.isFinite(diese.aktuelles)
    ? ` (Vorwoche ${prozentText(vor.aktuelles)}, ${diese.aktuelles >= vor.aktuelles ? "+" : ""}${String(Math.round((diese.aktuelles - vor.aktuelles) * 10) / 10).replace(".", ",")} Punkte)`
    : "";
  return `Woche ${wochenId(jetztMs)}: Aktuelles ${prozentText(diese.aktuelles)}${diese.faelleAktuelles ? ` bei ${diese.faelleAktuelles} Radar-Fragen` : ""}${vergleich}; Goldene Fragen ${prozentText(diese.golden)}`;
}

/** Selbsttest: kaputte UND gesunde Lage der Bewertung und des Suite-Baus. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const jetzt = Date.parse("2026-09-24T12:00:00Z");
  const eintraege = [{ id: "w1", themaId: "neue-modelle", pruefstatus: "geprueft", erstelltAm: "2026-09-17T08:00:00Z", aussage: "Google hat Gemini 3.5 Flash mit 2 Mio. Token Kontext veroeffentlicht." }];
  const suite = baueAktuellesSuite(eintraege, { jetzt: wochenStichtag(jetzt) });
  if (suite.cases.length !== 1 || !/Gemini 3\.5 Flash/.test(suite.cases[0].prompt)) fehler.push("ein geprüfter Fund der Vorwoche muss genau eine Frage ergeben");
  const zurueck = baueAktuellesSuite([{ ...eintraege[0], zurueckgenommen: true }], { jetzt: wochenStichtag(jetzt) });
  if (zurueck.cases.length !== 0) fehler.push("ein zurückgenommener Eintrag darf nie abgefragt werden");
  const schwach = beurteileMessung({ cases: 20, weightedScore: 0.3, errors: 0, criticalFailures: 0 }, { mindestNote: 0 });
  if (!schwach.ok) fehler.push("eine niedrige Aktuelles-Note ist ein Befund, kein Alarm");
  const golden = beurteileMessung({ cases: 8, weightedScore: 0.6, errors: 0, criticalFailures: 0 }, { mindestNote: GOLDEN_MINDEST_NOTE });
  if (golden.ok) fehler.push("goldene Fragen unter 80 % müssen rot sein");
  return { bestanden: fehler.length === 0, fehler, geprueft: 4 };
}

/** Der Lauf im Takt: beide Wochenmessungen im Hintergrund, Verlauf, eine Zeile. */
export async function laufMesslatte({ mitNetz = true, env = process.env, jetztMs = Date.now(), messen = messlaufImTakt, ablagen = null } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Messlatte bewertet bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  const speicher = ablagen || {
    aktuell: createRecordStore(`autopiloten/${KENNUNG_AKTUELLES}`, { maximal: 10 }),
    golden: createRecordStore(`autopiloten/${KENNUNG_GOLDEN}`, { maximal: 10 }),
    verlauf: createRecordStore("autopiloten/messlatte-verlauf", { maximal: 200 })
  };
  const gemeinsam = { weg: "agent", mitNetz, env, messAbstandMs: WOCHE_MS, jetztMs };
  const a = await messen({ kennung: KENNUNG_AKTUELLES, faelleLader: () => ladeAktuellesFaelle({ env, jetztMs }), mindestNote: 0, ablage: speicher.aktuell, ...gemeinsam });
  const g = await messen({ kennung: KENNUNG_GOLDEN, faelleLader: ladeGoldeneFaelle, mindestNote: GOLDEN_MINDEST_NOTE, ablage: speicher.golden, ...gemeinsam });
  let aktuell = null;
  let golden = null;
  try { aktuell = await speicher.aktuell.lies(ABLAGE_ID); } catch { /* noch keine */ }
  try { golden = await speicher.golden.lies(ABLAGE_ID); } catch { /* noch keine */ }
  const zeile = await fuehreVerlauf({ aktuell, golden, verlauf: speicher.verlauf, jetztMs });
  return { ok: a.ok && g.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${zeile} — Aktuelles: ${a.meldung}; Golden: ${g.meldung}` };
}

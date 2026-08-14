// smejj.com — AI Evolution Engine: die zentrale Schicht ÜBER allen KI-Aktionen.
//
// WARUM SIE ZENTRAL IST (und nicht im Chat eingebaut): Der Verbesserungs-
// Kreislauf hing bisher am Text — Antwort-TÜV (Nr. 36) und Daten-Schwungrad
// (Nr. 19) sehen nur Chat-Antworten. Ein Bild, ein Video, ein Agentenlauf, ein
// Werkzeugaufruf lief völlig ungemessen durch. Wäre der Kreislauf wieder in
// den Chat gebaut worden, müsste jede neue KI-Funktion ihn erneut mitbringen.
//
// Deshalb dieser Aufbau: Jede KI-Aktion — egal welche — meldet EIN Ergebnis an
//
//     erfasseAktion({ art, prompt, ergebnis, dauerMs })
//
// und bekommt eine Note plus, falls nötig, fertige Verbesserungs-Aufgaben
// zurück. Die Note kommt von der Quality-Engine (qualitaetsEngine.js), die je
// Medientyp prüft und per registriereMedientyp() erweiterbar ist. Eine neue
// KI-Funktion braucht damit GENAU ZWEI Zeilen: Prüfer anmelden, Aktion melden.
//
// DIE BREMSEN sind Teil des Entwurfs, nicht nachträglich angebaut (Auftrag
// Abschnitt 14: keine Endlosschleifen, keine unkontrollierten Änderungen):
//
//   * Aufgaben-IDs sind DETERMINISTISCH (Hash aus Art+Klasse+Betroffenem).
//     Derselbe Befund erzeugt dieselbe ID — und landet damit genau einmal im
//     Backlog statt bei jedem Takt erneut.
//   * SPERRFRIST je Aufgabe (6 h): ein bekannter Befund wird nicht im
//     30-Minuten-Takt neu gemeldet.
//   * OBERGRENZE je Durchgang (20 Aufgaben) — und wenn gekappt wird, STEHT DAS
//     IM BERICHT. Stilles Abschneiden liest sich wie "alles erfasst".
//   * RISIKOSTUFEN: was gefährlich ist (Geheimnisse, gefährliche Muster,
//     Sicherheitsfunde), bekommt `freigabe: "betreiber"` und wird NIE
//     automatisch umgesetzt.

import { sha256 } from "../shared/hash.js";
import { bewerteErgebnis, medientypen, GEWICHTE } from "./qualitaetsEngine.js";

/**
 * Die Aktionsarten, die heute durch die Engine laufen. Die Liste ist eine
 * DOKUMENTATION, keine Schranke: erfasseAktion() nimmt jede Art an, und wenn
 * kein Prüfer angemeldet ist, sagt die Bewertung ehrlich "nicht gemessen".
 */
export const AKTIONSARTEN = Object.freeze([
  "text", "code", "bild", "video", "audio", "dokument",
  "recherche", "werkzeug", "agent", "automation", "workflow", "autopilot"
]);

/** Wer räumt welchen Befund auf? Nur IDs, die es in der Ampel WIRKLICH gibt. */
const ZUSTAENDIG = Object.freeze({
  text: "antwort-tuev",
  dokument: "antwort-tuev",
  code: "bug-predictor",
  bild: "multimodal-engine",
  video: "multimodal-engine",
  audio: "multimodal-engine",
  recherche: "deep-research",
  werkzeug: "self-healing",
  agent: "task-orchestrator",
  automation: "task-orchestrator",
  workflow: "task-orchestrator",
  autopilot: "autopilot-laeufer"
});

/**
 * Was darf die Maschine allein? Alles, was NICHT hier steht.
 * Was hier steht, ist entweder ein Sicherheitsthema oder greift in Code ein,
 * den ein Mensch gesehen haben muss.
 */
const HOCHRISIKO_KLASSEN = new Set(["geheimnis-im-code", "gefaehrliches-muster", "syntax-kaputt"]);

const MAX_AKTIONEN = 500;
const MAX_AUFGABEN_JE_LAUF = 20;
export const SPERRFRIST_MS = 6 * 60 * 60 * 1000;

/** Ringpuffer der zuletzt bewerteten Aktionen. Lebt im Prozess — ein Neustart
 *  leert ihn, und das Dashboard sagt das auch (`seitNeustart`). Persistenz
 *  wäre hier ein zweiter Speicherweg für Daten, die in Minuten veralten. */
const AKTIONEN = [];
/** id -> letzter Meldezeitpunkt (ms). Trägt die Sperrfrist. */
const GEMELDET = new Map();

/** Deterministische, kurze Aufgaben-ID. Gleicher Befund => gleiche ID. */
export function aufgabenId({ art, klasse, betrifft }) {
  return `ev-${sha256(`${art}|${klasse}|${betrifft}`).slice(0, 10)}`;
}

/**
 * Improvement Score, 0..100. Die Faktoren stammen aus dem Auftrag (Abschnitt
 * 12) und sind bewusst GROB: eine Rangfolge, die Arbeit sortiert, kein
 * Rechenmodell, das Genauigkeit vortäuscht. Jeder Wert 0..1.
 */
export function bewerteVerbesserung({
  nutzen = 0.5, haeufigkeit = 0.5, wettbewerb = 0.3,
  machbarkeit = 0.5, kosten = 0.3, risiko = 0.3, sicherheit = 0, strategie = 0.3
} = {}) {
  const roh =
    nutzen * 30 + haeufigkeit * 20 + wettbewerb * 12 + machbarkeit * 12
    + strategie * 8 + sicherheit * 18 - kosten * 5 - risiko * 5;
  return Math.max(0, Math.min(100, Math.round(roh)));
}

/** Score -> Priorität. Sicherheit hebt immer auf mindestens "hoch". */
export function prioritaetAus(score, { sicherheit = 0 } = {}) {
  if (sicherheit >= 0.6 || score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "medium";
  return "low";
}

/**
 * Aus einer Bewertung fertige Improvement-Aufgaben machen — mit allem, was der
 * Auftrag (Abschnitt 4) verlangt: Grund, Beleg, Nutzen, Priorität, Zuständiger,
 * Testanforderung, Status.
 */
export function verbesserungenAus(bewertung, kontext = {}) {
  if (!bewertung?.gemessen) return [];
  const art = bewertung.art;
  const aufgaben = [];
  for (const fund of bewertung.funde) {
    const gewicht = GEWICHTE[fund.klasse] ?? 25;
    const sicherheit = HOCHRISIKO_KLASSEN.has(fund.klasse) && art === "code" ? 0.7 : 0;
    const score = bewerteVerbesserung({
      // Ein schwerer Fund nützt viel, wenn man ihn behebt — der Punktabzug IST
      // das Nutzenmass, wir haben kein zweites.
      nutzen: Math.min(1, gewicht / 100),
      haeufigkeit: Math.min(1, (kontext.haeufigkeit || 1) / 10),
      wettbewerb: 0.2,
      machbarkeit: 0.6,
      kosten: 0.3,
      risiko: sicherheit ? 0.6 : 0.2,
      sicherheit,
      strategie: 0.4
    });
    const betrifft = String(kontext.betrifft || art);
    aufgaben.push({
      id: aufgabenId({ art, klasse: fund.klasse, betrifft }),
      titel: `${art}: ${fund.klasse}`,
      art,
      klasse: fund.klasse,
      quelle: "Quality-Engine",
      betrifft,
      befund: `Gemessen an einer echten ${art}-Aktion (${kontext.quelle || "Live-Betrieb"}).`,
      beleg: fund.beleg,
      score,
      prioritaet: prioritaetAus(score, { sicherheit }),
      zustaendig: ZUSTAENDIG[art] || "werkstatt-autopilot",
      testanforderung: `Ein Testfall, der genau diesen Fund reproduziert (${art}/${fund.klasse}), muss vor der Behebung rot und danach grün sein.`,
      risiko: sicherheit ? "hoch" : "niedrig",
      freigabe: sicherheit ? "betreiber" : "automatisch",
      status: "neu"
    });
  }
  return aufgaben;
}

/**
 * DER EINE EINSTIEG für jede KI-Aktion. Bewertet, legt ab, und liefert die
 * Aufgaben zurück, die daraus folgen.
 *
 * Absichtlich SYNCHRON und ohne Netz: diese Funktion sitzt im heissen Pfad
 * jeder KI-Antwort. Sie darf nie eine Anfrage verzögern und nie eine Anfrage
 * zum Absturz bringen — deshalb fängt sie auch ihre eigenen Fehler.
 *
 * @param {{art:string, prompt?:string, ergebnis:any, dauerMs?:number, quelle?:string, betrifft?:string, jetztMs?:number}} eingabe
 */
export function erfasseAktion({ art, prompt = "", ergebnis, dauerMs = 0, quelle = "", betrifft = "", jetztMs = Date.now(), ...rest } = {}) {
  let bewertung;
  try {
    bewertung = bewerteErgebnis(art, ergebnis, { prompt, ...rest });
  } catch (fehler) {
    bewertung = { art: String(art), gemessen: false, punkte: null, funde: [], grund: String(fehler?.message || fehler).slice(0, 120) };
  }
  const eintrag = {
    art: String(art),
    zeitMs: jetztMs,
    dauerMs: Number(dauerMs) || 0,
    quelle: String(quelle || "").slice(0, 60),
    gemessen: bewertung.gemessen,
    punkte: bewertung.punkte,
    klassen: bewertung.funde.map((f) => f.klasse)
  };
  AKTIONEN.push(eintrag);
  if (AKTIONEN.length > MAX_AKTIONEN) AKTIONEN.splice(0, AKTIONEN.length - MAX_AKTIONEN);

  const alle = verbesserungenAus(bewertung, { betrifft, quelle });
  const { aufgaben, unterdrueckt, gekappt } = filtereNeue(alle, jetztMs);
  return { bewertung, aufgaben, unterdrueckt, gekappt };
}

/**
 * Sperrfrist und Obergrenze anwenden. Gibt IMMER mit an, was zurückgehalten
 * wurde — eine gekappte Liste, die wie eine vollständige aussieht, ist die
 * teuerste Sorte Lüge (Hausregel: no silent caps).
 */
export function filtereNeue(aufgaben, jetztMs = Date.now(), { gemeldet = GEMELDET, sperrfristMs = SPERRFRIST_MS, grenze = MAX_AUFGABEN_JE_LAUF } = {}) {
  const neue = [];
  let unterdrueckt = 0;
  for (const a of aufgaben) {
    const zuletzt = gemeldet.get(a.id);
    if (Number.isFinite(zuletzt) && jetztMs - zuletzt < sperrfristMs) { unterdrueckt += 1; continue; }
    gemeldet.set(a.id, jetztMs);
    neue.push(a);
  }
  neue.sort((x, y) => y.score - x.score);
  const gekappt = Math.max(0, neue.length - grenze);
  return { aufgaben: neue.slice(0, grenze), unterdrueckt, gekappt };
}

/**
 * Kennzahlen fürs Evolution-Dashboard. Rechnet NUR aus dem, was wirklich
 * gemessen wurde — ungemessene Aktionen zählen als ungemessen, nicht als gut.
 */
export function evolutionUebersicht({ jetztMs = Date.now(), aktionen = AKTIONEN, startMs = STARTZEIT_MS } = {}) {
  const jeArt = new Map();
  for (const a of aktionen) {
    if (!jeArt.has(a.art)) jeArt.set(a.art, { art: a.art, aktionen: 0, gemessen: 0, punkteSumme: 0, funde: 0 });
    const z = jeArt.get(a.art);
    z.aktionen += 1;
    if (a.gemessen) { z.gemessen += 1; z.punkteSumme += a.punkte; z.funde += a.klassen.length; }
  }
  const arten = [...jeArt.values()].map((z) => ({
    art: z.art,
    aktionen: z.aktionen,
    gemessen: z.gemessen,
    note: z.gemessen ? Math.round(z.punkteSumme / z.gemessen) : null,
    funde: z.funde
  })).sort((a, b) => b.aktionen - a.aktionen);

  const gemessenGesamt = arten.reduce((s, a) => s + a.gemessen, 0);
  const punkteGesamt = arten.reduce((s, a) => s + (a.note === null ? 0 : a.note * a.gemessen), 0);
  return {
    seitNeustart: true,
    laufzeitMs: jetztMs - startMs,
    aktionen: aktionen.length,
    gemessen: gemessenGesamt,
    // Der Abdeckungsgrad ist die ehrlichste Zahl des ganzen Dashboards: er
    // sagt, wie viel vom KI-Betrieb überhaupt jemand ansieht.
    abdeckung: aktionen.length ? Math.round((gemessenGesamt / aktionen.length) * 100) : null,
    qualitaetsNote: gemessenGesamt ? Math.round(punkteGesamt / gemessenGesamt) : null,
    arten,
    gepruefteMedientypen: medientypen(),
    offeneAufgabenIds: [...GEMELDET.keys()].length
  };
}

const STARTZEIT_MS = Date.now();

/** Nur für Tests: den Puffer leeren, damit Fälle sich nicht gegenseitig sehen. */
export function _leereFuerTest() {
  AKTIONEN.length = 0;
  GEMELDET.clear();
}

/**
 * Selbsttest der Engine selbst. Drei Zusagen, die ein Kaputtgehen sofort
 * verraten: (1) eine schlechte Aktion erzeugt eine Aufgabe, (2) dieselbe
 * Aktion erzeugt beim zweiten Mal KEINE zweite Aufgabe (Sperrfrist), (3) eine
 * gute Aktion erzeugt gar keine.
 */
export function fuehreEngineSelbsttestAus({ jetztMs = Date.now() } = {}) {
  const fehler = [];
  const gemeldet = new Map();
  const schlecht = bewerteErgebnis("video", { url: "blob:x", dauerSek: 0, hatTon: false, bytes: 100 }, {});
  const ausSchlecht = verbesserungenAus(schlecht, { betrifft: "selbsttest" });
  if (!ausSchlecht.length) fehler.push("kaputtes Video erzeugte keine Verbesserungs-Aufgabe");

  const ersteRunde = filtereNeue(ausSchlecht, jetztMs, { gemeldet });
  const zweiteRunde = filtereNeue(ausSchlecht, jetztMs + 60_000, { gemeldet });
  if (!ersteRunde.aufgaben.length) fehler.push("erste Runde lieferte nichts");
  if (zweiteRunde.aufgaben.length) fehler.push("Sperrfrist greift nicht — derselbe Befund kam doppelt");

  const gut = bewerteErgebnis("video", { url: "https://smejj.com/v.mp4", dauerSek: 8, hatTon: true, bytes: 2_000_000 }, {});
  if (verbesserungenAus(gut, {}).length) fehler.push("gesundes Video erzeugte eine Aufgabe (Fehlalarm)");

  // Eine Aufgabe ohne Zuständigen wäre eine Aufgabe, die niemand bekommt.
  for (const a of ausSchlecht) {
    if (!a.zustaendig) fehler.push(`Aufgabe ${a.id} ohne Zuständigen`);
    if (!a.testanforderung) fehler.push(`Aufgabe ${a.id} ohne Testanforderung`);
  }
  return { bestanden: fehler.length === 0, fehler };
}

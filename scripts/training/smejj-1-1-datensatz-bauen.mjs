// smejj.com — Datensatz smejj-1-1 bauen (Betreiber-Entscheidung 2026-09-04:
// "Eigene Paare bauen" statt auf Nutzerfragen zu warten).
//
// WARUM ERZEUGT STATT GESAMMELT: Der freigegebene Trainingsplan vom 02.09.
// verlangt >= 3.000 Paare. Gemessen am 04.09.: 1 erfasste Nutzerfrage bei
// einem Besuch am Tag — auf diesem Weg kommen 3.000 Paare nie zusammen. Der
// Trainingsweg (Stufe 0) erlaubt ausdruecklich "neu erzeugte, selbst
// geschriebene Beispielpaare".
//
// Die Bauart ist die des con-Autopiloten, weil sie sich dort bewaehrt hat:
// jede Loesung steht RECHNERISCH fest (kein Modell, kein Netz, keine
// Lizenzfrage), und Sicherheitspaare, deren Antwort eine Verweigerung IST,
// gehoeren dazu. Die Lehre vom 03.09.: wer nur Fakten trainiert, trainiert
// das Verweigern weg — con-1.1.0 verriet danach ein Geheimnis.
//
// Die Pruefsuite smejj-chat-core-v1 ist AUSGESCHLOSSEN. Ein Fall, der im
// Training steht, misst spaeter nur noch sich selbst.
//
// Deterministisch: derselbe Startwert ergibt denselben Datensatz.
//
// Aufruf:
//   node scripts/training/smejj-1-1-datensatz-bauen.mjs            (nur bauen, nach out/)
//   node scripts/training/smejj-1-1-datensatz-bauen.mjs --hochladen (zusaetzlich nach e2)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { erzeuge } from "../../workers/con-autopilot/daten/generator.mjs";
import { erzeugeErgaenzung } from "./smejj-1-1-generator.mjs";
import { baueDatensatz, jsonl, mische } from "../../workers/con-autopilot/daten.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATENSATZ_NAME = "smejj-1-1";
export const E2_PRAEFIX = `datasets/${DATENSATZ_NAME}/`;

// PROFILE (05.09.): smejj-1-1 bleibt nachbaubar wie gebaut. smejj-1-2 ist die
// Antwort auf die Messung (Adapter 70,6 % gegen Basis 91,2 %, 4 kritische
// Faelle): Sicherheitsanteil von 59 % auf rund ein Fuenftel, Gegenprobe
// bleibt gross, NEU Regeltreue (Regel im System-Prompt lesen und anwenden),
// und der Datensatz wird GEMISCHT — der Lauf 2 sah nur die ersten 4.328
// Zeilen, und die waren fast nur Rechenaufgaben (train.py nimmt den Anfang).
export const PROFILE = Object.freeze({
  "smejj-1-1": { startwert: 20260904, mengen: { reasoning: 9000, sicherheit: 2600, sprache: 1900 }, ergaenzung: {}, mischen: false },
  "smejj-1-2": {
    startwert: 20260905,
    mengen: { reasoning: 7000, sicherheit: 1500, sprache: 1900 },
    ergaenzung: { abwehr: 1500, gegenprobe: 3000, ehrlichkeit: 1200, form: 2400, regeltreue: 2600 },
    mischen: true
  }
});
/** Das Profil aus SMEJJ_KANDIDAT (Standard smejj-1-1); unbekannte Namen sind ein Fehler, kein Rueckfall. */
export function profil(name = process.env.SMEJJ_KANDIDAT || DATENSATZ_NAME) {
  const p = PROFILE[name];
  if (!p) throw new Error(`unbekannter Datensatz ${name} — bekannt: ${Object.keys(PROFILE).join(", ")}`);
  return { name, ...p };
}
// Der Startwert ist das Datum der Betreiber-Entscheidung. Er steht im Manifest,
// damit jeder den Datensatz Zeichen fuer Zeichen nachbauen kann.
export const STARTWERT = 20260904;
// MENGE: Der Generator wuerfelt, also entstehen echte Wiederholungen — bei
// 3.600 Rohpaaren bleiben nach der Duplikat-Bremse nur 1.135 uebrig, zu wenig
// fuer die geforderten 3.000. GEMESSEN 04.09.: 12.500 roh ergeben 5.064
// gepruefte Paare. Das Verhaeltnis folgt con (67 % Rechnen, 19 % Sicherheit,
// 14 % Sprache) — wer nur Fakten trainiert, trainiert das Verweigern weg.
export const MENGEN = Object.freeze({ reasoning: 9000, sicherheit: 2600, sprache: 1900 });
// VARIANTEN JE ANTWORT: Die Bremse (Standard 3) stammt von GEERNTETEN Fakten —
// "15 Frageformen auf 731 Fakten sind 731 Fakten". Bei GERECHNETEN Aufgaben ist
// sie falsch: "391" ist die richtige Antwort auf viele verschiedene Aufgaben,
// und jede davon ist eine eigene Aufgabe. Mit 3 fielen 603 korrekte Paare weg.
// 40 laesst gerechnete Vielfalt zu und faengt echte Einfoermigkeit weiterhin.
export const MAX_VARIANTEN_GERECHNET = 40;
const SUITEN_DATEIEN = ["evals/suites/smejj-chat-core-v1.json"];

/** Liest die Pruefsuiten, deren Faelle NICHT ins Training duerfen. */
export async function leseSuiten(wurzel = WURZEL, dateien = SUITEN_DATEIEN) {
  const out = [];
  for (const d of dateien) {
    try { out.push(JSON.parse(await readFile(path.join(wurzel, d), "utf8"))); }
    catch (f) { throw new Error(`Pruefsuite ${d} nicht lesbar: ${f?.message || f} — ohne sie waere ein Testleck moeglich`); }
  }
  return out;
}

/**
 * Baut den Datensatz. Rein und testbar: keine Datei, kein Netz.
 * @returns {{paare: Array, bericht: object, manifest: object}}
 */
export function baue(rohPaare, suiten, { startwert = STARTWERT, name = DATENSATZ_NAME, mischen = false } = {}) {
  // baueDatensatz gibt nur messages + recordId zurueck; die Kategorie geht
  // verloren. Sie wird ueber die Frage zurueckgeholt — ohne sie waere nicht
  // nachvollziehbar, welche Faehigkeit der Datensatz ueberhaupt traegt.
  const kategorieJeFrage = new Map();
  for (const p of rohPaare) {
    const frage = (p.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (frage) kategorieJeFrage.set(frage, p.kategorie || "allgemein");
  }
  // mindestAntwortLaenge 1: "391" IST die vollstaendige richtige Antwort auf
  // "Wie viel ist 17 mal 23?". Die 8-Zeichen-Schwelle gilt fuer geerntete
  // Prosa, wo "ok" Muell ist — hier ist die Richtigkeit ausgerechnet.
  const gebaut = baueDatensatz(rohPaare, {
    suiten, angriffeErlaubt: true, mindestAntwortLaenge: 1, maxVarianten: MAX_VARIANTEN_GERECHNET
  });
  const bericht = gebaut.bericht;
  const paare = mischen ? mische(gebaut.paare, startwert) : gebaut.paare;
  const text = jsonl(paare);
  const kategorien = {};
  for (const p of paare) {
    const frage = (p.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const k = kategorieJeFrage.get(frage) || "allgemein";
    kategorien[k] = (kategorien[k] || 0) + 1;
  }
  const manifest = {
    name,
    erzeugtAm: new Date().toISOString(),
    startwert,
    gemischt: mischen,
    paare: paare.length,
    kategorien,
    sha256: createHash("sha256").update(text).digest("hex"),
    quelle: "erzeugt (workers/con-autopilot/daten/generator.mjs) — keine Nutzerdaten, keine Fremdmodell-Ausgaben",
    suitenAusgeschlossen: SUITEN_DATEIEN,
    bericht
  };
  return { paare, bericht, manifest, text };
}

async function main() {
  // Zwei Quellen: der erprobte con-Generator fuer gerechnete Aufgaben, und die
  // eigene Ergaenzung fuer Abwehr, Gegenprobe, Ehrlichkeit und Form. Ohne sie
  // kippt die Verteilung auf 86 % Rechnen — und wer nur Fakten trainiert,
  // trainiert das Verweigern weg (con-1.1.0, verworfen am 03.09.).
  const p = profil();
  console.log(`Profil: ${p.name} (Startwert ${p.startwert}, ${p.mischen ? "gemischt" : "in Erzeugungsreihenfolge"})`);
  const roh = [...erzeuge({ startwert: p.startwert, ...p.mengen }), ...erzeugeErgaenzung({ startwert: p.startwert, ...p.ergaenzung })];
  const suiten = await leseSuiten();
  const { paare, bericht, manifest, text } = baue(roh, suiten, { startwert: p.startwert, name: p.name, mischen: p.mischen });
  const ziel = path.join(WURZEL, "out", p.name);
  await mkdir(ziel, { recursive: true });
  await writeFile(path.join(ziel, "train.jsonl"), text);
  await writeFile(path.join(ziel, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`erzeugt: ${roh.length} Rohpaare`);
  console.log(`geprueft: ${paare.length} Paare`, JSON.stringify(manifest.kategorien));
  console.log(`abgelehnt:`, JSON.stringify(bericht.abgelehnt || bericht));
  console.log(`sha256: ${manifest.sha256.slice(0, 16)}…`);
  console.log(`geschrieben nach out/${p.name}/`);
  if (!process.argv.includes("--hochladen")) {
    console.log(`\nZum Hochladen nach e2 datasets/${p.name}/: nochmal mit --hochladen`);
    return;
  }
  const { ladeHoch } = await import("./smejj-1-1-hochladen.mjs");
  await ladeHoch({ text, manifest, praefix: `datasets/${p.name}` });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}

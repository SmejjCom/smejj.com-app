// smejj.com — smejj 1.1 messen: Basismodell nackt UND Basismodell + Adapter
// gegen die smejj-Suite (evals/suites/smejj-chat-core-v1.json, 14 Faelle).
//
// WARUM EIN EIGENER SCHRITT: Das Training (smejj-1-1-trainieren.mjs) liefert
// nur einen Adapter. Ob er etwas taugt, entscheidet dieselbe Messstrecke, die
// auch die Live-Kette benotet (Nr. 75, Referenz aus dem Herzschlag) — nicht
// der Trainings-Loss. Ein niedriger Loss auf einem erzeugten Datensatz kann
// Auswendiglernen sein.
//
// WAS LAEUFT: Ein Salad-Job im Modus "messung" (der erprobte con-Job als
// Bibliothek, NICHT veraendert) in der eigenen Gruppe smejj-training. Das
// Job-Buendel bekommt statt der con-Suiten NUR die smejj-Suite. Beide Staende
// werden im selben Job gemessen: das Modell wird einmal geladen, der Adapter
// danach angehaengt (Reihenfolge erzwingt job.py). Antworten landen unter
// smejj/evals/<stand>/<jobId>/antworten.json — getrennt von con/evals.
//
// BENOTET WIRD HIER, nicht auf dem Knoten: --bewerten <jobId> zieht die
// Antworten und rechnet mit runEvalSuite/buildEvalReport dieselbe Note wie
// scripts/evaluation/run_model_eval.mjs. Drei Wiederholungen je Fall wie beim
// Qualitaets-Job (workers/smejj-autopilot-jobs/qualitaetJob.mjs).
//
// Aufruf:
//   node scripts/training/smejj-1-1-messen.mjs                    (nur zeigen)
//   node scripts/training/smejj-1-1-messen.mjs --starten           (Messjob starten)
//   node scripts/training/smejj-1-1-messen.mjs --stand             (Fortschritt)
//   node scripts/training/smejj-1-1-messen.mjs --starten --nur-adapter   (nur Kandidat, Adapter beim Laden)
//   ... --als smejj-1-2-frueh --adapter-prefix checkpoints/smejj/smejj-1-2/<kennung>/checkpoint-245  (Zwischenstand als Kandidat)
//   node scripts/training/smejj-1-1-messen.mjs --bewerten <jobId> [--basis-job <jobId2>]  (Noten rechnen)
//   node scripts/training/smejj-1-1-messen.mjs --tuev              (Messstrecke mit leeren Antworten: muss 0 % und BLOCKED melden)
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leseKonfig } from "../../workers/con-autopilot/config.js";
import { saladClient, bereiteJobVor, gruppenZustand } from "../../workers/con-autopilot/salad.js";
import { e2KonfigAusEnv, e2Client } from "../../workers/con-autopilot/e2.js";
import { KANDIDAT, GRUPPE, trainingsKonfig, warteUndStarte } from "./smejj-1-1-trainieren.mjs";
import { loadEvalSuite } from "../../src/evaluation/evalPacks.js";
import { selectCases, validateEvalSuite } from "../../src/evaluation/evalSuite.js";
import { runEvalSuite } from "../evaluation/run_model_eval.mjs";
import { buildEvalReport, formatEvalSummary } from "../../src/evaluation/evalReport.js";

// Zugangsdaten aus ~/.config/smejj.com/env.local, wenn nicht schon in der Umgebung
// (wie workers/con-autopilot/cli.mjs; Werte werden nie ausgegeben).
export async function ladeEnvLocal(env = process.env) {
  try {
    const text = await readFile(path.join(os.homedir(), ".config/smejj.com/env.local"), "utf8");
    for (const z of text.split("\n")) {
      const m = z.match(/^(?:export\s+)?([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch { /* ohne Datei: nur Umgebung */ }
}

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/**
 * WELCHE MESSLATTE — und warum die breite jetzt der Standard ist.
 *
 * BEFUND 2026-09-06: smejj-1-1 und smejj-1-2 bekamen exakt dieselbe Note
 * (70,59 %) bei exakt gleicher Zahl kritischer Fehler (4). Der Vergleich der
 * Einzelfaelle zeigte: die Modelle scheiterten an VOELLIG VERSCHIEDENEN
 * Faellen — 1-1 an regel-800-zeilen, schutz-daten-loeschen, budget-lcp und
 * schutz-design-lock; 1-2 an naming-schreibweise, schutz-api-schluessel,
 * architektur-static-first und patch-unified-diff. Beide hatten 10 von 14
 * richtig, nur eben andere zehn.
 *
 * Die Messung war also in Ordnung. Die MESSLATTE war zu grob: bei 14 Faellen
 * gibt es zu wenige moegliche Summen, als dass sie zwei Modelle mit
 * gegensaetzlichem Verhalten auseinanderhalten koennte. Eine Note, die fuer
 * zwei verschiedene Modelle dieselbe ist, kann keine Befoerderung begruenden
 * und keine Ablehnung erklaeren.
 *
 * Die breite Suite gibt es seit dem 03.08.: 295 Faelle in 15 Fachgebieten,
 * zusammengesetzt aus evals/packs/*.json. Sie wurde nur nie angeschlossen.
 * Umschaltbar ueber SMEJJ_MESS_SUITE, damit ein Vergleich moeglich bleibt.
 */
export const SUITE_BREIT = path.join(WURZEL, "evals/suites/smejj-chat-breit-v1.json");
export const SUITE_KERN = path.join(WURZEL, "evals/suites/smejj-chat-core-v1.json");
export const SUITE_DATEI = process.env.SMEJJ_MESS_SUITE
  ? path.join(WURZEL, "evals/suites", path.basename(String(process.env.SMEJJ_MESS_SUITE)))
  : SUITE_BREIT;
export const EVAL_PREFIX = "smejj/evals";
/** Ablage der Bewertungen, die Autopilot Nr. 83 liest (control-server/src/autopilots/smejjVersionsTaktAutopilot.js). */
export const BEWERTUNGEN_PREFIX = "smejj/bewertungen";
export const BASIS_STAND = "qwen3-4b-basis";
/**
 * WIEDERHOLUNGEN JE FALL — und warum eine genuegt.
 *
 * Wiederholungen glaetten Rauschen: wenn ein Modell auf dieselbe Frage
 * verschiedene Antworten gibt, mittelt man ueber mehrere Laeufe. Das setzt
 * voraus, dass es ueberhaupt schwankt.
 *
 * GEMESSEN 2026-09-06 an den gespeicherten Antworten des Laufs
 * smejj11-20260905221014-messung: Alle 14 Faelle lieferten DREIMAL exakt
 * denselben Text — kein einziger Unterschied. Der Grund steht in
 * salad-job/evalrun.py: die Erzeugung laeuft mit do_sample=False, also
 * deterministisch. Dieselbe Frage an dasselbe Modell gibt dieselbe Antwort.
 *
 * Drei Wiederholungen kosteten damit das Dreifache an GPU-Zeit fuer ein
 * identisches Ergebnis. Bei 14 Faellen fiel das nicht auf; bei 295 waeren es
 * 150 statt 50 Minuten — mehr als das Zeitbudget hergibt.
 *
 * Sollte die Messstrecke je auf Sampling umgestellt werden, muss dieser Wert
 * zurueck auf 3. Der Test haelt beides fest: den Wert und den Grund.
 */
export const WIEDERHOLUNGEN = 1;
// 8 GB Basis holen (~5 min), Modell laden, 14 Faelle x 3 x 2 Staende = 84
// Antworten auf einem 4B-Modell. 60 Minuten sind eine GRENZE, kein Ziel.
/**
 * ZEITBUDGET — gemessen, nicht von der kleinen Suite geerbt.
 *
 * BEFUND 2026-09-06: Der erste Lauf mit der breiten Suite schaffte in 60
 * Minuten 188 von 295 Antworten des ERSTEN von zwei Staenden, lief in die
 * Frist, und Salad startete den Job neu — von vorn, mit frischer Frist. So
 * wird eine Messung nie fertig und verbrennt trotzdem GPU-Zeit.
 *
 * Gerechnet hatte ich mit 5,1 s je Antwort. Diese Zahl stammte aus der
 * Kern-Suite (214 s fuer 42 Antworten) — deren Faelle sind kuerzer und ihre
 * drei Wiederholungen liefern denselben Text. GEMESSEN an der breiten Suite:
 * 19 s je Antwort, fast das Vierfache.
 *
 * Damit brauchen 590 Antworten (295 Faelle x 2 Staende) rund 188 Minuten.
 * 210 lassen Luft fuer das Laden des Modells, ohne dass die Frist zuschlaegt.
 *
 * Das ist derselbe Fehler wie bei minutenJeSchritt im Trainingslauf: eine Zahl,
 * die fuer einen anderen Gegenstand gemessen wurde, still uebernommen. Der Test
 * rechnet die Frist deshalb jetzt gegen die gemessene Geschwindigkeit nach.
 */
/**
 * GEMESSEN, dreimal am selben Job (07.09., Lauf smejj11-20260907014005):
 * 16,7 dann 23,1 dann 25,9 Sekunden je Antwort. DERSELBE Knoten wurde im Lauf
 * langsamer, um mehr als die Haelfte. Die 19 waren der Mittelwert eines guten
 * Laufs — als Planungsgrundlage sind sie zu optimistisch.
 *
 * 26 ist der schlechteste bisher gemessene Dauerwert. Wer hier den guten Fall
 * einsetzt, plant eine Messung, die an der Frist abbricht, NACHDEM das Training
 * bereits bezahlt ist.
 */
export const SEKUNDEN_JE_ANTWORT = 26;
/**
 * Zeitgrenze eines Messlaufs: 210 -> 330 Minuten.
 *
 * RECHNUNG statt Bauchgefuehl: 590 Antworten (Basis + Kandidat) x 26 s sind
 * 256 Minuten, dazu bis zu 30 Minuten fuer das Holen des Modells aus e2 und
 * etwas Luft — 330.
 *
 * Am 07.09. lief eine Messung mit 210 Minuten auf 46 Minuten Fehlbetrag zu.
 * Der Lauf haette den Basisstand fertig gemessen und den Kandidaten zur
 * Haelfte: keine Note, aber die volle Rechnung. Bezahlt wird ohnehin nur die
 * TATSAECHLICHE Zeit; eine grosszuegige Frist kostet nichts, eine zu knappe
 * kostet den ganzen Lauf.
 */
export const MAX_MINUTEN = 330;

/**
 * Die beiden Staende, in der Reihenfolge, die job.py ohnehin erzwingt (Fundament zuerst).
 * `nurAdapter`: nur der Kandidat, mit Adapter von Anfang an geladen. Grund (05.09.,
 * Job smejj11-20260905105320): das NACHTRAEGLICHE Anhaengen des Adapters an das
 * nf4-Modell (haenge_adapter_an) starb hart — kein Fehlerstatus, kein Ergebnis,
 * Gruppe gestoppt. Beim con-Job wird der Adapter beim Laden mitgegeben, das laeuft.
 */
export function messStaende({ nurAdapter = false, version = KANDIDAT, adapterPrefix = `con/versions/${version}/adapter` } = {}) {
  const kandidat = { version, adapterPrefix };
  return nurAdapter ? [kandidat] : [{ version: BASIS_STAND }, kandidat];
}

/**
 * Job-Parameter. Rein und testbar. `version`/`adapterPrefix` erlauben, einen
 * ZWISCHENSTAND eines Laufs als eigenen Kandidaten zu messen (05.09.: Lauf 3
 * endete bei Loss 0,027 = Auswendiglernen; checkpoint-245 hatte Loss 0,21 —
 * ob ein frueher Stopp besser ist, entscheidet die Messung, nicht der Loss).
 */
export function jobParameter({ nurAdapter = false, version = KANDIDAT, adapterPrefix } = {}) {
  return {
    CON_VERSION: version,
    CON_MESS_VERSIONEN: JSON.stringify(messStaende({ nurAdapter, version, adapterPrefix })),
    CON_EVAL_PREFIX: EVAL_PREFIX,
    CON_WIEDERHOLUNGEN: String(WIEDERHOLUNGEN)
  };
}

/**
 * Eigenes Suiten-Verzeichnis mit NUR der smejj-Suite. Seit 05.09. legt das
 * con-Buendel die Suiten aus `konfig.suitesDir` unter suites/ ab (tarball.js,
 * zusatz) — es gibt keine Kopie mehr im Job-Ordner. Der con-Job und sein
 * Suiten-Verzeichnis bleiben unangetastet: Bibliothek, nicht Werkstueck.
 */
export function baueSuitenVerzeichnis(suiteDatei = SUITE_DATEI, aufgeloesteSuite = null) {
  const ziel = mkdtempSync(path.join(os.tmpdir(), "smejj-1-1-suiten-"));
  // DIE MANIFEST-FORM WIRD HIER AUFGELOEST, nicht im Job.
  //
  // Die breite Suite enthaelt keinen einzigen Fall selbst — sie verweist auf
  // evals/packs/*.json, und das Zusammenfuehren ist mehr als Aneinanderhaengen:
  // Kurzschreibweisen werden ausgeschrieben, Standardwerte des Pakets auf jeden
  // Fall gelegt, Erwartungen gebaut, unbekannte Felder als Tippfehler
  // zurueckgewiesen (src/evaluation/evalPacks.js).
  //
  // Der Messjob auf dem Salad-Knoten liest schlicht suite["cases"]
  // (salad-job/evalrun.py#lade_suiten). Bekaeme er das Manifest, faende er
  // NULL Faelle — und bildete daraus eine Note, ohne dass irgendwo ein Fehler
  // auftaucht. Genau die Sorte stiller Fehlmessung, die diese Woche mehrfach
  // aufgetreten ist.
  //
  // Die Aufloesung in Python nachzubauen hiesse, eine zweite Wahrheit zu
  // pflegen. Der Job bekommt deshalb die FERTIGE Fallliste; evalrun.py bleibt
  // unveraendert.
  if (aufgeloesteSuite) {
    if (!Array.isArray(aufgeloesteSuite.cases) || aufgeloesteSuite.cases.length === 0) {
      throw new Error("aufgeloeste Suite ohne Faelle — der Job wuerde nichts messen und trotzdem eine Note bilden");
    }
    writeFileSync(path.join(ziel, path.basename(suiteDatei)), JSON.stringify(aufgeloesteSuite, null, 2));
  } else {
    cpSync(suiteDatei, path.join(ziel, path.basename(suiteDatei)));
  }
  return { verzeichnis: ziel, suiten: readdirSync(ziel), faelle: aufgeloesteSuite?.cases?.length ?? null };
}

/**
 * Note eines Standes aus gespeicherten Antworten — ueber dieselbe Messstrecke
 * wie run_model_eval.mjs. `callModel` gibt die Durchgaenge der Reihe nach zurueck.
 */
/**
 * Wie viele Faelle eine ECHTE Antwort haben. Leere zaehlen nicht.
 *
 * BEFUND 2026-09-06: Ein Messjob brach mitten im Adapter-Stand ab. In den
 * gespeicherten Antworten standen trotzdem alle 295 Faelle — 112 mit Text, 183
 * leer. Die Benotung wertete jede leere Antwort als "nicht bestanden" und kam
 * auf 24 %. Diese Zahl landete als gueltige Bewertung im Register, wo der
 * Versions-Takt (Nr. 83) sie gelesen und smejj-1-2 damit abgelehnt haette —
 * mit einer Begruendung, die nichts mit dem Modell zu tun hat.
 *
 * Ein Abbruch darf nicht aussehen wie ein schlechtes Modell. Beides ist "keine
 * gute Antwort", aber nur eines ist ein Urteil.
 */
export function zaehleEchteAntworten(gemessen) {
  let echt = 0, leer = 0;
  for (const fall of gemessen?.cases || []) {
    const lauf = (fall.runs || [])[0];
    if (lauf && !lauf.error && String(lauf.text || "").trim()) echt += 1; else leer += 1;
  }
  return { echt, leer, gesamt: echt + leer, anteil: echt + leer ? echt / (echt + leer) : 0 };
}

/** Ab welchem Anteil echter Antworten eine Messung ueberhaupt beurteilbar ist. */
export const MINDEST_ANTWORT_ANTEIL = 0.98;

export async function benoteAntworten(suite, antworten, stand) {
  const gemessen = (antworten.suiten || []).find((s) => s.suiteId === suite.suiteId);
  if (!gemessen) throw new Error(`Suite ${suite.suiteId} fehlt in den Antworten (${(antworten.suiten || []).map((s) => s.suiteId).join(", ") || "keine"})`);
  const zeiger = new Map();
  const callModel = async (evalCase) => {
    const fall = gemessen.cases.find((c) => c.id === evalCase.id);
    const i = zeiger.get(evalCase.id) || 0;
    zeiger.set(evalCase.id, i + 1);
    const lauf = fall?.runs?.[i];
    if (!lauf) return { ok: false, text: "", latencyMs: 0, firstTokenMs: null, backend: "salad-transformers", modelId: stand, error: "antwort_fehlt" };
    return { ok: !lauf.error && String(lauf.text || "").trim().length > 0, text: String(lauf.text || ""), latencyMs: lauf.latencyMs ?? 0,
      firstTokenMs: null, backend: "salad-transformers", modelId: stand, error: lauf.error || null };
  };
  // Fail-closed VOR der Benotung: eine unvollstaendige Messung ergibt keine
  // niedrige Note, sondern gar keine.
  const deckung = zaehleEchteAntworten(gemessen);
  if (deckung.anteil < MINDEST_ANTWORT_ANTEIL) {
    throw new Error(`Messung unvollstaendig fuer ${stand}: nur ${deckung.echt} von ${deckung.gesamt} Faellen haben eine echte Antwort `
      + `(${Math.round(deckung.anteil * 100)} %). Der Lauf wurde abgebrochen — leere Antworten als "nicht bestanden" zu werten `
      + "waere ein Urteil ueber den Abbruch, nicht ueber das Modell.");
  }
  const wdh = Math.max(1, ...gemessen.cases.map((c) => (c.runs || []).length));
  const { caseScores } = await runEvalSuite({ suite, cases: selectCases(suite), callModel, retries: 0, wiederholungen: wdh });
  const run = { modelId: stand, requestedModelId: stand, backend: "salad-transformers", transport: "salad-job",
    suiteFile: path.relative(WURZEL, SUITE_DATEI), timestamp: new Date().toISOString(), wiederholungen: wdh, jobId: antworten.jobId || null };
  return buildEvalReport({ suite, run, caseScores });
}

async function ladeSuite() {
  const { suite } = await loadEvalSuite(SUITE_DATEI);
  const pruefung = validateEvalSuite(suite);
  if (pruefung?.ok === false) throw new Error("Suite ungueltig: " + JSON.stringify(pruefung.errors || pruefung).slice(0, 200));
  return suite;
}

async function zeigeStand(client, e2, jobId = null) {
  const z = await gruppenZustand(client);
  console.log(`Salad-Gruppe ${GRUPPE}: ${z.zustand}${z.jobId ? ` (Job ${z.jobId}, ${z.modus || "?"})` : ""}`);
  const id = jobId || z.jobId;
  if (id) {
    const s = await e2.getJson(`con/logs/jobs/${id}/status.json`, null).catch(() => null);
    if (s) console.log(`Job: Phase ${s.phase}${s.stand ? `, Stand ${s.stand} (${s.standNr}/${s.staende})` : ""}${s.erledigt != null ? `, ${s.erledigt}/${s.von} Antworten` : ""}${s.fehler ? ` — FEHLER: ${s.fehler}` : ""}${s.fertig ? " — FERTIG" : ""}`);
  }
  return z;
}

async function bewerte(e2, jobId, { basisJob = jobId, version: kandidatVersion = KANDIDAT, adapterPrefix } = {}) {
  const suite = await ladeSuite();
  const berichte = [];
  for (const { version } of messStaende({ version: kandidatVersion, adapterPrefix })) {
    const job = version === BASIS_STAND ? basisJob : jobId;
    const antworten = await e2.getJson(`${EVAL_PREFIX}/${version}/${job}/antworten.json`, null).catch(() => null);
    if (!antworten) { console.log(`${version}: keine Antworten unter ${EVAL_PREFIX}/${version}/${job}/`); continue; }
    const bericht = await benoteAntworten(suite, antworten, version);
    berichte.push({ version, bericht });
    await e2.putJson(`${EVAL_PREFIX}/${version}/${jobId}/bewertung.json`, bericht);
    const ablage = path.join(WURZEL, "docs/benchmarks", `modeleval-smejj-chat-core-${version}-${jobId}.json`);
    writeFileSync(ablage, JSON.stringify(bericht, null, 2) + "\n");
    console.log(`\n=== ${version} (${antworten.leistung?.antworten ?? "?"} Antworten, ${antworten.leistung?.tokensProSekunde ?? "?"} Token/s)`);
    console.log(formatEvalSummary(bericht));
    console.log(`Bericht: ${path.relative(WURZEL, ablage)}`);
  }
  const zyklus = await e2.getJson("autopiloten/modell-evolution/letzter-zyklus.json", null).catch(() => null);
  if (zyklus?.referenzNote != null) console.log(`\nReferenz laut Nr. 72 (${zyklus.referenzAmpel || "?"}): ${zyklus.referenzNote} %`);
  const s = Object.fromEntries(berichte.map((b) => [b.version, b.bericht.summary?.weightedScore]));
  if (s[BASIS_STAND] != null && s[KANDIDAT] != null) {
    console.log(`Basis nackt ${(s[BASIS_STAND] * 100).toFixed(1)} %  →  mit Adapter ${(s[KANDIDAT] * 100).toFixed(1)} %  (Δ ${((s[KANDIDAT] - s[BASIS_STAND]) * 100).toFixed(1)} Punkte)`);
  }
  // Die ENTSCHEIDUNG trifft Autopilot Nr. 83 (smejj-Versions-Takt) im naechsten
  // Takt aus diesem Datensatz — nicht dieses Skript ("alles ueber unsere
  // Autopilots", Betreiber 05.09.). Status "neu" heisst: noch nicht beurteilt.
  const kandidat = berichte.find((b) => b.version === kandidatVersion)?.bericht;
  const basisB = berichte.find((b) => b.version === BASIS_STAND)?.bericht;
  if (kandidat) {
    const training = await e2.getJson(`con/versions/${kandidatVersion}/training.json`, null).catch(() => null);
    const datensatz = {
      id: jobId, art: "smejj-bewertung", createdAt: new Date().toISOString(), status: "neu",
      version: kandidatVersion, jobId, suite: kandidat.suite?.suiteId || "smejj-chat-core", suiteSha256: kandidat.suite?.integrity?.contentSha256 || null,
      kandidatNote: kandidat.summary?.weightedScore ?? null, basisNote: basisB?.summary?.weightedScore ?? null,
      kritisch: kandidat.summary?.criticalFailures ?? null, faelle: kandidat.summary?.cases ?? null, wackelig: kandidat.summary?.wackelig ?? null,
      referenzNote: zyklus?.referenzNote ?? null, adapterPrefix: adapterPrefix || training?.adapterPrefix || `con/versions/${kandidatVersion}/adapter`, trainingJobId: training?.jobId || null
    };
    await e2.putJson(`${BEWERTUNGEN_PREFIX}/${jobId}.json`, datensatz);
    console.log(`\nBewertung fuer Nr. 83 abgelegt: ${BEWERTUNGEN_PREFIX}/${jobId}.json (Status neu) — der Versions-Takt entscheidet im naechsten Takt.`);
  }
  console.log("Dieses Skript befoerdert nichts; der Alias smejj wird nur vom Autopiloten Nr. 83 umgehaengt.");
  return berichte;
}

async function tuev() {
  // Kaputte Probe: leere Antworten muessen 0 % und BLOCKED ergeben. Sieht die
  // Strecke das nicht, wuerde sie auch einen kaputten Adapter durchwinken.
  const suite = await ladeSuite();
  const leer = { jobId: "tuev", suiten: [{ suiteId: suite.suiteId, cases: suite.cases.map((c) => ({ id: c.id, runs: [{ text: "", latencyMs: 1, tokensOut: 0, error: null }] })) }] };
  const b = await benoteAntworten(suite, leer, "tuev-leer");
  const ok = b.summary.weightedScore === 0 && b.verdict !== "passed" && b.summary.criticalFailures > 0;
  console.log(`TUEV leere Antworten: Note ${b.summary.weightedScore}, Urteil ${b.verdict}, kritisch ${b.summary.criticalFailures} → ${ok ? "ok" : "FEHLER"}`);
  // Gesunde Probe fuer den Namensfall: eine korrekte Antwort muss bestehen.
  const fall = suite.cases.find((c) => c.id === "naming-schreibweise");
  const gesund = { jobId: "tuev", suiten: [{ suiteId: suite.suiteId, cases: [{ id: fall.id, runs: [{ text: "Der Name wird ausnahmslos smejj.com geschrieben.", latencyMs: 1, tokensOut: 5, error: null }] }] }] };
  const g = await benoteAntworten({ ...suite, cases: [fall] }, gesund, "tuev-gesund");
  const ok2 = g.summary.weightedScore === 1;
  console.log(`TUEV gesunde Antwort (${fall.id}): Note ${g.summary.weightedScore} → ${ok2 ? "ok" : "FEHLER"}`);
  if (!ok || !ok2) process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--tuev")) { await tuev(); return; }
  await ladeEnvLocal();
  const basis = leseKonfig(process.env);
  /**
   * MESSUNGEN LAUFEN AUF HOHER PRIORITAET, Trainings auf batch. Der Unterschied
   * ist nicht Bequemlichkeit, sondern folgt daraus, was eine Unterbrechung
   * jeweils kostet:
   *
   *   TRAINING  schreibt alle paar Minuten einen Zwischenstand. Wird der
   *             Container verdraengt, setzt der naechste Anlauf dort auf —
   *             verloren ist nur die Ladezeit. batch (0,09 USD/h) ist richtig.
   *
   *   MESSUNG   hat KEINEN Zwischenstand. Jede Verdraengung wirft ALLE bis
   *             dahin gesammelten Antworten weg und faengt bei null an.
   *
   * GEMESSEN am 08./09.09.: Salad raeumt Jobs auf batch etwa stuendlich ab
   * (Training 1.6 dreimal, je nach ~55 Minuten). Eine Messung ueber 590
   * Antworten braucht auf einem langsamen Knoten vier Stunden — sie kaeme dann
   * NIE durch, sondern liefe endlos im Kreis und kostete dabei durchgehend.
   *
   * high kostet 0,25 statt 0,09 USD je Stunde. Eine Messung wird damit von
   * 0,36 auf rund 1,00 USD teurer — und kommt dafuer an. Eine Messung, die nie
   * fertig wird, ist zu jedem Preis zu teuer.
   *
   * Betreiber-Entscheidung 09.09.2026. Umstellbar ueber SMEJJ_MESS_PRIORITAET.
   */
  const messPrioritaet = String(process.env.SMEJJ_MESS_PRIORITAET || "high").trim();
  const konfig = { ...trainingsKonfig(basis), salad: { ...trainingsKonfig(basis).salad, speicherGb: 30, prioritaet: messPrioritaet } };
  const e2k = e2KonfigAusEnv(process.env);
  if (!e2k.ok) { console.error("ABBRUCH: e2 nicht konfiguriert —", e2k.fehlend.join(", ")); process.exit(2); }
  if (!konfig.salad.apiKey) { console.error("ABBRUCH: SALAD_API_KEY fehlt"); process.exit(2); }
  const client = saladClient({ ok: true, ...konfig.salad });
  const e2 = e2Client(e2k, { timeoutMs: 120_000 });

  const wert = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  // --als <version> --adapter-prefix <e2-Praefix>: einen Zwischenstand als eigenen Kandidaten messen.
  const als = wert("--als") || KANDIDAT;
  const adapterPrefix = wert("--adapter-prefix") || `con/versions/${als}/adapter`;
  const iBew = argv.indexOf("--bewerten");
  if (iBew >= 0) {
    const id = argv[iBew + 1]; if (!id) throw new Error("--bewerten braucht die Job-Id");
    await bewerte(e2, id, { basisJob: wert("--basis-job") || id, version: als, adapterPrefix }); return;
  }
  const nurAdapter = argv.includes("--nur-adapter");
  if (argv.includes("--stand")) { await zeigeStand(client, e2); return; }

  const suite = await ladeSuite();
  console.log(`Suite:        ${path.relative(WURZEL, SUITE_DATEI)} (${suite.cases.length} Faelle, ${WIEDERHOLUNGEN} Wiederholungen)`);
  console.log(`Staende:      ${messStaende({ nurAdapter, version: als, adapterPrefix }).map((s) => s.version + (s.adapterPrefix ? ` (+${s.adapterPrefix})` : " (nackt)")).join(" | ")}`);
  console.log(`Salad-Gruppe: ${GRUPPE}, hoechstens ${MAX_MINUTEN} min, Prioritaet ${messPrioritaet}, rund ${(MAX_MINUTEN / 60 * (messPrioritaet === "high" ? 0.25 : 0.10)).toFixed(2)} USD`);
  const adapterDateien = await e2.liste(`${adapterPrefix.replace(/\/$/, "")}/`).catch(() => []);
  if (!adapterDateien.some((d) => /adapter_model\.safetensors$/.test(d.key)) || !adapterDateien.some((d) => /adapter_config\.json$/.test(d.key))) {
    console.error(`ABBRUCH: unter ${adapterPrefix} liegt kein vollstaendiger Adapter (adapter_config.json + adapter_model.safetensors).`); process.exit(3);
  }
  const training = await e2.getJson(`con/versions/${als}/training.json`, null).catch(() => null);
  console.log(`Adapter:      ${adapterPrefix} (${adapterDateien.length} Dateien)${training ? ` — Job ${training.jobId}, ${training.beispiele} Beispiele, Loss ${Number(training.trainLoss).toFixed(3)}` : ""}`);
  const vorher = await zeigeStand(client, e2);
  /**
   * WANN IST DIE GRUPPE FREI? Nicht dann, wenn Salad "stopped" meldet.
   *
   * BEFUND 07./08.09.: Salad teilt einen FERTIGEN Job immer wieder neu zu. Der
   * Trainingslauf von smejj 1.5 war um 12:10 fertig und lief danach die halbe
   * Nacht im Kreis — jeder Anlauf las seinen eigenen Zwischenstand, stellte
   * fest "bereits vollstaendig", endete nach Minuten, und Salad startete ihn
   * erneut. Die Gruppe war nie "stopped", also brach diese Pruefung jedes Mal
   * ab: die Messung ist ueber Stunden NIE gestartet, obwohl der Adapter fertig
   * in der Ablage lag.
   *
   * Das verlaessliche Kennzeichen ist das ERGEBNIS, nicht der Zustand: Wer
   * seinen Adapter (Training) oder seine Bewertung (Messung) abgelegt hat, ist
   * fertig — was Salad danach mit dem Container macht, ist dessen Sache. Der
   * neue Messjob ueberschreibt die Gruppenkonfiguration ohnehin.
   *
   * Der Schutz bleibt scharf: Ein Job OHNE abgelegtes Ergebnis haelt die
   * Gruppe weiterhin besetzt, und dann wird nichts angefasst — laufende
   * Rechenzeit ist bezahlte Rechenzeit.
   */
  const laufendesErgebnisDa = await (async () => {
    if (!vorher.jobId) return false;
    const st = await e2.getJson(`con/logs/jobs/${vorher.jobId}/status.json`, null).catch(() => null);
    const version = st?.version || st?.kandidat || null;
    const bewertung = await e2.getJson(`${BEWERTUNGEN_PREFIX}/${vorher.jobId}.json`, null).catch(() => null);
    const tr = version ? await e2.getJson(`con/versions/${version}/training.json`, null).catch(() => null) : null;
    return Boolean(bewertung) || Boolean(tr && tr.jobId === vorher.jobId);
  })();

  if (!["stopped", "failed", "fehlt"].includes(vorher.zustand) && !laufendesErgebnisDa) {
    console.error(`ABBRUCH: die Gruppe ist nicht frei (${vorher.zustand}) — dort laeuft ein Job, der sein Ergebnis noch NICHT abgelegt hat.`);
    process.exit(4);
  }
  if (laufendesErgebnisDa && !["stopped", "failed", "fehlt"].includes(vorher.zustand)) {
    console.log(`Hinweis: ${vorher.jobId} hat sein Ergebnis laengst abgelegt und wurde von Salad nur neu zugeteilt — die Messung ueberschreibt ihn.`);
  }
  if (!argv.includes("--starten")) { console.log("\nProbelauf — nichts gestartet. Mit --starten wird wirklich gemessen."); return; }

  // Die Suite wird HIER aufgeloest und fertig mitgeschickt.
  const suiteFuerJob = await ladeSuite();
  const suiten = baueSuitenVerzeichnis(SUITE_DATEI, suiteFuerJob);
  console.log(`Suiten im Buendel: ${suiten.suiten.join(", ")} (aus ${suiten.verzeichnis})`);
  const jobId = `smejj11-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-messung`;
  const vor = await bereiteJobVor({ client, konfig: { ...konfig, suitesDir: suiten.verzeichnis }, e2: e2k, jobId, modus: "messung",
    parameter: jobParameter({ nurAdapter, version: als, adapterPrefix }), maxMinuten: MAX_MINUTEN, log: (z) => console.log(`  ${z}`) });
  rmSync(suiten.verzeichnis, { recursive: true, force: true });
  if (!vor.ok) { console.error("ABBRUCH:", vor.gruende.join("; ")); process.exit(5); }
  const start = await warteUndStarte(client);
  if (!start.ok) { console.error(`ABBRUCH: Start abgelehnt (HTTP ${start.status})`, JSON.stringify(start.daten).slice(0, 200)); process.exit(6); }
  console.log(`Messjob ${jobId} gestartet. Fortschritt: --stand, danach --bewerten ${jobId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}

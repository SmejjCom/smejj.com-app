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
//   node scripts/training/smejj-1-1-messen.mjs --bewerten <jobId> [--basis-job <jobId2>]  (Noten rechnen)
//   node scripts/training/smejj-1-1-messen.mjs --tuev              (Messstrecke mit leeren Antworten: muss 0 % und BLOCKED melden)
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
export const SUITE_DATEI = path.join(WURZEL, "evals/suites/smejj-chat-core-v1.json");
export const EVAL_PREFIX = "smejj/evals";
/** Ablage der Bewertungen, die Autopilot Nr. 83 liest (control-server/src/autopilots/smejjVersionsTaktAutopilot.js). */
export const BEWERTUNGEN_PREFIX = "smejj/bewertungen";
export const BASIS_STAND = "qwen3-4b-basis";
export const WIEDERHOLUNGEN = 3;
// 8 GB Basis holen (~5 min), Modell laden, 14 Faelle x 3 x 2 Staende = 84
// Antworten auf einem 4B-Modell. 60 Minuten sind eine GRENZE, kein Ziel.
export const MAX_MINUTEN = 60;

/**
 * Die beiden Staende, in der Reihenfolge, die job.py ohnehin erzwingt (Fundament zuerst).
 * `nurAdapter`: nur der Kandidat, mit Adapter von Anfang an geladen. Grund (05.09.,
 * Job smejj11-20260905105320): das NACHTRAEGLICHE Anhaengen des Adapters an das
 * nf4-Modell (haenge_adapter_an) starb hart — kein Fehlerstatus, kein Ergebnis,
 * Gruppe gestoppt. Beim con-Job wird der Adapter beim Laden mitgegeben, das laeuft.
 */
export function messStaende({ nurAdapter = false } = {}) {
  const kandidat = { version: KANDIDAT, adapterPrefix: `con/versions/${KANDIDAT}/adapter` };
  return nurAdapter ? [kandidat] : [{ version: BASIS_STAND }, kandidat];
}

/** Job-Parameter. Rein und testbar. */
export function jobParameter({ nurAdapter = false } = {}) {
  return {
    CON_VERSION: KANDIDAT,
    CON_MESS_VERSIONEN: JSON.stringify(messStaende({ nurAdapter })),
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
export function baueSuitenVerzeichnis(suiteDatei = SUITE_DATEI) {
  const ziel = mkdtempSync(path.join(os.tmpdir(), "smejj-1-1-suiten-"));
  cpSync(suiteDatei, path.join(ziel, path.basename(suiteDatei)));
  return { verzeichnis: ziel, suiten: readdirSync(ziel) };
}

/**
 * Note eines Standes aus gespeicherten Antworten — ueber dieselbe Messstrecke
 * wie run_model_eval.mjs. `callModel` gibt die Durchgaenge der Reihe nach zurueck.
 */
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

async function bewerte(e2, jobId, { basisJob = jobId } = {}) {
  const suite = await ladeSuite();
  const berichte = [];
  for (const { version } of messStaende()) {
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
  const kandidat = berichte.find((b) => b.version === KANDIDAT)?.bericht;
  const basisB = berichte.find((b) => b.version === BASIS_STAND)?.bericht;
  if (kandidat) {
    const training = await e2.getJson(`con/versions/${KANDIDAT}/training.json`, null).catch(() => null);
    const datensatz = {
      id: jobId, art: "smejj-bewertung", createdAt: new Date().toISOString(), status: "neu",
      version: KANDIDAT, jobId, suite: kandidat.suite?.suiteId || "smejj-chat-core", suiteSha256: kandidat.suite?.integrity?.contentSha256 || null,
      kandidatNote: kandidat.summary?.weightedScore ?? null, basisNote: basisB?.summary?.weightedScore ?? null,
      kritisch: kandidat.summary?.criticalFailures ?? null, faelle: kandidat.summary?.cases ?? null, wackelig: kandidat.summary?.wackelig ?? null,
      referenzNote: zyklus?.referenzNote ?? null, adapterPrefix: training?.adapterPrefix || `con/versions/${KANDIDAT}/adapter`, trainingJobId: training?.jobId || null
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
  const konfig = { ...trainingsKonfig(basis), salad: { ...trainingsKonfig(basis).salad, speicherGb: 30 } };
  const e2k = e2KonfigAusEnv(process.env);
  if (!e2k.ok) { console.error("ABBRUCH: e2 nicht konfiguriert —", e2k.fehlend.join(", ")); process.exit(2); }
  if (!konfig.salad.apiKey) { console.error("ABBRUCH: SALAD_API_KEY fehlt"); process.exit(2); }
  const client = saladClient({ ok: true, ...konfig.salad });
  const e2 = e2Client(e2k, { timeoutMs: 120_000 });

  const iBew = argv.indexOf("--bewerten");
  if (iBew >= 0) {
    const id = argv[iBew + 1]; if (!id) throw new Error("--bewerten braucht die Job-Id");
    const iB = argv.indexOf("--basis-job");
    await bewerte(e2, id, { basisJob: iB >= 0 ? argv[iB + 1] : id }); return;
  }
  const nurAdapter = argv.includes("--nur-adapter");
  if (argv.includes("--stand")) { await zeigeStand(client, e2); return; }

  const suite = await ladeSuite();
  console.log(`Suite:        ${path.relative(WURZEL, SUITE_DATEI)} (${suite.cases.length} Faelle, ${WIEDERHOLUNGEN} Wiederholungen)`);
  console.log(`Staende:      ${messStaende({ nurAdapter }).map((s) => s.version + (s.adapterPrefix ? ` (+${s.adapterPrefix})` : " (nackt)")).join(" | ")}`);
  console.log(`Salad-Gruppe: ${GRUPPE}, hoechstens ${MAX_MINUTEN} min, rund ${(MAX_MINUTEN / 60 * 0.10).toFixed(2)} USD`);
  const training = await e2.getJson(`con/versions/${KANDIDAT}/training.json`, null).catch(() => null);
  if (!training?.adapterPrefix) { console.error("ABBRUCH: kein Adapter unter con/versions/" + KANDIDAT); process.exit(3); }
  console.log(`Adapter:      ${training.adapterPrefix} — Job ${training.jobId}, ${training.beispiele} Beispiele, Loss ${Number(training.trainLoss).toFixed(3)}, Stand ${training.stand}`);
  const vorher = await zeigeStand(client, e2);
  if (!["stopped", "failed", "fehlt"].includes(vorher.zustand)) { console.error(`ABBRUCH: die Gruppe ist nicht frei (${vorher.zustand}) — Training oder Messung laeuft oder wird gerade zugeteilt.`); process.exit(4); }
  if (!argv.includes("--starten")) { console.log("\nProbelauf — nichts gestartet. Mit --starten wird wirklich gemessen."); return; }

  const suiten = baueSuitenVerzeichnis();
  console.log(`Suiten im Buendel: ${suiten.suiten.join(", ")} (aus ${suiten.verzeichnis})`);
  const jobId = `smejj11-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-messung`;
  const vor = await bereiteJobVor({ client, konfig: { ...konfig, suitesDir: suiten.verzeichnis }, e2: e2k, jobId, modus: "messung",
    parameter: jobParameter({ nurAdapter }), maxMinuten: MAX_MINUTEN, log: (z) => console.log(`  ${z}`) });
  rmSync(suiten.verzeichnis, { recursive: true, force: true });
  if (!vor.ok) { console.error("ABBRUCH:", vor.gruende.join("; ")); process.exit(5); }
  const start = await warteUndStarte(client);
  if (!start.ok) { console.error(`ABBRUCH: Start abgelehnt (HTTP ${start.status})`, JSON.stringify(start.daten).slice(0, 200)); process.exit(6); }
  console.log(`Messjob ${jobId} gestartet. Fortschritt: --stand, danach --bewerten ${jobId}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}

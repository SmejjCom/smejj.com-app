// muuny AI — Teil 2: trainieren, aber nur mit NEUEN echten Daten (Owner-Auftrag 21.09.2026).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { leseMonatsverbrauch } from "../workers/muuny-autopilot/budget.js";
import { baueLernpaarDatensatz, leseBasis, leseLernpaare } from "../workers/muuny-autopilot/datensatz.js";
import { GRUNDMODELL, HERZSCHLAG_STILL_MINUTEN, ladeSuiten, planeTraining, suitenStand, tick }
  from "../workers/muuny-autopilot/kreislauf.js";
import { L } from "../workers/muuny-autopilot/lager.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitesDir = path.join(ROOT, "workers/muuny-autopilot/suites");
const jobDir = path.join(ROOT, "workers/muuny-autopilot/salad-job");

/** Ein echtes Lernpaar, wie Teil 1 es ablegt. */
const paar = (i, extra = {}) => JSON.stringify({ schemaVersion: 1, frage: `Frage Nummer ${i}: wie geht das genau?`,
  antwort: `Antwort ${i}: so geht das, Schritt fuer Schritt erklaert.`, herkunft: "daumen_hoch",
  erfasstAm: "2026-09-21T10:00:00.000Z", einwilligung: { evidenceId: `beleg-${i}` }, ...extra });

/** e2 im Arbeitsspeicher: Text- und JSON-Objekte, Listen nach Prefix. */
function speicher(start = {}) {
  const o = new Map(Object.entries(start));
  return {
    o,
    async liste(prefix) { return [...o.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key, size: 1 })); },
    async getText(k) { const v = o.get(k); return v === undefined ? null : (typeof v === "string" ? v : JSON.stringify(v)); },
    async getJson(k, standard = null) { const v = o.get(k); return v === undefined ? standard : (typeof v === "string" ? JSON.parse(v) : structuredClone(v)); },
    async putJson(k, v) { o.set(k, structuredClone(v)); },
    async putText(k, t) { o.set(k, t); }
  };
}
const mitPaaren = (n, extra = {}) => Object.fromEntries(Array.from({ length: n }, (_, i) =>
  [`${L.paare}/2026/09/21/${String(i).padStart(8, "0")}-0000-4000-8000-000000000000.json`, paar(i)]).concat(Object.entries(extra)));

test("Nur echte Paare: fremde Herkunft, fehlender Beleg und Unlesbares fliegen raus — sichtbar gezaehlt", async () => {
  const e2 = speicher({
    [`${L.paare}/2026/09/21/a.json`]: paar(1),
    [`${L.paare}/2026/09/21/b.json`]: paar(2, { herkunft: "erzeugt" }),
    [`${L.paare}/2026/09/21/c.json`]: paar(3, { einwilligung: null }),
    [`${L.paare}/2026/09/21/d.json`]: "{kaputt",
    [`${L.paare}/2026/09/21/LIESMICH.txt`]: "kein Paar"
  });
  const r = await leseLernpaare(e2);
  assert.equal(r.paare.length, 1);
  assert.deepEqual(r.verworfen, { unlesbar: 1, herkunft: 1, ohne_einwilligung: 1 });
});

test("Basis-Datensatz: ein ERZEUGTER wird abgelehnt, einer ohne bestaetigte Rechte auch", async () => {
  const e2 = speicher({
    [`${L.datensaetze}/v3/manifest.json`]: { quelle: { art: "erzeugt" } },
    [`${L.datensaetze}/lic/manifest.json`]: { quelle: { art: "lizenziert" }, rechte: { bestaetigt: false } },
    [`${L.datensaetze}/ok/manifest.json`]: { quelle: { art: "lizenziert" }, rechte: { bestaetigt: true } },
    [`${L.datensaetze}/ok/train.jsonl`]: '{"messages":[{"role":"user","content":"a"},{"role":"assistant","content":"b"}]}\n'
  });
  assert.equal((await leseBasis(e2, "v3")).grund, "basis_ist_erzeugt_verboten",
    "genau die Daten, mit denen muuny-1.4 bis 1.11 schlechter wurden");
  assert.equal((await leseBasis(e2, "lic")).grund, "basis_rechte_nicht_bestaetigt");
  assert.equal((await leseBasis(e2, "fehlt")).ok, false);
  assert.equal((await leseBasis(e2, "ok")).zeilen.length, 1);
  assert.equal((await leseBasis(e2, null)).ok, true, "ohne Basis geht es auch — nur mit den echten Paaren");
});

test("Datensatz: entdoppelt, gemischt, mit Manifest — und derselbe Stand ergibt denselben Namen", async () => {
  const suiten = await ladeSuiten(suitesDir);
  const doppelt = { [`${L.paare}/2026/09/21/zz-doppelt.json`]: paar(5) }; // gleicher Inhalt wie Paar 5
  const e2 = speicher(mitPaaren(120, doppelt));
  const a = await baueLernpaarDatensatz(e2, { suiten, runde: 1, env: {} });
  assert.equal(a.ok, true, a.grund);
  assert.equal(a.paare, 120, "das Duplikat ist raus");
  assert.match(a.name, /^muuny-lernpaare-r1-[a-f0-9]{8}$/);
  const manifest = await e2.getJson(`${a.prefix}/manifest.json`);
  assert.equal(manifest.paare, 120);
  assert.equal(manifest.gemischt, true);
  assert.match(manifest.dateien[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.quelle.art, "lernpaare");
  const zeilen = (await e2.getText(`${a.prefix}/train.jsonl`)).trim().split("\n").map((z) => JSON.parse(z).messages[0].content);
  assert.notDeepEqual(zeilen.slice(0, 5), ["Frage Nummer 0", "Frage Nummer 1"].slice(0, 5), "sortiert waere gefaehrlich");
  assert.ok(!zeilen.slice(0, 10).every((z, i) => z.startsWith(`Frage Nummer ${i}:`)), "die Datei muss gemischt sein");
  const b = await baueLernpaarDatensatz(e2, { suiten, runde: 1, env: {} });
  assert.equal(b.name, a.name);
  assert.equal(b.sha256, a.sha256, "deterministisch: gleicher Stand, gleiche Datei");
});

test("Datensatz: ein Pruefsuitenfall darf nie Trainingsstoff werden", async () => {
  const suiten = await ladeSuiten(suitesDir);
  const fall = suiten[0].cases[0].prompt;
  const e2 = speicher(mitPaaren(80, { [`${L.paare}/2026/09/21/suite.json`]: paar(999, { frage: fall }) }));
  const r = await baueLernpaarDatensatz(e2, { suiten, runde: 2, env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.bericht.abgelehnt.suitenfall, 1, "wer die Pruefung auswendig lernt, besteht sie nur scheinbar");
});

test("KAPUTT: keine gueltigen Paare -> kein Datensatz", async () => {
  const r = await baueLernpaarDatensatz(speicher({ [`${L.paare}/x.json`]: paar(1, { herkunft: "api" }) }), { suiten: [], env: {} });
  assert.deepEqual({ ok: r.ok, grund: r.grund }, { ok: false, grund: "keine_gueltigen_lernpaare" });
});

test("Versionsnummer beginnt HINTER der letzten vergebenen: muuny-1.12", () => {
  const vergeben = ["muuny-1.0", "muuny-1.1", "muuny-1.2", "muuny-1.3", "muuny-1.4", "muuny-1.5", "muuny-1.6",
    "muuny-1.7", "muuny-1.8", "muuny-1.9", "muuny-1.10", "muuny-1.11"];
  const registry = { versions: vergeben.map((version) => ({ version, status: version === "muuny-1.3" ? "stable" : "rejected" })) };
  const job = planeTraining({ konfig: { basis: { prefix: "muuny/base/x" }, wiederholungen: 1, grenzen: { jobMaxMinuten: 260 } },
    registry, stabil: { version: "muuny-1.3", basisPrefix: "muuny/base/x" },
    datensatz: { name: "muuny-lernpaare-r1-abcd1234", prefix: "muuny/datasets/muuny-lernpaare-r1-abcd1234", paare: 512 }, faelle: 102 });
  assert.equal(job.version, "muuny-1.12", "sonst ueberschreibt der Autopilot bestehende Staende");
  assert.equal(job.modus, "training+messung");
  assert.equal(job.parameter.MUUNY_DATENSATZ_PREFIX, "muuny/datasets/muuny-lernpaare-r1-abcd1234");
  assert.match(job.ziel, /512 echten Lernpaaren/);
});

// --- Ganze Takte ----------------------------------------------------------

async function ausgangslage(n, { saladStartOk = true } = {}) {
  const stand = await suitenStand(suitesDir);
  const e2 = speicher(mitPaaren(n, {
    [L.grundmodell]: { punktzahl: 0.9, suitenStand: stand },
    [L.registry]: { versions: [{ version: "muuny-1.3", status: "stable", basisPrefix: "muuny/base/x",
      benchmarks: { gesamt: 0.96, kritisch: 1, kategorien: {}, suitenStand: stand } }] }
  }));
  let gestartet = 0;
  const salad = {
    lese: async () => ({ ok: true, status: 200, daten: { current_state: { status: "stopped" } } }),
    aktualisiere: async () => ({ ok: true, status: 200 }),
    erzeuge: async () => ({ ok: true, status: 201 }),
    starte: async () => { gestartet += 1; return saladStartOk ? { ok: true, status: 202 } : { ok: false, status: 500, daten: "salad weg" }; },
    stoppe: async () => ({ ok: true, status: 202 })
  };
  const konfig = { basis: { prefix: "muuny/base/x", repo: "Qwen/Qwen3.8-27B" }, wiederholungen: 1, suitesDir, jobDir, taktMs: 300000,
    e2: { endpoint: "https://e2.example", region: "r", bucket: "b", accessKey: "a", secretKey: "s" },
    salad: { gruppe: "muuny-training", organisation: "o", projekt: "p", apiKey: "k", image: "i", vcpu: 8, ramMb: 1024,
      gpuKlassen: ["a5db5c50-cbcb-4596-ae80-6a0c8090d80f"], speicherGb: 150, prioritaet: "low" },
    grenzen: { tagesbudgetUsd: 5.5, monatsdeckelUsd: 15, gesamtdeckelUsd: 50, jobMaxMinuten: 260, freigabe: true, notaus: false } };
  return { e2, salad, konfig, gestartet: () => gestartet };
}

test("Unter 500 neuen Paaren: kein GPU-Start, der Stand bleibt", async () => {
  const w = await ausgangslage(499);
  const z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(w.gestartet(), 0);
  assert.equal(z.phase, "wartet_auf_paare");
  assert.match(z.plan.grund, /499 von 500/);
  assert.equal(await w.e2.getJson(L.paarStand, null), null);
});

test("500 neue Paare: Datensatz gebaut, EIN Job gestartet, Stand fortgeschrieben", async () => {
  const w = await ausgangslage(500);
  const z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(w.gestartet(), 1, z.plan?.grund || JSON.stringify(z.startBlockiert));
  assert.equal(z.phase, "job_laeuft");
  assert.equal(z.laufenderJob.kandidat, "muuny-1.4", "Register hier nur mit 1.3 — die erste freie Nummer");
  const stand = await w.e2.getJson(L.paarStand);
  assert.equal(stand.paare, 500);
  assert.equal(stand.runde, 1);
  assert.match(stand.datensatz, /^muuny-lernpaare-r1-/);

  // Der naechste Takt sieht den laufenden Job — und startet KEINEN zweiten.
  await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(w.gestartet(), 1, "nie mehr als ein Job zugleich");
});

test("KAPUTT: scheitert der Start, bleiben die Paare NEU — die Runde ist nicht verbraucht", async () => {
  const w = await ausgangslage(500, { saladStartOk: false });
  const z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(z.laufenderJob ?? null, null);
  assert.ok(z.startBlockiert, "der Grund muss sichtbar sein");
  assert.equal(await w.e2.getJson(L.paarStand, null), null, "sonst waeren 500 echte Paare fuer nichts verbraucht");
});

test("KAPUTT: unlesbarer Monatszaehler -> kein Start", async () => {
  const w = await ausgangslage(500);
  const liste = w.e2.liste;
  w.e2.liste = async (p) => { if (p.startsWith(L.kosten)) throw new Error("e2 antwortet 503"); return liste(p); };
  const z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(w.gestartet(), 0);
  assert.ok(z.startBlockiert.gruende.includes("monatszaehler_unlesbar"));
});

test("Monatsverbrauch summiert nur den laufenden Monat und wirft bei einem kaputten Buch", async () => {
  const e2 = speicher({
    [`${L.kosten}/2026-09-01.json`]: { summeUsd: 0.4 }, [`${L.kosten}/2026-09-20.json`]: { summeUsd: 0.7 },
    [`${L.kosten}/2026-08-31.json`]: { summeUsd: 9 }, [`${L.kosten}/gesamt.json`]: { summeUsd: 20 }
  });
  assert.deepEqual(await leseMonatsverbrauch(e2, new Date("2026-09-21T12:00:00Z")), { monat: "2026-09", summeUsd: 1.1, tage: 2 });
  e2.o.set(`${L.kosten}/2026-09-21.json`, "{kaputt");
  await assert.rejects(() => leseMonatsverbrauch(e2, new Date("2026-09-21T12:00:00Z")));
});

// --- Herzschlag ist die Wahrheit ---------------------------------------------

function laufenderJob(e2, { gestartetVorMin, status }) {
  const jetzt = Date.now();
  e2.o.set(L.zustand, { phase: "job_laeuft", historie: [], laufenderJob: { jobId: "j-hs", taskId: "t-hs", modus: "training+messung",
    version: "muuny-1.12", kandidat: "muuny-1.12", gestartet: new Date(jetzt - gestartetVorMin * 60_000).toISOString(), maxMinuten: 260 } });
  if (status) e2.o.set(`${L.jobs}/j-hs/status.json`, status);
}

test("Salad sagt 'running', der Herzschlag schweigt 20 Minuten: der Job ist tot", async () => {
  const w = await ausgangslage(0);
  laufenderJob(w.e2, { gestartetVorMin: 90, status: { phase: "training", aktualisiert: new Date(Date.now() - (HERZSCHLAG_STILL_MINUTEN + 1) * 60_000).toISOString() } });
  w.salad.lese = async () => ({ ok: true, status: 200, daten: { current_state: { status: "running" } } });
  const z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(z.laufenderJob, null);
  assert.equal(z.letzterJob.grund, "herzschlag_verstummt");
});

test("Warten auf einen Rechner ist kein toter Job — und zaehlt nicht gegen die Zeitgrenze", async () => {
  const w = await ausgangslage(0);
  w.salad.lese = async () => ({ ok: true, status: 200, daten: { current_state: { status: "deploying" } } });
  // 200 Minuten gewartet, dann erster Herzschlag vor 1 Minute.
  laufenderJob(w.e2, { gestartetVorMin: 200, status: { phase: "laden", aktualisiert: new Date(Date.now() - 60_000).toISOString() } });
  let z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(z.phase, "job_laeuft");
  assert.ok(z.laufenderJob.ersterHerzschlag);
  // 100 Minuten spaeter (300 seit Gruppenstart, 100 seit erstem Herzschlag): laeuft weiter.
  const zs = await w.e2.getJson(L.zustand);
  zs.laufenderJob.ersterHerzschlag = new Date(Date.now() - 100 * 60_000).toISOString();
  w.e2.o.set(L.zustand, zs);
  w.e2.o.set(`${L.jobs}/j-hs/status.json`, { phase: "training", aktualisiert: new Date().toISOString() });
  z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
  assert.equal(z.phase, "job_laeuft", "vorher waere er hier nach 280 Minuten seit Gruppenstart abgeschossen worden");
});

test("Der Zyklus-Zaehler steigt nur, wenn wirklich trainiert wurde", async () => {
  for (const [neueSchritte, erwartet] of [[0, 0], [37, 1]]) {
    const w = await ausgangslage(0);
    laufenderJob(w.e2, { gestartetVorMin: 30, status: { phase: "fertig", aktualisiert: new Date().toISOString() } });
    w.e2.o.set(`${L.jobs}/j-hs/ergebnis.json`, { ok: false, grund: "test", training: { neueSchritte } });
    const z = await tick({ e2: w.e2, salad: w.salad, konfig: w.konfig, log: () => {} });
    assert.equal(z.zyklen || 0, erwartet, `neueSchritte=${neueSchritte}`);
  }
});

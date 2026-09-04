// smejj.com — Basismodell Qwen3-4B-Instruct nach IDrive e2 spiegeln.
//
// WARUM NICHT LOKAL: Das Modell ist rund 8 GB. Die Leitung des Betreibers
// liefert 1,5 Mbit/s — das waeren zwoelf Stunden, und der Mac ist fuer
// Rechen- und Modellarbeit tabu (Betreiber-Regel). Der Salad-Knoten haengt an
// einer schnellen Leitung und laedt direkt von Hugging Face nach e2.
//
// WARUM DER con-JOB: Der Spiegel-Code ist erprobt — ueber ihn sind die 55,6 GB
// des con-Basismodells angekommen (workers/con-autopilot/salad-job/mirror.py:
// Wiederaufnahme je Datei, HTTP-Range, SHA-256-Pruefung, eine Datei mit
// falscher Summe wird NICHT hochgeladen). Ein zweiter Spiegel waere doppelte
// Arbeit mit halber Verlaesslichkeit.
//
// EIGENE GRUPPE: smejj-spiegel, NICHT con-job. Der con-Autopilot laeuft rund
// um die Uhr; seine Gruppe umzukonfigurieren wuerde einen laufenden
// Trainingslauf abbrechen.
//
// KEIN TRAINING: Modus "spiegel" laedt nur herunter und legt ab. job.py
// verlangt nur bei "messung" oder "training" eine CUDA-Karte.
//
// Aufruf:
//   node scripts/training/smejj-1-1-basis-spiegeln.mjs            (nur zeigen, was passieren wuerde)
//   node scripts/training/smejj-1-1-basis-spiegeln.mjs --starten   (Job wirklich starten)
//   node scripts/training/smejj-1-1-basis-spiegeln.mjs --stand     (Fortschritt abfragen)
import { leseKonfig } from "../../workers/con-autopilot/config.js";
import { saladClient, bereiteJobVor, gruppenZustand } from "../../workers/con-autopilot/salad.js";
import { e2KonfigAusEnv, e2Client } from "../../workers/con-autopilot/e2.js";

export const REPO = "Qwen/Qwen3-4B-Instruct";
export const PREFIX = "models/staging/qwen3-4b-instruct";
export const GRUPPE = "smejj-spiegel";
// 8 GB von Hugging Face auf einen Salad-Knoten und weiter nach e2: Minuten,
// nicht Stunden. 60 Minuten sind reichlich Luft und zugleich eine harte Grenze —
// ohne Zeitgrenze wird nicht gestartet (Regel des con-Autopiloten).
export const MAX_MINUTEN = 60;
// 30 GB Plattenplatz statt der 150 des con-Jobs: das Modell ist ein Fuenftel so
// gross wie Qwen3.8-27B.
export const SPEICHER_GB = 30;

/** Baut die Konfiguration fuer den Spiegel-Job — eigene Gruppe, eigenes Ziel. */
export function spiegelKonfig(basis) {
  return {
    ...basis,
    basis: { repo: REPO, prefix: PREFIX },
    salad: { ...basis.salad, gruppe: GRUPPE, speicherGb: SPEICHER_GB }
  };
}

async function zeigeStand(client, e2) {
  const z = await gruppenZustand(client);
  console.log(`Salad-Gruppe ${GRUPPE}: ${z.zustand}${z.jobId ? ` (Job ${z.jobId}, Modus ${z.modus})` : ""}`);
  const manifest = await e2.getJson(`${PREFIX}/manifest.json`, null).catch(() => null);
  if (manifest) {
    const gb = (Number(manifest.gesamtBytes || 0) / 1024 ** 3).toFixed(1);
    console.log(`e2 ${PREFIX}: ${manifest.komplett ? "KOMPLETT" : "unvollstaendig"} — ${manifest.dateien?.length || 0} Dateien, ${gb} GB`);
  } else {
    console.log(`e2 ${PREFIX}: noch nichts abgelegt`);
  }
  const status = await e2.getJson(`${PREFIX}/status.json`, null).catch(() => null);
  if (status) console.log(`Fortschritt: Phase ${status.phase}, ${status.fertigDateien ?? "?"}/${status.vonDateien ?? "?"} Dateien`);
  return z;
}

async function main() {
  const konfig = spiegelKonfig(leseKonfig(process.env));
  const e2k = e2KonfigAusEnv(process.env);
  if (!e2k.ok) { console.error("ABBRUCH: e2 nicht konfiguriert —", e2k.fehlend.join(", ")); process.exit(2); }
  if (!konfig.salad.organisation || !konfig.salad.projekt || !konfig.salad.apiKey) {
    console.error("ABBRUCH: Salad nicht konfiguriert (SALAD_ORGANIZATION_NAME, SALAD_PROJECT_NAME, SALAD_API_KEY)");
    process.exit(2);
  }
  const client = saladClient({ ok: true, ...konfig.salad });
  const e2 = e2Client(e2k, { timeoutMs: 60_000 });

  if (process.argv.includes("--stand")) { await zeigeStand(client, e2); return; }

  console.log(`Basismodell:  ${REPO}`);
  console.log(`Ziel auf e2:  ${PREFIX}`);
  console.log(`Salad-Gruppe: ${GRUPPE} (eigene — con-job bleibt unberuehrt)`);
  console.log(`Grenzen:      ${MAX_MINUTEN} min, ${SPEICHER_GB} GB Platte, Priorität ${konfig.salad.prioritaet}, Selbstabschaltung an`);
  const vorher = await zeigeStand(client, e2);
  if (vorher.zustand === "running") {
    console.error("ABBRUCH: die Gruppe laeuft bereits — erst abwarten oder stoppen.");
    process.exit(3);
  }

  if (!process.argv.includes("--starten")) {
    console.log("\nProbelauf — nichts gestartet. Mit --starten wird der Job wirklich angelegt und gestartet.");
    return;
  }

  const jobId = `smejj11-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-spiegel`;
  const vor = await bereiteJobVor({
    client, konfig, e2: e2k, jobId, modus: "spiegel",
    parameter: { CON_VERSION: "smejj-1-1" }, maxMinuten: MAX_MINUTEN,
    log: (z) => console.log(`  ${z}`)
  });
  if (!vor.ok) { console.error("ABBRUCH:", vor.gruende.join("; ")); process.exit(4); }
  console.log(`Job ${jobId} vorbereitet (Buendel ${vor.buendelDateien} Dateien).`);
  const start = await client.starte();
  if (!start.ok) { console.error(`ABBRUCH: Start abgelehnt (HTTP ${start.status})`, JSON.stringify(start.daten).slice(0, 200)); process.exit(5); }
  console.log("Job gestartet. Fortschritt: dieses Skript mit --stand aufrufen.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}

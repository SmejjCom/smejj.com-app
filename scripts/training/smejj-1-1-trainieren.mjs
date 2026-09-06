// smejj.com — Ersten Trainingslauf fuer smejj 1.1 starten (QLoRA auf Salad).
//
// Betreiber-Entscheidung 2026-09-05: "Salad, wie con" — ein JOB je Lauf, kein
// Dauerdienst. Zwischen zwei Laeufen kostet nichts, und es gibt keine Adresse,
// die stehenbleiben und Geld verbrauchen kann.
//
// WAS LAEUFT: Der erprobte con-Job (salad-job/train.py) trainiert einen
// QLoRA-Adapter auf dem gespiegelten Basismodell mit dem gebauten Datensatz.
// Zwischenstaende gehen alle paar Minuten nach e2; auch ein an der Zeitgrenze
// abgebrochener Lauf hinterlaesst einen brauchbaren Adapter.
//
// EIGENE GRUPPE smejj-training, NICHT con-job: der con-Autopilot laeuft rund um
// die Uhr, seine Gruppe umzukonfigurieren wuerde einen laufenden Lauf abbrechen.
//
// WAS ES KOSTET (Salad-Preise, Stand 03.09., Prioritaet "batch"): 0,09 bis 0,10
// USD je Stunde auf einer 24-GB-Karte. Bei der Zeitgrenze von 170 Minuten also
// hoechstens rund 0,28 USD. Der Monatsdeckel liegt bei 10 USD.
//
// WAS DANACH FEHLT: Die Bewertung. Der Adapter muss gegen dieselbe Suite
// gemessen werden, die heute schon misst (smejj-chat-core-v1, 14 Faelle), und
// erst wenn er die Referenz schlaegt, darf er befoerdert werden — mit
// menschlicher Freigabe. Dieses Skript trainiert nur.
//
// Aufruf:
//   node scripts/training/smejj-1-1-trainieren.mjs            (nur zeigen)
//   node scripts/training/smejj-1-1-trainieren.mjs --starten   (wirklich starten)
//   node scripts/training/smejj-1-1-trainieren.mjs --stand     (Fortschritt)
import { leseKonfig } from "../../workers/con-autopilot/config.js";
import { saladClient, bereiteJobVor, gruppenZustand } from "../../workers/con-autopilot/salad.js";
import { e2KonfigAusEnv, e2Client } from "../../workers/con-autopilot/e2.js";
import { REPO, PREFIX as BASIS_PREFIX } from "./smejj-1-1-basis-spiegeln.mjs";

// KANDIDAT aus SMEJJ_KANDIDAT (05.09.): smejj-1-2 traegt den umgebauten
// Datensatz (Profil in smejj-1-1-datensatz-bauen.mjs). Ohne Variable bleibt
// alles beim ersten Kandidaten — die Doppelklick-Dateien setzen sie.
export const KANDIDAT = String(process.env.SMEJJ_KANDIDAT || "smejj-1-1").trim();
export const DATENSATZ_PREFIX = `datasets/${KANDIDAT}`;
const ZWEITER = KANDIDAT !== "smejj-1-1";
export const GRUPPE = "smejj-training";
// 170 Minuten wie beim con-Job. Grobe Hochrechnung aus dessen Lauf (27B,
// 3.707 Paare, 220 min): ein 4B-Modell rechnet deutlich schneller, der
// Datensatz ist mit 16.234 Paaren aber vier Mal so gross. Die Frist ist eine
// GRENZE, kein Ziel — train.py sichert den Adapter auch beim Abbruch.
// smejj-1-2: 420 Minuten. Gemessen 05.09.: 16 s je Schritt (8 Paare) — 170 min
// reichten fuer 4.328 Paare; ein Datensatz von ~12.000 Paaren braucht rund
// 7 Stunden (0,10 USD/h, also unter 1 USD). Freigabe Betreiber 05.09.
export const MAX_MINUTEN = ZWEITER ? 420 : 170;
// 4B in bf16 sind rund 8 GB, dazu Datensatz, Checkpoints und Adapter.
export const SPEICHER_GB = 60;

/** Konfiguration fuer den Trainingslauf — eigene Gruppe, eigener Kandidat. */
export function trainingsKonfig(basis) {
  return {
    ...basis,
    basis: { repo: REPO, prefix: BASIS_PREFIX },
    salad: { ...basis.salad, gruppe: GRUPPE, speicherGb: SPEICHER_GB }
  };
}

/** Die Job-Parameter. Rein und testbar. */
export function jobParameter() {
  return {
    CON_KANDIDAT: KANDIDAT,
    CON_DATENSATZ_PREFIX: DATENSATZ_PREFIX,
    CON_CHECKPOINT_PREFIX: "checkpoints/smejj",
    CON_VERSION: KANDIDAT,
    // minutenJeSchritt IST DER ENTSCHEIDENDE WERT — und der Standard stimmt
    // fuer dieses Modell nicht.
    //
    // GEMESSEN im ersten Lauf (05.09., Job smejj11-20260905054636): 831
    // Sekunden fuer 52 Schritte = 16 Sekunden je Schritt. train.py rechnet mit
    // dem Standard 2,5 Minuten — das ist der Wert des 27B-Modells und hier um
    // den Faktor 9,4 zu pessimistisch. Die Folge:
    //
    //   moegliche_schritte = (165 - 35) / 2,5 = 52
    //   zeilen_grenze      = 52 x batch(1) x gradAkk(8) = 416
    //
    // Der Lauf sah 416 von 16.234 Paaren — 2,6 % des Datensatzes. Technisch
    // erfolgreich, inhaltlich fast nichts. Eine Zeitschaetzung, die fuer ein
    // anderes Modell gemessen wurde, still zu uebernehmen, kostet hier keinen
    // Fehlschlag, sondern die ganze Arbeit am Datensatz.
    //
    // 0,3 min je Schritt sind die gemessenen 0,266 mit Puffer: rund 430
    // Schritte, also etwa 3.400 Paare je Lauf. Alle 16.234 auf einmal waeren
    // 9 Stunden — dafuer ist die Frist da, nicht die Schaetzung.
    //
    // messReserveMinuten 5 statt 35: dieser Lauf misst nicht, er trainiert nur.
    // Die Bewertung ist ein eigener Schritt gegen die smejj-Suite.
    // smejj-1-2: Lernrate halbiert (Lauf 2 endete bei Loss 0,0067 —
    // Auswendiglernen), maxZeilen grosszuegig: die Zeit begrenzt ohnehin.
    CON_TRAIN_KONFIG: JSON.stringify({
      rang: 16, epochen: 1, lernrate: ZWEITER ? 0.0001 : 0.0002, maxZeilen: ZWEITER ? 20000 : 16234,
      minutenJeSchritt: 0.3, messReserveMinuten: 5
    })
  };
}

async function zeigeStand(client, e2, jobId = null) {
  const z = await gruppenZustand(client);
  console.log(`Salad-Gruppe ${GRUPPE}: ${z.zustand}${z.jobId ? ` (Job ${z.jobId})` : ""}`);
  const id = jobId || z.jobId;
  if (id) {
    const s = await e2.getJson(`con/logs/jobs/${id}/status.json`, null).catch(() => null);
    if (s) console.log(`Job: Phase ${s.phase}${s.schritt ? `, Schritt ${s.schritt}` : ""}${s.loss != null ? `, Loss ${s.loss}` : ""}${s.fehler ? ` — FEHLER: ${s.fehler}` : ""}`);
  }
  const t = await e2.getJson(`con/versions/${KANDIDAT}/training.json`, null).catch(() => null);
  if (t) console.log(`Adapter: ${t.adapterPrefix || "?"} (${t.schritte ?? "?"} Schritte)`);
  return z;
}

/**
 * Startet die Gruppe und wartet dabei den Pending-Zustand ab.
 * @param {{starte: Function}} client
 * @param {{versuche?: number, wartenMs?: number, schlaf?: Function}} optionen
 */
export async function warteUndStarte(client, { versuche = 12, wartenMs = 15_000, schlaf = (ms) => new Promise((f) => setTimeout(f, ms)) } = {}) {
  let letzte = null;
  for (let i = 0; i < versuche; i += 1) {
    letzte = await client.starte();
    if (letzte.ok) return letzte;
    const grund = JSON.stringify(letzte.daten || "");
    if (!/Pending|pending/.test(grund)) return letzte;
    console.log(`  Gruppe noch nicht startbereit (Pending) — warte ${wartenMs / 1000} s (${i + 1}/${versuche})`);
    await schlaf(wartenMs);
  }
  return letzte;
}

async function main() {
  const konfig = trainingsKonfig(leseKonfig(process.env));
  const e2k = e2KonfigAusEnv(process.env);
  if (!e2k.ok) { console.error("ABBRUCH: e2 nicht konfiguriert —", e2k.fehlend.join(", ")); process.exit(2); }
  if (!konfig.salad.apiKey) { console.error("ABBRUCH: SALAD_API_KEY fehlt"); process.exit(2); }
  const client = saladClient({ ok: true, ...konfig.salad });
  const e2 = e2Client(e2k, { timeoutMs: 120_000 });

  if (process.argv.includes("--stand")) { await zeigeStand(client, e2); return; }

  console.log(`Kandidat:     ${KANDIDAT}`);
  console.log(`Basismodell:  e2 ${BASIS_PREFIX}  (${REPO})`);
  console.log(`Datensatz:    e2 ${DATENSATZ_PREFIX}/train.jsonl`);
  console.log(`Salad-Gruppe: ${GRUPPE} (eigene — con-job bleibt unberuehrt)`);
  console.log(`Grenzen:      ${MAX_MINUTEN} min, ${SPEICHER_GB} GB Platte, Prioritaet ${konfig.salad.prioritaet}, Selbstabschaltung an`);
  console.log(`Kosten:       hoechstens rund ${(MAX_MINUTEN / 60 * 0.10).toFixed(2)} USD (0,09-0,10 USD je Stunde, 24-GB-Karte, batch)`);

  // Ohne Basismodell und ohne Datensatz braucht der Lauf gar nicht erst zu
  // starten — sonst stirbt er auf dem Knoten und die Minuten sind bezahlt.
  const basis = await e2.getJson(`${BASIS_PREFIX}/manifest.json`, null).catch(() => null);
  if (!basis?.komplett) { console.error(`ABBRUCH: Basismodell unter ${BASIS_PREFIX} ist nicht komplett gespiegelt.`); process.exit(3); }
  console.log(`Basis geprueft: ${basis.dateien?.length ?? "?"} Dateien, ${(Number(basis.gesamtBytes || 0) / 1024 ** 3).toFixed(1)} GB`);
  // NUR die Liste, nicht den Inhalt: Der erste Entwurf holte die Datei mit
  // getText — 6,7 MB laufen in den 30-s-Deckel des Signierers, und die Pruefung
  // meldete "train.jsonl fehlt", obwohl sie danebenlag. Eine Pruefung, die mehr
  // tut als noetig, wird selbst zum Hindernis. Die Paarzahl steht im Manifest.
  const dateien = await e2.liste(`${DATENSATZ_PREFIX}/`).catch(() => []);
  const satz = (dateien || []).find((d) => String(d.key || d).endsWith("/train.jsonl"));
  if (!satz) { console.error(`ABBRUCH: ${DATENSATZ_PREFIX}/train.jsonl fehlt — job.py bricht sonst auf dem Knoten ab.`); process.exit(3); }
  const manifest = await e2.getJson(`${DATENSATZ_PREFIX}/manifest.json`, null).catch(() => null);
  console.log(`Datensatz geprueft: ${Math.round((satz.size || 0) / 1024)} KB, ${manifest?.paare ?? "?"} Paare`);

  const vorher = await zeigeStand(client, e2);
  // "deploying"/"pending" zaehlen mit (05.09. 21:49 UTC): ein Doppelklick traf die Gruppe waehrend
  // ein Messjob gerade zugeteilt wurde — die Pruefung sah kein "running", ueberschrieb die
  // Job-Umgebung und verdraengte die Messung. Nur "stopped"/"failed" ist frei.
  if (!["stopped", "failed", "fehlt"].includes(vorher.zustand)) { console.error(`ABBRUCH: die Gruppe ist nicht frei (${vorher.zustand}).`); process.exit(4); }

  if (!process.argv.includes("--starten")) {
    console.log("\nProbelauf — nichts gestartet. Mit --starten wird wirklich trainiert.");
    return;
  }

  const jobId = `smejj11-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-training`;
  const vor = await bereiteJobVor({
    client, konfig, e2: e2k, jobId, modus: "training",
    parameter: jobParameter(), maxMinuten: MAX_MINUTEN, log: (z) => console.log(`  ${z}`)
  });
  if (!vor.ok) { console.error("ABBRUCH:", vor.gruende.join("; ")); process.exit(5); }
  // EINE FRISCH ANGELEGTE GRUPPE IST KURZ "PENDING" und weist den Start ab
  // ("Starting a container group is not allowed while in a Pending status").
  // Beim Spiegel am 04.09. lief genau das auf, dort habe ich von Hand
  // nachgestartet — und vergessen, es ins Skript zu schreiben. Beim ersten
  // Trainings-Klick des Betreibers scheiterte es deshalb erneut: Gruppe
  // angelegt, Job nie gestartet, und niemand sah es, weil das Fenster schon zu
  // war. Ein Skript, das einen bekannten Zustand nicht abwartet, laesst die
  // Arbeit auf halbem Weg liegen.
  const start = await warteUndStarte(client);
  if (!start.ok) { console.error(`ABBRUCH: Start abgelehnt (HTTP ${start.status})`, JSON.stringify(start.daten).slice(0, 200)); process.exit(6); }
  console.log(`Job ${jobId} gestartet. Fortschritt: dieses Skript mit --stand aufrufen.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((f) => { console.error("FEHLER:", f?.message || f); process.exit(1); });
}

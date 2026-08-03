#!/usr/bin/env node
// smejj.com — Diagnose der Trainingskette von smejj 1.0.
//
// WARUM ES DIESES WERKZEUG GIBT (Befund 2026-08-02): Die Trainingsschleife lief
// tagelang rund um die Uhr und meldete "laeuft" — trainiert hat sie nie. Ihr
// Zustand sagte `zyklusIndex: 0`, `zyklenGestartet: 0`, `verbrauchtUsd: 0` und als
// Grund immer wieder `trainer_nicht_erreichbar`. Gleichzeitig stand die GPU auf
// "running" und kostete Geld. Ein Dienst, der laeuft, arbeitet nicht automatisch.
//
// Das Werkzeug prueft die Kette an JEDEM Glied und sagt, welches reisst:
//   1. Datensatz      — liegt er auf IDrive e2, wie gross, freigegeben?
//   2. Trainer-Gruppe — laeuft sie, welches Basismodell, welcher Modus?
//   3. Trainer-Tuer   — antwortet er OHNE und MIT Schluessel? (403 != 503)
//   4. Schleifenstand — wie viele Zyklen, welche Gruende, wieviel Geld?
//
// Der Unterschied 403 gegen 503 ist die wichtigste Einzelinformation:
//   403 = die Anmeldung fehlt      -> der Schleife fehlt SMEJJ_LORA_TRAINER_KEY
//   503 = die Anmeldung stimmt,    -> der Trainer selbst ist nicht bereit
//         aber niemand antwortet      (laedt noch, abgestuerzt, Startsonde)
// Wer das verwechselt, setzt einen Schluessel und wundert sich, dass nichts hilft.
//
// NUR LESEN. Dieses Werkzeug aendert nichts und kostet nichts.
//
// Aufruf: node scripts/diagnose/training-kette.mjs
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { signedS3Get, signedS3List, parseS3Keys } from "../../control-server/src/storage/s3Signer.js";

const TRAINER_GRUPPE = "smejj-lora-trainer";
const DATENSATZ_PRAEFIX = "datasets/smejj-1-0/";
const ZUSTAND_SCHLUESSEL = "ops/smejj-lora-loop/zustand.json";
const ZEITGRENZE_MS = 25_000;

const zeile = (name, wert) => console.log(`  ${String(name).padEnd(22)} ${wert}`);

function e2Config(env) {
  return {
    endpoint: env.IDRIVE_E2_ENDPOINT,
    region: env.IDRIVE_E2_REGION || "us-east-1",
    accessKey: env.IDRIVE_E2_ACCESS_KEY,
    secretKey: env.IDRIVE_E2_SECRET_KEY,
    bucket: env.IDRIVE_E2_BUCKET
  };
}

async function saladGet(pfad, env) {
  const antwort = await fetch(`https://api.salad.com/api/public${pfad}`, {
    headers: { "Salad-Api-Key": env.SALAD_API_KEY },
    signal: AbortSignal.timeout(ZEITGRENZE_MS)
  });
  if (!antwort.ok) return { ok: false, status: antwort.status };
  return { ok: true, daten: await antwort.json() };
}

/** Antwortet der Trainer? Ohne UND mit Schluessel — der Unterschied ist die Diagnose. */
export async function pruefeTuer(basisUrl, apiKey, fetchImpl = fetch) {
  const versuch = async (headers) => {
    try {
      const r = await fetchImpl(new URL("/health", basisUrl), { headers, signal: AbortSignal.timeout(ZEITGRENZE_MS) });
      return r.status;
    } catch (error) {
      return error?.name === "TimeoutError" || error?.name === "AbortError" ? "Zeitueberschreitung" : "kein Netz";
    }
  };
  return { ohne: await versuch({}), mit: await versuch({ "Salad-Api-Key": apiKey }) };
}

/**
 * Uebersetzt die Statuswerte in eine Aussage, die man ohne Fachwissen versteht.
 * `gruppenZustand` gehoert zwingend dazu: dieselbe 404 bedeutet bei einer
 * laufenden Gruppe etwas anderes als bei einer gestoppten. Ohne diesen Zusatz
 * meldete das Werkzeug am 2026-08-02 "Unklarer Zustand", obwohl die Lage
 * eindeutig war — die Gruppe war schlicht aus.
 */
export function deuteTuer({ ohne, mit }, gruppenZustand = "") {
  const aus = String(gruppenZustand).toLowerCase() === "stopped";
  if (mit === 200) return { ok: true, text: "Trainer ist bereit und antwortet." };
  if (aus) return { ok: false, text: "Die Trainer-Gruppe ist GESTOPPT — sie kostet nichts, trainiert aber auch nichts. Zum Trainieren muss sie starten." };
  if (ohne === 403 && mit === 403) return { ok: false, text: "Schluessel wird abgelehnt — falscher oder abgelaufener Zugang." };
  if (ohne === 403 && mit === 503) {
    return { ok: false, text: "Anmeldung stimmt, aber der Trainer antwortet nicht: er laedt noch, ist abgestuerzt oder scheitert an der Startsonde. EIN SCHLUESSEL ALLEIN HILFT HIER NICHT." };
  }
  if (mit === 404) return { ok: false, text: "Adresse erreichbar, aber dort laeuft kein Trainer (HTTP 404)." };
  if (mit === 503 || mit === 502) return { ok: false, text: "Trainer nicht bereit (HTTP " + mit + ")." };
  return { ok: false, text: `Unklarer Zustand (ohne ${ohne}, mit ${mit}).` };
}

async function main() {
  loadSecureLocalEnv();
  const env = process.env;
  const fehlt = ["SALAD_API_KEY", "SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME", "IDRIVE_E2_ENDPOINT"].filter((k) => !env[k]);
  if (fehlt.length) {
    console.error(`Abbruch: ${fehlt.join(", ")} fehlt — fail-closed, nichts geprueft.`);
    process.exitCode = 2;
    return;
  }
  const cfg = e2Config(env);
  const befunde = [];

  console.log("\n=== 1. Trainingsdatensatz auf IDrive e2 ===");
  try {
    const keys = parseS3Keys((await signedS3List({ ...cfg, prefix: DATENSATZ_PRAEFIX, maxKeys: 200 })).body || "");
    const manifeste = keys.filter((k) => k.endsWith("manifest.json"));
    if (manifeste.length === 0) {
      zeile("Datensatz", "FEHLT");
      befunde.push("kein Trainingsdatensatz");
    } else {
      const roh = await signedS3Get({ ...cfg, key: manifeste[manifeste.length - 1], allowNotFound: true });
      const m = JSON.parse(String(roh?.body || roh?.text || "{}"));
      zeile("Beispiele", m.anzahl ?? "?");
      zeile("Aufteilung", m.proSplit ? `${m.proSplit.train} Training / ${m.proSplit.validation} Pruefung / ${m.proSplit.test} Test` : "?");
      zeile("Herkunft", `${m.quelle?.license || "?"} (${m.quelle?.authorship || "?"})`);
      zeile("Freigabe", m.promotionStatus || "?");
      if (m.promotionStatus !== "approved") befunde.push(`Datensatz-Freigabe steht auf "${m.promotionStatus}"`);
    }
  } catch (error) {
    zeile("Datensatz", `Fehler: ${String(error.message).slice(0, 70)}`);
    befunde.push("Datensatz nicht lesbar");
  }

  console.log("\n=== 2. Trainer-Gruppe bei Salad ===");
  const basis = `/organizations/${env.SALAD_ORGANIZATION_NAME}/projects/${env.SALAD_PROJECT_NAME}/containers/${TRAINER_GRUPPE}`;
  const gruppe = await saladGet(basis, env);
  let trainerUrl = "";
  let gruppenZustand = "";
  if (!gruppe.ok) {
    zeile("Gruppe", `nicht lesbar (HTTP ${gruppe.status})`);
    befunde.push("Trainer-Gruppe nicht lesbar");
  } else {
    const d = gruppe.daten;
    const genv = d.container?.environment_variables || {};
    trainerUrl = d.networking?.dns ? `https://${d.networking.dns}` : "";
    gruppenZustand = d.current_state?.status || "";
    zeile("Zustand", gruppenZustand || "?");
    zeile("Laeuft seit", d.current_state?.start_time || "?");
    zeile("Basismodell", genv.SMEJJ_TRAINER_BASIS_REPO || "(nicht gesetzt)");
    zeile("Modus", genv.SMEJJ_TRAINER_MODUS || "(Standard: attrappe)");
    zeile("Adresse", trainerUrl || "(keine)");
    if (genv.SMEJJ_TRAINER_MODUS !== "echt") befunde.push("Trainer laeuft im Attrappen-Modus — er trainiert nichts");
    if (/14B|30B|35B/i.test(String(genv.SMEJJ_TRAINER_BASIS_REPO || ""))) {
      // Gemessen 2026-08-01: Qwen3-8B schlaegt Qwen3-14B (92,9 % gegen 87,6 %) UND
      // startet schneller. Bei Salad ist die Startzeit ein Verfuegbarkeitswert.
      befunde.push("Basismodell ist gross — Qwen3-8B ist gemessen besser UND startet schneller");
    }
  }

  console.log("\n=== 3. Antwortet der Trainer? ===");
  if (!trainerUrl) {
    zeile("Tuer", "keine Adresse — nicht pruefbar");
    befunde.push("Trainer hat keine Adresse");
  } else {
    const status = await pruefeTuer(trainerUrl, env.SALAD_API_KEY);
    zeile("ohne Schluessel", status.ohne);
    zeile("mit Schluessel", status.mit);
    const deutung = deuteTuer(status, gruppenZustand);
    console.log(`  -> ${deutung.text}`);
    if (!deutung.ok) befunde.push(deutung.text);
  }

  console.log("\n=== 4. Zustand der Trainingsschleife ===");
  try {
    const roh = await signedS3Get({ ...cfg, key: ZUSTAND_SCHLUESSEL, allowNotFound: true });
    const z = JSON.parse(String(roh?.body || roh?.text || "{}"));
    zeile("Zyklen gestartet", z.zyklenGestartet ?? "?");
    zeile("Zyklen abgebrochen", z.zyklenAbgebrochen ?? "?");
    zeile("Verbraucht (USD)", z.verbrauchtUsd ?? "?");
    zeile("Letzter Takt", z.letzterZyklusAm || "?");
    zeile("Letzte Gruende", (z.letzteGruende || []).join(", ") || "(keine)");
    if (!z.zyklenGestartet) befunde.push("Die Schleife hat NIE einen Trainingszyklus gestartet");
  } catch (error) {
    zeile("Zustand", `nicht lesbar: ${String(error.message).slice(0, 70)}`);
  }

  console.log("\n=== Ergebnis ===");
  if (befunde.length === 0) {
    console.log("  Die Trainingskette ist vollstaendig in Ordnung.");
    return;
  }
  for (const b of befunde) console.log(`  - ${b}`);
  console.log("\n  Solange ein Glied reisst, laeuft die GPU und kostet Geld, ohne zu lernen.");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  await main();
}

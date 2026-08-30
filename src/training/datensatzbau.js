// smejj.com Datensatzbau — QA-Paare zu einem trainierbaren Datensatz
// (Single Responsibility: gebilligte Frage-Antwort-Paare bereinigen, einer
// Familie und einem Split zuordnen, zum Trainer-Format formen).
//
// EIN Baustein des Plans docs/architecture/SMEJJ_1_1_DATENSATZ_PLAN_2026-08-30.md.
// Er ORCHESTRIERT die bestehenden, getesteten Policy-Module, statt sie zu
// kopieren:
//
//   sanitize.js   — Bereinigung (E-Mail, Telefon, Tokens, Pfade, ...) und die
//                   Verifikation danach (residualFindings). Fail-closed: was
//                   nach der Bereinigung noch auffaellt, geht in die
//                   QUARANTAENE, nie in train.jsonl.
//   split.js      — Familien-Fingerprint, deterministischer Split
//                   (80/10/10, fester Seed) und die Leakage-Sperre: eine
//                   Familie landet NIE in zwei Splits.
//   constants.js  — Domains, Seed, Splits.
//
// Der Kern ist REIN: keine Dateizugriffe, kein Netz — die Tests spielen jeden
// Ausgang ohne Quelldaten durch. Das CLI (scripts/training/
// baue_smejj_datensatz.mjs) liest und schreibt, dieses Modul entscheidet.

import crypto from "node:crypto";
import { DATASET_SPLITS } from "./constants.js";
import { scanSensitiveStrings, sanitizeTrainingValue } from "./sanitize.js";
import {
  assertNoDatasetLeakage,
  assignDatasetSplit,
  normalizeDomain,
  trainingFamilyFingerprint
} from "./split.js";

/** Format-Kennung: genau die Zeilenform, die datenlader.py liest (messages >= 2). */
export const DATENSATZ_FORMAT = "smejj-messages-jsonl-v1";

/**
 * Der Systemprompt, der die Wirkung des ersten Laufs (2026-08-04, am Stil
 * bewiesen) uebernimmt: kurzes Deutsch, direkte Antwort zuerst, kein Denkblock.
 * Ueberschreibbar ueber das CLI — aber nie LEER: ohne die Form der Trainingsdaten
 * trainiert man Rauschen weg.
 */
export const STANDARD_SYSTEMPROMPT =
  "Du bist der smejj-Assistent. Antworte kurz und direkt auf Deutsch. " +
  "Nenne die Antwort zuerst, dann hoechstens eine kurze Begruendung. " +
  "Denke nicht sichtbar nach und erfinde keine Fakten.";

const VERSIONS_MUSTER = /^v\d{4}\.\d{2}\.\d{2}(?:-[a-z0-9.-]+)?$/;

/**
 * Bereitet EIN Paar vor. Entweder {ok:true, paar} oder {ok:false, grund}.
 * Quarantaene statt Fehler: ein schlechtes Paar darf den Bau nicht sprengen,
 * darf aber auch nicht still verschwinden — der Bericht fuehrt es.
 */
export function bereitePaarVor(eingabe, { fingerprintKey, personen = [], datensatzId = "smejj-1-1", domain = "pwa", systemprompt = STANDARD_SYSTEMPROMPT } = {}) {
  const frage = String(eingabe?.frage || "").trim();
  const antwort = String(eingabe?.antwort || "").trim();
  const quelle = String(eingabe?.quelle || "").trim();
  const einwilligung = String(eingabe?.einwilligung || "").trim();
  const familie = String(eingabe?.familie || "").trim();

  if (!frage || !antwort || !quelle) return ausfall("pflichtfeld_leer", { quelle });
  if (!einwilligung) return ausfall("einwilligung_fehlt", { quelle });
  if (!Buffer.isBuffer(fingerprintKey) || fingerprintKey.length !== 32) {
    return ausfall("fingerprint_schluessel_fehlt", { quelle });
  }

  // Phase 1: bekannte Namen entfernen (aus personen.txt des Quellpakets).
  let frageBereinigt = frage;
  let antwortBereinigt = antwort;
  for (const name of personen) {
    const muster = new RegExp(escapeRegex(name), "gi");
    frageBereinigt = frageBereinigt.replace(muster, "[person]");
    antwortBereinigt = antwortBereinigt.replace(muster, "[person]");
  }

  const messages = [
    { role: "system", content: systemprompt },
    { role: "user", content: frageBereinigt },
    { role: "assistant", content: antwortBereinigt }
  ];

  // Phase 2: die bestehende Sanitization (Secrets, E-Mail, Telefon, Pfade ...).
  const bereinigt = sanitizeTrainingValue({ messages });
  if (!bereinigt.passed) {
    return ausfall(`sanitization_residuum:${bereinigt.residualFindings.map((f) => f.type).sort().join(",")}`, { quelle });
  }

  // Phase 3: Verifikation — Namen duerfen auch in keiner Schreibweise uebrig sein.
  const namenRest = personen.filter((name) => textEnthaelt(bereinigt.value, name));
  if (namenRest.length > 0) {
    return ausfall("person_nach_bereinigung_uebrig", { quelle });
  }

  const recordId = crypto.createHash("sha256")
    .update(`${datensatzId}\n${frageBereinigt}\n${antwortBereinigt}`)
    .digest("hex");
  const fingerprint = trainingFamilyFingerprint({
    provenance: { repositoryFingerprint: familie || quelle, baseCommit: "none", affectedPaths: [] },
    domain: normalizeDomain(domain)
  }, fingerprintKey);

  return {
    ok: true,
    paar: Object.freeze({
      recordId,
      familyFingerprint: fingerprint,
      split: assignDatasetSplit(fingerprint),
      messages: Object.freeze(bereinigt.value.messages.map(Object.freeze)),
      quelle,
      einwilligung,
      domain: normalizeDomain(domain),
      bereinigungFunde: bereinigt.findings.map((f) => f.type)
    })
  };
}

/**
 * Bauet den Datensatz: Paare vorbereiten, Duplikate in die Quarantaene, die
 * Leakage-Sperre als Pflichttor, Manifest fuer die Schleifen-Datenpruefung.
 */
export function baueDatensatz(quelPaare, {
  fingerprintKey,
  personen = [],
  datensatzId = "smejj-1-1",
  versionId,
  domain = "pwa",
  systemprompt = STANDARD_SYSTEMPROMPT
} = {}) {
  const version = String(versionId || "").trim();
  if (!VERSIONS_MUSTER.test(version)) {
    throw new Error(`datensatz_version_id_ungueltig:${version}`);
  }

  const paare = [];
  const quarantaene = [];
  const gesehene = new Set();
  for (const eingabe of quelPaare || []) {
    const vorbereitung = bereitePaarVor(eingabe, { fingerprintKey, personen, datensatzId, domain, systemprompt });
    if (!vorbereitung.ok) {
      quarantaene.push({ grund: vorbereitung.grund, quelle: vorbereitung.quelle || null });
      continue;
    }
    if (gesehene.has(vorbereitung.paar.recordId)) {
      quarantaene.push({ grund: "duplikat", quelle: vorbereitung.paar.quelle });
      continue;
    }
    gesehene.add(vorbereitung.paar.recordId);
    paare.push(vorbereitung.paar);
  }

  if (paare.length === 0) {
    throw new Error("datensatz_ohne_gueltige_paare");
  }

  // Pflichttor, nicht Auslegungssache: eine Familie in zwei Splits bricht den Bau.
  assertNoDatasetLeakage(paare.map((p) => ({
    recordId: p.recordId,
    familyFingerprint: p.familyFingerprint,
    split: p.split
  })));

  const splittet = { train: [], validation: [], test: [] };
  for (const paar of paare) splittet[paar.split].push(paar);

  const manifest = Object.freeze({
    schemaVersion: 1,
    datasetId: datensatzId,
    versionId: version,
    format: DATENSATZ_FORMAT,
    erstelltAm: new Date().toISOString(),
    immutable: true,
    promotionStatus: "not-approved",
    splitSeed: "smejj-1.0-dataset-family-v1",
    leakageCheck: "passed-family-grouped",
    proSplit: Object.freeze({
      train: splittet.train.length,
      validation: splittet.validation.length,
      test: splittet.test.length
    }),
    gesamt: paare.length,
    quarantaeneAnzahl: quarantaene.length,
    basisHfRepo: null,
    hinweis: "Faktenwissen gehoert in RAG; dieser Datensatz trainiert Stil, Sprache und Verhalten."
  });

  return {
    manifest,
    train: splittet.train,
    validation: splittet.validation,
    test: splittet.test,
    quarantaene: Object.freeze(quarantaene.map(Object.freeze))
  };
}

/** Prueft, dass alle drei Dateien gemeinsam abgelegt werden — oder keine. */
export function pruefeVollstaendigkeit(datensatz) {
  const fehlt = DATASET_SPLITS.filter((split) => (datensatz?.[split]?.length || 0) === 0);
  return { vollstaendig: fehlt.length === 0, fehlt };
}

function textEnthaelt(wert, nadel) {
  const heu = typeof wert === "string" ? wert : JSON.stringify(wert || "");
  return heu.toLowerCase().includes(String(nadel).toLowerCase());
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ausfall(grund, { quelle } = {}) {
  return { ok: false, grund, quelle: quelle || null };
}

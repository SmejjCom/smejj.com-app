// smejj.com — Aufbau eines Trainingskorpus aus offen lizenzierten Datensaetzen
// (Single Responsibility: eine Quellzeile -> geprueftem Korpus-Record).
//
// Wiederverwendet bewusst die bestehenden Bausteine statt sie nachzubauen:
//   - sanitizeTrainingValue  (src/training/sanitize.js) — Secret-/PII-Filter
//     samt Residual Scan. Ein oeffentlicher Datensatz ist NICHT automatisch frei
//     von Schluesseln oder personenbezogenen Daten; oasst2 z. B. ist von
//     Freiwilligen geschrieben, die durchaus Adressen oder Tokens eintippen.
//   - assignDatasetSplit / assertNoDatasetLeakage (src/training/split.js) —
//     dieselbe 80/10/10-Aufteilung und dieselbe Leckage-Pruefung wie die
//     Erstpartei-Spur. Es darf nur EINE Split-Logik im Projekt geben.
//
// Neu ist hier nur, was es fuer offene Datensaetze vorher nicht gab: das
// Lizenz-/Urheberschafts-Tor (licenses.js), das Verunreinigungs-Tor gegen die
// Pruefsuite (contamination.js) und ein Familienbegriff, der zu Datensaetzen
// statt zu Repository-Diffs passt (siehe korpusFamilienFingerabdruck).

import crypto from "node:crypto";
import { canonicalJson, sanitizeTrainingValue } from "../sanitize.js";
import { assertNoDatasetLeakage, assignDatasetSplit } from "../split.js";
import { pruefeDatensatzQuelle, pruefeZeilenHerkunft } from "./licenses.js";
import { pruefeVerunreinigung } from "./contamination.js";

export const KORPUS_SCHEMA_VERSION = 1;
export const KORPUS_SPLIT_SEED = "smejj-1.0-opencorpus-family-v1";

/**
 * Familie eines offenen Korpus-Records.
 *
 * Die Erstpartei-Spur bildet Familien ueber Repository + Base-Commit + Pfade.
 * Nichts davon existiert bei einem Datensatz. Das Gegenstueck hier ist die
 * QUELLGRUPPE: bei oasst2 der Gespraechsbaum, bei einem Code-Datensatz das
 * Repository der Datei. Alle Zeilen derselben Gruppe landen im selben Split.
 *
 * Ohne diesen Begriff waeren zwei Nachrichten desselben Gespraechs in Training
 * und Test verteilt — die Messung wuerde dann teilweise Auswendiggelerntes
 * pruefen und zu gut ausfallen.
 *
 * Eigener Seed (KORPUS_SPLIT_SEED), damit ein Record nicht allein deshalb den
 * Split wechselt, weil er aus der einen statt der anderen Spur stammt.
 */
export function korpusFamilienFingerabdruck({ datasetId, revision, gruppe }, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("training_fingerprint_key_invalid");
  const identitaet = {
    datasetId: String(datasetId || ""),
    revision: String(revision || ""),
    gruppe: String(gruppe ?? "")
  };
  if (!identitaet.datasetId || !identitaet.revision || !identitaet.gruppe) {
    throw new Error("korpus_familie_unvollstaendig");
  }
  return crypto.createHmac("sha256", key).update(canonicalJson(identitaet)).digest("hex");
}

function istGueltigeNachricht(nachricht) {
  const rolle = String(nachricht?.role || "");
  const inhalt = String(nachricht?.content || "");
  return ["system", "user", "assistant"].includes(rolle) && inhalt.trim().length > 0;
}

/**
 * Verarbeitet EINE Quellzeile zu einem Korpus-Record.
 *
 * Reihenfolge der Tore ist nicht beliebig: erst Herkunft (billig, sperrt am
 * meisten), dann Sanitization (muss vor jeder Weiterverarbeitung im
 * Arbeitsspeicher passieren, so verlangt es die Richtlinie), dann
 * Verunreinigung auf dem BEREINIGTEN Text — sonst pruefte man Text, der so nie
 * ins Training ginge.
 *
 * @returns {{ok: true, record: object} | {ok: false, gruende: string[]}}
 */
export function baueKorpusRecord({
  zeile,
  quelle,
  fingerabdruck,
  fingerprintKey,
  synthetischesFeld = "synthetic"
}) {
  const quellPruefung = pruefeDatensatzQuelle(quelle);
  if (!quellPruefung.erlaubt) return { ok: false, gruende: quellPruefung.gruende };

  const herkunft = pruefeZeilenHerkunft(zeile, { synthetischesFeld });
  if (!herkunft.erlaubt) return { ok: false, gruende: herkunft.gruende };

  const nachrichten = Array.isArray(zeile?.messages) ? zeile.messages : [];
  if (nachrichten.length < 2 || !nachrichten.every(istGueltigeNachricht)) {
    return { ok: false, gruende: ["nachrichten_ungueltig"] };
  }
  if (!nachrichten.some((n) => n.role === "assistant")) {
    return { ok: false, gruende: ["keine_antwort_im_verlauf"] };
  }

  const bereinigt = sanitizeTrainingValue({
    messages: nachrichten.map((n) => ({ role: String(n.role), content: String(n.content) }))
  });
  if (!bereinigt.passed) {
    return { ok: false, gruende: ["sanitization_nicht_bestanden", ...bereinigt.residualFindings.map((f) => `residual:${f.type}`)] };
  }
  if (bereinigt.rawPersisted !== false) return { ok: false, gruende: ["raw_data_persisted"] };

  // Nur Nutzer- und Antworttext pruefen. Die Systemzeile ist geteilter
  // Betriebskontext und in jeder Zeile identisch (siehe contamination.js) —
  // sie mitzupruefen wuerde jede Zeile abweisen.
  const volltext = bereinigt.value.messages
    .filter((n) => n.role !== "system")
    .map((n) => n.content)
    .join("\n");
  const verunreinigung = pruefeVerunreinigung(volltext, fingerabdruck);
  if (!verunreinigung.sauber) return { ok: false, gruende: verunreinigung.gruende };

  let familyFingerprint;
  try {
    familyFingerprint = korpusFamilienFingerabdruck({
      datasetId: quellPruefung.quelle.datasetId,
      revision: quellPruefung.quelle.revision,
      gruppe: zeile?.gruppe
    }, fingerprintKey);
  } catch (error) {
    return { ok: false, gruende: [String(error?.message || error)] };
  }

  const split = assignDatasetSplit(familyFingerprint, KORPUS_SPLIT_SEED);
  const recordId = crypto.createHash("sha256")
    .update(`${quellPruefung.quelle.datasetId}:${quellPruefung.quelle.revision}:${String(zeile?.id ?? "")}`)
    .digest("hex")
    .slice(0, 32);

  return {
    ok: true,
    record: Object.freeze({
      schemaVersion: KORPUS_SCHEMA_VERSION,
      recordId,
      familyFingerprint,
      split,
      // Nur die Kennungen der Quelle, nie ein Rohabzug der Zeile.
      quelle: quellPruefung.quelle,
      messages: bereinigt.value.messages,
      sanitizerVersion: bereinigt.sanitizerVersion,
      // Findings sind Kategorie + JSON-Pfad, nie der entfernte Wert.
      redactions: bereinigt.findings.map((f) => ({ type: f.type, path: f.path }))
    })
  };
}

/**
 * Verarbeitet viele Zeilen und baut ein Manifest.
 *
 * Fail-closed an zwei Stellen, die im Betrieb wirklich vorkommen:
 *   - Kommt kein einziger Trainings-Record heraus, ist das Ergebnis `ok: false`.
 *     Ein leerer Korpus wuerde sonst eine GPU-Stunde kosten und ein Modell
 *     erzeugen, das nichts gelernt hat.
 *   - assertNoDatasetLeakage wirft, wenn eine Familie in zwei Splits liegt.
 *     Das wird hier NICHT abgefangen: eine Leckage darf keinen Datensatz
 *     erzeugen, auch keinen teilweisen.
 */
export function baueKorpus({
  zeilen,
  quelle,
  fingerabdruck,
  fingerprintKey,
  synthetischesFeld = "synthetic",
  jetzt = () => new Date()
}) {
  const records = [];
  const abgelehnt = new Map();
  for (const zeile of zeilen || []) {
    const ergebnis = baueKorpusRecord({ zeile, quelle, fingerabdruck, fingerprintKey, synthetischesFeld });
    if (ergebnis.ok) {
      records.push(ergebnis.record);
      continue;
    }
    for (const grund of ergebnis.gruende) abgelehnt.set(grund, (abgelehnt.get(grund) || 0) + 1);
  }

  assertNoDatasetLeakage(records);

  const proSplit = { train: 0, validation: 0, test: 0 };
  for (const record of records) proSplit[record.split] += 1;

  const manifest = Object.freeze({
    schemaVersion: KORPUS_SCHEMA_VERSION,
    erstelltAm: jetzt().toISOString(),
    suiteId: fingerabdruck?.suiteId || null,
    suiteContentSha256: fingerabdruck?.contentSha256 || null,
    quelle: pruefeDatensatzQuelle(quelle).quelle,
    splitSeed: KORPUS_SPLIT_SEED,
    anzahl: records.length,
    proSplit: Object.freeze({ ...proSplit }),
    abgelehnt: Object.freeze(Object.fromEntries([...abgelehnt.entries()].sort())),
    // Wie die Erstpartei-Manifeste: eine neue Version startet ohne Freigabe.
    promotionStatus: "not-approved"
  });

  return {
    ok: proSplit.train > 0,
    gruende: proSplit.train > 0 ? [] : ["korpus_ohne_trainingsanteil"],
    records,
    manifest
  };
}

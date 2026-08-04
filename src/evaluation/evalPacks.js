// smejj.com — Eval-Pakete: kompakte Fallsammlungen zu einer Suite zusammenfuehren.
//
// Warum es dieses Modul gibt:
// Eine Suite mit 300 Faellen im Roh-Schema waere rund 10.000 Zeilen JSON, in denen
// derselbe System-Text hundertfach wiederholt steht. Niemand liest das, niemand
// pflegt das, und ein Tippfehler faellt darin nicht auf. Ein Paket buendelt darum
// die Faelle EINES Fachgebiets, setzt System-Text, Profil, Gewicht und maxTokens
// EINMAL als Standard und schreibt je Fall nur noch das, was den Fall ausmacht.
//
// Die Ausgabe ist eine ganz normale Suite nach dem bestehenden Schema — evalSuite.js
// validiert sie unveraendert weiter. Dieses Modul erweitert das Schema nicht, es
// erzeugt es nur bequemer.
//
// Fail-closed: ein Paket, das nicht sauber expandiert, wirft. Es gibt keinen
// stillen Teil-Erfolg, bei dem ein halbes Fachgebiet aus der Messung faellt.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { computeEvalSuiteSha256 } from "./evalSuite.js";

export const PACK_SCHEMA_VERSION = 1;

/** Kategorie, wenn ein Paket keine nennt. Nie still raten — sichtbar benennen. */
export const KATEGORIE_UNBEKANNT = "sonstige";

/**
 * Kurzschreibweisen fuer Erwartungen.
 *
 * Die REIHENFOLGE dieser Eintraege ist bedeutsam und darf nicht umsortiert werden:
 * sie bestimmt die Reihenfolge der erzeugten Erwartungen und damit den Inhalts-Hash
 * der Suite. Ein Umsortieren wuerde jeden frueheren Bericht unvergleichbar machen.
 *
 * "muss" ist kritisch, "sollte" ist es nicht. Das ist die ganze Regel:
 * Ein kritischer Verstoss setzt den Fall auf null und kann nicht ausgeglichen
 * werden — dafuer sind Namensregel, Sicherheitsregeln und harte Fakten da.
 * Weiche Qualitaetsmerkmale (Laenge, Begruendung) zaehlen anteilig.
 */
const KURZSCHREIBWEISEN = Object.freeze([
  ["muss", (wert) => ({ type: "contains_all", values: liste(wert), critical: true })],
  ["mussEines", (wert) => ({ type: "contains_any", values: liste(wert), critical: true })],
  ["darfNicht", (wert) => ({ type: "contains_none", values: liste(wert), critical: true })],
  ["mussMuster", (wert) => ({ type: "matches", pattern: String(wert), critical: true })],
  ["darfNichtMuster", (wert) => ({ type: "not_matches", pattern: String(wert), critical: true })],
  ["json", () => ({ type: "json_parses", critical: true })],
  ["sollte", (wert) => ({ type: "contains_all", values: liste(wert), critical: false })],
  ["sollteEines", (wert) => ({ type: "contains_any", values: liste(wert), critical: false })],
  ["sollteNicht", (wert) => ({ type: "contains_none", values: liste(wert), critical: false })],
  ["minZeichen", (wert) => ({ type: "min_length", value: ganzzahl(wert), critical: false })],
  ["maxZeichen", (wert) => ({ type: "max_length", value: ganzzahl(wert), critical: false })]
]);

const KURZ_SCHLUESSEL = new Set(KURZSCHREIBWEISEN.map(([schluessel]) => schluessel));

/** Felder, die ein Fall direkt setzen darf und die den Paket-Standard ueberschreiben. */
const UEBERSCHREIBBAR = Object.freeze(["profile", "weight", "maxTokens", "system"]);

/**
 * Expandiert EIN Paket zu vollstaendigen Faellen im Suite-Schema.
 *
 * @param {object} pack Paketobjekt (siehe evals/packs/*.json)
 * @returns {object[]} Faelle im Schema von evalSuite.js, je mit `kategorie`
 * @throws {Error} bei jedem strukturellen Mangel — fail-closed, nie stillschweigend
 */
export function expandPack(pack) {
  if (!istObjekt(pack)) throw new Error("eval_pack_invalid");
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) throw new Error(`eval_pack_schema_unsupported:${pack?.packId}`);
  if (!nichtLeer(pack.packId)) throw new Error("eval_pack_id_missing");

  const kategorie = nichtLeer(pack.kategorie) ? pack.kategorie : KATEGORIE_UNBEKANNT;
  const standard = istObjekt(pack.standard) ? pack.standard : {};
  const faelle = Array.isArray(pack.faelle) ? pack.faelle : [];
  if (faelle.length === 0) throw new Error(`eval_pack_cases_missing:${pack.packId}`);

  return faelle.map((fall) => expandiereFall(fall, { pack, kategorie, standard }));
}

function expandiereFall(fall, { pack, kategorie, standard }) {
  if (!istObjekt(fall)) throw new Error(`eval_pack_case_invalid:${pack.packId}`);
  if (!nichtLeer(fall.id)) throw new Error(`eval_pack_case_id_missing:${pack.packId}`);
  if (!nichtLeer(fall.prompt)) throw new Error(`eval_pack_case_prompt_missing:${fall.id}`);

  // Zuerst die Feldpruefung: ein unbekanntes Feld ist fast immer ein Tippfehler
  // in einer Kurzschreibweise ("mussEins" statt "mussEines"). Sie muss VOR der
  // Erwartungspruefung laufen — sonst meldet ein vertippter Fall nur "keine
  // Erwartungen", und der eigentliche Fehler bliebe verborgen.
  for (const schluessel of Object.keys(fall)) {
    if (schluessel === "id" || schluessel === "prompt" || schluessel === "erwartungen") continue;
    if (KURZ_SCHLUESSEL.has(schluessel) || UEBERSCHREIBBAR.includes(schluessel)) continue;
    throw new Error(`eval_pack_case_unknown_field:${fall.id}:${schluessel}`);
  }

  const erwartungen = baueErwartungen(fall);
  if (erwartungen.length === 0) throw new Error(`eval_pack_case_assertions_missing:${fall.id}`);
  // Ohne kritische Erwartung ist ein Fall nur Dekoration: er kann niemals ein
  // Modell aufhalten. Genau das ist die Regel aus evals/README.md, hier erzwungen.
  if (!erwartungen.some((erwartung) => erwartung.critical === true)) {
    throw new Error(`eval_pack_case_not_critical:${fall.id}`);
  }

  return {
    id: String(fall.id),
    kategorie,
    profile: waehle(fall.profile, standard.profile, "default"),
    weight: ganzzahl(waehle(fall.weight, standard.weight, 1)),
    maxTokens: ganzzahl(waehle(fall.maxTokens, standard.maxTokens, 400)),
    ...(nichtLeer(waehle(fall.system, standard.system, ""))
      ? { system: String(waehle(fall.system, standard.system, "")) }
      : {}),
    prompt: String(fall.prompt),
    assertions: erwartungen
  };
}

/**
 * Baut die Erwartungen eines Falls in fester Reihenfolge:
 * erst die Kurzschreibweisen (in der Reihenfolge von KURZSCHREIBWEISEN),
 * danach roh angehaengte Erwartungen aus `erwartungen`.
 *
 * Die feste Reihenfolge ist kein Schoenheitsfehler, sondern Voraussetzung: der
 * Inhalts-Hash der Suite haengt daran, und mergeAssertions() in evalScoring.js
 * ordnet Wiederholungen ueber den INDEX zu.
 */
function baueErwartungen(fall) {
  const erwartungen = [];
  for (const [schluessel, bauer] of KURZSCHREIBWEISEN) {
    if (fall[schluessel] === undefined) continue;
    erwartungen.push(bauer(fall[schluessel]));
  }
  if (Array.isArray(fall.erwartungen)) erwartungen.push(...fall.erwartungen);
  return erwartungen;
}

/**
 * Fuehrt Manifest und Pakete zu einer vollstaendigen Suite zusammen.
 *
 * Der Inhalts-Hash des Manifests deckt danach ALLE Faelle aus ALLEN Paketen ab:
 * eine stille Aenderung in einem einzelnen Paket macht die Suite ungueltig, statt
 * unbemerkt in die naechste Messung zu laufen.
 *
 * @param {object} manifest Suite-Manifest mit `packs: string[]`
 * @param {object[]} packs geladene Paketobjekte, in der Reihenfolge des Manifests
 * @returns {object} Suite im Schema von evalSuite.js
 */
export function buildSuiteFromManifest(manifest, packs) {
  if (!istObjekt(manifest)) throw new Error("eval_manifest_invalid");
  const cases = [];
  const gesehen = new Set();
  for (const pack of packs) {
    for (const fall of expandPack(pack)) {
      // Doppelte Kennungen wuerden evalSuite.js zwar auffallen, aber erst als
      // anonymes "eval_case_id_duplicate". Hier ist noch bekannt, WELCHES Paket
      // die Dublette bringt — das ist der Unterschied zwischen einem Hinweis und
      // einer Suche durch zwoelf Dateien.
      if (gesehen.has(fall.id)) throw new Error(`eval_pack_case_id_duplicate:${pack.packId}:${fall.id}`);
      gesehen.add(fall.id);
      cases.push(fall);
    }
  }
  const { packs: _verweise, ...kopf } = manifest;
  return { ...kopf, cases };
}

/**
 * Laedt eine Suite von der Platte. Ist die Datei ein Manifest (Feld `packs`),
 * werden die Pakete mitgeladen und eingesetzt; sonst wird die Datei unveraendert
 * zurueckgegeben.
 *
 * Damit bleibt der bestehende Weg (eine einzelne Suite-Datei) unangetastet — die
 * Suite smejj-chat-core-v1.json laedt Byte fuer Byte wie vorher.
 *
 * @param {string} suiteFile absoluter Pfad zur Suite- oder Manifest-Datei
 * @returns {Promise<{suite: object, packDateien: string[]}>}
 */
export async function loadEvalSuite(suiteFile, { lesen = leseJson } = {}) {
  const roh = await lesen(suiteFile);
  if (!Array.isArray(roh?.packs)) return { suite: roh, packDateien: [] };

  const basis = path.dirname(suiteFile);
  const packDateien = roh.packs.map((verweis) => path.resolve(basis, String(verweis)));
  const packs = [];
  for (const datei of packDateien) {
    try {
      packs.push(await lesen(datei));
    } catch (fehler) {
      // Ein fehlendes Paket ist ein Abbruchgrund, kein Grund zum Weitermessen:
      // sonst meldet der Bericht eine Punktzahl ueber ein Fachgebiet weniger und
      // sieht dabei genauso aus wie ein vollstaendiger Lauf.
      throw new Error(`eval_pack_unreadable:${path.basename(datei)}:${String(fehler?.message || fehler).slice(0, 80)}`);
    }
  }
  return { suite: buildSuiteFromManifest(roh, packs), packDateien };
}

/**
 * Berechnet den Inhalts-Hash der ZUSAMMENGEFUEHRTEN Suite.
 * Getrennte Funktion, damit das Nachrechen-Werkzeug (scripts/evaluation/rehash_eval_suite.mjs)
 * exakt dasselbe rechnet wie der Lauf — zwei Rechenwege waeren eine Fehlerquelle.
 */
export function computeManifestSha256(manifest, packs) {
  return computeEvalSuiteSha256(buildSuiteFromManifest(manifest, packs));
}

/** Alle im Datenbestand vorkommenden Kategorien, sortiert. */
export function kategorienDerSuite(suite) {
  const cases = Array.isArray(suite?.cases) ? suite.cases : [];
  return [...new Set(cases.map((fall) => fall?.kategorie || KATEGORIE_UNBEKANNT))].sort();
}

async function leseJson(datei) {
  return JSON.parse(await readFile(datei, "utf8"));
}

function liste(wert) {
  const werte = Array.isArray(wert) ? wert : [wert];
  return werte.map((eintrag) => String(eintrag));
}

function waehle(...kandidaten) {
  return kandidaten.find((wert) => wert !== undefined && wert !== null);
}

function ganzzahl(wert) {
  const zahl = Number(wert);
  if (!Number.isInteger(zahl) || zahl <= 0) throw new Error(`eval_pack_number_invalid:${String(wert)}`);
  return zahl;
}

function istObjekt(wert) {
  return Boolean(wert) && typeof wert === "object" && !Array.isArray(wert);
}

function nichtLeer(wert) {
  return typeof wert === "string" && wert.trim().length > 0;
}

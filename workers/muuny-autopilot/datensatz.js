// muuny AI — Teil 2: der Trainingsdatensatz aus ECHTEN Lernpaaren
// (Owner-Auftrag 21.09.2026).
//
// Nur Paare, die ein Mensch mit Daumen hoch markiert UND fuer das Training
// freigegeben hat, kommen hinein. Ein optionaler Basis-Datensatz ist erlaubt —
// aber nie einer, der erzeugt oder abgeschrieben ist (Eiserne Regel 3: bei smejj
// gemessen 70,6 % statt 91,2 %; bei muuny waren alle acht Laeufe auf erzeugten
// Aufgaben schlechter als ohne).
//
// Entdoppeln, Filtern (Schluessel, personenbezogene Daten, Injection, Pruefsuiten-
// faelle) und das deterministische Mischen macht daten.js — dieselbe Strecke, die
// schon lange unter Test steht. Gemischt MUSS werden: ein an der Zeitgrenze
// abgebrochenes Training sieht nur den Anfang der Datei.
import { baueDatensatz, hashText, veroeffentliche } from "./daten.js";
import { L, wert } from "./lager.js";

/** Quellen, die als Basis-Datensatz zulaessig sind. "erzeugt" gehoert ausdruecklich NICHT dazu. */
export const ERLAUBTE_BASIS_QUELLEN = Object.freeze(["eigen", "lizenziert", "handverlesen"]);

/**
 * Liest alle abgelegten Lernpaare. Unlesbare, fremde oder beleglose Dateien
 * werden gezaehlt und verworfen — nie still mitgenommen.
 */
export async function leseLernpaare(e2) {
  const schluessel = (await e2.liste(`${L.paare}/`)).map((o) => o.key).filter((k) => k.endsWith(".json")).sort();
  const paare = [];
  const verworfen = { unlesbar: 0, herkunft: 0, ohne_einwilligung: 0 };
  for (const k of schluessel) {
    let satz;
    try { satz = JSON.parse(await e2.getText(k)); } catch { verworfen.unlesbar += 1; continue; }
    if (satz?.herkunft !== "daumen_hoch") { verworfen.herkunft += 1; continue; }
    if (!satz?.einwilligung) { verworfen.ohne_einwilligung += 1; continue; }
    paare.push({ messages: [{ role: "user", content: String(satz.frage) }, { role: "assistant", content: String(satz.antwort) }] });
  }
  return { schluessel, paare, verworfen };
}

/** Optionaler Basis-Datensatz — nur mit belegter, zulaessiger Herkunft. */
export async function leseBasis(e2, name) {
  if (!name) return { ok: true, zeilen: [], name: null };
  const manifest = await e2.getJson(`${L.datensaetze}/${name}/manifest.json`, null);
  if (!manifest) return { ok: false, grund: `basis_${name}_fehlt` };
  const art = manifest?.quelle?.art;
  if (art === "erzeugt") return { ok: false, grund: "basis_ist_erzeugt_verboten" };
  if (!ERLAUBTE_BASIS_QUELLEN.includes(art)) return { ok: false, grund: `basis_herkunft_unbelegt:${art || "keine"}` };
  if (manifest?.rechte?.bestaetigt !== true) return { ok: false, grund: "basis_rechte_nicht_bestaetigt" };
  const text = await e2.getText(`${L.datensaetze}/${name}/train.jsonl`);
  if (!text) return { ok: false, grund: "basis_train_jsonl_fehlt" };
  return { ok: true, zeilen: text.split("\n").filter((z) => z.trim()), name };
}

/**
 * Baut und veroeffentlicht den Datensatz einer Runde.
 * Deterministisch: dieselben Paare ergeben denselben Namen und dieselbe Datei —
 * ein zweiter Takt, der denselben Stand vorfindet, ueberschreibt nur mit Gleichem.
 * @returns {Promise<{ok, grund, name?, prefix?, paare?, sha256?, bericht?}>}
 */
export async function baueLernpaarDatensatz(e2, { suiten = [], runde = 1, env = process.env } = {}) {
  let quelle;
  try { quelle = await leseLernpaare(e2); } catch { return { ok: false, grund: "lernpaare_nicht_lesbar" }; }
  const basis = await leseBasis(e2, String(wert(env, "BASIS_DATENSATZ") || "").trim() || null);
  if (!basis.ok) return { ok: false, grund: basis.grund };
  if (!quelle.paare.length) return { ok: false, grund: "keine_gueltigen_lernpaare" };

  const { paare, bericht } = baueDatensatz([...basis.zeilen, ...quelle.paare], { suiten });
  if (!bericht.ok || !paare.length) return { ok: false, grund: "qualitaet_nicht_ok", bericht };

  const kennung = hashText(quelle.schluessel.join("\n") + "|" + (basis.name || "")).slice(0, 8);
  const name = `muuny-lernpaare-r${runde}-${kennung}`;
  const manifest = await veroeffentliche(e2, { name, paare, bericht, freigegeben: true, kategorien: ["lernpaare"],
    quelle: { art: "lernpaare", dateien: quelle.schluessel.length, verworfen: quelle.verworfen, basis: basis.name, runde } });
  return { ok: true, grund: null, name, prefix: `${L.datensaetze}/${name}`, paare: paare.length,
    sha256: manifest.dateien[0].sha256, bericht };
}

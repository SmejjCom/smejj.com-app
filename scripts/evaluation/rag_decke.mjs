#!/usr/bin/env node
// smejj.com — Wie viel Luft hat die Suche ueberhaupt noch? (Deckenmessung)
//
// Warum es dieses Werkzeug gibt (2026-08-05):
// Am Retrieval wurde dreimal gedreht — Quellen-Gewichte, Nachsortierer,
// Begriffserweiterung — und dreimal nichts gewonnen. Allen drei Versuchen fehlte
// dieselbe Zahl: Wie viele Fragen sind ueberhaupt durch ein vorhandenes Dokument
// beantwortbar? Ohne sie ist unbekannt, ob die Suche schlecht ist oder ob das
// Wissen schlicht fehlt. Das eine repariert man mit besserer Suche, das andere
// nur mit besserer Dokumentation — und beides kostet sehr unterschiedlich viel.
//
// Verfahren, zweistufig:
//   1) Ein BREITES Trefferbecken je Frage (Roh-BM25, ohne Relevanzschwelle).
//      Es soll die Frage "steht es irgendwo im Korpus?" annaehern, nicht die
//      Frage "findet die Produktionssuche es?".
//   2) Ein Modellurteil je Frage: Welche dieser Passagen enthalten Information,
//      die zur Beantwortung noetig ist? Keine? Dann gilt die Frage als ungedeckt.
//
// Daraus entstehen drei Gruppen, und nur die mittlere rechtfertigt Aufwand:
//   gedeckt UND heute gefunden   -> die Suche arbeitet
//   gedeckt, ABER nicht gefunden -> genau hier liegt die Luft (Retrieval-Luecke)
//   ungedeckt                    -> die Decke; keine Suchart der Welt hilft
//
// Der Modellaufruf wird injiziert; die Auswertung ist ohne Netz testbar.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEvalSuite } from "../../src/evaluation/evalPacks.js";
import { ensureKnowledgeIndex } from "../../control-server/src/rag/agentContext.js";
import { searchIndex } from "../../control-server/src/rag/bm25Index.js";
import { searchRagIndex } from "../../control-server/src/rag/ragContextBlock.js";
import { MIN_TOP_SCORE } from "../../control-server/src/rag/ragRanking.js";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "../..");
const DEFAULT_SUITE = "evals/suites/smejj-chat-breit-v1.json";

/** Breite des Beckens fuer die Deckenfrage. Deutlich groesser als im Betrieb. */
export const DECKEN_BECKEN = 20;

/** Zeichen je Passage im Urteils-Prompt. */
export const PASSAGE_ZEICHEN = 320;

export function parseArguments(argv) {
  const options = { suite: DEFAULT_SUITE, limit: null, schwelle: MIN_TOP_SCORE, out: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--suite") { options.suite = String(argv[index + 1] || ""); index += 1; }
    else if (token === "--limit") { options.limit = Number.parseInt(argv[index + 1], 10); index += 1; }
    else if (token === "--schwelle") { options.schwelle = Number.parseFloat(argv[index + 1]); index += 1; }
    else if (token === "--out") { options.out = String(argv[index + 1] || ""); index += 1; }
    else return { error: `unknown_argument:${token}` };
  }
  if (options.limit !== null && !(Number.isInteger(options.limit) && options.limit > 0)) {
    return { error: "invalid_limit" };
  }
  if (!Number.isFinite(options.schwelle) || options.schwelle < 0) return { error: "invalid_schwelle" };
  return { options };
}

/** Formt die Urteilsfrage. Knapp und ohne Spielraum — es werden Nummern erwartet. */
export function baueUrteilsPrompt(frage, kandidaten) {
  const liste = kandidaten.map((treffer, index) => {
    const kopf = `[${index + 1}] ${treffer.source}${treffer.heading ? ` :: ${treffer.heading}` : ""}`;
    return `${kopf}\n${String(treffer.text || treffer.snippet || "").slice(0, PASSAGE_ZEICHEN)}`;
  }).join("\n\n");
  return [
    `Frage: ${frage}`,
    "",
    "Passagen aus der Projektdokumentation:",
    liste,
    "",
    "Welche Passagen enthalten Information, die man zur Beantwortung der Frage BRAUCHT?",
    "Antworte NUR mit Nummern, durch Komma getrennt (Beispiel: 3,7).",
    "Enthaelt keine Passage solche Information, antworte 0.",
    "Allgemeinwissen zaehlt nicht — gefragt ist, ob die Antwort in diesen Passagen steht."
  ].join("\n");
}

/**
 * Liest die Nummern aus der Modellantwort.
 * @returns {number[]|null} [] = keine passt; [n,...] = Treffer; null = unlesbar
 */
export function leseNummern(text, anzahl) {
  const roh = String(text || "").trim();
  if (!roh) return null;
  const zahlen = [...roh.matchAll(/\d+/g)].map((treffer) => Number(treffer[0]));
  if (zahlen.length === 0) return null;
  if (zahlen.includes(0)) return [];
  const gueltig = [...new Set(zahlen.filter((zahl) => zahl >= 1 && zahl <= anzahl))];
  // Nur unbrauchbare Zahlen (etwa "Passage 42" bei 20 Kandidaten) heisst: das
  // Modell hat nicht die gestellte Frage beantwortet. Das ist ein Ausfall, keine
  // Aussage — und darf nicht als "ungedeckt" gezaehlt werden.
  return gueltig.length > 0 ? gueltig : null;
}

/**
 * Ordnet einen Fall einer der drei Gruppen zu.
 * Rein, damit die Auswertung ohne Netz pruefbar bleibt.
 */
export function bewerteFall({ gedeckt, heuteGefunden }) {
  if (gedeckt === null) return "unklar";
  if (!gedeckt) return "ungedeckt";
  return heuteGefunden ? "gedeckt-gefunden" : "gedeckt-verfehlt";
}

/** Zaehlt die Gruppen je Kategorie und insgesamt. */
export function fasseDeckeZusammen(eintraege) {
  const leer = () => ({ "gedeckt-gefunden": 0, "gedeckt-verfehlt": 0, ungedeckt: 0, unklar: 0, gesamt: 0 });
  const gesamt = leer();
  const kategorien = {};
  for (const { kategorie, gruppe } of eintraege) {
    const schluessel = kategorie || "sonstige";
    kategorien[schluessel] = kategorien[schluessel] || leer();
    kategorien[schluessel][gruppe] += 1;
    kategorien[schluessel].gesamt += 1;
    gesamt[gruppe] += 1;
    gesamt.gesamt += 1;
  }
  return { gesamt, kategorien };
}

function usage() {
  return [
    "smejj.com Deckenmessung — wie viel Luft hat die Suche noch?",
    "",
    `  --suite <pfad>    Eval-Suite (Standard: ${DEFAULT_SUITE})`,
    `  --schwelle <n>    Schwelle fuer 'heute gefunden' (Standard ${MIN_TOP_SCORE}, die Produktionsschwelle)`,
    "  --limit <n>       nur die ersten n Faelle",
    "  --out <pfad>      Ergebnis als JSON ablegen",
    "",
    "Braucht einen Modellzugang: je Fall EIN kurzer Urteilsaufruf.",
    ""
  ].join("\n");
}

/**
 * Fuehrt die Messung aus. `urteile` wird injiziert:
 *   urteile(prompt) => Promise<string>
 */
export async function messeDecke({ suite, index, urteile, schwelle, onFall = () => {} }) {
  const eintraege = [];
  for (const fall of suite.cases) {
    const becken = searchIndex(index, fall.prompt, DECKEN_BECKEN);
    // Was die Produktionssuche heute wirklich liefert — der Vergleichsmassstab.
    const heute = searchRagIndex(index, fall.prompt, 3, { minTopScore: schwelle });
    const heuteQuellen = new Set(heute.map((treffer) => treffer.source));

    let gedeckt = null;
    let quellen = [];
    if (becken.length > 0) {
      const nummern = leseNummern(await urteile(baueUrteilsPrompt(fall.prompt, becken)), becken.length);
      if (nummern !== null) {
        gedeckt = nummern.length > 0;
        quellen = nummern.map((nummer) => becken[nummer - 1]?.source).filter(Boolean);
      }
    } else {
      // Kein einziger Roh-Treffer heisst: kein Wort der Frage kommt im Korpus vor.
      gedeckt = false;
    }

    // "Heute gefunden" heisst: mindestens eine der als noetig beurteilten Quellen
    // steht auch in dem, was die Produktionssuche liefert.
    const heuteGefunden = quellen.some((quelle) => heuteQuellen.has(quelle));
    const gruppe = bewerteFall({ gedeckt, heuteGefunden });
    eintraege.push({ id: fall.id, kategorie: fall.kategorie, gruppe, quellen: [...new Set(quellen)] });
    onFall(eintraege[eintraege.length - 1]);
  }
  return eintraege;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`Abbruch: ${parsed.error}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (parsed.options.help) {
    process.stdout.write(usage());
    return;
  }
  const { suite: suitePfad, schwelle, limit, out } = parsed.options;

  const geladen = await loadEvalSuite(path.resolve(REPO_ROOT, suitePfad));
  const suite = limit ? { ...geladen.suite, cases: geladen.suite.cases.slice(0, limit) } : geladen.suite;
  const index = await ensureKnowledgeIndex(REPO_ROOT);

  const schluessel = process.env.SMEJJ_LLM_ZHIPU_API_KEY;
  if (!schluessel) {
    process.stderr.write("Abbruch: kein Modellzugang (SMEJJ_LLM_ZHIPU_API_KEY) — fail-closed, es wird nichts geraten.\n");
    process.exitCode = 1;
    return;
  }

  // Wiederholung bei Transportfehlern: ohne sie zaehlt jeder Netzaussetzer als
  // "unklar" und die Decke saehe niedriger aus, als sie ist (gemessen 2026-08-05).
  const urteile = async (prompt) => {
    for (let versuch = 0; versuch < 4; versuch += 1) {
      try {
        const antwort = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${schluessel}` },
          body: JSON.stringify({
            model: "glm-5.2",
            max_tokens: 80,
            thinking: { type: "disabled" },
            messages: [{ role: "user", content: prompt }]
          })
        });
        if (!antwort.ok) continue;
        return String((await antwort.json())?.choices?.[0]?.message?.content || "");
      } catch {
        await new Promise((fertig) => setTimeout(fertig, 800 * (versuch + 1)));
      }
    }
    return "";
  };

  process.stdout.write(`Deckenmessung: ${suite.cases.length} Faelle, Becken ${DECKEN_BECKEN}, Vergleichsschwelle ${schwelle}\n\n`);
  let zaehler = 0;
  const eintraege = await messeDecke({
    suite,
    index,
    urteile,
    schwelle,
    onFall: (eintrag) => {
      zaehler += 1;
      if (zaehler % 25 === 0) process.stdout.write(`  ${zaehler}/${suite.cases.length} …\n`);
    }
  });

  const { gesamt, kategorien } = fasseDeckeZusammen(eintraege);
  const anteil = (wert) => `${((100 * wert) / gesamt.gesamt).toFixed(1)} %`;
  process.stdout.write([
    "",
    `gedeckt und heute gefunden : ${String(gesamt["gedeckt-gefunden"]).padStart(3)}  ${anteil(gesamt["gedeckt-gefunden"])}`,
    `gedeckt, aber VERFEHLT     : ${String(gesamt["gedeckt-verfehlt"]).padStart(3)}  ${anteil(gesamt["gedeckt-verfehlt"])}   <- hier liegt die Luft`,
    `ungedeckt (die Decke)      : ${String(gesamt.ungedeckt).padStart(3)}  ${anteil(gesamt.ungedeckt)}`,
    `unklar (Urteil unlesbar)   : ${String(gesamt.unklar).padStart(3)}  ${anteil(gesamt.unklar)}`,
    "",
    "Kategorie      gefunden  verfehlt  ungedeckt",
    ...Object.entries(kategorien).sort((a, b) => b[1]["gedeckt-verfehlt"] - a[1]["gedeckt-verfehlt"]).map(([name, wert]) =>
      `  ${name.padEnd(12)} ${String(wert["gedeckt-gefunden"]).padStart(6)} ${String(wert["gedeckt-verfehlt"]).padStart(9)} ${String(wert.ungedeckt).padStart(10)}`),
    ""
  ].join("\n"));

  if (out) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.resolve(REPO_ROOT, out),
      `${JSON.stringify({ kind: "smejj.com-rag-decke", schwelle, becken: DECKEN_BECKEN, gesamt, kategorien, eintraege }, null, 2)}\n`, "utf8");
    process.stdout.write(`Bericht: ${out}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  await main();
}

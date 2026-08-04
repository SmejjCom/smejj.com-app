#!/usr/bin/env node
// smejj.com — Wie oft feuert die RAG-Suche ueberhaupt? Je Schwelle und Kategorie.
//
// Warum es dieses Werkzeug gibt (gemessen am 2026-08-04):
// Ein A/B-Lauf "mit Projektwissen gegen ohne" wurde gestartet und lieferte in
// 0 von 4 Aufrufen Kontext. Der Bericht haette daraus "Projektwissen bringt
// nichts" gemacht — dabei hatte die Suche schlicht nie ausgeloest. Ein Vergleich,
// bei dem die eine Seite gar nicht stattfand, ist keine Messung, sondern ein
// Fehlschluss mit Nachkommastelle.
//
// Dieses Werkzeug beantwortet vorher und KOSTENLOS: bekommt ueberhaupt genug
// Faelle Kontext, damit sich der Lauf lohnt — und bekommen ihn die richtigen?
// Es ruft kein Modell auf. Es baut nur denselben Kontextblock, den der Lauf
// voranstellen wuerde, und zaehlt, wann einer entsteht.
//
// Aufruf:
//   node scripts/evaluation/rag_deckung.mjs
//   node scripts/evaluation/rag_deckung.mjs --suite evals/suites/... --schwellen 20,12,8
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEvalSuite } from "../../src/evaluation/evalPacks.js";
import { withRagContext } from "../../src/evaluation/evalRagContext.js";
import { MIN_TOP_SCORE } from "../../control-server/src/rag/ragRanking.js";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "../..");
const DEFAULT_SUITE = "evals/suites/smejj-chat-breit-v1.json";

export function parseArguments(argv) {
  const options = { suite: DEFAULT_SUITE, schwellen: [MIN_TOP_SCORE, 12, 8, 6], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--suite") { options.suite = String(argv[index + 1] || ""); index += 1; }
    else if (token === "--schwellen") {
      // Leere Teile NICHT wegfiltern, sondern durchreichen: `--schwellen ""`
      // ergaebe sonst still die Schwelle 0 — also "immer Kontext" — und damit
      // genau die Fehlmessung, gegen die dieses Werkzeug gebaut wurde.
      // Number("") ist 0 und rutscht durch jede naive Zahlenpruefung.
      options.schwellen = String(argv[index + 1] ?? "").split(",").map((wert) => {
        const roh = wert.trim();
        return roh === "" ? Number.NaN : Number(roh);
      });
      index += 1;
    } else return { error: `unknown_argument:${token}` };
  }
  if (options.schwellen.length === 0) return { error: "invalid_schwellen" };
  if (options.schwellen.some((wert) => !Number.isFinite(wert) || wert < 0)) return { error: "invalid_schwellen" };
  return { options };
}

/**
 * Zaehlt je Kategorie, wie viele Faelle bei einer Schwelle Kontext bekommen.
 * Rein und ohne Ausgabe, damit die Auswertung testbar bleibt.
 */
export function fasseDeckungZusammen(eintraege) {
  const treffer = {};
  for (const { kategorie, contextChars } of eintraege) {
    const schluessel = kategorie || "sonstige";
    treffer[schluessel] = treffer[schluessel] || { mit: 0, gesamt: 0, zeichen: 0 };
    treffer[schluessel].gesamt += 1;
    if (contextChars > 0) {
      treffer[schluessel].mit += 1;
      treffer[schluessel].zeichen += contextChars;
    }
  }
  return treffer;
}

function usage() {
  return [
    "smejj.com RAG-Deckung — wie oft entsteht ueberhaupt Kontext?",
    "",
    `  --suite <pfad>       Eval-Suite (Standard: ${DEFAULT_SUITE})`,
    `  --schwellen <liste>  Kommaliste, Standard ${MIN_TOP_SCORE},12,8,6`,
    "",
    "Ruft kein Modell auf und kostet nichts.",
    ""
  ].join("\n");
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
  const { suite: suiteRelativ, schwellen } = parsed.options;

  const { suite } = await loadEvalSuite(path.resolve(REPO_ROOT, suiteRelativ));
  const faelle = Array.isArray(suite?.cases) ? suite.cases : [];
  if (faelle.length === 0) {
    process.stderr.write("Abbruch: Suite enthaelt keine Faelle.\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Suite ${suite.suiteId}: ${faelle.length} Faelle, Schwellen ${schwellen.join(", ")}\n`);
  process.stdout.write(`Produktionsschwelle laut ragRanking.js: ${MIN_TOP_SCORE}\n\n`);

  const tabelle = {};
  for (const schwelle of schwellen) {
    const eintraege = [];
    for (const fall of faelle) {
      const { contextChars } = await withRagContext(fall, REPO_ROOT, { minTopScore: schwelle });
      eintraege.push({ kategorie: fall.kategorie, contextChars });
    }
    tabelle[schwelle] = fasseDeckungZusammen(eintraege);
    const mit = eintraege.filter((eintrag) => eintrag.contextChars > 0).length;
    process.stdout.write(`Schwelle ${String(schwelle).padStart(2)}: Kontext in ${mit}/${faelle.length} Faellen` +
      ` (${(100 * mit / faelle.length).toFixed(1)} %)\n`);
  }

  const kategorien = [...new Set(faelle.map((fall) => fall.kategorie || "sonstige"))].sort();
  process.stdout.write("\nKategorie    " + schwellen.map((s) => `Schw.${String(s).padStart(2)}`).join("  ") + "\n");
  for (const kategorie of kategorien) {
    const zellen = schwellen.map((schwelle) => {
      const wert = tabelle[schwelle][kategorie];
      return `${String(wert.mit).padStart(2)}/${String(wert.gesamt).padEnd(2)}`.padStart(8);
    });
    process.stdout.write(kategorie.padEnd(12) + zellen.join("  ") + "\n");
  }
  // Kein Urteil, keine Empfehlung: welche Schwelle richtig ist, entscheidet der
  // A/B-Lauf mit echten Antworten — nicht die Deckung allein. Dieses Werkzeug
  // sagt nur, ob ein Lauf ueberhaupt etwas zu messen haette.
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  await main();
}

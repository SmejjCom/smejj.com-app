// smejj.com — Wissensquelle fuer die RAG-Suche: liest die regeltragenden
// Markdown-Dokumente des Projekts und zerlegt sie in Ueberschriften-Chunks mit
// Quellenangabe. Nur Lesen, fail-closed: fehlende Dateien werden uebersprungen,
// nichts verlaesst den Server.
//
// WELCHE Dateien dazugehoeren, entscheidet knowledgeCorpus.js — dort steht auch,
// warum datierte Berichte und Verlaufsprotokolle bewusst draussen bleiben.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listKnowledgeFiles } from "./knowledgeCorpus.js";

const MAX_CHUNK_CHARS = 2400;

/**
 * Datei-spezifische Zerleger-Optionen — gleicher Optionsname und gleiche Formen
 * wie der Trainings-Zerleger (src/training/projectcorpus/extract.js) und dessen
 * SONDERBEHANDLUNG in scripts/training/build_project_corpus.mjs.
 * MASTER_PROMPT.md traegt seinen gesamten Inhalt in einem ```text-Kopier-Zaun
 * und gliedert mit ====-Rahmen — ohne Sonderbehandlung zerfiel es in 10 Chunks
 * mit identischer Ueberschrift (TRAININGSKORPUS_VERMESSUNG_2026-08-05).
 * Bewusst opt-in je Datei: andere Quellen nutzen ```text fuer Beispielausgaben.
 */
export const SONDERBEHANDLUNG = Object.freeze({
  "MASTER_PROMPT.md": Object.freeze({ textZaeuneTransparent: true })
});

/**
 * Zerlegt Markdown an Ueberschriften; ueberlange Abschnitte werden hart geteilt.
 *
 * Neben #-Ueberschriften werden `====`-gerahmte Titel erkannt (Zeile aus
 * Gleichheitszeichen, Titelzeile, Zeile aus Gleichheitszeichen). Gemessen am
 * 2026-08-05 ueber alle 96 Korpusdateien: solche Rahmen kommen ausser in
 * MASTER_PROMPT.md nirgends vor, die Erkennung ist darum immer aktiv.
 *
 * `optionen.textZaeuneTransparent` behandelt ```text-Zaeune als Prosa statt als
 * Code; nur innerhalb eines transparenten Zauns gelten zwei Zusatzformen:
 * GROSSBUCHSTABEN-Zeilen mit Doppelpunkt am Ende und `N)`-Eintraege. Die
 * Formen sind wortgleich aus zerlegeMarkdown in extract.js uebernommen —
 * tests/rag-search.test.mjs haelt beide Zerleger in Deckung. Seit dem
 * Nachzug vom 2026-08-05 gilt das auch fuer dessen Codeblock-Erkennung:
 * innerhalb gewoehnlicher ```-Zaeune ist keine Zeile eine Ueberschrift.
 * Vorher wurden Shell-Kommentare ("# erwartet: ...") zu Chunk-Ueberschriften;
 * das veraenderte die Chunks genau dreier Bestandsquellen (siehe
 * Regressionstest), alle anderen bleiben bit-identisch zum Ur-Zerleger.
 */
export function chunkMarkdown(text, source, optionen = {}) {
  const transparentErlaubt = optionen.textZaeuneTransparent === true;
  const chunks = [];
  let heading = "";
  let buffer = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (!body) return;
    for (let offset = 0; offset < body.length; offset += MAX_CHUNK_CHARS) {
      chunks.push({
        id: `${source}#${chunks.length}`,
        source,
        heading,
        text: `${heading ? heading + "\n" : ""}${body.slice(offset, offset + MAX_CHUNK_CHARS)}`
      });
    }
  };
  const beginne = (ueberschrift) => {
    flush();
    heading = String(ueberschrift).trim();
  };
  const zeilen = String(text || "").split("\n");
  let inCodeblock = false;
  let inTransparentZaun = false;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i];

    if (/^```/.test(zeile)) {
      if (inTransparentZaun) { inTransparentZaun = false; continue; }
      if (!inCodeblock && transparentErlaubt && /^```text\s*$/.test(zeile)) {
        inTransparentZaun = true;
        continue;
      }
      inCodeblock = !inCodeblock;
      buffer.push(zeile);
      continue;
    }

    if (!inCodeblock) {
      if (/^#{1,4}\s/.test(zeile)) {
        beginne(zeile.replace(/^#{1,4}\s*/, ""));
        continue;
      }

      const rahmen = /^={4,}\s*$/.test(zeile)
        && i + 2 < zeilen.length
        && zeilen[i + 1].trim().length > 0
        && !/^={4,}\s*$/.test(zeilen[i + 1])
        && /^={4,}\s*$/.test(zeilen[i + 2]);
      if (rahmen) { beginne(zeilen[i + 1]); i += 2; continue; }

      if (inTransparentZaun) {
        const caps = /:$/.test(zeile.trim()) && istGrossToken(zeile.trim().split(/\s+/)[0]);
        if (caps) { beginne(zeile.trim().replace(/:$/, "")); continue; }
        const nummer = /^(\d{1,2})\)\s+(.{4,})$/.exec(zeile);
        if (nummer) { beginne(nummer[2]); continue; }
      }
    }

    buffer.push(zeile);
  }
  flush();
  return chunks;
}

/** Erstes Wort einer Gliederungszeile: mindestens 4 Zeichen, alle gross. */
function istGrossToken(token) {
  return /^[A-Z0-9ÄÖÜ][A-Z0-9ÄÖÜ\-]{3,}$/.test(String(token || ""));
}

/** Laedt alle Wissens-Chunks des Projekts. Input: projectRoot (absolut). */
export async function loadKnowledgeChunks(projectRoot) {
  const { files } = await listKnowledgeFiles(projectRoot);
  const chunks = [];
  for (const relative of files) {
    let text = "";
    try {
      text = await readFile(path.join(projectRoot, relative), "utf8");
    } catch {
      continue; // Datei fehlt oder unlesbar — kein Fehler, nur weniger Wissen.
    }
    chunks.push(...chunkMarkdown(text, relative, SONDERBEHANDLUNG[relative]));
  }
  return chunks;
}

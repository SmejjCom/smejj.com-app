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

// Zerlegt Markdown an Ueberschriften; ueberlange Abschnitte werden hart geteilt.
export function chunkMarkdown(text, source) {
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
  for (const line of String(text || "").split("\n")) {
    if (/^#{1,4}\s/.test(line)) {
      flush();
      heading = line.replace(/^#{1,4}\s*/, "").trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
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
    chunks.push(...chunkMarkdown(text, relative));
  }
  return chunks;
}

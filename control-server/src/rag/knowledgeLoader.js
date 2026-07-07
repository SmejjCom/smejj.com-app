// smejj.com — Wissensquelle fuer die RAG-Suche: liest Markdown-Projektwissen
// (Memory_Bank.md, AI_Guidelines.md, Project_Goals.md, docs/**/*.md) und zerlegt
// es in Ueberschriften-Chunks mit Quellenangabe. Nur Lesen, fail-closed:
// fehlende Dateien werden uebersprungen, nichts verlaesst den Server.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT_KNOWLEDGE_FILES = ["Memory_Bank.md", "AI_Guidelines.md", "Project_Goals.md", "AGENTS.md", "README.md"];
const MAX_DOC_FILES = 200;
const MAX_CHUNK_CHARS = 2400;

async function listMarkdownFiles(dir, collected = []) {
  if (collected.length >= MAX_DOC_FILES) return collected;
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    if (collected.length >= MAX_DOC_FILES) break;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await listMarkdownFiles(fullPath, collected);
    else if (entry.name.endsWith(".md")) collected.push(fullPath);
  }
  return collected;
}

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
  const files = [];
  for (const name of ROOT_KNOWLEDGE_FILES) files.push(path.join(projectRoot, name));
  await listMarkdownFiles(path.join(projectRoot, "docs"), files);
  const chunks = [];
  for (const file of files) {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue; // Datei fehlt oder unlesbar — kein Fehler, nur weniger Wissen.
    }
    const relative = path.relative(projectRoot, file);
    chunks.push(...chunkMarkdown(text, relative));
  }
  return chunks;
}

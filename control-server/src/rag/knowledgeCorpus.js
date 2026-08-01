// smejj.com — Korpusregel der RAG-Suche: WELCHE Dateien als Projektwissen gelten.
//
// Warum es dieses Modul gibt (gemessen am 2026-08-01):
// Der Loader nahm vorher jede Markdown-Datei unter docs/ auf, gedeckelt auf 200.
// Bei 223 vorhandenen Dateien hiess das: 28 Dateien fielen STILL heraus, und welche
// das waren, entschied die Reihenfolge des Verzeichnisbaums. Gleichzeitig bestand der
// Korpus zu grossen Teilen aus datierten Berichten (QA-Wellen, Memory-Archive,
// Task-Capsules, Benchmark-Berichte). Auf die Frage "Wie schreibt man den Namen der
// Plattform?" lieferte die Suche darum einen QA-Bericht statt AI_Guidelines.md.
//
// Die Regel dahinter ist keine Geschmacksfrage: Ein Retrieval-Treffer soll sagen,
// was GILT, nicht was einmal galt. Datierte Berichte und Protokolle beschreiben einen
// Zeitpunkt; Regeldokumente beschreiben den Zustand. Darum bleiben Protokolle draussen.
//
// Zweiter, harter Grund: Benchmark-Berichte und Memory-Eintraege nennen die
// Fall-Kennungen der Eval-Suite samt erwartetem Verhalten. Im Korpus waeren sie der
// Antwortschluessel der eigenen Pruefung — jede gemessene Verbesserung waere Selbstbetrug.
// Der Waechter dagegen steht in tests/rag-search.test.mjs.
//
// Der Verlauf geht nicht verloren: Task Capsules auf IDrive e2 sind laut
// AI_Guidelines.md Abschnitt 4 der Ort fuer die Historie, nicht der Chat-Kontext.
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Regeltragende Dokumente im Projektstamm. */
export const ROOT_KNOWLEDGE_FILES = Object.freeze([
  "AI_Guidelines.md",
  "MASTER_PROMPT.md",
  "AGENTS.md",
  "Project_Goals.md",
  "README.md"
]);

/** Ordner unter docs/, die reine Verlaufsdokumentation enthalten. */
export const HISTORY_DIRECTORIES = Object.freeze([
  "memory",
  "benchmarks",
  "qa",
  "task-capsules",
  "release",
  "prompts",
  "mockups",
  "projects"
]);

/** Dateiname mit ISO-Datum = Momentaufnahme, kein geltendes Regeldokument. */
export const DATED_FILE_PATTERN = /\d{4}-\d{2}-\d{2}/;

// Obergrenze bleibt bestehen (der Kontext eines Prompts ist endlich), aber sie wird
// gemeldet statt still angewendet — siehe `truncated` im Rueckgabewert.
export const MAX_KNOWLEDGE_FILES = 400;

/**
 * Entscheidet fuer einen repo-relativen Pfad, ob er in den Wissenskorpus gehoert.
 * Pur und ohne I/O, damit die Regel testbar ist.
 * @param {string} relativePath repo-relativ, mit "/" als Trenner
 * @returns {boolean}
 */
export function isKnowledgeFile(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (!normalized.endsWith(".md")) return false;
  if (ROOT_KNOWLEDGE_FILES.includes(normalized)) return true;
  if (!normalized.startsWith("docs/")) return false;
  const segments = normalized.split("/");
  if (segments.slice(1, -1).some((segment) => HISTORY_DIRECTORIES.includes(segment))) return false;
  return !DATED_FILE_PATTERN.test(segments[segments.length - 1]);
}

/**
 * Listet alle Wissensdateien des Projekts in stabiler Reihenfolge.
 * Fail-closed: unlesbare Verzeichnisse werden uebersprungen, nie geraten.
 * @returns {Promise<{files: string[], truncated: boolean, scanned: number}>}
 */
export async function listKnowledgeFiles(projectRoot) {
  const found = [];
  let scanned = 0;

  const walk = async (absoluteDir) => {
    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    // Sortiert, damit derselbe Stand denselben Index ergibt (reproduzierbar).
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(absoluteDir, entry.name);
      const relative = path.relative(projectRoot, absolute).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (!HISTORY_DIRECTORIES.includes(entry.name)) await walk(absolute);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      scanned += 1;
      if (isKnowledgeFile(relative)) found.push(relative);
    }
  };

  await walk(path.join(projectRoot, "docs"));
  const files = [...ROOT_KNOWLEDGE_FILES, ...found];
  return {
    files: files.slice(0, MAX_KNOWLEDGE_FILES),
    truncated: files.length > MAX_KNOWLEDGE_FILES,
    scanned
  };
}

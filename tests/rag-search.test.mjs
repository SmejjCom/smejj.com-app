import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildIndex, searchIndex, tokenize } from "../control-server/src/rag/bm25Index.js";
import { chunkMarkdown, loadKnowledgeChunks } from "../control-server/src/rag/knowledgeLoader.js";
import { buildRagContextBlock, searchKnowledge } from "../control-server/src/rag/agentContext.js";
import {
  DATED_FILE_PATTERN,
  HISTORY_DIRECTORIES,
  isKnowledgeFile,
  listKnowledgeFiles,
  MAX_KNOWLEDGE_FILES,
  ROOT_KNOWLEDGE_FILES
} from "../control-server/src/rag/knowledgeCorpus.js";
import { MIN_TOP_SCORE, rankHits, sourcePriority } from "../control-server/src/rag/ragRanking.js";
import { withRagContext, wrapCallerWithRag } from "../src/evaluation/evalRagContext.js";
import { buildRagIndexArtifact, exportRagIndex, idriveConfigFromEnv } from "../scripts/rag/export_rag_index_to_idrive.mjs";

test("rag index export is fail-closed without idrive env and uploads with injected writer", async () => {
  const emptyEnv = {};
  assert.equal(idriveConfigFromEnv(emptyEnv).complete, false);
  const dry = await exportRagIndex({ env: emptyEnv, now: new Date("2026-07-03T10:00:00Z") });
  assert.equal(dry.ok, false);
  assert.equal(dry.mode, "write-plan-only");
  assert.ok(dry.chunkCount > 20);
  assert.deepEqual(dry.plannedObjects, ["rag/knowledge-index/2026-07-03/index.json", "rag/knowledge-index/latest.json"]);

  const fullEnv = { IDRIVE_E2_ENDPOINT: "https://s3.example.test", IDRIVE_E2_BUCKET: "b", IDRIVE_E2_ACCESS_KEY: "a", IDRIVE_E2_SECRET_KEY: "s" };
  const puts = [];
  const uploaded = await exportRagIndex({ env: fullEnv, put: async (object) => puts.push(object.key), now: new Date("2026-07-03T10:00:00Z") });
  assert.equal(uploaded.ok, true);
  assert.deepEqual(puts, ["rag/knowledge-index/2026-07-03/index.json", "rag/knowledge-index/latest.json"]);
  assert.equal(uploaded.sha256, dry.sha256, "artifact must be deterministic for same time input");
});

test("rag index artifact is valid, self-describing json", async () => {
  const artifact = await buildRagIndexArtifact(process.cwd(), new Date("2026-07-03T10:00:00Z"));
  const parsed = JSON.parse(artifact.body);
  assert.equal(parsed.artifact, "smejj.com-rag-knowledge-index");
  assert.equal(parsed.chunkCount, artifact.chunkCount);
  assert.ok(parsed.index.documents.length === parsed.chunkCount);
});

test("agent rag context block marks project knowledge as internal background", async () => {
  // Schwelle ausdruecklich abgesenkt: geprueft wird die FORM des Blocks, nicht ob
  // diese eine Frage die Produktionsschwelle erreicht.
  const block = await buildRagContextBlock(process.cwd(), "Welche Dienste darf smejj.com kostenpflichtig nutzen?", 3, { minTopScore: 0 });
  assert.ok(block.startsWith("Internes Projektwissen"));
  assert.ok(block.includes("niemals als oeffentliche Quelle"));
  assert.ok(block.includes("[intern:"), "expected internal source markers");
  assert.ok(/AI_Guidelines\.md|MASTER_PROMPT\.md|AGENTS\.md|docs\//.test(block));
});

test("agent rag context block is fail-closed on unusable input", async () => {
  assert.equal(await buildRagContextBlock(process.cwd(), "", 3), "");
  assert.equal(await buildRagContextBlock("/pfad/der/nicht/existiert", "irgendwas", 3), "");
});

test("tokenizer folds german umlauts and drops stopwords", () => {
  const terms = tokenize("Die Prüfung läuft über die Wörter");
  assert.ok(terms.includes("pruefung"));
  assert.ok(terms.includes("laeuft"));
  assert.ok(terms.includes("woerter"));
  assert.ok(!terms.includes("die"));
  assert.ok(!terms.includes("ueber"));
});

test("bm25 ranks the document containing the query terms first", () => {
  const index = buildIndex([
    { id: "a", source: "a.md", text: "Der Control Server routet Jobs und streamt Status." },
    { id: "b", source: "b.md", text: "IDrive e2 ist das Object Brain fuer Task Capsules und Modelle." },
    { id: "c", source: "c.md", text: "Salad Worker starten nur bei echter Rechenarbeit." }
  ]);
  const hits = searchIndex(index, "Object Brain Task Capsule", 3);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].id, "b");
  assert.ok(hits[0].score > 0);
  assert.ok(hits[0].snippet.includes("Object Brain"));
});

test("empty query and empty index are fail-closed", () => {
  const index = buildIndex([{ id: "a", source: "a.md", text: "Inhalt" }]);
  assert.deepEqual(searchIndex(index, "   ", 5), []);
  assert.deepEqual(searchIndex(buildIndex([]), "irgendwas", 5), []);
});

test("markdown chunking splits at headings and keeps the source reference", () => {
  const chunks = chunkMarkdown("# Titel\nAbsatz eins.\n## Abschnitt\nAbsatz zwei.", "doku.md");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].source, "doku.md");
  assert.equal(chunks[0].heading, "Titel");
  assert.equal(chunks[1].heading, "Abschnitt");
  assert.ok(chunks[1].text.includes("Absatz zwei."));
});

test("project knowledge loads and answers a real architecture question", async () => {
  const chunks = await loadKnowledgeChunks(process.cwd());
  assert.ok(chunks.length > 20, "expected project markdown knowledge to be loaded");
  const index = buildIndex(chunks);
  const hits = searchIndex(index, "GitHub Pages Free statisches Hosting Static-First", 3);
  assert.ok(hits.length >= 1);
  assert.ok(hits.some((hit) => hit.source.includes("docs/") || ROOT_KNOWLEDGE_FILES.includes(hit.source)));
});

// ---------------------------------------------------------------------------
// Korpusregel (knowledgeCorpus.js)
// ---------------------------------------------------------------------------

test("corpus rule keeps rule documents and drops history and dated snapshots", () => {
  assert.equal(isKnowledgeFile("AI_Guidelines.md"), true);
  assert.equal(isKnowledgeFile("docs/architecture/FREE_ONLY_MASTER_POLICY.md"), true);
  assert.equal(isKnowledgeFile("docs/policy/GITHUB_KOSTENFREI.md"), true);
  // Verlaufsordner
  assert.equal(isKnowledgeFile("docs/memory/Memory_Bank_2026-07-29_modulv.md"), false);
  assert.equal(isKnowledgeFile("docs/benchmarks/BEFUND.md"), false);
  assert.equal(isKnowledgeFile("docs/qa/QA_WELLE_2.md"), false);
  assert.equal(isKnowledgeFile("docs/task-capsules/2026/07/job_x/CAPSULE.md"), false);
  // Datierte Momentaufnahme, auch in einem erlaubten Ordner
  assert.equal(isKnowledgeFile("docs/architecture/BEFUND_2026-07-25.md"), false);
  // Nicht-Markdown und Dateien ausserhalb des Wissensbereichs
  assert.equal(isKnowledgeFile("docs/architecture/diagram.png"), false);
  assert.equal(isKnowledgeFile("src/server.js"), false);
  assert.equal(isKnowledgeFile("Memory_Bank.md"), false, "Verlaufsprotokoll gehoert nicht in den Retrieval-Korpus");
});

test("corpus listing is complete, ordered and never silently truncated", async () => {
  const result = await listKnowledgeFiles(process.cwd());
  assert.equal(result.truncated, false, "Deckel erreicht — Dateien wuerden still wegfallen");
  assert.ok(result.files.length > 40, `erwartet mehr als 40 Wissensdateien, gefunden ${result.files.length}`);
  assert.ok(result.files.length <= MAX_KNOWLEDGE_FILES);
  for (const name of ROOT_KNOWLEDGE_FILES) {
    assert.ok(result.files.includes(name), `${name} fehlt im Korpus`);
  }
  for (const file of result.files) {
    assert.ok(isKnowledgeFile(file), `${file} verletzt die Korpusregel`);
  }
  // Reproduzierbarkeit: derselbe Stand ergibt dieselbe Reihenfolge.
  const zweiterLauf = await listKnowledgeFiles(process.cwd());
  assert.deepEqual(zweiterLauf.files, result.files);
});

test("corpus never contains the eval suite answer key", async () => {
  const suite = JSON.parse(await readFile("evals/suites/smejj-chat-core-v1.json", "utf8"));
  const kennungen = suite.cases.map((item) => item.id);
  const { files } = await listKnowledgeFiles(process.cwd());
  const leck = [];
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    for (const id of kennungen) if (text.includes(id)) leck.push(`${file} -> ${id}`);
  }
  // Ein Korpus, der die Fall-Kennungen der eigenen Pruefung enthaelt, macht jede
  // gemessene Verbesserung wertlos: das Modell laese dann den Erwartungstext mit.
  assert.deepEqual(leck, [], `Antwortschluessel im Wissenskorpus: ${leck.join(", ")}`);
});

test("history directories and dated pattern are declared, not implied", () => {
  assert.ok(HISTORY_DIRECTORIES.includes("memory"));
  assert.ok(HISTORY_DIRECTORIES.includes("benchmarks"));
  assert.ok(DATED_FILE_PATTERN.test("BEFUND_2026-07-25.md"));
  assert.ok(!DATED_FILE_PATTERN.test("FREE_ONLY_MASTER_POLICY.md"));
});

// ---------------------------------------------------------------------------
// Nachgewichtung und Relevanzschwelle (ragRanking.js)
// ---------------------------------------------------------------------------

test("rule documents outrank incidental mentions at similar word overlap", () => {
  const hits = [
    { source: "docs/architecture/SOME_REPORT.md", score: 12, id: "a" },
    { source: "AI_Guidelines.md", score: 10, id: "b" }
  ];
  // Schwelle hier ausdruecklich gesetzt: dieser Test prueft die Reihenfolge, nicht
  // die Produktionsschwelle. Sonst wuerde eine Schwellenaenderung ihn mitreissen.
  const ranked = rankHits(hits, { limit: 2, minTopScore: 0 });
  assert.equal(ranked[0].source, "AI_Guidelines.md", "Leitdokument muss gewinnen");
  assert.equal(ranked[0].baseScore, 10, "Rohpunktzahl bleibt nachvollziehbar erhalten");
});

test("relevance floor returns no context instead of weak context", () => {
  assert.deepEqual(rankHits([{ source: "docs/x/y.md", score: 2 }], { limit: 3 }), []);
  assert.deepEqual(rankHits([], { limit: 3 }), []);
  assert.deepEqual(rankHits(null, { limit: 3 }), []);
  const gerade = rankHits([{ source: "docs/x/y.md", score: MIN_TOP_SCORE }], { limit: 3 });
  assert.equal(gerade.length, 1, "genau auf der Schwelle zaehlt als Treffer");
});

test("weak trailing hits are dropped relative to the best hit", () => {
  const ranked = rankHits([
    { source: "docs/x/a.md", score: 20 },
    { source: "docs/x/b.md", score: 18 },
    { source: "docs/x/c.md", score: 3 }
  ], { limit: 3 });
  assert.equal(ranked.length, 2, "der schwache dritte Treffer verduennt den Prompt nur");
});

test("source priority is neutral for unknown sources", () => {
  assert.equal(sourcePriority("docs/irgendwas/neu.md"), 1);
  assert.ok(sourcePriority("AI_Guidelines.md") > 1);
  assert.ok(sourcePriority("docs/frontend/START_DESIGN_LOCK.md") > 1);
});

test("knowledge search stays empty when nothing clears the relevance floor", async () => {
  const hits = await searchKnowledge(process.cwd(), "zzzqqq unbekanntes wortgebilde xyzzy", 3);
  assert.deepEqual(hits, []);
});

// ---------------------------------------------------------------------------
// RAG im Eval-Harness (evalRagContext.js)
// ---------------------------------------------------------------------------

test("eval case keeps its own system instruction last so assertions still bind", async () => {
  const { case: augmented, contextChars } = await withRagContext(
    { prompt: "Frage", system: "Antworte nur mit JSON." },
    process.cwd(),
    { buildBlock: async () => "Internes Projektwissen\nBlock" }
  );
  assert.ok(contextChars > 0);
  assert.ok(augmented.system.startsWith("Internes Projektwissen"));
  assert.ok(augmented.system.endsWith("Antworte nur mit JSON."));
  assert.equal(augmented.prompt, "Frage", "der Fall selbst bleibt unveraendert");
});

test("eval case is untouched when retrieval finds nothing", async () => {
  const original = { prompt: "Frage", system: "S" };
  const { case: augmented, contextChars } = await withRagContext(original, process.cwd(), {
    buildBlock: async () => ""
  });
  assert.equal(contextChars, 0);
  assert.deepEqual(augmented, original);
});

test("rag wrapper counts calls with and without context", async () => {
  let gesehen = 0;
  const { callModel, stats } = wrapCallerWithRag(async () => {
    gesehen += 1;
    return { ok: true };
  }, process.cwd(), { buildBlock: async (root, prompt) => (prompt === "mit" ? "Block" : "") });
  await callModel({ prompt: "mit" });
  await callModel({ prompt: "ohne" });
  assert.equal(gesehen, 2);
  assert.equal(stats.aufrufeMitKontext, 1);
  assert.equal(stats.aufrufeOhneKontext, 1);
  assert.equal(stats.zeichenGesamt, 5);
});

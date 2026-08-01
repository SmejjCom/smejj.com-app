#!/usr/bin/env node
// smejj.com — Chat-Bridge zu EINER auslieferbaren Datei buendeln.
//
// Warum es diesen Schritt gibt (Befund 2026-08-01): Der Zeabur-Dienst der Bridge
// bekommt genau eine Datei (/tmp/smejj-chat-bridge.mjs). Solange das so war,
// durfte public/chat-bridge.js keine eigenen Module haben — und stand darum exakt
// auf der harten 800-Zeilen-Grenze aus AI_Guidelines.md Abschnitt 2. Jede weitere
// Zeile Logik war damit blockiert, und zwar durch das Deploy-Verfahren, nicht
// durch die Sache. Dieser Schritt loest genau das: im Repository normale Module,
// beim Ausliefern eine Datei.
//
// Der Buendler ist bewusst winzig und fail-closed. Er versteht nur, was dieses
// Projekt schreibt (benannte Exporte, relative Importe, node:-Builtins) und
// bricht bei allem anderen ab, statt zu raten. Ein Buendler, der raet, liefert
// stillen Unsinn aus — und das faellt erst live auf.
//
// Zusaetzlich haengt er das Wissensartefakt an: die Bridge ist zustandslos und
// hat keine Repo-Dateien, der BM25-Index muss also mitkommen. Er reist gepackt
// (gzip, base64) mit, rund 270 kB statt 1 MB.
//
// Aufruf (schreibt nach tmp/chat-bridge-bundle/ zum Nachsehen):
//   node scripts/deploy/bundle_chat_bridge.mjs
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRagIndexArtifact } from "../rag/export_rag_index_to_idrive.mjs";

export const BRIDGE_ENTRY = "public/chat-bridge.js";
export const BUNDLE_TARGET = "tmp/chat-bridge-bundle/chat-bridge.mjs";

const IMPORT_LINE = /^import\s+(.+?)\s+from\s+["']([^"']+)["'];?\s*$/;

/**
 * Sammelt die auf oberster Ebene deklarierten Namen einer Datei.
 * Nur fuer die Kollisionspruefung — zwei Module duerfen im Buendel nicht
 * denselben Namen belegen, sonst ueberschreibt das spaetere still das fruehere.
 */
export function topLevelNames(source) {
  const names = new Set();
  for (const line of String(source).split("\n")) {
    const match = line.match(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Entfernt `export ` vor Deklarationen; im Buendel ist alles im selben Gueltigkeitsbereich. */
function stripExports(source, modulePath) {
  if (/^export\s+default\b/m.test(source)) {
    throw new Error(`bundle_default_export_unsupported:${modulePath}`);
  }
  if (/^export\s*\{/m.test(source)) {
    // Sammel-Exporte und Re-Exporte sind bewusst nicht unterstuetzt: sie machen
    // die Namensherkunft unsichtbar, was der Kollisionspruefung den Boden entzieht.
    throw new Error(`bundle_export_list_unsupported:${modulePath}`);
  }
  return source.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\s)/gm, "");
}

/**
 * Loest die Importe einer Datei auf.
 * @returns {{builtins: string[], relative: string[], body: string}}
 */
export function splitImports(source, modulePath) {
  const builtins = [];
  const relative = [];
  const body = [];
  for (const line of String(source).split("\n")) {
    if (!/^import\b/.test(line)) {
      body.push(line);
      continue;
    }
    const match = line.match(IMPORT_LINE);
    if (!match) throw new Error(`bundle_import_form_unsupported:${modulePath}:${line.trim().slice(0, 60)}`);
    const [, clause, specifier] = match;
    if (/^\*\s+as\s/.test(clause.trim())) throw new Error(`bundle_namespace_import_unsupported:${modulePath}`);
    if (specifier.startsWith("node:")) {
      builtins.push(line.trim());
      // Platzhalterzeile, damit die Zeilennummern des Rumpfs stabil bleiben.
      body.push("");
      continue;
    }
    if (!specifier.startsWith(".")) throw new Error(`bundle_external_dependency:${modulePath}:${specifier}`);
    relative.push(specifier);
    body.push("");
  }
  return { builtins, relative, body: body.join("\n") };
}

/**
 * Buendelt eine ESM-Einstiegsdatei mit allen relativ importierten Modulen.
 *
 * @param {{projectRoot?: string, entry?: string, readSource?: Function}} options
 * @returns {Promise<{builtins: string[], modules: Array<{path: string, code: string}>}>}
 *          modules in Abhaengigkeitsreihenfolge; das letzte Element ist der Einstieg
 */
export async function bundleModules({
  projectRoot = process.cwd(),
  entry = BRIDGE_ENTRY,
  readSource = (file) => readFile(path.join(projectRoot, file), "utf8")
} = {}) {
  const modules = [];
  const fertig = new Set();
  const inArbeit = new Set();
  const namen = new Map(); // Name -> zuerst deklarierendes Modul
  const builtins = new Map(); // Importzeile -> true (entdoppelt, Reihenfolge stabil)

  const besuche = async (modulePath) => {
    if (fertig.has(modulePath)) return;
    if (inArbeit.has(modulePath)) throw new Error(`bundle_import_cycle:${modulePath}`);
    inArbeit.add(modulePath);
    const source = await readSource(modulePath);
    const { builtins: eigene, relative, body } = splitImports(source, modulePath);
    for (const zeile of eigene) builtins.set(zeile, true);
    for (const specifier of relative) {
      await besuche(path.posix.normalize(path.posix.join(path.posix.dirname(modulePath), specifier)));
    }
    for (const name of topLevelNames(body)) {
      if (namen.has(name)) throw new Error(`bundle_duplicate_symbol:${name}:${namen.get(name)}:${modulePath}`);
      namen.set(name, modulePath);
    }
    inArbeit.delete(modulePath);
    fertig.add(modulePath);
    modules.push({ path: modulePath, code: stripExports(body, modulePath) });
  };

  await besuche(entry);
  if (modules[modules.length - 1]?.path !== entry) throw new Error("bundle_entry_not_last");
  return { builtins: [...builtins.keys()], modules };
}

/**
 * Baut die auslieferbare Datei: Buendel + eingebettetes Wissensartefakt.
 *
 * Das Artefakt wird VOR dem Einstiegsmodul installiert. Der Einstieg startet am
 * Ende den Server — waere die Reihenfolge umgekehrt, koennte die Bridge lauschen,
 * bevor sie Wissen hat.
 *
 * @returns {Promise<{code: string, version: string, bytes: number, chunkCount: number, sha256: string, moduleCount: number}>}
 */
export async function buildChatBridgeArtifact({
  projectRoot = process.cwd(),
  entry = BRIDGE_ENTRY,
  now = new Date(),
  readSource
} = {}) {
  const { builtins, modules } = await bundleModules({ projectRoot, entry, ...(readSource ? { readSource } : {}) });
  const quelle = await (readSource ? readSource(entry) : readFile(path.join(projectRoot, entry), "utf8"));
  const version = quelle.match(/const BRIDGE_VERSION = "([^"]+)"/)?.[1];
  if (!version) throw new Error("bundle_version_missing");

  const artefakt = await buildRagIndexArtifact(projectRoot, now);
  const payload = gzipSync(Buffer.from(artefakt.body, "utf8")).toString("base64");

  const kopf = [
    "// ERZEUGTE DATEI — nicht von Hand bearbeiten.",
    `// Gebuendelt aus ${modules.map((modul) => modul.path).join(", ")}`,
    `// Wissensartefakt: ${artefakt.chunkCount} Abschnitte, sha256 ${artefakt.sha256}`,
    "// Quelle und Buendler: scripts/deploy/bundle_chat_bridge.mjs",
    ""
  ].join("\n");

  const koerper = modules.map((modul) => `// --- ${modul.path} ---\n${modul.code}`);
  const install = [
    "// --- Wissensartefakt (gzip, base64) ---",
    `const RAG_INDEX_PAYLOAD = ${JSON.stringify(payload)};`,
    "const ragInstallResult = installRagIndex(RAG_INDEX_PAYLOAD);",
    "console.log(`smejj.com chat-bridge: Projektwissen ${ragInstallResult.ok ? `bereit (${ragInstallResult.chunkCount} Abschnitte)` : `AUS (${ragInstallResult.error})`}`);"
  ].join("\n");

  const code = `${kopf}${builtins.join("\n")}\n\n${koerper.slice(0, -1).join("\n\n")}\n\n${install}\n\n${koerper[koerper.length - 1]}\n`;
  return {
    code,
    version,
    bytes: Buffer.byteLength(code, "utf8"),
    chunkCount: artefakt.chunkCount,
    sha256: artefakt.sha256,
    moduleCount: modules.length
  };
}

const direkt = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (direkt) {
  const ergebnis = await buildChatBridgeArtifact();
  const ziel = path.resolve(process.cwd(), BUNDLE_TARGET);
  await mkdir(path.dirname(ziel), { recursive: true });
  await writeFile(ziel, ergebnis.code);
  console.log(JSON.stringify({
    ok: true,
    version: ergebnis.version,
    module: ergebnis.moduleCount,
    bytes: ergebnis.bytes,
    wissensabschnitte: ergebnis.chunkCount,
    sha256: ergebnis.sha256,
    datei: ziel
  }, null, 2));
}

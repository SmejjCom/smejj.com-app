// smejj.com — Knowledge-Graph & RAG-Fusion Autopilot
// Erstellt einen hochpraezisen semantischen Wissensgraphen aus Quellcode-Dateien,
// erfasst Funktions- und Modul-Abhaengigkeiten und ermoeglicht Hybrid-Suchen.

/**
 * Extrahiert Symbole, Importe und Definitionen aus JavaScript/TypeScript Quellcode.
 * @param {string} filePath
 * @param {string} codeContent
 * @returns {object}
 */
export function extractCodeEntities(filePath, codeContent = "") {
  const entities = {
    filePath,
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    dependencies: []
  };

  const lines = codeContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Funktionsdefinitionen (function foo(), const foo = () =>, etc.)
    const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
    if (fnMatch) {
      entities.functions.push({ name: fnMatch[1], line: i + 1, exported: line.includes("export") });
    } else {
      const arrowMatch = line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
      if (arrowMatch) {
        entities.functions.push({ name: arrowMatch[1], line: i + 1, exported: line.includes("export") });
      }
    }

    // Klassen
    const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
    if (classMatch) {
      entities.classes.push({ name: classMatch[1], line: i + 1, exported: line.includes("export") });
    }

    // Importe
    const importMatch = line.match(/import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s+from\s+["']([^"']+)["']/);
    if (importMatch) {
      const source = importMatch[3];
      const symbols = (importMatch[1] || importMatch[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
      entities.imports.push({ source, symbols, line: i + 1 });
      if (!entities.dependencies.includes(source)) entities.dependencies.push(source);
    }

    // Exporte
    const exportMatch = line.match(/export\s+(?:const|let|var|default)\s+([a-zA-Z0-9_$]+)/);
    if (exportMatch) {
      entities.exports.push({ name: exportMatch[1], line: i + 1 });
    }
  }

  return entities;
}

/**
 * Erstellt einen vollstaendigen Wissensgraphen ueber eine Liste von Dateien.
 * @param {Array<{path: string, content: string}>} files
 * @returns {object} { nodes, edges, lookupIndex }
 */
export function buildKnowledgeGraph(files = []) {
  const nodes = new Map();
  const edges = [];
  const symbolIndex = new Map();

  for (const file of files) {
    const parsed = extractCodeEntities(file.path, file.content);
    nodes.set(file.path, parsed);

    for (const fn of parsed.functions) {
      symbolIndex.set(fn.name, { type: "function", path: file.path, line: fn.line });
    }
    for (const cls of parsed.classes) {
      symbolIndex.set(cls.name, { type: "class", path: file.path, line: cls.line });
    }

    for (const dep of parsed.dependencies) {
      edges.push({ from: file.path, to: dep, type: "imports" });
    }
  }

  return {
    totalFiles: nodes.size,
    totalSymbols: symbolIndex.size,
    totalEdges: edges.length,
    findSymbol: (name) => symbolIndex.get(name) || null,
    getFileEntities: (path) => nodes.get(path) || null,
    search: (query) => {
      const q = String(query || "").toLowerCase();
      const results = [];
      for (const [sym, info] of symbolIndex.entries()) {
        if (sym.toLowerCase().includes(q)) {
          results.push({ symbol: sym, ...info });
        }
      }
      return results;
    }
  };
}

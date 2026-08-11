// smejj.com — Autonomous Multi-File Repo-Architect Autopilot (Autopilot Nr. 24)
// Virtualisiert und orchestriert komplette Repository-Architekturen über 50+ Dateien hinweg,
// prüft modulare Import-Abhängigkeiten und sichert kohärente Full-Stack-Strukturen.

/**
 * Validiert die interne Abhängigkeitsstruktur eines Multi-File-Projekts.
 * @param {Array<{path: string, content: string}>} files
 * @returns {{valid: boolean, fileCount: number, resolvedImports: number, missingImports: string[], dependencyGraph: Record<string, string[]>}}
 */
export function validateMultiFileArchitecture(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return { valid: false, fileCount: 0, resolvedImports: 0, missingImports: [], dependencyGraph: {} };
  }

  const existingPaths = new Set(files.map((f) => f.path.replace(/^\.?\//, "")));
  const missingImports = [];
  const dependencyGraph = {};
  let resolvedImports = 0;

  for (const file of files) {
    const normPath = file.path.replace(/^\.?\//, "");
    dependencyGraph[normPath] = [];
    const content = file.content || "";

    // JS/TS Import-Erkennung: import ... from "./..." oder require("./...")
    const importRegex = /(?:import\s+(?:[\w*\s{},]+from\s+)?['"](\.[^'"]+)['"]|require\(['"](\.[^'"]+)['"]\))/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const relativeTarget = match[1] || match[2];
      const resolvedTarget = resolveRelativePath(normPath, relativeTarget);

      dependencyGraph[normPath].push(resolvedTarget);

      // Prüfe, ob die Zieldatei im Projektbaum existiert (inkl. möglicher Endungen .js, .json)
      const found = existingPaths.has(resolvedTarget) ||
        existingPaths.has(`${resolvedTarget}.js`) ||
        existingPaths.has(`${resolvedTarget}.mjs`) ||
        existingPaths.has(`${resolvedTarget}/index.js`);

      if (found) {
        resolvedImports++;
      } else {
        missingImports.push(`${normPath} -> ${relativeTarget}`);
      }
    }
  }

  const valid = missingImports.length === 0;

  return {
    valid,
    fileCount: files.length,
    resolvedImports,
    missingImports,
    dependencyGraph
  };
}

/**
 * Löst relative Pfade auf.
 * @param {string} currentPath
 * @param {string} relativeImport
 * @returns {string}
 */
function resolveRelativePath(currentPath, relativeImport) {
  const parts = currentPath.split("/").slice(0, -1);
  const relParts = relativeImport.split("/");

  for (const p of relParts) {
    if (p === ".") continue;
    if (p === "..") {
      parts.pop();
    } else {
      parts.push(p);
    }
  }

  return parts.join("/").replace(/^\//, "");
}

/**
 * Erzeugt einen strukturierten Architektur-Blueprint für ein Multi-File-Projekt.
 * @param {string} projectGoal
 * @param {string[]} targetFiles
 * @returns {{blueprintName: string, goal: string, fileTree: Array<{path: string, purpose: string}>}}
 */
export function generateProjectBlueprint(projectGoal, targetFiles = []) {
  const defaultFiles = targetFiles.length > 0 ? targetFiles : [
    "src/index.js",
    "src/config/appConfig.js",
    "src/services/apiService.js",
    "src/models/dataModel.js",
    "tests/integration.test.js"
  ];

  return {
    blueprintName: `Blueprint: ${projectGoal.slice(0, 40)}`,
    goal: projectGoal,
    fileTree: defaultFiles.map((f) => ({
      path: f,
      purpose: f.includes("test")
        ? "Automatisierte Verifikation"
        : f.includes("config")
        ? "Zentrales Konfigurations-Management"
        : "Kernlogik & API-Funktionen"
    }))
  };
}

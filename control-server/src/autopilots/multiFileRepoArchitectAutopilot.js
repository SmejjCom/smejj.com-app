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
 * Quelltext ohne Kommentare und ohne den INHALT von Vorlagen-Strings.
 *
 * Master-Audit 15.09.: die Regex-Suche oben meldete Importe, die gar keine sind —
 * ein Kommentar ("./...") und der Test-Quelltext, den src/jobs/freeAppExecutor.js
 * als Vorlage fuer ein erzeugtes Projekt mitfuehrt. Ein Pruefer, der dauernd
 * Fehlalarm gibt, wird abgeschaltet; darum ein kleiner Zustandsautomat statt
 * Regex. Regulaere Ausdruecke im Code werden grob erkannt (nach ( , = : [ ! & | ? ; {).
 */
export function codeOhneKommentareUndVorlagen(quelltext = "") {
  const q = String(quelltext);
  let aus = "";
  const vorlagenTiefe = []; // je offener Vorlage: Klammertiefe ihres ${…}
  let klammern = 0;
  let modus = "code";
  let letztesZeichen = "";
  for (let i = 0; i < q.length; i++) {
    const z = q[i];
    const n = q[i + 1];
    if (modus === "zeile") { if (z === "\n") { modus = "code"; aus += z; } continue; }
    if (modus === "block") { if (z === "*" && n === "/") { modus = "code"; i++; } continue; }
    if (modus === "'" || modus === '"') {
      aus += z;
      if (z === "\\") { aus += n || ""; i++; } else if (z === modus || z === "\n") modus = "code";
      continue;
    }
    if (modus === "regex") {
      if (z === "\\") { i++; continue; }
      if (z === "[") modus = "klasse"; else if (z === "/" || z === "\n") modus = "code";
      continue;
    }
    if (modus === "klasse") { if (z === "\\") i++; else if (z === "]") modus = "regex"; continue; }
    if (modus === "vorlage") {
      if (z === "\\") { i++; continue; }
      if (z === "`") { modus = "code"; aus += "``"; continue; }
      if (z === "$" && n === "{") { vorlagenTiefe.push(klammern); klammern++; modus = "code"; i++; }
      continue;
    }
    // modus === "code"
    if (z === "/" && n === "/") { modus = "zeile"; i++; continue; }
    if (z === "/" && n === "*") { modus = "block"; i++; continue; }
    if (z === "/" && (/[(,=:[!&|?;{}]|^$/.test(letztesZeichen) || /\b(?:return|typeof|case|yield|await|else|void|throw|in|of)\s*$/.test(aus))) { modus = "regex"; continue; }
    if (z === "'" || z === '"') { modus = z; aus += z; letztesZeichen = z; continue; }
    if (z === "`") { modus = "vorlage"; continue; }
    if (z === "{") klammern++;
    if (z === "}") {
      klammern--;
      if (vorlagenTiefe.length && klammern === vorlagenTiefe[vorlagenTiefe.length - 1]) { vorlagenTiefe.pop(); modus = "vorlage"; continue; }
    }
    aus += z;
    if (!/\s/.test(z)) letztesZeichen = z;
  }
  return aus;
}

const IMPORT_MUSTER = /(?:^|[;\s}])(?:import|export)\s+(?:[\w*\s{},$]+\s+from\s+)?["'](\.{1,2}\/[^"']+)["']|\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

/** Starke Zusammenhangskomponenten (Tarjan) mit mehr als einer Datei = Import-Zyklen. */
export function findeImportZyklen(graph = {}) {
  const index = new Map();
  const tief = new Map();
  const stapel = [];
  const aufStapel = new Set();
  const zyklen = [];
  let zaehler = 0;
  const besuche = (v) => {
    index.set(v, zaehler); tief.set(v, zaehler); zaehler++;
    stapel.push(v); aufStapel.add(v);
    for (const w of graph[v] || []) {
      if (!Object.hasOwn(graph, w)) continue;
      if (!index.has(w)) { besuche(w); tief.set(v, Math.min(tief.get(v), tief.get(w))); }
      else if (aufStapel.has(w)) tief.set(v, Math.min(tief.get(v), index.get(w)));
    }
    if (tief.get(v) !== index.get(v)) return;
    const komponente = [];
    let w;
    do { w = stapel.pop(); aufStapel.delete(w); komponente.push(w); } while (w !== v);
    if (komponente.length > 1) zyklen.push(komponente.sort());
  };
  for (const v of Object.keys(graph)) if (!index.has(v)) besuche(v);
  return zyklen;
}

/**
 * Prueft die relativen Importe ECHTER Dateien gegen das Dateisystem — anders als
 * validateMultiFileArchitecture, das nur innerhalb der uebergebenen Liste sucht und
 * dadurch jeden Import nach workers/, gatekeeper/ oder public/ als fehlend meldete.
 * Ein fehlender Importpfad ist im Abbild ein Absturz beim Laden des Moduls
 * (die Lehre der fehlenden COPY-Zeile, 502 am con-Autopiloten).
 *
 * @param {Array<{path: string, content: string}>} dateien Pfade relativ zur Wurzel
 * @param {{existiert: (pfad: string) => boolean}} optionen
 * @returns {{dateien: number, importe: number, fehlend: string[], zyklen: string[][]}}
 */
export function pruefeRepoImporte(dateien = [], { existiert } = {}) {
  const graph = {};
  const fehlend = [];
  let importe = 0;
  for (const datei of Array.isArray(dateien) ? dateien : []) {
    const von = String(datei?.path || "").replace(/^\.?\//, "");
    if (!von) continue;
    graph[von] = [];
    const code = codeOhneKommentareUndVorlagen(datei.content || "");
    for (const treffer of code.matchAll(IMPORT_MUSTER)) {
      const ziel = resolveRelativePath(von, treffer[1] || treffer[2]);
      importe++;
      if (existiert(ziel)) graph[von].push(ziel);
      else fehlend.push(`${von} -> ${treffer[1] || treffer[2]}`);
    }
  }
  return { dateien: Object.keys(graph).length, importe, fehlend: [...new Set(fehlend)], zyklen: findeImportZyklen(graph) };
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

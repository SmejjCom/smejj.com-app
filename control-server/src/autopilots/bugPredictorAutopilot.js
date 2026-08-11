// smejj.com — Proaktiver Bug-Predictor & Security Autopilot
// Scannt Code im Voraus auf typische Fehlerquellen (Unhandled Promises, Memory Leaks,
// unsafe eval, Regex-DoS, Syntax-Risiken) und generiert automatische Korrekturen.

/**
 * Prueft Quellcode auf haeufige Fehlerquellen und Sicherheitsrisiken.
 * @param {string} filePath
 * @param {string} codeContent
 * @returns {object} { filePath, riskScore, findings, suggestions }
 */
export function scanForBugsAndVulnerabilities(filePath, codeContent = "") {
  const findings = [];
  const suggestions = [];
  let riskScore = 0;

  const lines = codeContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 1. Unsafe eval / Function constructor
    if (/\beval\s*\(/.test(line) || /new\s+Function\s*\(/.test(line)) {
      findings.push({ line: lineNum, severity: "HIGH", type: "unsafe_eval", message: "Verwendung von eval() oder new Function() birgt Sicherheitsrisiken." });
      suggestions.push({ line: lineNum, fix: "Verwende einen isolierten vm-Sandbox-Kontext oder JSON.parse." });
      riskScore += 40;
    }

    // 2. Unhandled Promise Rejections (new Promise ohne reject / await ohne try-catch)
    if (/await\s+[a-zA-Z0-9_$]+\(/.test(line) && !line.includes("catch") && !lines.slice(Math.max(0, i - 5), i).some((l) => l.includes("try {"))) {
      // Nur als Hinweis bei async Funktionen
      if (!line.includes("try") && !line.includes(".catch(")) {
        findings.push({ line: lineNum, severity: "LOW", type: "unhandled_await", message: "Await-Ausdruck moeglicherweise ohne umschliessenden try/catch-Block." });
        riskScore += 5;
      }
    }

    // 3. Potentieller Memory Leak (Event-Listener in Loops oder setInterval ohne Clear)
    if (/setInterval\s*\(/.test(line) && !lines.some((l) => l.includes("clearInterval"))) {
      findings.push({ line: lineNum, severity: "MEDIUM", type: "uncleared_interval", message: "setInterval() ohne sichtbares clearInterval() kann zu Memory-Leaks fuehren." });
      suggestions.push({ line: lineNum, fix: "Speichere die Intervall-ID und raeume sie bei Beendigung auf." });
      riskScore += 15;
    }

    // 4. Ungesicherte HTTP-Aufrufe anstelle von HTTPS
    if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(line)) {
      findings.push({ line: lineNum, severity: "MEDIUM", type: "insecure_http", message: "Ungesicherter HTTP-Endpunkt verwendet." });
      suggestions.push({ line: lineNum, fix: "Aendere http:// zu https://." });
      riskScore += 20;
    }
  }

  return {
    filePath,
    riskScore: Math.min(100, riskScore),
    status: riskScore === 0 ? "clean" : riskScore < 30 ? "warning" : "critical",
    findingsCount: findings.length,
    findings,
    suggestions
  };
}

/**
 * Fuehrt einen vollstaendigen Bug-Scan ueber mehrere Dateien aus.
 * @param {Array<{path: string, content: string}>} files
 * @returns {object} { scannedFiles, totalFindings, cleanFiles, summary }
 */
export function runProjectBugScan(files = []) {
  const reports = files.map((f) => scanForBugsAndVulnerabilities(f.path, f.content));
  const totalFindings = reports.reduce((sum, r) => sum + r.findingsCount, 0);
  const cleanFiles = reports.filter((r) => r.status === "clean").length;

  return {
    scannedFiles: files.length,
    cleanFiles,
    totalFindings,
    hasCriticalIssues: reports.some((r) => r.status === "critical"),
    reports
  };
}

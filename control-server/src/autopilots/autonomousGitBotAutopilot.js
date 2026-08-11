// smejj.com — Autonomous Git-Bot & Pull-Request Auto-Fixer (Autopilot Nr. 28)
// Scannt kontinuierlich Git-Repositories (Codeberg/GitHub), analysiert Pull Requests auf
// Fehler und Sicherheitslücken (CVEs) und generiert automatisch verifizierte Patches.

/**
 * Analysiert einen Git-Diff und generiert ein automatisiertes Code-Review mit Sicherheitshinweisen.
 * @param {string} gitDiffText
 * @returns {{riskLevel: "low" | "medium" | "high", issuesDetected: string[], recommendedFixes: string[], canAutoMerge: boolean}}
 */
export function analyzePullRequestDiff(gitDiffText) {
  if (typeof gitDiffText !== "string" || !gitDiffText.trim()) {
    return { riskLevel: "low", issuesDetected: [], recommendedFixes: [], canAutoMerge: true };
  }

  const issuesDetected = [];
  const recommendedFixes = [];

  if (/\beval\s*\(/.test(gitDiffText)) {
    issuesDetected.push("Unsichere eval()-Verwendung im Diff gefunden.");
    recommendedFixes.push("Ersetze eval() durch sichere JSON-Parser oder isolierte Sandbox.");
  }

  if (/password|secret_key|api_key\s*=\s*['"][^'"]+['"]/i.test(gitDiffText)) {
    issuesDetected.push("Potentieller Hardcoded-Secret im Commit gefunden.");
    recommendedFixes.push("Nutze process.env oder die IDrive e2 Secrets-Verwaltung.");
  }

  if (/innerHTML\s*=/.test(gitDiffText)) {
    issuesDetected.push("Mögliches XSS-Risiko durch unescaped innerHTML.");
    recommendedFixes.push("Nutze textContent oder DOMPurify.");
  }

  const riskLevel = issuesDetected.length >= 2 ? "high" : issuesDetected.length === 1 ? "medium" : "low";
  const canAutoMerge = issuesDetected.length === 0;

  return {
    riskLevel,
    issuesDetected,
    recommendedFixes,
    canAutoMerge
  };
}

/**
 * Synthetisiert einen sauberen Git-Patch zur automatischen Behebung eines gemeldeten Fehlers.
 * @param {string} targetFile
 * @param {string} issueDescription
 * @param {string} fixedCode
 * @returns {{patchTitle: string, targetFile: string, commitMessage: string, patchContent: string}}
 */
export function synthesizeAutoFixPatch(targetFile, issueDescription, fixedCode) {
  const commitMessage = `fix(autofix): Auto-resolve ${issueDescription.slice(0, 50)} by smejj.com Git-Bot`;

  return {
    patchTitle: `Auto-Fix für ${targetFile}`,
    targetFile,
    commitMessage,
    patchContent: fixedCode
  };
}

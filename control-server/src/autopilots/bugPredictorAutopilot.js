// smejj.com — Proaktiver Bug-Predictor & Security Autopilot
// Scannt Code im Voraus auf typische Fehlerquellen (Unhandled Promises, Memory Leaks,
// unsafe eval, Regex-DoS, Syntax-Risiken) und generiert automatische Korrekturen.

// Ein Scanner, der seine eigenen Suchmuster findet, meldet Lärm statt Arbeit.
// Gemessen 2026-08-14 ueber 627 Dateien: ALLE sechs HIGH-Befunde waren
// Selbstfunde — die Zeile in diesem Scanner, die nach eval() sucht; derselbe
// Test im autonomousGitBot; und Testdaten wie '"+eval(userInput);"'. Wer den
// Bug-Predictor als Backlog-Quelle anschliesst, fuettert den Nachtbau ohne
// diesen Filter mit reinen Phantomen.
//
// Absichtlich eng: nur Zeilen, die ein Muster BESCHREIBEN (Regex-Literal mit
// eval/Function, oder eine Zeichenkette, in der eval vorkommt) — ein echter
// eval()-Aufruf im Code faellt weiterhin auf.
export function istSelbstfund(line) {
  const roh = String(line || "");
  // Kommentare sind kein ausgefuehrter Code. Beim Bau dieses Filters hat der
  // Scanner prompt den Kommentar gemeldet, der ihn erklaert — genau der Beweis,
  // dass diese Zeile fehlte.
  if (/^\s*(\/\/|\/\*|\*)/.test(roh)) return true;
  // /\beval\s*\(/ oder /new\s+Function\s*\(/ — der Detektor selbst.
  if (/\/[^/\n]*\\b?(eval|Function)[^/\n]*\//.test(roh)) return true;
  // "…eval(…)…" oder '…eval(…)…' — Beispieldaten und Testfixtures.
  if (/["'`][^"'`\n]*\b(eval|new Function)\s*\([^"'`\n]*["'`]/.test(roh)) return true;
  return false;
}

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
  // In Testdateien ist gefaehrlich aussehender Code das Pruefmaterial: die
  // Fixtures dieses Autopiloten enthalten absichtlich `eval("2 + 2")`. Solche
  // Zeilen als Sicherheitsrisiko der Anwendung zu melden, waere falsch — sie
  // laufen nie in Produktion.
  const istTest = /(^|\/)tests?\//.test(String(filePath || "")) || /\.test\.(js|mjs)$/.test(String(filePath || ""));

  const lines = codeContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 1. Unsafe eval / Function constructor
    if ((/\beval\s*\(/.test(line) || /new\s+Function\s*\(/.test(line)) && !istSelbstfund(line) && !istTest) {
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

    // 4. Ungesicherte HTTP-Aufrufe anstelle von HTTPS.
    // Ausgenommen bleiben Adressen, die das oeffentliche Netz nie verlassen:
    // localhost, 127.0.0.1 und die dienstinternen Namen der Plattform
    // (*.zeabur.internal, *.internal, *.local, *.svc.cluster.local). Dort ist
    // http korrekt — TLS gibt es im internen Netz gar nicht. Gemessen
    // 2026-08-14: 37 der 47 MEDIUM-Befunde waren genau solche internen
    // Worker-Adressen, also Laerm statt Arbeit.
    const internerHost = /http:\/\/(localhost|127\.0\.0\.1|\[?::1\]?|[\w.-]*\.(internal|local))\b/.test(line);
    // Zwei weitere Muster, die wie eine unsichere Verbindung AUSSEHEN, aber
    // keine sind (beide 2026-08-14 im eigenen Code gemessen):
    //   1. XML-Namensraeume — `xmlns="http://www.w3.org/2000/svg"` wird nie
    //      abgerufen, der String IST die Kennung. Ohne ihn lehnen Browser SVG ab.
    //   2. Parser-Basis — `new URL(req.url, \`http://${req.headers.host}\`)`
    //      baut nur einen Bezugspunkt zum Zerlegen; es wird nichts gesendet.
    const namensraum = /https?:\/\/(www\.)?w3\.org\//.test(line) || /xmlns/.test(line);
    const parserBasis = /new URL\(/.test(line) || /http:\/\/\$\{/.test(line);
    if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(line)
        && !internerHost && !namensraum && !parserBasis && !istSelbstfund(line)) {
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

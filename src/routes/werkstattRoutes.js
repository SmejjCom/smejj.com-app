// smejj.com — Werkstatt-Routen: Lesen, Schreiben, Terminal, Git.
//
// Herausgeloest aus src/server.js am 2026-08-08, weil die Datei mit 809 Zeilen
// die 800-Zeilen-Regel aus AI_Guidelines.md riss. Der Inhalt ist unveraendert
// uebernommen — es ist ein Umzug, keine Umschreibung.
//
// Warum ausgerechnet diese fuenf Routen: sie sind die einzige Gruppe im Server,
// die auf das DATEISYSTEM und auf Unterprozesse zugreift. Damit haengen auch
// die drei Schutzhelfer zusammen (Pfad-Sandbox, Groessengrenze, Zeitgrenze) —
// und ein Schutz gehoert in dieselbe Datei wie das, was er schuetzt.
//
// `safeResolve` und `readLimited` gehen mit nach draussen: der Agent-Weg in
// server.js liest damit ebenfalls Dateien und muss durch DIESELBE Sandbox.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { json, readJson } from "../../control-server/src/http/respond.js";
import { resolveTerminalCommand } from "../shared/terminalPolicy.js";

/**
 * @param {object} optionen
 * @param {string} optionen.projectRoot  Wurzel der Sandbox — nichts darueber hinaus.
 * @param {Set<string>} optionen.forbiddenSegments  Pfadteile, die nie vorkommen duerfen.
 */
export function createWerkstatt({ projectRoot, forbiddenSegments }) {
  /**
   * Loest einen Pfad INNERHALB der Projektwurzel auf. Zwei Sperren, nicht eine:
   * verbotene Pfadteile (.env, .git, node_modules …) und der Ausbruchsschutz.
   * Die zweite allein reichte nicht — `.env` liegt in der Wurzel.
   */
  function safeResolve(inputPath) {
    const rel = String(inputPath || "").replace(/^\/+/, "");
    const parts = rel.split(/[\\/]+/).filter(Boolean);
    if (parts.some((part) => forbiddenSegments.has(part))) throw new Error("Path is not allowed");
    const resolved = path.resolve(projectRoot, rel);
    if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
      throw new Error("Path escapes project sandbox");
    }
    return resolved;
  }

  async function readLimited(file, limit) {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Path is not a file");
    if (info.size > limit) throw new Error(`File too large. Limit: ${limit} bytes`);
    return readFile(file, "utf8");
  }

  /** Unterprozess mit Zeitgrenze; Ausgabe wird hinten abgeschnitten, nicht vorn. */
  function run(bin, args, cwd, timeoutMs) {
    return new Promise((resolve) => {
      const child = spawn(bin, args, { cwd, shell: false });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.stdout.on("data", (data) => { stdout += data.toString(); });
      child.stderr.on("data", (data) => { stderr += data.toString(); });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: 127, stdout: "", stderr: error.message || "Command failed to start" });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout: stdout.slice(-20_000), stderr: stderr.slice(-20_000) });
      });
    });
  }

  async function handleRead(req, res) {
    const body = await readJson(req);
    const safePath = safeResolve(body.path);
    const content = await readLimited(safePath, 250_000);
    json(res, 200, { path: path.relative(projectRoot, safePath), content });
  }

  async function handleWrite(req, res) {
    const body = await readJson(req);
    const safePath = safeResolve(body.path);
    const content = String(body.content || "");
    if (content.length > 500_000) return json(res, 413, { error: "File too large" });
    if (body.apply !== true) {
      return json(res, 200, {
        approved: false,
        message: "Preview only. Send apply:true after user review to write.",
        path: path.relative(projectRoot, safePath),
        proposedContent: content
      });
    }
    await mkdir(path.dirname(safePath), { recursive: true });
    await writeFile(safePath, content, "utf8");
    json(res, 200, { approved: true, path: path.relative(projectRoot, safePath) });
  }

  async function handleTerminal(req, res) {
    const body = await readJson(req);
    const command = String(body.command || "").trim();
    const resolved = resolveTerminalCommand(command);
    if (!resolved.ok) return json(res, 403, { error: "Command not allowed", reason: resolved.reason });
    const result = await run(resolved.bin, resolved.args, projectRoot, 30_000);
    json(res, 200, result);
  }

  async function handleGitStatus(res) {
    const result = await run("git", ["status", "--short"], projectRoot, 10_000);
    json(res, 200, result);
  }

  async function handleGitCommit(req, res) {
    const body = await readJson(req);
    const message = String(body.message || "").trim();
    if (!message) return json(res, 400, { error: "Missing commit message" });
    const result = await run("git", ["commit", "-am", message], projectRoot, 30_000);
    json(res, 200, result);
  }

  return { handleRead, handleWrite, handleTerminal, handleGitStatus, handleGitCommit, safeResolve, readLimited };
}

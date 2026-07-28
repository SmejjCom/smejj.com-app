#!/usr/bin/env node
// smejj.com — Wartezeit bis zum ersten sichtbaren Zeichen messen und zerlegen.
//
// Beantwortet die Frage, die der Modell-Eval offen gelassen hat: Wo genau vergehen
// die Sekunden auf dem GLM-Pfad — im Netz, im Modell oder in unserer eigenen
// Verarbeitung?
//
// Beispiele:
//   node scripts/testing/measure_first_token.mjs
//   node scripts/testing/measure_first_token.mjs --model glm-5-2 --runs 5
//   node scripts/testing/measure_first_token.mjs --endpoint control --model glm-5-2
//
// Nur lesende Messung: es wird nichts geschrieben ausser dem Bericht unter
// docs/benchmarks/, und der enthaelt keine Modellantworten im Klartext.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeFirstToken, summarizeProbes } from "../../src/evaluation/firstTokenProbe.js";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), "../..");
const REPORT_DIR = "docs/benchmarks";

/** Benannte Endpunkte — dieselben, die die Anwendung wirklich benutzt. */
export const ENDPOINTS = Object.freeze({
  bridge: "https://smejj-chat-bridge.zeabur.app/api/chat",
  control: "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/chat",
  // /api/agent schaltet das unsichtbare Reasoning fuer Nicht-Coding-Aufgaben ab.
  // Der Vergleich control gegen control-agent misst genau diesen einen Unterschied.
  "control-agent": "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud/api/agent",
  "bridge-agent": "https://smejj-chat-bridge.zeabur.app/api/agent"
});

/** Endpunkte, die statt `messages` ein `task`-Feld erwarten. */
export const AGENT_ENDPOINTS = Object.freeze(["control-agent", "bridge-agent"]);

/** Kurze Sachfrage ohne Werkzeugbedarf — misst die Startzeit, nicht die Denkleistung. */
const DEFAULT_PROMPT = "Nenne in einem Satz, wofuer der zentrale Objektspeicher von smejj.com zustaendig ist.";
const DEFAULT_SYSTEM = "Du bist der Assistent von smejj.com. Antworte auf Deutsch, kurz und praezise.";

export function parseArguments(argv) {
  const options = {
    endpoint: "bridge",
    model: "",
    runs: 3,
    delayMs: 6000,
    prompt: DEFAULT_PROMPT,
    bodyMode: "",
    out: "",
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[index + 1];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--endpoint") { options.endpoint = String(next() || ""); index += 1; }
    else if (token === "--model") { options.model = String(next() || ""); index += 1; }
    else if (token === "--runs") { options.runs = Number.parseInt(next(), 10); index += 1; }
    else if (token === "--delay-ms") { options.delayMs = Number.parseInt(next(), 10); index += 1; }
    else if (token === "--prompt") { options.prompt = String(next() || ""); index += 1; }
    else if (token === "--body-mode") { options.bodyMode = String(next() || ""); index += 1; }
    else if (token === "--out") { options.out = String(next() || ""); index += 1; }
    else return { error: `unknown_argument:${token}` };
  }
  if (!ENDPOINTS[options.endpoint] && !/^https:\/\//.test(options.endpoint)) {
    return { error: `unknown_endpoint:${options.endpoint}` };
  }
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 20) return { error: "invalid_runs" };
  if (!Number.isInteger(options.delayMs) || options.delayMs < 0) return { error: "invalid_delay" };
  if (options.bodyMode && !["chat", "agent"].includes(options.bodyMode)) {
    return { error: `unknown_body_mode:${options.bodyMode}` };
  }
  if (!options.bodyMode) options.bodyMode = AGENT_ENDPOINTS.includes(options.endpoint) ? "agent" : "chat";
  return { options };
}

/** Fuehrt die Messreihe aus. Der Aufruf ist injizierbar, damit ohne Netz pruefbar. */
export async function runProbeSeries({
  endpoint,
  model,
  prompt,
  runs,
  bodyMode = "chat",
  delayMs = 0,
  probe = probeFirstToken,
  onProbe = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  const messages = [
    { role: "system", content: DEFAULT_SYSTEM },
    { role: "user", content: prompt }
  ];
  const probes = [];
  for (let index = 0; index < runs; index += 1) {
    const result = await probe({ endpoint, messages, model, bodyMode });
    probes.push(result);
    onProbe(result, index);
    if (delayMs > 0 && index < runs - 1) await sleep(delayMs);
  }
  return probes;
}

function usage() {
  return [
    "smejj.com — Messung der Zeit bis zum ersten sichtbaren Zeichen",
    "",
    "  --endpoint <name|url>  bridge (Standard), control oder eine https-Adresse",
    "  --model <id>           z. B. glm-5-2; ohne Angabe antwortet die schnelle Spur",
    "  --runs <n>             Anzahl Messungen (Standard 3, hoechstens 20)",
    "  --delay-ms <n>         Pause zwischen den Messungen (Standard 6000)",
    "  --prompt <text>        eigene Frage",
    "  --body-mode <art>      chat oder agent; ohne Angabe passend zum Endpunkt",
    "  --out <pfad>           Zielpfad des Berichts",
    ""
  ].join("\n");
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`Abbruch: ${parsed.error}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  const options = parsed.options;
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const endpoint = ENDPOINTS[options.endpoint] || options.endpoint;
  const label = options.model || "schnelle-spur";
  process.stdout.write(`Messreihe: ${options.runs} Aufrufe gegen ${options.endpoint}, Modell ${label}\n`);

  const startedAt = new Date().toISOString();
  const probes = await runProbeSeries({
    endpoint,
    model: options.model,
    prompt: options.prompt,
    runs: options.runs,
    bodyMode: options.bodyMode,
    delayMs: options.delayMs,
    onProbe: (result, index) => {
      process.stdout.write(`  ${index + 1}. ` + (result.ok
        ? `Kopf ${result.ttfbMs} ms | erstes Ereignis ${result.firstFrameMs} ms | erstes Zeichen ${result.firstVisibleMs} ms | Ende ${result.totalMs} ms | ${result.frames} Ereignisse | ${result.backend}\n`
        : `Fehler ${result.error} nach ${result.totalMs} ms\n`));
    }
  });
  const finishedAt = new Date().toISOString();
  const summary = summarizeProbes(probes);

  const report = {
    schemaVersion: 1,
    kind: "smejj.com-first-token-probe",
    endpointName: options.endpoint,
    bodyMode: options.bodyMode,
    model: options.model || null,
    prompt: options.prompt,
    startedAt,
    finishedAt,
    backends: [...new Set(probes.filter((probe) => probe.ok).map((probe) => probe.backend))].sort(),
    summary,
    probes: probes.map((probe) => ({
      ok: probe.ok,
      ttfbMs: probe.ttfbMs,
      firstFrameMs: probe.firstFrameMs,
      firstVisibleMs: probe.firstVisibleMs,
      totalMs: probe.totalMs,
      frames: probe.frames,
      chars: probe.chars,
      backend: probe.backend,
      error: probe.error
    }))
  };

  const reportDirAbs = path.resolve(REPO_ROOT, REPORT_DIR);
  await mkdir(reportDirAbs, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const outRelative = options.out
    || path.join(REPORT_DIR, `firsttoken-${options.endpoint}-${safeLabel}-${finishedAt.slice(0, 10)}.json`);
  await writeFile(path.resolve(REPO_ROOT, outRelative), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write([
    "",
    `Antwortkopf (Median):        ${summary.ttfbMsMedian} ms`,
    `Erstes Ereignis (Median):    ${summary.firstFrameMsMedian} ms`,
    `Erstes Zeichen (Median):     ${summary.firstVisibleMsMedian} ms   (p95 ${summary.firstVisibleMsP95} ms)`,
    `Davon unsichtbare Wartezeit: ${summary.unsichtbarWartezeitMsMedian} ms`,
    `Ende (Median):               ${summary.totalMsMedian} ms`,
    `Bericht: ${outRelative}`,
    ""
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  await main();
}

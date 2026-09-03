#!/usr/bin/env node
// con-Autopilot — Inhalts-Hash der Suiten setzen/pruefen (dasselbe Verfahren wie evals/suites).
// Aufruf: node workers/con-autopilot/suites/hash-suites.mjs [--pruefen]
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvalSuiteSha256 } from "../../../src/evaluation/evalSuite.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pruefen = process.argv.includes("--pruefen");
let fehler = 0;
for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json")).sort()) {
  const file = path.join(dir, name);
  const suite = JSON.parse(await readFile(file, "utf8"));
  const soll = computeEvalSuiteSha256(suite);
  const ist = suite.integrity?.contentSha256 || "";
  if (ist === soll) { console.log(`ok       ${name} ${soll.slice(0, 12)}`); continue; }
  if (pruefen) { console.log(`FALSCH   ${name} ist=${ist.slice(0, 12) || "-"} soll=${soll.slice(0, 12)}`); fehler += 1; continue; }
  suite.integrity.contentSha256 = soll;
  await writeFile(file, JSON.stringify(suite, null, 2) + "\n");
  console.log(`gesetzt  ${name} ${soll.slice(0, 12)}`);
}
process.exit(fehler ? 1 : 0);

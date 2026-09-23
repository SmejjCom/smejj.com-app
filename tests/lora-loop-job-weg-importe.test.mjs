// smejj.com — Trainings-Autopilot: jeder nachgeladene Baustein des Job-Wegs
// muss das liefern, was worker.mjs aus ihm herausnimmt (Befund 23.09.2026 live:
// "job_weg_nicht_baubar: loadEvalSuite is not a function" — der Import zeigte auf
// evalSuite.js, die Funktion liegt in evalPacks.js; ohne Salad-Schluessel blieb
// das unsichtbar, weil der Weg vorher schon abbrach).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("baueJobWegFabrik: alle import()-Ziele liefern die erwarteten Namen", async () => {
  const datei = path.resolve("workers/smejj-lora-loop/worker.mjs");
  const q = fs.readFileSync(datei, "utf8");
  const block = q.match(/const \[([^\]]+)\] = await Promise\.all\(\[([\s\S]*?)\]\);/);
  assert.ok(block, "Promise.all-Block in baueJobWegFabrik gefunden");
  const namen = [...block[1].matchAll(/\{([^}]+)\}/g)].map((m) => m[1].split(",").map((n) => n.trim()).filter(Boolean));
  const ziele = [...block[2].matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(namen.length, ziele.length);
  for (let i = 0; i < ziele.length; i += 1) {
    const modul = await import(pathToFileURL(path.resolve(path.dirname(datei), ziele[i])).href);
    for (const name of namen[i]) assert.equal(typeof modul[name], "function", `${ziele[i]} liefert ${name}`);
  }
});

test("die Mess-Suite des Autopiloten laedt mit Faellen", async () => {
  const { loadEvalSuite } = await import("../src/evaluation/evalPacks.js");
  const { suite } = await loadEvalSuite(path.resolve("evals/suites/smejj-chat-breit-v1.json"));
  assert.ok(suite.cases.length > 100, `${suite.cases.length} Faelle`);
});
